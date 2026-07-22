import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { SliderState, SerializedStepOverrides } from './state';
import { normalizeProductPlayConfigs, type ProductPlayConfig } from '../audio/productPlaySequencer';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { normalizeSequencerEvolveConfigs } from './sequencer/useEuclideanSequencer';
import { stepOverridesForEngineSubLaneState } from './sequencer/engineStepOverrides';
import { createEmptyStepOverrides, deserializeStepOverrides } from './sequencer/stepOverrideSerialization';
import { inferLegacySequencerSubLaneStatesFromOverrides } from './sequencer/sequencePresetLane';
import { clampEuclideanSubLaneSteps } from './sequencer/sequencerLimits';
import { drumPitchBaseMidiFromState, drumPitchUiValuesToEngineOffsets } from './sequencer/drumPitchSequencer';
import { SCALES, scaleDegreeToSemitone, type ClockDivision, type PitchBindingMode } from '../audio/drumSeqTypes';
import { calculateDriftedRoot } from '../audio/harmony';
import { getScaleByName } from '../audio/scales';
import { normalizeSequencerClockDivisions } from '../audio/sequencerClockDivisions';
import { normalizeSequencerLaneDirection } from '../audio/sequencerLaneDirection';
import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from '../audio/sequencerLaneCounts';
import { normalizeSequencerPitchBindingModes } from '../audio/sequencerPitchBinding';
import { normalizeSequencerPitchSettingsArray } from '../audio/sequencerPitchSettings';
import { normalizeSequencerSwings } from '../audio/sequencerSwing';

type SequencerRestorePreset = {
  state: SliderState;
  drumEvolveConfigs?: EvolveConfig[];
  synthEvolveConfigs?: EvolveConfig[];
  drumStepOverrides?: SerializedStepOverrides;
  synthStepOverrides?: SerializedStepOverrides;
  drumClockDivs?: ClockDivision[];
  synthClockDivs?: ClockDivision[];
  drumSwings?: number[];
  synthSwings?: number[];
  drumLinked?: boolean[];
  synthLinked?: boolean[];
  drumSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthArpConfigs?: ProductPlayConfig[];
  drumPitchSettings?: PitchSettings[];
  synthPitchSettings?: PitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
};

