import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { SliderState, SerializedStepOverrides } from './state';
import type { StepOverrides, SubLaneKind, SubLaneState, PitchSettings, EvolveConfig } from './sequencer/useEuclideanSequencer';
import { normalizeSequencerEvolveConfigs } from './sequencer/useEuclideanSequencer';
import { stepOverridesForEngineSubLaneState } from './sequencer/engineStepOverrides';
import { createEmptyStepOverrides, deserializeStepOverrides } from './sequencer/stepOverrideSerialization';
import { inferLegacySequencerSubLaneStatesFromOverrides } from './sequencer/sequencePresetLane';
import { drumPitchBaseMidiFromState, drumPitchUiValuesToEngineOffsets } from './sequencer/drumPitchSequencer';
import { SCALES, scaleDegreeToSemitone, type ClockDivision, type PitchBindingMode } from '../audio/drumSeqTypes';
import { normalizeSequencerClockDivisions } from '../audio/sequencerClockDivisions';
import { normalizeSequencerLaneDirection } from '../audio/sequencerLaneDirection';
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
  setSelectedDrumEuclidClockDivs: (clockDivs: ClockDivision[]) => void;
  setSelectedDrumEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setSelectedDrumEuclidSwings: (swings: number[]) => void;
  setSelectedDrumStepOverrides: (overrides: StepOverrides) => void;
  setSelectedDrumSubLaneEnabled: (enabled: Record<SubLaneKind, boolean>[]) => void;
  setSelectedSequencerPresetHomeSnapshots: () => void;
  setSelectedSynthEuclidClockDivs: (clockDivs: ClockDivision[]) => void;
  setSelectedSynthEuclidEvolveConfigs: (configs: EvolveConfig[]) => void;
  setSelectedSynthEuclidSwings: (swings: number[]) => void;
  setSelectedSynthPitchBindingModes: (modes: PitchBindingMode[]) => void;
  setSelectedSynthPitchSettings: (settings: PitchSettings[]) => void;
  setSelectedSynthStepOverrides: (overrides: StepOverrides) => void;
  setSelectedSynthSubLaneEnabled: (enabled: Record<SubLaneKind, boolean>[]) => void;
  setSynthPresetVersion: Dispatch<SetStateAction<number>>;
  synthClockDivsRef: MutableRefObject<ClockDivision[] | undefined>;
  synthEvolveConfigsRef: MutableRefObject<EvolveConfig[] | undefined>;
  synthLinkedRef: MutableRefObject<boolean[] | undefined>;
  synthPitchBindingModesRef: MutableRefObject<PitchBindingMode[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
};

const DEFAULT_EUCLIDEAN_CLOCK_DIVS: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4'];
const DEFAULT_EUCLIDEAN_SWINGS = [0, 0, 0, 0];
const DEFAULT_EUCLIDEAN_LINKED = [false, false, false, false];
const DEFAULT_SYNTH_PITCH_BINDING_MODES: PitchBindingMode[] = ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'];
const EVOLVED_SUBLANE_RANGE_DEFAULTS: Partial<Record<SubLaneKind, { min: number; max: number }>> = {
  expression: { min: 0.75, max: 1 },
  morph: { min: 0.25, max: 0.75 },
  distance: { min: 0, max: 1 },
};

export function createDefaultPitchSettings(): PitchSettings[] {
  return Array.from({ length: 4 }, () => ({
    mode: 'semitones',
    root: 60,
    scale: 'Major',
  }));
}

function defaultEvolvedSubLaneState(lane: SubLaneKind): SubLaneState {
  const range = EVOLVED_SUBLANE_RANGE_DEFAULTS[lane];
  return {
    enabled: false,
    steps: lane === 'pitch' ? 5 : 4,
    direction: 'forward',
    ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
    ...(range
      ? {
          valueMode: 'sequence' as const,
          rangeMin: range.min,
          rangeMax: range.max,
        }
      : {}),
  };
}

function clampSequencerUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSequencerSubLaneState(lane: SubLaneKind, state: Partial<SubLaneState> | undefined): SubLaneState {
  const fallback = defaultEvolvedSubLaneState(lane);
  const steps = typeof state?.steps === 'number' && Number.isFinite(state.steps) ? Math.max(1, Math.min(16, Math.floor(state.steps))) : fallback.steps;
  const next: SubLaneState = {
    ...fallback,
    enabled: state?.enabled === true,
    steps,
    direction: normalizeSequencerLaneDirection(state?.direction, fallback.direction),
  };
  if (lane === 'pitch') {
    next.scaleQuantize = state?.scaleQuantize === true;
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
      slice: sanitizeSequencerSubLaneState('slice', partial.slice),
      reverse: sanitizeSequencerSubLaneState('reverse', partial.reverse),
    };
  });
}

function restoreSequencerSubLaneStates(
  states: Partial<Record<SubLaneKind, Partial<SubLaneState>>>[] | undefined,
  overrides: SerializedStepOverrides | undefined,
): Record<SubLaneKind, SubLaneState>[] | undefined {
  const inferred = inferLegacySequencerSubLaneStatesFromOverrides(overrides);
  if (!states || states.length === 0) {
    return sanitizeSequencerSubLaneStates(inferred);
  }
  if (!inferred || inferred.length === 0) {
    return sanitizeSequencerSubLaneStates(states);
  }
  const laneCount = Math.max(states.length, inferred.length);
  return sanitizeSequencerSubLaneStates(
    Array.from({ length: laneCount }, (_, laneIndex) => ({
      ...(inferred[laneIndex] ?? {}),
      ...(states[laneIndex] ?? {}),
    })),
  );
}

function mapSubLaneStatesToEnabledFlags(states: Record<SubLaneKind, SubLaneState>[] | undefined): Record<SubLaneKind, boolean>[] {
  if (!states) {
    return Array.from({ length: 4 }, () => ({
      pitch: false,
      expression: false,
      morph: false,
      distance: false,
      slice: false,
      reverse: false,
    }));
  }
  return Array.from({ length: 4 }, (_, index) => ({
    pitch: states[index]?.pitch.enabled === true,
    expression: states[index]?.expression.enabled === true,
    morph: states[index]?.morph.enabled === true,
    distance: states[index]?.distance.enabled === true,
    slice: states[index]?.slice.enabled === true,
    reverse: states[index]?.reverse.enabled === true,
  }));
}

function rangeOverrideFromSubLaneState(lane: SubLaneState | undefined, fallbackMin: number, fallbackMax: number): { min: number; max: number } | null {
  if (!lane?.enabled || lane.valueMode !== 'range') return null;
  const min = clampSequencerUnit(typeof lane.rangeMin === 'number' ? lane.rangeMin : fallbackMin);
  const max = clampSequencerUnit(typeof lane.rangeMax === 'number' ? lane.rangeMax : fallbackMax);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function rangeOverridesFromSubLaneStates(states: Record<SubLaneKind, SubLaneState>[] | undefined): Pick<StepOverrides, 'expressionRanges' | 'morphRanges' | 'distanceRanges'> {
  return {
    expressionRanges: Array.from({ length: 4 }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.expression, 0.75, 1)),
    morphRanges: Array.from({ length: 4 }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.morph, 0, 1)),
    distanceRanges: Array.from({ length: 4 }, (_, index) => rangeOverrideFromSubLaneState(states?.[index]?.distance, 0, 1)),
  };
}

function stepOverridesWithRestoredRanges(overrides: StepOverrides, subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined): StepOverrides {
  return {
    ...overrides,
    ...rangeOverridesFromSubLaneStates(subLaneStates),
  };
}

