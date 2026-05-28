import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { normalizeSequencerSwing } from '../audio/sequencerSwing';
import { mergeRuntimeValues } from './runtimeValueState';
import { emitVisualizerPulse } from './visualizer/visualizerSignals';
import type { LaneDirection, TrigCondition } from '../audio/drumSeqTypes';
import type { PitchSettings, StepOverrides, SubLaneKind, SubLaneState } from './sequencer/useEuclideanSequencer';

type EvolvedSubLanePatch = Partial<Record<SubLaneKind, Partial<SubLaneState>>>;
type EvolvedRangeOverride = { min: number; max: number };
export type EvolvedOverrideState = {
  laneIndex: number;
  version: number;
  data: Partial<StepOverrides> & { pitchSettings?: (PitchSettings | null)[] };
  swing?: number;
  subLaneStates?: EvolvedSubLanePatch;
};

type EvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type SynthNoteRangeCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

type UseSelectedAudioEngineEvolveOverrideCallbacksOptions = {
  activeTab: string;
  createDefaultPitchSettings: () => PitchSettings[];
  drumStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  drumSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  drumSwingsRef: MutableRefObject<number[] | undefined>;
  drumPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  synthStepOverridesRef: MutableRefObject<StepOverrides | undefined>;
  synthSubLaneStatesRef: MutableRefObject<Record<SubLaneKind, SubLaneState>[] | undefined>;
  synthSwingsRef: MutableRefObject<number[] | undefined>;
  synthPitchSettingsRef: MutableRefObject<PitchSettings[] | undefined>;
  setSelectedDrumEvolveOverridesChangedCallback: (callback: EvolveOverrideCallback | null) => void;
  setSelectedSynthEvolveOverridesChangedCallback: (callback: EvolveOverrideCallback | null) => void;
  setSelectedSynthNoteRangeEvolvedCallback: (callback: SynthNoteRangeCallback | null) => void;
};

type SelectedAudioEngineEvolveOverrideState = {
  drumEvolvedOverrides: EvolvedOverrideState | undefined;
  synthEvolvedOverrides: EvolvedOverrideState | undefined;
};

const DEFAULT_EUCLIDEAN_SWINGS = [0, 0, 0, 0];
const EVOLVED_SUBLANE_KEYS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance'];
const EVOLVED_SUBLANE_RANGE_DEFAULTS: Partial<Record<SubLaneKind, { min: number; max: number }>> = {
  expression: { min: 0.75, max: 1 },
  morph: { min: 0.25, max: 0.75 },
  distance: { min: 0, max: 1 },
};

function defaultEvolvedSubLaneState(lane: SubLaneKind): SubLaneState {
  const range = EVOLVED_SUBLANE_RANGE_DEFAULTS[lane];
  return {
    enabled: false,
    steps: lane === 'pitch' ? 5 : 4,
    direction: 'forward',
    ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
    ...(range ? { valueMode: 'sequence' as const, rangeMin: range.min, rangeMax: range.max } : {}),
  };
}

function defaultEvolvedSubLaneStates(laneCount: number): Record<SubLaneKind, SubLaneState>[] {
  return Array.from({ length: laneCount }, () => ({
    pitch: defaultEvolvedSubLaneState('pitch'),
    expression: defaultEvolvedSubLaneState('expression'),
    morph: defaultEvolvedSubLaneState('morph'),
    distance: defaultEvolvedSubLaneState('distance'),
    slice: defaultEvolvedSubLaneState('slice'),
    reverse: defaultEvolvedSubLaneState('reverse'),
  }));
}