type PresetSequencerRestoreOptions = {
  drumClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  drumEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  drumLinkedRef: MutableRefObject<boolean[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  setDrumPresetVersion: Dispatch<SetStateAction<number>>;
  setProductDrumEuclidClockDivs: (clockDivs: ClockDivision[]) => void;
  setProductDrumEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductDrumEuclidSwings: (swings: number[]) => void;
  setProductDrumPitchSettings: (settings: PitchSettings[]) => void;
  setProductDrumStepOverrides: (overrides: StepOverrides, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  setProductDrumSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  setProductSequencerPresetHomeSnapshots: (
    drumPitchSettings?: PitchSettings[],
    drumPitchStates?: (SubLaneState | null | undefined)[],
    synthPitchStates?: (SubLaneState | null | undefined)[],
    options?: {
      drumStepOverrides?: StepOverrides;
      drumSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
      synthStepOverrides?: StepOverrides;
      synthSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
    },
  ) => void;
  setProductSynthEuclidClockDivs: (clockDivs: ClockDivision[]) => void;
  setProductSynthEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setProductSynthEuclidSwings: (swings: number[]) => void;
  setProductSynthPitchBindingModes: (modes: PitchBindingMode[]) => void;
  setProductSynthPitchSettings: (settings: PitchSettings[]) => void;
  setProductSynthStepOverrides: (overrides: StepOverrides, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  setProductSynthSubLaneEnabled: (enabled: Record<string, boolean>[]) => void;
  setSynthPresetVersion: Dispatch<SetStateAction<number>>;
  synthClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  synthEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  synthLinkedRef: MutableRefObject<boolean[] | undefined>;
  synthPitchBindingModesRef: MutableRefObject<PitchBindingMode[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthArpConfigsRef: MutableRefObject<ProductPlayConfig[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

const DEFAULT_SYNTH_EUCLIDEAN_CLOCK_DIVS: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4'];
const DEFAULT_DRUM_EUCLIDEAN_CLOCK_DIVS: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4', '1/16', '1/8'];
const DEFAULT_SYNTH_EUCLIDEAN_SWINGS = Array.from({ length: SYNTH_EUCLIDEAN_LANE_COUNT }, () => 0);
const DEFAULT_DRUM_EUCLIDEAN_SWINGS = Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }, () => 0);
const DEFAULT_SYNTH_EUCLIDEAN_LINKED = Array.from({ length: SYNTH_EUCLIDEAN_LANE_COUNT }, () => false);
const DEFAULT_DRUM_EUCLIDEAN_LINKED = Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }, () => false);
const DEFAULT_SYNTH_PITCH_BINDING_MODES: PitchBindingMode[] = ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'];
const EVOLVED_SUBLANE_RANGE_DEFAULTS: Partial<Record<SubLaneKind, { min: number; max: number }>> = {
  expression: { min: 0.75, max: 1 },
  morph: { min: 0.25, max: 0.75 },
  distance: { min: 0, max: 1 },
};

const STEP_OVERRIDE_ARRAY_FIELDS = ['probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'nudge', 'slice', 'reverse'] as const;
const STEP_OVERRIDE_DIRECTION_FIELDS = ['expressionDirection', 'morphDirection', 'distanceDirection', 'nudgeDirection', 'pitchDirection', 'sliceDirection', 'reverseDirection'] as const;
const STEP_OVERRIDE_RANGE_FIELDS = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;

export function createDefaultPitchSettings(laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT): PitchSettings[] {
  return Array.from({ length: laneCount }, () => ({
    mode: 'semitones',
    root: 60,
    scale: 'Major',
  }));
}

function createDefaultSynthPitchSettings(laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT): PitchSettings[] {
  return Array.from({ length: laneCount }, () => ({
    mode: 'semitones',
    root: 60,
    scale: 'Harmony',
  }));
}

function defaultEvolvedSubLaneState(lane: SubLaneKind): SubLaneState {
  const range = EVOLVED_SUBLANE_RANGE_DEFAULTS[lane];
  return {
    enabled: false,
    steps: lane === 'pitch' ? 5 : 4,
    direction: 'forward',
    ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
    ...(lane === 'nudge' ? { followTriggerHits: true } : {}),
    ...(range
      ? {
          valueMode: 'sequence' as const,
          rangeMin: range.min,
          rangeMax: range.max,
        }
      : {}),
  };
}

function expandStepOverridesToLaneCount(overrides: StepOverrides, laneCount: number): StepOverrides {
  const expanded = createEmptyStepOverrides(laneCount);
  expanded.triggerToggles = Array.from({ length: laneCount }, (_, index) => new Map(overrides.triggerToggles?.[index] ?? []));
  for (const field of STEP_OVERRIDE_ARRAY_FIELDS) {
    expanded[field] = Array.from({ length: laneCount }, (_, index) => overrides[field]?.[index] ?? null) as never;
  }
  for (const field of STEP_OVERRIDE_DIRECTION_FIELDS) {
    expanded[field] = Array.from({ length: laneCount }, (_, index) => overrides[field]?.[index] ?? null) as never;
  }
  for (const field of STEP_OVERRIDE_RANGE_FIELDS) {
    expanded[field] = Array.from({ length: laneCount }, (_, index) => {
      const range = overrides[field]?.[index];
      return range ? { min: range.min, max: range.max } : null;
    }) as never;
  }
  return expanded;
}

function clampSequencerUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSequencerSubLaneState(lane: SubLaneKind, state: Partial<SubLaneState> | undefined): SubLaneState {
  const fallback = defaultEvolvedSubLaneState(lane);
  const steps = typeof state?.steps === 'number' && Number.isFinite(state.steps)
    ? clampEuclideanSubLaneSteps(Math.floor(state.steps), fallback.steps)
    : fallback.steps;
  const next: SubLaneState = {
    ...fallback,
    enabled: state?.enabled === true,
    steps,
    direction: normalizeSequencerLaneDirection(state?.direction, fallback.direction),
  };
  if (lane === 'pitch') {
    next.scaleQuantize = false;
  }
  if (lane === 'nudge') {
    next.followTriggerHits = true;
  }
  const rangeFallback = EVOLVED_SUBLANE_RANGE_DEFAULTS[lane];
  if (rangeFallback) {
    const min = typeof state?.rangeMin === 'number' && Number.isFinite(state.rangeMin) ? clampSequencerUnit(state.rangeMin) : rangeFallback.min;
    const max = typeof state?.rangeMax === 'number' && Number.isFinite(state.rangeMax) ? clampSequencerUnit(state.rangeMax) : rangeFallback.max;
    next.valueMode = state?.valueMode === 'range' ? 'range' : 'sequence';
    next.rangeMin = Math.min(min, max);
    next.rangeMax = Math.max(min, max);
  }
  return next;
}

export function sanitizeSequencerSubLaneStates(
  states: Partial<Record<SubLaneKind, Partial<SubLaneState>>>[] | undefined,
): Record<SubLaneKind, SubLaneState>[] | undefined {
  if (!states) return undefined;
  return states.map((state) => {
    const partial = state && typeof state === 'object' ? (state as Partial<Record<SubLaneKind, Partial<SubLaneState>>>) : {};
    return {
      pitch: sanitizeSequencerSubLaneState('pitch', partial.pitch),
      expression: sanitizeSequencerSubLaneState('expression', partial.expression),
      morph: sanitizeSequencerSubLaneState('morph', partial.morph),
      distance: sanitizeSequencerSubLaneState('distance', partial.distance),
      nudge: sanitizeSequencerSubLaneState('nudge', partial.nudge),
      slice: sanitizeSequencerSubLaneState('slice', partial.slice),
      reverse: sanitizeSequencerSubLaneState('reverse', partial.reverse),
    };
  });
}

function restoreSequencerSubLaneStates(
  states: Partial<Record<SubLaneKind, Partial<SubLaneState>>>[] | undefined,
  overrides: SerializedStepOverrides | undefined,
  laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT,
): Record<SubLaneKind, SubLaneState>[] | undefined {
  const inferred = inferLegacySequencerSubLaneStatesFromOverrides(overrides, laneCount);
  if (!states || states.length === 0) {
    return sanitizeSequencerSubLaneStates(inferred);
  }
  if (!inferred || inferred.length === 0) {
    return sanitizeSequencerSubLaneStates(states);
  }
  const mergedLaneCount = Math.max(laneCount, states.length, inferred.length);
  return sanitizeSequencerSubLaneStates(
    Array.from({ length: mergedLaneCount }, (_, laneIndex) => ({
      ...(inferred[laneIndex] ?? {}),
      ...(states[laneIndex] ?? {}),
    })),
  );
}

function mapSubLaneStatesToEnabledFlags(
  states: Record<SubLaneKind, SubLaneState>[] | undefined,
  arpConfigs?: ProductPlayConfig[],
  laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT,
): Record<string, boolean>[] {
  return Array.from({ length: laneCount }, (_, index) => ({
    pitch: states?.[index]?.pitch.enabled === true || arpConfigs?.[index]?.enabled === true,
    expression: states?.[index]?.expression.enabled === true,
    ratchet: states?.[index]?.expression.enabled === true,
    morph: states?.[index]?.morph.enabled === true,
    distance: states?.[index]?.distance.enabled === true,
    nudge: states?.[index]?.nudge.enabled === true,
    slice: states?.[index]?.slice.enabled === true,
    reverse: states?.[index]?.reverse.enabled === true,
    arp: arpConfigs?.[index]?.enabled === true,
    play: arpConfigs?.[index]?.enabled === true,
  }));
}

function rangeOverrideFromSubLaneState(lane: SubLaneState | undefined, fallbackMin: number, fallbackMax: number): { min: number; max: number } | null {
  if (!lane?.enabled || lane.valueMode !== 'range') return null;
  const min = clampSequencerUnit(typeof lane.rangeMin === 'number' ? lane.rangeMin : fallbackMin);
  const max = clampSequencerUnit(typeof lane.rangeMax === 'number' ? lane.rangeMax : fallbackMax);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function rangeOverridesFromSubLaneStates(states: Record<SubLaneKind, SubLaneState>[] | undefined, laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT): Pick<StepOverrides, 'expressionRanges' | 'morphRanges' | 'distanceRanges'> {
  const count = Math.max(laneCount, states?.length ?? 0);
  return {
    expressionRanges: Array.from({ length: count }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.expression, 0.75, 1)),
    morphRanges: Array.from({ length: count }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.morph, 0, 1)),
    distanceRanges: Array.from({ length: count }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.distance, 0, 1)),
  };
}

function stepOverridesWithRestoredRanges(overrides: StepOverrides, subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined, laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT): StepOverrides {
  return {
    ...overrides,
    ...rangeOverridesFromSubLaneStates(subLaneStates, laneCount),
  };
}

function drumStepOverridesForEngineRestore(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
  state: SliderState,
  laneCount: number = DRUM_EUCLIDEAN_LANE_COUNT,
): StepOverrides {
  const pitch = overrides.pitch.map((offsets, laneIdx) => {
    if (!offsets) return null;
    if (!subLaneStates?.[laneIdx]?.pitch?.enabled) return null;
    return drumPitchUiValuesToEngineOffsets(offsets, pitchSettings[laneIdx], drumPitchBaseMidiFromState(state, laneIdx));
  });
  return stepOverridesForEngineSubLaneState(
    {
      ...stepOverridesWithRestoredRanges(overrides, subLaneStates, laneCount),
      pitch,
    },
    subLaneStates,
  );
}

function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

function rootMidiWithPitchClass(baseMidi: number, rootPitchClass: number): number {
  const base = Math.max(0, Math.min(127, Math.round(baseMidi)));
  const candidate = Math.floor(base / 12) * 12 + pitchClass(rootPitchClass);
  return Math.max(0, Math.min(127, candidate > 127 ? candidate - 12 : candidate));
}

function restoredSynthPitchRootAndScale(settings: PitchSettings, state: SliderState) {
  if (settings.scale !== 'Harmony') {
    return {
      root: settings.root,
      scaleIntervals: SCALES[settings.scale] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11],
    };
  }
  const harmonyRoot = state.cofDriftEnabled
    ? calculateDriftedRoot(state.rootNote, state.cofCurrentStep ?? 0)
    : state.rootNote;
  return {
    root: rootMidiWithPitchClass(60, harmonyRoot),
    scaleIntervals: state.scaleMode === 'manual'
      ? getScaleByName(state.manualScale)?.intervals ?? SCALES.Harmony
      : SCALES.Harmony,
  };
}

