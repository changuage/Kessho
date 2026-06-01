import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from '../../coreProductEvents';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductSequencerLaneUiState, CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';
import { createRng } from '../../rng';
import { coreProductSequencerEvolveRngMaterial } from '../../CoreProductHostSequencerEvolveRng';
import { coreProductDrumSequencerEffectiveEvolveTension, coreProductSynthSequencerEffectiveEvolveTension } from '../../CoreProductHostSequencerEvolveTension';
import { CORE_PRODUCT_SUBLANE_DIRECTIONS } from '../../coreProductEvents';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern, seqEuclidean } from '../../euclideanPatterns';
import { createSequencer } from '../../drumSequencer';
import { captureHomeSnapshot, evolveSequencer } from '../../drumSeqEvolve';
import type { LaneDirection, SequencerSnapshot, SequencerState } from '../../drumSeqTypes';
import { SCALES, type PitchMode, type ScaleName, type TrigCondition } from '../../drumSeqTypes';
import {
  captureSynthHomeSnapshot,
  defaultSynthEvolveState,
  evolveSynthLane,
  type SynthEvolveState,
  type SynthLaneOverrides,
} from '../../synthSeqEvolve';
import { patchCoreProductSequencerLaneSwing } from '../../CoreProductHostSequencerSwing';
import { postCoreProductSequencerLaneStepState, type CoreProductSequencerHomeState } from '../../CoreProductHostSequencerHome';
import { normalizeSequencerPitchSettings, type SequencerPitchSettings } from '../../sequencerPitchSettings';
import type {
  SequencerKind,
  SequencerStepToggleOverride,
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';
import {
  ensureCoreProductSequencerLaneCache,
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';

type NoteRange = { min: number; max: number };
type Rng = () => number;
type EvolveResult = { handled: boolean; changed: boolean; adapterState?: Record<string, unknown> };
type SubLanePatch = Partial<Record<'pitch' | 'expression' | 'morph' | 'distance', { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;
type DrumSubLanePatch = SubLanePatch & Partial<Record<'slice' | 'reverse', { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;

const DRUM_VOICE_TYPES = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'] as const;
const PRODUCT_DRUM_VOICE_MASK_SEED_FLAG = 0x80000000;
const PRODUCT_DRUM_VOICE_MASK_SEED_SHIFT = 24;
const PRODUCT_DRUM_VOICE_MASK = 0x7f;

export type CoreProductSequencerParityEvolveState = {
  synthStates: SynthEvolveState[];
  drumHomes: (SequencerSnapshot | null)[];
  drumLastEvolveBars: number[];
  rngKey: string | null;
  rng: Rng | null;
};

export function createCoreProductSequencerParityEvolveState(): CoreProductSequencerParityEvolveState {
  return {
    synthStates: [defaultSynthEvolveState(), defaultSynthEvolveState(), defaultSynthEvolveState(), defaultSynthEvolveState()],
    drumHomes: [null, null, null, null],
    drumLastEvolveBars: [0, 0, 0, 0],
    rngKey: null,
    rng: null,
  };
}

export function resetCoreProductSequencerParityEvolveState(state: CoreProductSequencerParityEvolveState): void {
  state.synthStates = [defaultSynthEvolveState(), defaultSynthEvolveState(), defaultSynthEvolveState(), defaultSynthEvolveState()];
  state.drumHomes = [null, null, null, null];
  state.drumLastEvolveBars = [0, 0, 0, 0];
  state.rngKey = null;
  state.rng = null;
}

export function evolveCoreProductSequencerLaneWithSharedModel(options: {
  state: CoreProductSequencerParityEvolveState;
  sequencer: SequencerKind;
  laneIndex: number;
  config: {
    enabled: boolean;
    everyBars: number;
    evolution: number;
    writeOffset: number | 'auto';
    mutationMode: 'strict' | 'biased';
    methods: Record<string, boolean>;
    enabledSubLanes?: string[];
  };
  bar: number;
  seed: number;
  cache: CoreProductSequencerCacheState;
  adapterState: Record<string, unknown>;
  latestSliderState: Record<string, unknown> | null;
  latestProductSnapshot: CoreProductSnapshot | null;
  telemetry: CoreProductTelemetrySnapshot;
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
  synthNoteRangeOverrides: (NoteRange | null)[];
  setSynthNoteRangeOverride: (laneIndex: number, range: NoteRange | null) => void;
  restoreHomeNoteRange?: (laneIndex: number) => NoteRange | null;
  restoreHomePitchSettings?: (sequencer: SequencerKind, laneIndex: number) => SequencerPitchSettings | null;
  runtimeReady: boolean;
  fieldEnabled: (field: CoreProductStepValueField) => boolean;
  post: (event: CoreProductEvent) => void;
  publishOverrides: (name: 'synthEvolveOverrides' | 'drumEvolveOverrides', laneIndex: number, payload: Record<string, unknown>) => void;
  publishNoteRange: (laneIndex: number, noteMin: number, noteMax: number) => void;
}): EvolveResult {
  if (options.sequencer === 'synth') return evolveSynthLaneWithSharedModel(options);
  return evolveDrumLaneWithSharedModel(options);
}

function evolveRng(options: {
  state: CoreProductSequencerParityEvolveState;
  latestSliderState: Record<string, unknown> | null;
  telemetry: CoreProductTelemetrySnapshot;
  seed: number;
}): Rng {
  const key = coreProductSequencerEvolveRngMaterial(options.latestSliderState, options.telemetry, options.seed);
  if (options.state.rngKey !== key || !options.state.rng) {
    options.state.rngKey = key;
    options.state.rng = createRng(key);
  }
  return options.state.rng;
}

function evolveSynthLaneWithSharedModel(options: Parameters<typeof evolveCoreProductSequencerLaneWithSharedModel>[0]): EvolveResult {
  ensureCoreProductSequencerLaneCache(options.cache, 'synth', options.laneIndex);
  const lane = synthLaneParams(options);
  if (!lane.enabled) return { handled: true, changed: false };

  const cache = selectCoreProductSequencerCache(options.cache, 'synth');
  const current = synthOverridesFromCache(cache.toggles[options.laneIndex] ?? [], cache.values[options.laneIndex] ?? [], cache.configs[options.laneIndex] ?? [], lane.stepCount);
  const pitchSettings = synthPitchSettings(options.adapterState, options.laneIndex, lane.midiNote);
  const offsetOverrides = synthOffsetsForEvolve(current, pitchSettings);
  const state = options.state.synthStates[options.laneIndex] ?? defaultSynthEvolveState();
  options.state.synthStates[options.laneIndex] = state;
  if (!state.homePitchSettings && pitchSettings) state.homePitchSettings = { ...pitchSettings };

  const enabledSubLanes = enabledSynthSubLanes(options.config.enabledSubLanes, options.synthSubLaneEnabled[options.laneIndex]);
  const currentRange = options.synthNoteRangeOverrides[options.laneIndex] ?? options.restoreHomeNoteRange?.(options.laneIndex) ?? synthNoteRangeFromState(options.latestSliderState, options.laneIndex);
  const result = evolveSynthLane(
    offsetOverrides,
    { ...options.config, enabledSubLanes },
    state,
    options.bar,
    evolveRng(options),
    {
      effectiveTension: coreProductSynthSequencerEffectiveEvolveTension(options.latestSliderState, lane.targetSourceId),
      swing: lane.swing,
      steps: lane.stepCount,
      scaleIntervals: pitchSettings.mode === 'notes' ? (SCALES[pitchSettings.scale] ?? SCALES.Major) : undefined,
      pitchMode: pitchSettings.mode,
      noteRangeMin: currentRange.min,
      noteRangeMax: currentRange.max,
    },
  );
  if (!result.changed) return { handled: true, changed: false };

  const stored = synthMidiForStorage(result.overrides, pitchSettings);
  applySynthOverridesToCache(cache, options.laneIndex, stored);
  const swingPatch = patchCoreProductSequencerLaneSwing(options.adapterState, 'synth', options.laneIndex, result.swing);
  const homeState: CoreProductSequencerHomeState = {
    toggles: cache.toggles[options.laneIndex] ?? [],
    values: cache.values[options.laneIndex] ?? [],
    configs: cache.configs[options.laneIndex] ?? [],
    swing: swingPatch.swing,
  };
  if (options.runtimeReady) {
    postCoreProductSequencerLaneStepState({
      sequencer: 'synth',
      laneIndex: options.laneIndex,
      state: homeState,
      fieldEnabled: options.fieldEnabled,
      post: options.post,
    });
  }

  const subLaneStates = synthEvolvedSubLaneStatePatch(result.overrides);
  options.publishOverrides('synthEvolveOverrides', options.laneIndex, {
    ...result.overrides,
    swing: swingPatch.swing,
    ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
  });
  if (result.noteRangeMin !== undefined && result.noteRangeMax !== undefined) {
    const range = { min: result.noteRangeMin, max: result.noteRangeMax };
    options.setSynthNoteRangeOverride(options.laneIndex, range);
    if (options.runtimeReady) {
      options.post(createCoreProductSequencerLaneParamEvent('synth', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, (range.min + range.max) * 0.5));
    }
    options.publishNoteRange(options.laneIndex, range.min, range.max);
  }
  state.home ??= captureSynthHomeSnapshot(result.overrides);
  return { handled: true, changed: true, adapterState: swingPatch.adapterState };
}

function evolveDrumLaneWithSharedModel(options: Parameters<typeof evolveCoreProductSequencerLaneWithSharedModel>[0]): EvolveResult {
  ensureCoreProductSequencerLaneCache(options.cache, 'drum', options.laneIndex);
  const lane = drumLaneParams(options);
  if (!lane.enabled) return { handled: true, changed: false };

  const sequencer = drumSequencerFromCache(options, lane);
  if (!options.state.drumHomes[options.laneIndex]) options.state.drumHomes[options.laneIndex] = captureHomeSnapshot(sequencer);
  sequencer.evolve = {
    ...sequencer.evolve,
    enabled: options.config.enabled,
    everyBars: options.config.everyBars,
    evolution: options.config.evolution,
    writeOffset: options.config.writeOffset,
    mutationMode: options.config.mutationMode,
    methods: { ...sequencer.evolve.methods, ...options.config.methods },
    lastEvolveBar: options.state.drumLastEvolveBars[options.laneIndex] ?? 0,
    home: options.state.drumHomes[options.laneIndex] ?? null,
  };
  const evolved = evolveSequencer(sequencer, options.bar, {
    effectiveTension: coreProductDrumSequencerEffectiveEvolveTension(options.latestSliderState),
    scaleIntervals: drumPitchSettings(options.adapterState, options.latestSliderState, options.laneIndex, options.restoreHomePitchSettings?.('drum', options.laneIndex) ?? null).scaleIntervals,
    enabledSubLanes: enabledDrumSubLanes(options.config.enabledSubLanes, options.drumSubLaneEnabled[options.laneIndex]),
  });
  options.state.drumLastEvolveBars[options.laneIndex] = evolved.evolve.lastEvolveBar;
  if (evolved === sequencer) return { handled: true, changed: false };

  const cache = selectCoreProductSequencerCache(options.cache, 'drum');
  applyDrumSequencerToCache(cache, options.laneIndex, evolved, lane.midiNote);
  const swingPatch = patchCoreProductSequencerLaneSwing(options.adapterState, 'drum', options.laneIndex, evolved.swing);
  const homeState: CoreProductSequencerHomeState = {
    toggles: cache.toggles[options.laneIndex] ?? [],
    values: cache.values[options.laneIndex] ?? [],
    configs: cache.configs[options.laneIndex] ?? [],
    swing: swingPatch.swing,
  };
  if (options.runtimeReady) {
    options.post(createCoreProductSequencerLaneParamEvent('drum', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneStepCount, evolved.trigger.steps));
    options.post(createCoreProductSequencerLaneParamEvent('drum', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneFillCount, evolved.trigger.hits));
    options.post(createCoreProductSequencerLaneParamEvent('drum', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRotation, evolved.trigger.rotation));
    postCoreProductSequencerLaneStepState({
      sequencer: 'drum',
      laneIndex: options.laneIndex,
      state: homeState,
      fieldEnabled: options.fieldEnabled,
      post: options.post,
    });
  }

  options.publishOverrides('drumEvolveOverrides', options.laneIndex, drumPayloadFromSequencer(options.laneIndex, evolved));
  return { handled: true, changed: true, adapterState: swingPatch.adapterState };
}

function synthLaneParams(options: Parameters<typeof evolveCoreProductSequencerLaneWithSharedModel>[0]): {
  enabled: boolean;
  stepCount: number;
  fillCount: number;
  rotation: number;
  swing: number;
  midiNote: number;
  targetSourceId: number;
} {
  const telemetryLane = options.telemetry.sequencerUiState?.synthLanes[options.laneIndex];
  const snapshotLane = options.latestProductSnapshot?.synthLanes[options.laneIndex];
  const defaults = defaultSynthEuclidPattern(options.laneIndex);
  const stepCount = boundedLaneNumber(telemetryLane?.stepCount ?? snapshotLane?.stepCount, defaults.steps, 1, 64);
  return {
    enabled: (telemetryLane?.enabled ?? snapshotLane?.enabled ?? true) === true,
    stepCount,
    fillCount: boundedLaneNumber(telemetryLane?.fillCount ?? snapshotLane?.fillCount, defaults.hits, 0, stepCount),
    rotation: boundedLaneNumber(telemetryLane?.rotation ?? snapshotLane?.rotation, defaults.rotation, -64, 64),
    swing: boundedSwing(telemetryLane?.swing ?? snapshotLane?.swing, 0),
    midiNote: boundedLaneNumber(telemetryLane?.baseMidiNote ?? snapshotLane?.midiNote, 60, 0, 127),
    targetSourceId: boundedLaneNumber(telemetryLane?.targetSourceId ?? snapshotLane?.targetSourceId, 1, 1, 16),
  };
}

function drumLaneParams(options: Parameters<typeof evolveCoreProductSequencerLaneWithSharedModel>[0]): {
  uiLane: CoreProductSequencerLaneUiState | undefined;
  enabled: boolean;
  stepCount: number;
  fillCount: number;
  rotation: number;
  swing: number;
  midiNote: number;
  seed: number;
} {
  const uiLane = options.telemetry.sequencerUiState?.drumLanes[options.laneIndex];
  const snapshotLane = options.latestProductSnapshot?.drumLanes[options.laneIndex];
  const defaults = defaultDrumEuclidPattern(options.laneIndex);
  const stepCount = boundedLaneNumber(uiLane?.stepCount ?? snapshotLane?.stepCount, defaults.steps, 1, 64);
  return {
    uiLane,
    enabled: (uiLane?.enabled ?? snapshotLane?.enabled ?? true) === true,
    stepCount,
    fillCount: boundedLaneNumber(uiLane?.fillCount ?? snapshotLane?.fillCount, defaults.hits, 0, stepCount),
    rotation: boundedLaneNumber(uiLane?.rotation ?? snapshotLane?.rotation, defaults.rotation, -64, 64),
    swing: boundedSwing(uiLane?.swing ?? snapshotLane?.swing, 0),
    midiNote: boundedLaneNumber(uiLane?.baseMidiNote ?? snapshotLane?.midiNote, 36 + options.laneIndex, 0, 127),
    seed: boundedLaneNumber(snapshotLane?.seed, options.seed, 1, 0xffffffff),
  };
}

function synthOverridesFromCache(
  toggles: SequencerStepToggleOverride[],
  values: SequencerStepValueOverride[],
  configs: SequencerStepValueConfig[],
  stepCount: number,
): SynthLaneOverrides {
  return {
    pitch: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, stepCount, 0),
    pitchDirection: directionForField(configs, CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote),
    triggerToggles: new Map(toggles.map((entry) => [entry.step, entry.value] as const)),
    expression: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.expression, stepCount, 0.8),
    expressionDirection: directionForField(configs, CORE_PRODUCT_STEP_VALUE_FIELDS.expression),
    morph: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.morph, stepCount, 0),
    morphDirection: directionForField(configs, CORE_PRODUCT_STEP_VALUE_FIELDS.morph),
    distance: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.distance, stepCount, 0.5),
    distanceDirection: directionForField(configs, CORE_PRODUCT_STEP_VALUE_FIELDS.distance),
    probability: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.probability, stepCount, 1),
    ratchet: numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, stepCount, 1),
    trigCondition: trigConditionsForField(values, configs, stepCount),
  };
}

