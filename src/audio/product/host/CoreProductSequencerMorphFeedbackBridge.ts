import {
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from '../../coreProductEvents';
import type { CoreProductSnapshot, ProductLaneSnapshot } from '../../coreProductSnapshotTypes';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type {
  SequencerStepValueConfig,
  SequencerStepValueOverride,
} from '../../CoreProductHostSequencerAdapter';
import {
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';

type SequencerMorphCallbackName = 'padMorph' | 'pad2Morph' | 'leadMorph' | 'drumMorph';
type DrumVoiceName = typeof DRUM_VOICE_NAMES[number];

type CoreProductSequencerMorphFeedbackOptions = {
  telemetry: CoreProductTelemetrySnapshot;
  snapshot: CoreProductSnapshot | null;
  cache: CoreProductSequencerCacheState;
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
  hasCallback: (name: SequencerMorphCallbackName) => boolean;
  publish: (name: SequencerMorphCallbackName, ...payload: unknown[]) => void;
};

const MORPH_FIELD = CORE_PRODUCT_STEP_VALUE_FIELDS.morph;
const MAX_FEEDBACK_LANES = 4;
const DRUM_VOICE_NAMES = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'] as const;
const DRUM_VOICE_MASK_SEED_FLAG = 0x80000000;
const DRUM_VOICE_MASK_SEED_MASK = 0x7f000000;
const DRUM_VOICE_MASK_SEED_SHIFT = 24;
const DRUM_VOICE_MASK_SEED_PAYLOAD_MASK = 0x00ffffff;
const INACTIVE_MORPH_VALUE = -2;

export class CoreProductSequencerMorphFeedbackBridge {
  private readonly lastSynthHitCounts = new Array<number>(MAX_FEEDBACK_LANES).fill(0);
  private readonly lastDrumHitCounts = new Array<number>(MAX_FEEDBACK_LANES).fill(0);

  clear(options: Pick<CoreProductSequencerMorphFeedbackOptions, 'hasCallback' | 'publish'>): void {
    publishInactiveMorphFeedback(
      options.publish,
      options.hasCallback('padMorph') || options.hasCallback('pad2Morph') || options.hasCallback('leadMorph'),
      options.hasCallback('drumMorph'),
    );
  }

  update(options: CoreProductSequencerMorphFeedbackOptions): void {
    const synthHitCounts = options.telemetry.synthSequencerHitCounts;
    const drumHitCounts = options.telemetry.drumSequencerHitCounts;
    const wantsSynthFeedback =
      options.hasCallback('padMorph') ||
      options.hasCallback('pad2Morph') ||
      options.hasCallback('leadMorph');
    const wantsDrumFeedback = options.hasCallback('drumMorph');

    if (options.telemetry.transportRunning !== true || !options.snapshot) {
      publishInactiveMorphFeedback(options.publish, wantsSynthFeedback, wantsDrumFeedback);
      copyHitCounts(this.lastSynthHitCounts, synthHitCounts);
      copyHitCounts(this.lastDrumHitCounts, drumHitCounts);
      return;
    }

    if (wantsSynthFeedback) {
      this.updateSynth(options, synthHitCounts);
    } else {
      copyHitCounts(this.lastSynthHitCounts, synthHitCounts);
    }

    if (wantsDrumFeedback) {
      this.updateDrum(options, drumHitCounts);
    } else {
      copyHitCounts(this.lastDrumHitCounts, drumHitCounts);
    }
  }

  private updateSynth(
    options: CoreProductSequencerMorphFeedbackOptions,
    hitCounts: number[] | undefined,
  ): void {
    const cache = selectCoreProductSequencerCache(options.cache, 'synth');
    for (let laneIndex = 0; laneIndex < MAX_FEEDBACK_LANES; laneIndex += 1) {
      const hitCount = normalizedHitCount(hitCounts?.[laneIndex]);
      const previous = this.lastSynthHitCounts[laneIndex] ?? 0;
      this.lastSynthHitCounts[laneIndex] = hitCount;
      if (hitCount === 0 || hitCount <= previous) continue;

      const lane = options.snapshot?.synthLanes[laneIndex];
      if (!lane) continue;
      if (options.synthSubLaneEnabled[laneIndex]?.morph !== true) {
        publishSynthMorph(lane.targetSourceId, INACTIVE_MORPH_VALUE, options.publish);
        continue;
      }
      const morphValue = resolveLaneMorphValue({
        lane,
        hitCount,
        currentStep: options.telemetry.synthSequencerCurrentSteps?.[laneIndex],
        configs: cache.configs[laneIndex],
        values: cache.values[laneIndex],
        subLaneEnabled: options.synthSubLaneEnabled[laneIndex],
      });
      if (morphValue === null) continue;
      publishSynthMorph(lane.targetSourceId, morphValue, options.publish);
    }
  }

  private updateDrum(
    options: CoreProductSequencerMorphFeedbackOptions,
    hitCounts: number[] | undefined,
  ): void {
    const cache = selectCoreProductSequencerCache(options.cache, 'drum');
    for (let laneIndex = 0; laneIndex < MAX_FEEDBACK_LANES; laneIndex += 1) {
      const hitCount = normalizedHitCount(hitCounts?.[laneIndex]);
      const previous = this.lastDrumHitCounts[laneIndex] ?? 0;
      this.lastDrumHitCounts[laneIndex] = hitCount;
      if (hitCount === 0 || hitCount <= previous) continue;

      const lane = options.snapshot?.drumLanes[laneIndex];
      if (!lane) continue;
      const currentStep = options.telemetry.drumSequencerCurrentSteps?.[laneIndex];
      if (options.drumSubLaneEnabled[laneIndex]?.morph !== true) {
        publishDrumMorphClear(lane, laneIndex, hitCount, currentStep, options.publish);
        continue;
      }
      const morphValue = resolveLaneMorphValue({
        lane,
        hitCount,
        currentStep,
        configs: cache.configs[laneIndex],
        values: cache.values[laneIndex],
        subLaneEnabled: options.drumSubLaneEnabled[laneIndex],
      });
      if (morphValue === null) continue;
      options.publish('drumMorph', selectedDrumVoice(lane, laneIndex, hitCount, currentStep), morphValue);
    }
  }
}

function resolveLaneMorphValue({
  lane,
  hitCount,
  currentStep,
  configs,
  values,
  subLaneEnabled,
}: {
  lane: ProductLaneSnapshot;
  hitCount: number;
  currentStep: unknown;
  configs: SequencerStepValueConfig[] | undefined;
  values: SequencerStepValueOverride[] | undefined;
  subLaneEnabled: Record<string, boolean> | undefined;
}): number | null {
  const fieldConfig = findFieldConfig(configs, MORPH_FIELD);
  if (subLaneEnabled?.morph !== true) return null;

  const fallback = clampUnit(lane.morph);
  const phase = Math.max(0, hitCount - 1);
  const step = fieldConfig
    ? directedSubLaneStep(fieldConfig.steps, fieldConfig.direction, phase)
    : normalizedStep(currentStep, lane.stepCount, phase);
  const override = values?.find((entry) => entry && entry.field === MORPH_FIELD && entry.step === step);
  if (!override) return fallback;
  if (override.range === true && Number.isFinite(override.value2)) {
    return clampUnit((override.value + (override.value2 as number)) * 0.5);
  }
  return clampUnit(override.value);
}

function publishSynthMorph(
  targetSourceId: number,
  morphValue: number,
  publish: CoreProductSequencerMorphFeedbackOptions['publish'],
): void {
  if (targetSourceId === CORE_PRODUCT_SOURCE_IDS.pad1) {
    publish('padMorph', morphValue);
  } else if (targetSourceId === CORE_PRODUCT_SOURCE_IDS.pad2) {
    publish('pad2Morph', morphValue);
  } else if (targetSourceId === CORE_PRODUCT_SOURCE_IDS.lead1) {
    publish('leadMorph', { lead1: morphValue, lead2: -1 });
  } else if (targetSourceId === CORE_PRODUCT_SOURCE_IDS.lead2) {
    publish('leadMorph', { lead1: -1, lead2: morphValue });
  }
}

function publishInactiveMorphFeedback(
  publish: CoreProductSequencerMorphFeedbackOptions['publish'],
  wantsSynthFeedback: boolean,
  wantsDrumFeedback: boolean,
): void {
  if (wantsSynthFeedback) {
    publish('padMorph', INACTIVE_MORPH_VALUE);
    publish('pad2Morph', INACTIVE_MORPH_VALUE);
    publish('leadMorph', { lead1: INACTIVE_MORPH_VALUE, lead2: INACTIVE_MORPH_VALUE });
  }
  if (wantsDrumFeedback) {
    for (const voice of DRUM_VOICE_NAMES) {
      publish('drumMorph', voice, INACTIVE_MORPH_VALUE);
    }
  }
}

function findFieldConfig(
  configs: SequencerStepValueConfig[] | undefined,
  field: CoreProductStepValueField,
): SequencerStepValueConfig | null {
  return configs?.find((entry) => entry && entry.field === field && entry.steps > 0) ?? null;
}

function directedSubLaneStep(
  stepsValue: number,
  direction: CoreProductSubLaneDirection,
  phase: number,
): number {
  const steps = Math.max(1, Math.min(64, Math.round(stepsValue)));
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) {
    return steps - 1 - (phase % steps);
  }
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong && steps > 1) {
    const period = steps * 2 - 2;
    const position = phase % period;
    return position < steps ? position : period - position;
  }
  return phase % steps;
}