function synthPitchOverridesForEngine(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
  state: SliderState,
): StepOverrides['pitch'] {
  return overrides.pitch.map((offsets, laneIdx) => {
    if (!offsets) return null;
    if (!subLaneStates?.[laneIdx]?.pitch?.enabled) return null;
    const settings = pitchSettings[laneIdx];
    if (!settings) return offsets;
    if (settings.mode === 'noteRange') return null;
    const resolvedPitch = restoredSynthPitchRootAndScale(settings, state);
    if (settings.mode === 'notes') {
      return offsets.map((midi) => Math.max(0, Math.min(127, Math.round(midi))));
    }
    if (settings.mode === 'semitones') {
      const { root, scaleIntervals } = resolvedPitch;
      return offsets.map((degree) => root + scaleDegreeToSemitone(degree, scaleIntervals));
    }
    return offsets.map((offset) => resolvedPitch.root + offset);
  });
}

function synthStepOverridesForEngineRestore(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
  state: SliderState,
  laneCount: number = SYNTH_EUCLIDEAN_LANE_COUNT,
): StepOverrides {
  return stepOverridesForEngineSubLaneState(
    {
      ...stepOverridesWithRestoredRanges(overrides, subLaneStates, laneCount),
      pitch: synthPitchOverridesForEngine(overrides, subLaneStates, pitchSettings, state),
    },
    subLaneStates,
  );
}