function drumSequencerFromCache(
  options: Parameters<typeof evolveCoreProductSequencerLaneWithSharedModel>[0],
  lane: ReturnType<typeof drumLaneParams>,
): SequencerState {
  const cache = selectCoreProductSequencerCache(options.cache, 'drum');
  const values = cache.values[options.laneIndex] ?? [];
  const configs = cache.configs[options.laneIndex] ?? [];
  const sequencer = createSequencer(options.laneIndex, `core-product-drum-${options.seed}`);
  const pitchSettings = drumPitchSettings(options.adapterState, options.latestSliderState, options.laneIndex, options.restoreHomePitchSettings?.('drum', options.laneIndex) ?? null);
  const pattern = seqEuclidean(lane.stepCount, lane.fillCount, lane.rotation);
  const toggleMap = new Map((cache.toggles[options.laneIndex] ?? []).map((entry) => [entry.step, entry.value] as const));
  sequencer.rng = evolveRng(options);
  sequencer.swing = lane.swing;
  sequencer.trigger.steps = lane.stepCount;
  sequencer.trigger.hits = lane.fillCount;
  sequencer.trigger.rotation = lane.rotation;
  sequencer.trigger.pattern = toggleMap.size > 0 ? pattern.map((value, step) => toggleMap.has(step) ? toggleMap.get(step)! : value) : pattern;
  sequencer.trigger.overrides = new Set(toggleMap.keys());
  sequencer.trigger.probability = numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.probability, lane.stepCount, 1) ?? new Array(lane.stepCount).fill(1);
  sequencer.trigger.ratchet = numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, lane.stepCount, 1) ?? new Array(lane.stepCount).fill(1);
  sequencer.trigger.trigCondition = trigConditionsForField(values, configs, lane.stepCount) ?? new Array(lane.stepCount).fill([1, 1] as TrigCondition);
  sequencer.expression = { ...sequencer.expression, ...subLaneState(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.expression, lane.stepCount, 0.8, options.drumSubLaneEnabled[options.laneIndex]?.expression === true, 'velocities') };
  sequencer.morph = { ...sequencer.morph, ...subLaneState(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.morph, lane.stepCount, 0, options.drumSubLaneEnabled[options.laneIndex]?.morph === true, 'values') };
  sequencer.distance = { ...sequencer.distance, ...subLaneState(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.distance, lane.stepCount, 0.5, options.drumSubLaneEnabled[options.laneIndex]?.distance === true, 'values') };
  sequencer.pitch.offsets = drumPitchOffsets(values, configs, lane.stepCount, lane.midiNote);
  sequencer.pitch.steps = sequencer.pitch.offsets.length;
  sequencer.pitch.enabled = options.drumSubLaneEnabled[options.laneIndex]?.pitch === true && sequencer.pitch.offsets.length > 0;
  sequencer.pitch.direction = directionForField(configs, CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote) ?? 'forward';
  sequencer.pitch.mode = pitchSettings.mode;
  sequencer.pitch.root = pitchSettings.root;
  sequencer.pitch.scale = pitchSettings.scale;
  sequencer.pitch.scaleQuantize = pitchSettings.mode === 'notes';
  sequencer.sources = drumSourcesFromSeed(lane.seed);
  return sequencer;
}