function drumStepOverridesForEngineRestore(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
  state: SliderState,
): StepOverrides {
  const pitch = overrides.pitch.map((offsets, laneIdx) => {
    if (!offsets) return null;
    if (!subLaneStates?.[laneIdx]?.pitch?.enabled) return null;
    return drumPitchUiValuesToEngineOffsets(offsets, pitchSettings[laneIdx], drumPitchBaseMidiFromState(state, laneIdx), subLaneStates[laneIdx]?.pitch?.scaleQuantize === true);
  });
  return stepOverridesForEngineSubLaneState(
    {
      ...stepOverridesWithRestoredRanges(overrides, subLaneStates),
      pitch,
    },
    subLaneStates,
  );
}

function synthPitchOverridesForEngine(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
): StepOverrides['pitch'] {
  return overrides.pitch.map((offsets, laneIdx) => {
    if (!offsets) return null;
    if (!subLaneStates?.[laneIdx]?.pitch?.enabled) return null;
    const settings = pitchSettings[laneIdx];
    if (!settings) return offsets;
    if (settings.mode === 'noteRange') return null;
    if (settings.mode === 'notes') {
      const scaleIntervals = SCALES[settings.scale] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11];
      return offsets.map((degree) => settings.root + scaleDegreeToSemitone(degree, scaleIntervals));
    }
    return offsets.map((offset) => settings.root + offset);
  });
}