export function usePresetSequencerRestore({
  drumClockDivsRef,
  drumEvolveConfigsRef,
  drumLinkedRef,
  drumPitchSettingsRef,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  setDrumPresetVersion,
  setProductDrumEuclidClockDivs,
  setProductDrumEuclidEvolveConfigs,
  setProductDrumEuclidSwings,
  setProductDrumPitchSettings,
  setProductDrumStepOverrides,
  setProductDrumSubLaneEnabled,
  setProductSequencerPresetHomeSnapshots,
  setProductSynthEuclidClockDivs,
  setProductSynthEuclidEvolveConfigs,
  setProductSynthEuclidSwings,
  setProductSynthPitchBindingModes,
  setProductSynthPitchSettings,
  setProductSynthStepOverrides,
  setProductSynthSubLaneEnabled,
  setSynthPresetVersion,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthArpConfigsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: PresetSequencerRestoreOptions): (preset: SequencerRestorePreset) => void {
  return useCallback(
    (preset: SequencerRestorePreset) => {
      const drumConfigs = normalizeSequencerEvolveConfigs('drum', preset.drumEvolveConfigs, DRUM_EUCLIDEAN_LANE_COUNT);
      drumEvolveConfigsRef.current = drumConfigs;
      setProductDrumEuclidEvolveConfigs(drumConfigs);

      const synthConfigs = normalizeSequencerEvolveConfigs('synth', preset.synthEvolveConfigs, SYNTH_EUCLIDEAN_LANE_COUNT);
      synthEvolveConfigsRef.current = synthConfigs;
      setProductSynthEuclidEvolveConfigs(synthConfigs);

      const drumClockDivs = normalizeSequencerClockDivisions(preset.drumClockDivs ?? DEFAULT_DRUM_EUCLIDEAN_CLOCK_DIVS, DRUM_EUCLIDEAN_LANE_COUNT);
      drumClockDivsRef.current = drumClockDivs;
      setProductDrumEuclidClockDivs(drumClockDivs);
      const synthClockDivs = normalizeSequencerClockDivisions(preset.synthClockDivs ?? DEFAULT_SYNTH_EUCLIDEAN_CLOCK_DIVS, SYNTH_EUCLIDEAN_LANE_COUNT);
      synthClockDivsRef.current = synthClockDivs;
      setProductSynthEuclidClockDivs(synthClockDivs);

      const drumSwings = normalizeSequencerSwings(preset.drumSwings ?? DEFAULT_DRUM_EUCLIDEAN_SWINGS, DRUM_EUCLIDEAN_LANE_COUNT);
      drumSwingsRef.current = drumSwings;
      setProductDrumEuclidSwings(drumSwings);
      const synthSwings = normalizeSequencerSwings(preset.synthSwings ?? DEFAULT_SYNTH_EUCLIDEAN_SWINGS, SYNTH_EUCLIDEAN_LANE_COUNT);
      synthSwingsRef.current = synthSwings;
      setProductSynthEuclidSwings(synthSwings);

      drumLinkedRef.current = Array.from({ length: DRUM_EUCLIDEAN_LANE_COUNT }, (_, index) => preset.drumLinked?.[index] === true || DEFAULT_DRUM_EUCLIDEAN_LINKED[index] === true);
      synthLinkedRef.current = Array.from({ length: SYNTH_EUCLIDEAN_LANE_COUNT }, (_, index) => preset.synthLinked?.[index] === true || DEFAULT_SYNTH_EUCLIDEAN_LINKED[index] === true);

      const drumSubLaneStates = restoreSequencerSubLaneStates(preset.drumSubLaneStates, preset.drumStepOverrides, DRUM_EUCLIDEAN_LANE_COUNT);
      const synthSubLaneStates = restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides, SYNTH_EUCLIDEAN_LANE_COUNT);
      drumSubLaneStatesRef.current = drumSubLaneStates;
      synthSubLaneStatesRef.current = synthSubLaneStates;
      const drumPitchSettings = normalizeSequencerPitchSettingsArray(preset.drumPitchSettings ?? createDefaultPitchSettings(DRUM_EUCLIDEAN_LANE_COUNT), DRUM_EUCLIDEAN_LANE_COUNT) as PitchSettings[];
      const synthPitchSettings = normalizeSequencerPitchSettingsArray(preset.synthPitchSettings ?? createDefaultSynthPitchSettings(), SYNTH_EUCLIDEAN_LANE_COUNT) as PitchSettings[];
      drumPitchSettingsRef.current = drumPitchSettings;
      synthPitchSettingsRef.current = synthPitchSettings;
      const synthArpConfigs = normalizeProductPlayConfigs(preset.synthArpConfigs, SYNTH_EUCLIDEAN_LANE_COUNT);
      synthArpConfigsRef.current = synthArpConfigs;

      setProductDrumSubLaneEnabled(mapSubLaneStatesToEnabledFlags(drumSubLaneStates, undefined, DRUM_EUCLIDEAN_LANE_COUNT));
      setProductSynthSubLaneEnabled(mapSubLaneStatesToEnabledFlags(synthSubLaneStates, synthArpConfigs, SYNTH_EUCLIDEAN_LANE_COUNT));
      setProductDrumPitchSettings(drumPitchSettings);
      setProductSynthPitchSettings(synthPitchSettings);

      const synthPitchBindingModes = normalizeSequencerPitchBindingModes(preset.synthPitchBindingModes ?? DEFAULT_SYNTH_PITCH_BINDING_MODES, SYNTH_EUCLIDEAN_LANE_COUNT);
      synthPitchBindingModesRef.current = synthPitchBindingModes;
      setProductSynthPitchBindingModes(synthPitchBindingModes);

      const drumStepOverrides = expandStepOverridesToLaneCount(
        deserializeStepOverrides(preset.drumStepOverrides) ?? createEmptyStepOverrides(DRUM_EUCLIDEAN_LANE_COUNT),
        DRUM_EUCLIDEAN_LANE_COUNT,
      );
      drumStepOverridesRef.current = drumStepOverrides;
      const drumEngineStepOverrides = drumStepOverridesForEngineRestore(
        drumStepOverrides,
        drumSubLaneStates,
        drumPitchSettings,
        preset.state,
        DRUM_EUCLIDEAN_LANE_COUNT,
      );
      setProductDrumStepOverrides(
        drumEngineStepOverrides,
        drumSubLaneStates,
      );
      const synthStepOverrides = expandStepOverridesToLaneCount(
        deserializeStepOverrides(preset.synthStepOverrides) ?? createEmptyStepOverrides(SYNTH_EUCLIDEAN_LANE_COUNT),
        SYNTH_EUCLIDEAN_LANE_COUNT,
      );
      synthStepOverridesRef.current = synthStepOverrides;
      const synthEngineStepOverrides = synthStepOverridesForEngineRestore(
        synthStepOverrides,
        synthSubLaneStates,
        synthPitchSettings,
        preset.state,
        SYNTH_EUCLIDEAN_LANE_COUNT,
      );
      setProductSynthStepOverrides(
        synthEngineStepOverrides,
        synthSubLaneStates,
      );
      setProductSequencerPresetHomeSnapshots(
        drumPitchSettings,
        drumSubLaneStates?.map((state) => state.pitch),
        synthSubLaneStates?.map((state) => state.pitch),
        {
          drumStepOverrides: drumEngineStepOverrides,
          drumSubLaneStates,
          synthStepOverrides: synthEngineStepOverrides,
          synthSubLaneStates,
        },
      );

      setDrumPresetVersion((v) => v + 1);
      setSynthPresetVersion((v) => v + 1);
    },
    [
      drumClockDivsRef,
      drumEvolveConfigsRef,
      drumLinkedRef,
      drumPitchSettingsRef,
      drumStepOverridesRef,
      drumSubLaneStatesRef,
      drumSwingsRef,
      setDrumPresetVersion,
      setProductDrumEuclidClockDivs,
      setProductDrumEuclidEvolveConfigs,
      setProductDrumEuclidSwings,
      setProductDrumPitchSettings,
      setProductDrumStepOverrides,
      setProductDrumSubLaneEnabled,
      setProductSequencerPresetHomeSnapshots,
      setProductSynthEuclidClockDivs,
      setProductSynthEuclidEvolveConfigs,
      setProductSynthEuclidSwings,
      setProductSynthPitchBindingModes,
      setProductSynthPitchSettings,
      setProductSynthStepOverrides,
      setProductSynthSubLaneEnabled,
      setSynthPresetVersion,
      synthClockDivsRef,
      synthEvolveConfigsRef,
      synthLinkedRef,
      synthPitchBindingModesRef,
      synthPitchSettingsRef,
      synthArpConfigsRef,
      synthStepOverridesRef,
      synthSubLaneStatesRef,
      synthSwingsRef,
    ],
  );
}