function subLaneState(
  values: SequencerStepValueOverride[],
  configs: SequencerStepValueConfig[],
  field: CoreProductStepValueField,
  stepCount: number,
  fallback: number,
  enabled: boolean,
  key: 'values' | 'velocities',
): { enabled: boolean; steps: number; direction: LaneDirection; values?: number[]; velocities?: number[] } {
  const arr = numberArrayForField(values, configs, field, stepCount, fallback) ?? new Array(stepCount).fill(fallback);
  return {
    enabled: enabled && arr.length > 0,
    steps: arr.length,
    direction: directionForField(configs, field) ?? 'forward',
    [key]: arr,
  };
}

function synthOffsetsForEvolve(overrides: SynthLaneOverrides, settings: SequencerPitchSettings): SynthLaneOverrides {
  if (!overrides.pitch || settings.mode === 'noteRange') return overrides;
  return { ...overrides, pitch: midiToOffsets(overrides.pitch, settings) };
}

function synthMidiForStorage(overrides: SynthLaneOverrides, settings: SequencerPitchSettings): SynthLaneOverrides {
  if (!overrides.pitch || settings.mode === 'noteRange') return overrides;
  return { ...overrides, pitch: offsetsToMidi(overrides.pitch, settings) };
}

function applySynthOverridesToCache(cache: ReturnType<typeof selectCoreProductSequencerCache>, laneIndex: number, overrides: SynthLaneOverrides): void {
  cache.toggles[laneIndex] = Array.from(overrides.triggerToggles.entries())
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value }));
  cache.values[laneIndex] = valuesFromSynthOverrides(overrides);
  cache.configs[laneIndex] = configsFromSynthOverrides(overrides);
}