function normalizedStep(currentStep: unknown, stepCount: number, phase: number): number {
  if (typeof currentStep === 'number' && Number.isFinite(currentStep)) {
    return Math.max(0, Math.round(currentStep));
  }
  const steps = Number.isFinite(stepCount) ? Math.max(1, Math.round(stepCount)) : 1;
  return phase % steps;
}

function selectedDrumVoice(
  lane: ProductLaneSnapshot,
  laneIndex: number,
  hitCount: number,
  currentStep: unknown,
): DrumVoiceName {
  const seed = toU32(lane.seed);
  const mask = drumVoiceMaskFromEncodedSeed(seed);
  if (mask === 0) return drumVoiceFromMidi(lane.midiNote);

  const enabledVoices: number[] = [];
  for (let voice = 0; voice < DRUM_VOICE_NAMES.length; voice += 1) {
    if ((mask & (1 << voice)) !== 0) enabledVoices.push(voice);
  }
  if (enabledVoices.length === 0) return drumVoiceFromMidi(lane.midiNote);
  if (enabledVoices.length === 1) return DRUM_VOICE_NAMES[enabledVoices[0] ?? 1] ?? 'kick';

  const laneSeed = laneSeedFromEncodedDrumVoiceMask(seed);
  const hitPhase = Math.max(0, hitCount - 1);
  const relativeStep = typeof currentStep === 'number' && Number.isFinite(currentStep)
    ? Math.max(0, Math.round(currentStep))
    : hitPhase;
  const probabilitySeed = (laneSeed ^ Math.imul(relativeStep, 2654435761) ^ Math.imul(laneIndex, 16777619)) >>> 0;
  const selected = hashU32(probabilitySeed ^ laneSeed ^ Math.imul(hitPhase, 747796405) ^ 0x9e3779b9) % enabledVoices.length;
  return DRUM_VOICE_NAMES[enabledVoices[selected] ?? 1] ?? 'kick';
}