function normalizeEvolvedSubLanePatch(value: unknown): EvolvedSubLanePatch | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: EvolvedSubLanePatch = {};
  for (const lane of EVOLVED_SUBLANE_KEYS) {
    const patch = (value as Record<string, unknown>)[lane];
    if (patch && typeof patch === 'object' && !Array.isArray(patch)) out[lane] = patch as Partial<SubLaneState>;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function emptyEvolvedRangeOverrides(): (EvolvedRangeOverride | null)[] {
  return [null, null, null, null];
}

function mergeEvolvedSubLanePatch(
  current: Record<SubLaneKind, SubLaneState>[] | undefined,
  laneIndex: number,
  patch: EvolvedSubLanePatch | undefined,
): Record<SubLaneKind, SubLaneState>[] | undefined {
  if (!patch) return current;
  const base = current ?? defaultEvolvedSubLaneStates(Math.max(4, laneIndex + 1));
  return base.map((laneState, index) => index === laneIndex
    ? {
        ...laneState,
        ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [
          key,
          { ...laneState[key as SubLaneKind], ...(value ?? {}) },
        ])) as Record<SubLaneKind, SubLaneState>,
      }
    : laneState);
}

export function useSelectedAudioEngineEvolveOverrideCallbacks({
  activeTab,
  createDefaultPitchSettings,
  drumStepOverridesRef,
  drumSubLaneStatesRef,
  drumSwingsRef,
  drumPitchSettingsRef,
  synthStepOverridesRef,
  synthSubLaneStatesRef,
  synthSwingsRef,
  synthPitchSettingsRef,
  setSelectedDrumEvolveOverridesChangedCallback,
  setSelectedSynthEvolveOverridesChangedCallback,
  setSelectedSynthNoteRangeEvolvedCallback,
}: UseSelectedAudioEngineEvolveOverrideCallbacksOptions): SelectedAudioEngineEvolveOverrideState {
  const [drumEvolvedOverrides, setDrumEvolvedOverrides] = useState<EvolvedOverrideState | undefined>(undefined);
  const [synthEvolvedOverrides, setSynthEvolvedOverrides] = useState<EvolvedOverrideState | undefined>(undefined);
  const drumEvolvedVersionRef = useRef(0);
  const synthEvolvedVersionRef = useRef(0);

  useEffect(() => {
    setSelectedDrumEvolveOverridesChangedCallback((laneIndex, overrides) => {
      drumEvolvedVersionRef.current += 1;
      const payload = overrides as Partial<StepOverrides> & { swing?: unknown; subLaneStates?: unknown; pitchSettings?: (PitchSettings | null)[] };
      const swing = typeof payload.swing === 'number' && Number.isFinite(payload.swing)
        ? normalizeSequencerSwing(payload.swing)
        : undefined;
      const subLaneStates = normalizeEvolvedSubLanePatch(payload.subLaneStates);
      if (swing !== undefined) {
        const nextSwings = [...(drumSwingsRef.current ?? DEFAULT_EUCLIDEAN_SWINGS)];
        nextSwings[laneIndex] = swing;
        drumSwingsRef.current = nextSwings;
      }
      drumSubLaneStatesRef.current = mergeEvolvedSubLanePatch(drumSubLaneStatesRef.current, laneIndex, subLaneStates);
      if (payload.pitchSettings?.[laneIndex]) {
        const nextPitchSettings = [...(drumPitchSettingsRef.current ?? createDefaultPitchSettings())];
        nextPitchSettings[laneIndex] = payload.pitchSettings[laneIndex]!;
        drumPitchSettingsRef.current = nextPitchSettings;
      }
      if (drumStepOverridesRef.current) {
        const prev = drumStepOverridesRef.current;
        const next = { ...prev };
        if (payload.triggerToggles?.[laneIndex] != null) {
          const arr = [...prev.triggerToggles];
          arr[laneIndex] = new Map(payload.triggerToggles[laneIndex]);
          next.triggerToggles = arr;
        }
        const arrayKeys = ['probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const;
        for (const key of arrayKeys) {
          if (payload[key]?.[laneIndex] != null) {
            const arr = [...prev[key]];
            arr[laneIndex] = payload[key]![laneIndex] as never;
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;
        for (const key of rangeKeys) {
          if (payload[key]?.[laneIndex] != null) {
            const arr = [...((prev[key] as (EvolvedRangeOverride | null)[] | undefined) ?? emptyEvolvedRangeOverrides())];
            arr[laneIndex] = payload[key]![laneIndex] as EvolvedRangeOverride;
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        const directionKeys = ['expressionDirection', 'pitchDirection', 'morphDirection', 'distanceDirection', 'sliceDirection', 'reverseDirection'] as const;
        for (const key of directionKeys) {
          if (payload[key]?.[laneIndex] != null) {
            const arr = [...prev[key]];
            arr[laneIndex] = payload[key]![laneIndex] ?? null;
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        drumStepOverridesRef.current = next;
      }
      if (activeTab === 'visualizer' && document.visibilityState === 'visible') {
        emitVisualizerPulse('drums', 0.2 + Math.min(0.24, laneIndex * 0.04));
        emitVisualizerPulse('sequencer', 0.16);
        return;
      }
      if (activeTab !== 'drums' || document.visibilityState !== 'visible') return;
      setDrumEvolvedOverrides({ laneIndex, version: drumEvolvedVersionRef.current, data: payload, ...(swing !== undefined ? { swing } : {}), ...(subLaneStates ? { subLaneStates } : {}) });
    });
    return () => {
      setSelectedDrumEvolveOverridesChangedCallback(null);
    };
  }, [
    activeTab,
    createDefaultPitchSettings,
    drumPitchSettingsRef,
    drumStepOverridesRef,
    drumSubLaneStatesRef,
    drumSwingsRef,
    setSelectedDrumEvolveOverridesChangedCallback,
  ]);

  useEffect(() => {
    setSelectedSynthEvolveOverridesChangedCallback((laneIndex, overrides) => {
      synthEvolvedVersionRef.current += 1;
      const payload = overrides as {
        triggerToggles?: Map<number, boolean>;
        expression?: number[] | null;
        morph?: number[] | null;
        distance?: number[] | null;
        probability?: number[] | null;
        ratchet?: number[] | null;
        trigCondition?: TrigCondition[] | null;
        pitch?: number[] | null;
        expressionRanges?: EvolvedRangeOverride | null;
        morphRanges?: EvolvedRangeOverride | null;
        distanceRanges?: EvolvedRangeOverride | null;
        expressionDirection?: LaneDirection | null;
        pitchDirection?: LaneDirection | null;
        morphDirection?: LaneDirection | null;
        distanceDirection?: LaneDirection | null;
        swing?: unknown;
        subLaneStates?: unknown;
        pitchSettings?: (PitchSettings | null)[];
      };
      const swing = typeof payload.swing === 'number' && Number.isFinite(payload.swing)
        ? normalizeSequencerSwing(payload.swing)
        : undefined;
      const subLaneStates = normalizeEvolvedSubLanePatch(payload.subLaneStates);
      if (swing !== undefined) {
        const nextSwings = [...(synthSwingsRef.current ?? DEFAULT_EUCLIDEAN_SWINGS)];
        nextSwings[laneIndex] = swing;
        synthSwingsRef.current = nextSwings;
      }
      synthSubLaneStatesRef.current = mergeEvolvedSubLanePatch(synthSubLaneStatesRef.current, laneIndex, subLaneStates);
      const data: Partial<StepOverrides> & { pitchSettings?: (PitchSettings | null)[] } = {};
      if (payload.pitchSettings?.[laneIndex]) {
        data.pitchSettings = payload.pitchSettings;
        const nextPitchSettings = [...(synthPitchSettingsRef.current ?? createDefaultPitchSettings())];
        nextPitchSettings[laneIndex] = payload.pitchSettings[laneIndex]!;
        synthPitchSettingsRef.current = nextPitchSettings;
      }
      if (payload.triggerToggles != null) {
        const arr = [new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>()];
        arr[laneIndex] = new Map(payload.triggerToggles);
        data.triggerToggles = arr;
      }
      const keys = ['expression', 'morph', 'distance', 'probability', 'ratchet'] as const;
      for (const key of keys) {
        if (payload[key] != null) {
          const arr: (number[] | null)[] = [null, null, null, null];
          arr[laneIndex] = payload[key]!;
          data[key] = arr;
        }
      }
      if (payload.trigCondition != null) {
        const arr = [null, null, null, null] as StepOverrides['trigCondition'];
        arr[laneIndex] = payload.trigCondition;
        data.trigCondition = arr;
      }
      if (payload.pitch != null) {
        const arr: (number[] | null)[] = [null, null, null, null];
        arr[laneIndex] = payload.pitch;
        data.pitch = arr;
      }
      const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;
      for (const key of rangeKeys) {
        if (payload[key] != null) {
          const arr = emptyEvolvedRangeOverrides();
          arr[laneIndex] = payload[key]!;
          (data as Record<string, unknown>)[key] = arr;
        }
      }
      const directionKeys = ['expressionDirection', 'pitchDirection', 'morphDirection', 'distanceDirection'] as const;
      for (const key of directionKeys) {
        if (payload[key] != null) {
          const arr = [null, null, null, null] as StepOverrides[typeof key];
          arr[laneIndex] = payload[key]!;
          data[key] = arr;
        }
      }
      if (synthStepOverridesRef.current) {
        const prev = synthStepOverridesRef.current;
        const next = { ...prev };
        if (data.triggerToggles?.[laneIndex] != null) {
          const arr = [...prev.triggerToggles];
          arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
          next.triggerToggles = arr;
        }
        const mergeKeys = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'trigCondition', 'pitch'] as const;
        for (const key of mergeKeys) {
          if (data[key] && data[key]![laneIndex] != null) {
            const arr = [...prev[key]];
            arr[laneIndex] = data[key]![laneIndex];
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        for (const key of rangeKeys) {
          if (data[key]?.[laneIndex] != null) {
            const arr = [...((prev[key] as (EvolvedRangeOverride | null)[] | undefined) ?? emptyEvolvedRangeOverrides())];
            arr[laneIndex] = data[key]![laneIndex] as EvolvedRangeOverride;
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        for (const key of directionKeys) {
          if (data[key]?.[laneIndex] != null) {
            const arr = [...prev[key]];
            arr[laneIndex] = data[key]![laneIndex] ?? null;
            (next as Record<string, unknown>)[key] = arr;
          }
        }
        synthStepOverridesRef.current = next;
      }
      if (activeTab === 'visualizer' && document.visibilityState === 'visible') {
        emitVisualizerPulse('synth', 0.2 + Math.min(0.24, laneIndex * 0.04));
        emitVisualizerPulse('sequencer', 0.16);
        return;
      }
      if (activeTab !== 'synth' || document.visibilityState !== 'visible') return;
      setSynthEvolvedOverrides({ laneIndex, version: synthEvolvedVersionRef.current, data, ...(swing !== undefined ? { swing } : {}), ...(subLaneStates ? { subLaneStates } : {}) });
    });
    return () => {
      setSelectedSynthEvolveOverridesChangedCallback(null);
    };
  }, [
    activeTab,
    createDefaultPitchSettings,
    setSelectedSynthEvolveOverridesChangedCallback,
    synthPitchSettingsRef,
    synthStepOverridesRef,
    synthSubLaneStatesRef,
    synthSwingsRef,
  ]);

  useEffect(() => {
    setSelectedSynthNoteRangeEvolvedCallback((laneIndex, noteMin, noteMax) => {
      mergeRuntimeValues({
        [`synthEuclid${laneIndex + 1}NoteMin`]: noteMin,
        [`synthEuclid${laneIndex + 1}NoteMax`]: noteMax,
      });
    });
    return () => {
      setSelectedSynthNoteRangeEvolvedCallback(null);
    };
  }, [setSelectedSynthNoteRangeEvolvedCallback]);

  return {
    drumEvolvedOverrides,
    synthEvolvedOverrides,
  };
}