function applyDrumSequencerToCache(cache: ReturnType<typeof selectCoreProductSequencerCache>, laneIndex: number, sequencer: SequencerState, baseMidi: number): void {
  cache.toggles[laneIndex] = sequencer.trigger.pattern.map((value, step) => ({ step, value }));
  cache.values[laneIndex] = valuesFromDrumSequencer(sequencer, baseMidi);
  cache.configs[laneIndex] = configsFromDrumSequencer(sequencer);
}

function valuesFromSynthOverrides(overrides: SynthLaneOverrides): SequencerStepValueOverride[] {
  return [
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, overrides.pitch),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.probability, overrides.probability),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, overrides.ratchet, true),
    ...trigConditionValues(overrides.trigCondition),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.expression, overrides.expression),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.morph, overrides.morph),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.distance, overrides.distance),
  ].sort(compareStepValues);
}

function valuesFromDrumSequencer(sequencer: SequencerState, baseMidi: number): SequencerStepValueOverride[] {
  return [
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.probability, sequencer.trigger.probability),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, sequencer.trigger.ratchet, true),
    ...trigConditionValues(sequencer.trigger.trigCondition),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, sequencer.pitch.offsets.map((value) => value + baseMidi)),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.expression, sequencer.expression.velocities),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.morph, sequencer.morph.values),
    ...valuesFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.distance, sequencer.distance.values),
  ].sort(compareStepValues);
}