function drumVoiceMaskFromEncodedSeed(seed: number): number {
  return (seed & DRUM_VOICE_MASK_SEED_FLAG) !== 0
    ? (seed & DRUM_VOICE_MASK_SEED_MASK) >>> DRUM_VOICE_MASK_SEED_SHIFT
    : 0;
}

function laneSeedFromEncodedDrumVoiceMask(seed: number): number {
  return (seed & DRUM_VOICE_MASK_SEED_FLAG) !== 0
    ? seed & DRUM_VOICE_MASK_SEED_PAYLOAD_MASK
    : seed;
}

function drumVoiceFromMidi(midiNote: number): DrumVoiceName {
  const index = Math.max(0, Math.min(DRUM_VOICE_NAMES.length - 1, Math.round(midiNote - 36)));
  return DRUM_VOICE_NAMES[index] ?? 'kick';
}

function publishDrumMorphClear(
  lane: ProductLaneSnapshot,
  laneIndex: number,
  hitCount: number,
  currentStep: unknown,
  publish: CoreProductSequencerMorphFeedbackOptions['publish'],
): void {
  const seed = toU32(lane.seed);
  const mask = drumVoiceMaskFromEncodedSeed(seed);
  if (mask === 0) {
    publish('drumMorph', drumVoiceFromMidi(lane.midiNote), INACTIVE_MORPH_VALUE);
    return;
  }
  let published = false;
  for (let voice = 0; voice < DRUM_VOICE_NAMES.length; voice += 1) {
    if ((mask & (1 << voice)) === 0) continue;
    publish('drumMorph', DRUM_VOICE_NAMES[voice] ?? 'kick', INACTIVE_MORPH_VALUE);
    published = true;
  }
  if (!published) {
    publish('drumMorph', selectedDrumVoice(lane, laneIndex, hitCount, currentStep), INACTIVE_MORPH_VALUE);
  }
}

function hashU32(value: number): number {
  let next = value >>> 0;
  next ^= next >>> 16;
  next = Math.imul(next, 0x7feb352d) >>> 0;
  next ^= next >>> 15;
  next = Math.imul(next, 0x846ca68b) >>> 0;
  next ^= next >>> 16;
  return next >>> 0;
}

function normalizedHitCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function copyHitCounts(target: number[], source: number[] | undefined): void {
  for (let index = 0; index < MAX_FEEDBACK_LANES; index += 1) {
    target[index] = normalizedHitCount(source?.[index]);
  }
}

function toU32(value: number): number {
  return Number.isFinite(value) ? Math.round(value) >>> 0 : 0;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