function synthStepOverridesForEngineRestore(
  overrides: StepOverrides,
  subLaneStates: Record<SubLaneKind, SubLaneState>[] | undefined,
  pitchSettings: PitchSettings[],
): StepOverrides {
  return stepOverridesForEngineSubLaneState(
    {
      ...stepOverridesWithRestoredRanges(overrides, subLaneStates),
      pitch: synthPitchOverridesForEngine(overrides, subLaneStates, pitchSettings),
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
  setSelectedDrumEuclidClockDivs,
  setSelectedDrumEuclidEvolveConfigs,
  setSelectedDrumEuclidSwings,
  setSelectedDrumStepOverrides,
  setSelectedDrumSubLaneEnabled,
  setSelectedSequencerPresetHomeSnapshots,
  setSelectedSynthEuclidClockDivs,
  setSelectedSynthEuclidEvolveConfigs,
  setSelectedSynthEuclidSwings,
  setSelectedSynthPitchBindingModes,
  setSelectedSynthPitchSettings,
  setSelectedSynthStepOverrides,
  setSelectedSynthSubLaneEnabled,
  setSynthPresetVersion,
  synthClockDivsRef,
  synthEvolveConfigsRef,
  synthLinkedRef,
  synthPitchBindingModesRef,
  synthPitchSettingsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
}: PresetSequencerRestoreOptions): (preset: SequencerRestorePreset) => void {
  return useCallback(
    (preset: SequencerRestorePreset) => {
      const drumConfigs = normalizeSequencerEvolveConfigs('drum', preset.drumEvolveConfigs, 4);
      drumEvolveConfigsRef.current = drumConfigs;
      setSelectedDrumEuclidEvolveConfigs(drumConfigs);

      const synthConfigs = normalizeSequencerEvolveConfigs('synth', preset.synthEvolveConfigs, 4);
      synthEvolveConfigsRef.current = synthConfigs;
      setSelectedSynthEuclidEvolveConfigs(synthConfigs);

      const drumClockDivs = normalizeSequencerClockDivisions(preset.drumClockDivs ?? DEFAULT_EUCLIDEAN_CLOCK_DIVS, 4);
      drumClockDivsRef.current = drumClockDivs;
      setSelectedDrumEuclidClockDivs(drumClockDivs);
      const synthClockDivs = normalizeSequencerClockDivisions(preset.synthClockDivs ?? DEFAULT_EUCLIDEAN_CLOCK_DIVS, 4);
      synthClockDivsRef.current = synthClockDivs;
      setSelectedSynthEuclidClockDivs(synthClockDivs);

      const drumSwings = normalizeSequencerSwings(preset.drumSwings ?? DEFAULT_EUCLIDEAN_SWINGS, 4);
      drumSwingsRef.current = drumSwings;
      setSelectedDrumEuclidSwings(drumSwings);
      const synthSwings = normalizeSequencerSwings(preset.synthSwings ?? DEFAULT_EUCLIDEAN_SWINGS, 4);
      synthSwingsRef.current = synthSwings;
      setSelectedSynthEuclidSwings(synthSwings);

      drumLinkedRef.current = preset.drumLinked ?? [...DEFAULT_EUCLIDEAN_LINKED];
      synthLinkedRef.current = preset.synthLinked ?? [...DEFAULT_EUCLIDEAN_LINKED];

      const drumSubLaneStates = restoreSequencerSubLaneStates(preset.drumSubLaneStates, preset.drumStepOverrides);
      const synthSubLaneStates = restoreSequencerSubLaneStates(preset.synthSubLaneStates, preset.synthStepOverrides);
      drumSubLaneStatesRef.current = drumSubLaneStates;
      synthSubLaneStatesRef.current = synthSubLaneStates;
      const drumPitchSettings = normalizeSequencerPitchSettingsArray(preset.drumPitchSettings ?? createDefaultPitchSettings(), 4) as PitchSettings[];
      const synthPitchSettings = normalizeSequencerPitchSettingsArray(preset.synthPitchSettings ?? createDefaultPitchSettings(), 4) as PitchSettings[];
      drumPitchSettingsRef.current = drumPitchSettings;
      synthPitchSettingsRef.current = synthPitchSettings;

      setSelectedDrumSubLaneEnabled(mapSubLaneStatesToEnabledFlags(drumSubLaneStates));
      setSelectedSynthSubLaneEnabled(mapSubLaneStatesToEnabledFlags(synthSubLaneStates));
      setSelectedSynthPitchSettings(synthPitchSettings);

      const synthPitchBindingModes = normalizeSequencerPitchBindingModes(preset.synthPitchBindingModes ?? DEFAULT_SYNTH_PITCH_BINDING_MODES, 4);
      synthPitchBindingModesRef.current = synthPitchBindingModes;
      setSelectedSynthPitchBindingModes(synthPitchBindingModes);

      const drumStepOverrides = deserializeStepOverrides(preset.drumStepOverrides) ?? createEmptyStepOverrides();
      drumStepOverridesRef.current = drumStepOverrides;
      setSelectedDrumStepOverrides(drumStepOverridesForEngineRestore(drumStepOverrides, drumSubLaneStates, drumPitchSettings, preset.state));
      const synthStepOverrides = deserializeStepOverrides(preset.synthStepOverrides) ?? createEmptyStepOverrides();
      synthStepOverridesRef.current = synthStepOverrides;
      setSelectedSynthStepOverrides(synthStepOverridesForEngineRestore(synthStepOverrides, synthSubLaneStates, synthPitchSettings));
      setSelectedSequencerPresetHomeSnapshots();

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
      setSelectedDrumEuclidClockDivs,
      setSelectedDrumEuclidEvolveConfigs,
      setSelectedDrumEuclidSwings,
      setSelectedDrumStepOverrides,
      setSelectedDrumSubLaneEnabled,
      setSelectedSequencerPresetHomeSnapshots,
      setSelectedSynthEuclidClockDivs,
      setSelectedSynthEuclidEvolveConfigs,
      setSelectedSynthEuclidSwings,
      setSelectedSynthPitchBindingModes,
      setSelectedSynthPitchSettings,
      setSelectedSynthStepOverrides,
      setSelectedSynthSubLaneEnabled,
      setSynthPresetVersion,
      synthClockDivsRef,
      synthEvolveConfigsRef,
      synthLinkedRef,
      synthPitchBindingModesRef,
      synthPitchSettingsRef,
      synthStepOverridesRef,
      synthSubLaneStatesRef,
      synthSwingsRef,
    ],
  );
}