function configsFromSynthOverrides(overrides: SynthLaneOverrides): SequencerStepValueConfig[] {
  return [
    configFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, overrides.pitch, overrides.pitchDirection),
    configFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.expression, overrides.expression, overrides.expressionDirection),
    configFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.morph, overrides.morph, overrides.morphDirection),
    configFromArray(CORE_PRODUCT_STEP_VALUE_FIELDS.distance, overrides.distance, overrides.distanceDirection),
  ].filter((entry): entry is SequencerStepValueConfig => entry !== null);
}

function configsFromDrumSequencer(sequencer: SequencerState): SequencerStepValueConfig[] {
  return [
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, steps: sequencer.pitch.steps, direction: productDirection(sequencer.pitch.direction) },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, steps: sequencer.expression.steps, direction: productDirection(sequencer.expression.direction) },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph, steps: sequencer.morph.steps, direction: productDirection(sequencer.morph.direction) },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance, steps: sequencer.distance.steps, direction: productDirection(sequencer.distance.direction) },
  ];
}

function drumPayloadFromSequencer(laneIndex: number, sequencer: SequencerState): Record<string, unknown> {
  const laneArray = <T>(value: T): (T | null)[] => [null, null, null, null].map((_, index) => index === laneIndex ? value : null);
  const triggerToggles = [new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>()];
  triggerToggles[laneIndex] = new Map(sequencer.trigger.pattern.map((value, step) => [step, value] as const));
  return {
    triggerToggles,
    probability: laneArray([...sequencer.trigger.probability]),
    ratchet: laneArray([...sequencer.trigger.ratchet]),
    trigCondition: laneArray(sequencer.trigger.trigCondition.map((entry) => [entry[0], entry[1]])),
    expression: laneArray([...sequencer.expression.velocities]),
    pitch: laneArray([...sequencer.pitch.offsets]),
    morph: laneArray([...sequencer.morph.values]),
    distance: laneArray([...sequencer.distance.values]),
    expressionDirection: laneArray(sequencer.expression.direction),
    pitchDirection: laneArray(sequencer.pitch.direction),
    morphDirection: laneArray(sequencer.morph.direction),
    distanceDirection: laneArray(sequencer.distance.direction),
    swing: sequencer.swing,
    subLaneStates: drumSubLanePatch(sequencer),
    pitchSettings: laneArray({ mode: sequencer.pitch.mode, root: sequencer.pitch.root, scale: sequencer.pitch.scale }),
  };
}

function synthEvolvedSubLaneStatePatch(overrides: SynthLaneOverrides): SubLanePatch {
  const patch: SubLanePatch = {};
  addSynthSubLanePatch(patch, 'pitch', overrides.pitch, overrides.pitchDirection);
  addSynthSubLanePatch(patch, 'expression', overrides.expression, overrides.expressionDirection);
  addSynthSubLanePatch(patch, 'morph', overrides.morph, overrides.morphDirection);
  addSynthSubLanePatch(patch, 'distance', overrides.distance, overrides.distanceDirection);
  return patch;
}

function addSynthSubLanePatch(patch: SubLanePatch, lane: keyof SubLanePatch, values: number[] | null, direction: LaneDirection | null): void {
  if (!Array.isArray(values)) return;
  patch[lane] = { enabled: true, steps: Math.max(1, Math.min(16, values.length)), direction: direction ?? 'forward' };
}

function drumSubLanePatch(sequencer: SequencerState): DrumSubLanePatch {
  return {
    pitch: { enabled: sequencer.pitch.enabled, steps: sequencer.pitch.steps, direction: sequencer.pitch.direction, scaleQuantize: sequencer.pitch.scaleQuantize },
    expression: { enabled: sequencer.expression.enabled, steps: sequencer.expression.steps, direction: sequencer.expression.direction },
    morph: { enabled: sequencer.morph.enabled, steps: sequencer.morph.steps, direction: sequencer.morph.direction },
    distance: { enabled: sequencer.distance.enabled, steps: sequencer.distance.steps, direction: sequencer.distance.direction },
    slice: { enabled: sequencer.slice.enabled, steps: sequencer.slice.steps, direction: sequencer.slice.direction },
    reverse: { enabled: sequencer.reverse.enabled, steps: sequencer.reverse.steps, direction: sequencer.reverse.direction },
  };
}

function numberArrayForField(
  values: SequencerStepValueOverride[],
  configs: SequencerStepValueConfig[],
  field: CoreProductStepValueField,
  fallbackLength: number,
  fallbackValue: number,
): number[] | null {
  const entries = values.filter((entry) => entry.field === field && entry.range !== true);
  if (entries.length === 0) return null;
  const configLength = configs.find((entry) => entry.field === field)?.steps;
  const length = Math.max(1, Math.min(64, configLength ?? Math.max(fallbackLength, ...entries.map((entry) => entry.step + 1))));
  const out = new Array(length).fill(fallbackValue);
  for (const entry of entries) {
    if (entry.step >= 0 && entry.step < out.length) out[entry.step] = entry.value;
  }
  return out;
}

function trigConditionsForField(values: SequencerStepValueOverride[], configs: SequencerStepValueConfig[], fallbackLength: number): TrigCondition[] | null {
  const entries = values.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition);
  if (entries.length === 0) return null;
  const configLength = configs.find((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition)?.steps;
  const length = Math.max(1, Math.min(64, configLength ?? Math.max(fallbackLength, ...entries.map((entry) => entry.step + 1))));
  const out: TrigCondition[] = Array.from({ length }, () => [1, 1] as TrigCondition);
  for (const entry of entries) {
    if (entry.step >= 0 && entry.step < out.length) out[entry.step] = [Math.round(entry.value), Math.round(entry.value2 ?? 1)];
  }
  return out;
}

function valuesFromArray(field: CoreProductStepValueField, values: number[] | null | undefined, round = false): SequencerStepValueOverride[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value, step) => (
    typeof value === 'number' && Number.isFinite(value)
      ? [{ step, field, value: round ? Math.round(value) : value }]
      : []
  ));
}

function trigConditionValues(values: TrigCondition[] | null | undefined): SequencerStepValueOverride[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value, step) => (
    Array.isArray(value)
      ? [{ step, field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition, value: value[0], value2: value[1] }]
      : []
  ));
}

function compareStepValues(left: SequencerStepValueOverride, right: SequencerStepValueOverride): number {
  return left.step - right.step || left.field - right.field;
}

function configFromArray(field: CoreProductStepValueField, values: number[] | null, direction: LaneDirection | null): SequencerStepValueConfig | null {
  if (!Array.isArray(values)) return null;
  return { field, steps: Math.max(1, Math.min(64, values.length)), direction: productDirection(direction ?? 'forward') };
}

function directionForField(configs: SequencerStepValueConfig[], field: CoreProductStepValueField): LaneDirection | null {
  const direction = configs.find((entry) => entry.field === field)?.direction;
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return 'reverse';
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return 'pingpong';
  return direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.forward ? 'forward' : null;
}

function productDirection(direction: LaneDirection): CoreProductSubLaneDirection {
  if (direction === 'reverse') return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
  if (direction === 'pingpong') return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
  return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
}

function synthPitchSettings(adapterState: Record<string, unknown>, laneIndex: number, fallbackRoot: number): SequencerPitchSettings {
  const settings = Array.isArray(adapterState.synthPitchSettings) ? adapterState.synthPitchSettings[laneIndex] : undefined;
  return normalizeSequencerPitchSettings(settings, { root: fallbackRoot });
}

function drumPitchSettings(adapterState: Record<string, unknown>, state: Record<string, unknown> | null, laneIndex: number, homeSettings: SequencerPitchSettings | null): SequencerPitchSettings & { scaleIntervals: number[] | undefined } {
  const adapterSettings = Array.isArray(adapterState.drumPitchSettings) ? adapterState.drumPitchSettings[laneIndex] : undefined;
  const lane = laneIndex + 1;
  const legacyStateSettings: SequencerPitchSettings = {
    mode: pitchModeValue(state?.[`drumEuclid${lane}PitchMode`], homeSettings?.mode ?? 'semitones'),
    root: boundedLaneNumber(state?.[`drumEuclid${lane}PitchRoot`], homeSettings?.root ?? 60, 0, 127),
    scale: scaleNameValue(state?.[`drumEuclid${lane}PitchScale`], homeSettings?.scale ?? 'Major'),
  };
  const settings = normalizeSequencerPitchSettings(adapterSettings, legacyStateSettings);
  return {
    ...settings,
    scaleIntervals: settings.mode === 'notes' ? (SCALES[settings.scale] ?? SCALES.Major) : undefined,
  };
}

function enabledSynthSubLanes(configured: string[] | undefined, uiEnabled: Record<string, boolean> | undefined): string[] {
  const allowed = configured ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'];
  return allowed.filter((lane) => lane === 'probability' || lane === 'ratchet' || uiEnabled?.[lane] === true);
}

function enabledDrumSubLanes(configured: string[] | undefined, uiEnabled: Record<string, boolean> | undefined): ('pitch' | 'expression' | 'morph' | 'distance')[] {
  const allowed = new Set(configured ?? ['pitch', 'expression', 'morph', 'distance']);
  return (['pitch', 'expression', 'morph', 'distance'] as const).filter((lane) => allowed.has(lane) && uiEnabled?.[lane] === true);
}

function synthNoteRangeFromState(state: Record<string, unknown> | null, laneIndex: number): NoteRange {
  const lane = laneIndex + 1;
  const fallbackMin = lane === 2 ? 76 : lane === 3 ? 52 : lane === 4 ? 88 : 64;
  const fallbackMax = lane === 2 ? 88 : lane === 3 ? 64 : lane === 4 ? 96 : 76;
  const min = boundedLaneNumber(state?.[`synthEuclid${lane}NoteMin`], fallbackMin, 24, 108);
  const max = boundedLaneNumber(state?.[`synthEuclid${lane}NoteMax`], fallbackMax, 24, 108);
  return { min: Math.max(36, Math.min(94, Math.min(min, max - 2))), max: Math.max(38, Math.min(96, Math.max(max, min + 2))) };
}

function drumPitchOffsets(
  values: SequencerStepValueOverride[],
  configs: SequencerStepValueConfig[],
  stepCount: number,
  baseMidi: number,
): number[] {
  const midi = numberArrayForField(values, configs, CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, stepCount, baseMidi);
  return midi ? midi.map((value) => Math.round(value - baseMidi)) : new Array(stepCount).fill(0);
}

function midiToOffsets(midi: number[], settings: SequencerPitchSettings): number[] {
  if (settings.mode === 'notes') {
    const intervals = SCALES[settings.scale] ?? SCALES.Major;
    return midi.map((note) => {
      const semitone = note - settings.root;
      const octave = Math.floor(semitone / 12);
      const pitchClass = ((semitone % 12) + 12) % 12;
      let bestDegree = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let degree = 0; degree < intervals.length; degree += 1) {
        const distance = Math.abs((intervals[degree] ?? 0) - pitchClass);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestDegree = degree;
        }
      }
      return octave * intervals.length + bestDegree;
    });
  }
  return midi.map((note) => note - settings.root);
}

function offsetsToMidi(offsets: number[], settings: SequencerPitchSettings): number[] {
  if (settings.mode === 'notes') {
    const intervals = SCALES[settings.scale] ?? SCALES.Major;
    return offsets.map((degree) => {
      const octave = Math.floor(degree / intervals.length);
      const index = ((degree % intervals.length) + intervals.length) % intervals.length;
      return Math.max(0, Math.min(127, settings.root + octave * 12 + (intervals[index] ?? 0)));
    });
  }
  return offsets.map((offset) => Math.max(0, Math.min(127, settings.root + offset)));
}

function drumSourcesFromSeed(seed: number): SequencerState['sources'] {
  const encoded = seed >>> 0;
  const mask = (encoded & PRODUCT_DRUM_VOICE_MASK_SEED_FLAG) !== 0
    ? (encoded >>> PRODUCT_DRUM_VOICE_MASK_SEED_SHIFT) & PRODUCT_DRUM_VOICE_MASK
    : 1 << 1;
  return DRUM_VOICE_TYPES.reduce((out, voice, index) => {
    out[voice] = (mask & (1 << index)) !== 0;
    return out;
  }, {
    sub: false,
    kick: false,
    click: false,
    beepHi: false,
    beepLo: false,
    noise: false,
    membrane: false,
  } as SequencerState['sources']);
}

function pitchModeValue(value: unknown, fallback: PitchMode): PitchMode {
  return value === 'notes' || value === 'noteRange' || value === 'semitones' ? value : fallback;
}

function scaleNameValue(value: unknown, fallback: ScaleName): ScaleName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCALES, value) ? value as ScaleName : fallback;
}

function boundedLaneNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function boundedSwing(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(0.75, typeof value === 'number' && Number.isFinite(value) ? value : fallback));
}
