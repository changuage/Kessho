/**
 * DrumPage — Top-level layout for the Drums tab.
 * Uses the generic useEuclideanSequencer hook for all sequencer state.
 * Renders the prototype's two-panel layout:
 *   .container → .sound-panel + .sequencer-panel
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './drums.css';
import type { SerializedStepOverrides, SliderState } from '../state';
import type { DrumVoiceType } from '../../audio/drumSynth';
import type { DrumStepOverrides } from '../../audio/drumSeqTypes';
import type { ClockDivision } from '../../audio/drumSeqTypes';
import { normalizeNoteDegreeOffset } from '../../audio/drumSeqTypes';
import { getPresetNames as getDrumPresetNames } from '../../audio/drumPresets';
import { DRUM_VOICES as VOICE_CONFIG, DRUM_VOICE_ORDER } from '../../audio/drumVoiceConfig';
import { useEuclideanSequencer, type EvolveConfig, type PitchSettings, type StepOverrides, type SubLaneKind, type SubLaneState } from '../sequencer/useEuclideanSequencer';
import { liveOverdubTargetStep, useLiveOverdubRecorder } from '../sequencer/useLiveOverdubRecorder';
import { stepOverridesForEngineSubLaneState } from '../sequencer/engineStepOverrides';
import {
  drumPitchBaseMidiFromState,
  drumPitchUiValuesToEngineOffsets,
  evolvedDrumPitchOffsetToUiValue,
} from '../sequencer/drumPitchSequencer';
import { normalizeSequencerPitchSettings } from '../../audio/sequencerPitchSettings';
import DrumPanel from './DrumPanel';
import DragNumber from './DragNumber';
import SeqOverview from './SeqOverview';
import SeqSimple from './SeqSimple';
import type { SeqSimpleState } from './SeqSimple';
import SeqMiniOverview from './SeqMiniOverview';
import SeqLane from './SeqLane';
import SeqSparkline from './SeqSparkline';
import { useSliderHelp } from '../SliderHelpOverlay';
import { SliderPrimitive } from '../sliderSystem';
import { serializeStepOverrides } from '../sequencer/stepOverrideSerialization';
import {
  applySequencePresetClockDivs,
  applySequencePresetEvolveConfigs,
  applySequencePresetLinked,
  applySequencePresetOverrides,
  applySequencePresetPitchSettings,
  applySequencePresetSubLaneStates,
  applySequencePresetSwings,
  copySequenceLaneForPreset,
  copySequenceLaneStateForPreset,
  type SerializedSequenceLanePresetState,
} from '../sequencer/sequencePresetLane';
import {
  clampEuclideanSubLaneSteps,
  clampEuclideanTriggerSteps,
  EUCLIDEAN_STEP_MAX,
} from '../sequencer/sequencerLimits';
import { PresetDropdown } from '../../presets/PresetDropdown';
import { SEQUENCER_LANE_COLORS, SEQUENCER_SUB_LANE_COLORS } from '../../designSystem/colors';
import {
  EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY,
  applyEuclideanPatternToDrumLaneState,
  extractEuclideanPatternLaneDataFromDrumState,
} from '../../presets/euclideanPatternBank';
import type { PresetEntry } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';

const LANE_CONFIGS = [
  { color: SEQUENCER_LANE_COLORS[0], name: 'Seq 1' },
  { color: SEQUENCER_LANE_COLORS[1], name: 'Seq 2' },
  { color: SEQUENCER_LANE_COLORS[2], name: 'Seq 3' },
  { color: SEQUENCER_LANE_COLORS[3], name: 'Seq 4' },
];

const DRUM_LANE_ENABLED_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid2Enabled',
  'drumEuclid3Enabled',
  'drumEuclid4Enabled',
] as const satisfies readonly (keyof SliderState)[];

type EvolvedSequencerPatch = {
  laneIndex: number;
  version: number;
  data: Partial<StepOverrides> & { pitchSettings?: (PitchSettings | null)[] };
  swing?: number;
  subLaneStates?: Partial<Record<SubLaneKind, Partial<SubLaneState>>>;
};

// ── Keyboard shortcuts: A S D F G H J → voice triggers ──
const KEY_TO_VOICE: Record<string, DrumVoiceType> = {
  a: 'sub', s: 'kick', d: 'click', f: 'beepHi', g: 'beepLo', h: 'noise', j: 'membrane',
};

const DRUM_TARGET_SUFFIX_BY_VOICE: Record<DrumVoiceType, string> = {
  sub: 'Sub',
  kick: 'Kick',
  click: 'Click',
  beepHi: 'BeepHi',
  beepLo: 'BeepLo',
  noise: 'Noise',
  membrane: 'Membrane',
};

type DrumKeyboardLane = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance';
const DRUM_KEYBOARD_LANES: readonly DrumKeyboardLane[] = ['trigger', 'pitch', 'expression', 'morph', 'distance'] as const;

function makeDefaultKeyboardLaneSteps(): Record<DrumKeyboardLane, number[]> {
  return {
    trigger: [0, 0, 0, 0],
    pitch: [0, 0, 0, 0],
    expression: [0, 0, 0, 0],
    morph: [0, 0, 0, 0],
    distance: [0, 0, 0, 0],
  };
}

function getDrumKeyboardLane(openLane: string): DrumKeyboardLane {
  if (openLane === 'pitch' || openLane === 'expression' || openLane === 'morph' || openLane === 'distance') return openLane;
  return 'trigger';
}

export interface DrumPageProps {
  state: SliderState;
  isMobile: boolean;
  isRunning: boolean;
  expandedPanels: Set<string>;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  onRequestPlaybackStart?: (statePatch?: Partial<SliderState>) => void;
  togglePanel: (id: string) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  triggerVoice: (voice: DrumVoiceType) => void;
  getAnalyserNode?: (voice: DrumVoiceType) => AnalyserNode | undefined;
  preloadAudioEngine?: () => Promise<unknown>;
  setStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  resetEvolveHome: (laneIdx: number) => void;
  captureEvolveHome?: (laneIdx: number, pitchState?: SubLaneState | null) => void;
  diceLane?: (laneIdx: number, intensity: number) => void;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  editingVoice: string | null;
  onToggleEditing: (voice: string) => void;
  /** Called when evolve configs change, so parent can sync to audio engine */
  onEvolveConfigsChange?: (configs: EvolveConfig[]) => void;
  /** Initial evolve configs to restore across tab switches / preset loads */
  initialEvolveConfigs?: EvolveConfig[];
  /** Preset version counter for triggering UI reset on preset load */
  presetVersion?: number;
  /** Called when step overrides change, so parent can sync to audio engine */
  onStepOverridesChange?: (overrides: DrumStepOverrides) => void;
  /** Called with unconverted UI step overrides for preset round trips */
  onRawStepOverridesChange?: (overrides: StepOverrides) => void;
  /** Initial step overrides to restore across tab switches */
  initialStepOverrides?: StepOverrides;
  /** Initial sub-lane states to restore across tab switches */
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  /** Called when sub-lane states change, so parent can persist across tab switches */
  onSubLaneStatesChange?: (states: Record<SubLaneKind, SubLaneState>[]) => void;
  /** Initial pitch mode/root/scale settings to restore across tab switches */
  initialPitchSettings?: PitchSettings[];
  /** Called when pitch settings change, so parent can persist across tab switches */
  onPitchSettingsChange?: (settings: PitchSettings[]) => void;
  /** Initial view mode to restore across tab switches */
  initialViewMode?: 'simple' | 'detail' | 'overview';
  /** Called when view mode changes so parent can persist it */
  onViewModeChange?: (mode: 'simple' | 'detail' | 'overview') => void;
  /** Evolved step overrides pushed from audio engine (for visual sync) */
  evolvedOverrides?: EvolvedSequencerPatch;
  /** Called when per-lane clock divisions change */
  onClockDivsChange?: (divs: ClockDivision[]) => void;
  initialClockDivs?: ClockDivision[];
  /** Called when per-lane swing amounts change */
  onSwingsChange?: (swings: number[]) => void;
  initialSwings?: number[];
  onLinkedChange?: (linked: boolean[]) => void;
  initialLinked?: boolean[];
  /** Initial simple sequencer state to restore across tab switches */
  initialSeqSimpleState?: SeqSimpleState;
  /** Called when simple sequencer state changes */
  onSeqSimpleStateChange?: (state: SeqSimpleState) => void;
}

const DrumPage: React.FC<DrumPageProps> = (props) => {
  const Slider = props.SliderComponent as React.ComponentType<Record<string, unknown>>;
  const {
    state,
    isMobile,
    isRunning,
    expandedPanels,
    onParamChange,
    onSelectChange,
    onRequestPlaybackStart,
    togglePanel,
    sliderProps,
    triggerVoice,
    getAnalyserNode,
    preloadAudioEngine,
    setStepPositionCallback,
    setEvolveTriggerCallback,
    setTriggerCallback,
    resetEvolveHome,
    captureEvolveHome,
    diceLane,
    SliderComponent,
    CollapsiblePanelComponent,
    editingVoice,
    onToggleEditing,
    onEvolveConfigsChange,
    onStepOverridesChange,
    onRawStepOverridesChange,
    initialStepOverrides,
    initialSubLaneStates,
    onSubLaneStatesChange,
    initialPitchSettings,
    onPitchSettingsChange,
    initialViewMode,
    onViewModeChange,
    onClockDivsChange,
    initialClockDivs,
    onSwingsChange,
    initialSwings,
    onLinkedChange,
    initialLinked,
  } = props;
  const onStateChange = props.onStateChange;
  const evolvedOverrides = props.evolvedOverrides;
  const initialEvolveConfigs = props.initialEvolveConfigs;
  const presetVersion = props.presetVersion;

  const { announceHelp } = useSliderHelp();

  const [diceIntensity, setDiceIntensity] = useState(0.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keyboardLaneSteps, setKeyboardLaneSteps] = useState<Record<DrumKeyboardLane, number[]>>(() => makeDefaultKeyboardLaneSteps());
  const [playheads, setPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [hitCounts, setHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const [evolveFlashing, setEvolveFlashing] = useState<boolean[]>([false, false, false, false]);
  const [triggeredVoices, setTriggeredVoices] = useState<Record<string, boolean>>({});
  const leftShiftHeldRef = useRef(false);
  const zHeldRef = useRef(false);
  const drumTriggerTimersRef = useRef<Record<string, number | null>>({});
  const evolveFlashTimersRef = useRef<Array<number | null>>([null, null, null, null]);

  const bindHelp = useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);

  // ── Shared Euclidean pattern bank ──
  const [euclidPresetNames, setEuclidPresetNames] = useState<Array<string | undefined>>(() => Array(4).fill(undefined));
  const [kitPresetName, setKitPresetName] = useState<string | undefined>();
  const setEuclidPresetNameForLane = useCallback((laneIdx: number, name: string | undefined) => {
    setEuclidPresetNames(prev => prev.map((value, index) => (index === laneIdx ? name : value)));
  }, []);
  const handleKitPresetLoad = useCallback((entry: PresetEntry, _data: Record<string, unknown>) => {
    setKitPresetName(entry.name);
  }, []);
  // ── Reusable sequencer hook ──
  const seq = useEuclideanSequencer({
    state,
    onParamChange,
    onSelectChange,
    prefix: 'drum',
    laneCount: 4,
    lanes: LANE_CONFIGS,
    playheads,
    hitCounts,
    evolveFlashing,
    initialViewMode,
    initialStepOverrides,
    initialSubLaneStates,
    initialPitchSettings,
    initialClockDivs,
    initialSwings,
    initialLinked,
    initialEvolveConfigs,
    resetKey: presetVersion,
  });

  const drumEuclideanPatternOptions = React.useMemo<UsePresetsOptions[]>(() => LANE_CONFIGS.map((_, laneIdx) => ({
    customExtract: (currentState) => {
      const stepOverrides = serializeStepOverrides(copySequenceLaneForPreset(seq.stepOverrides, laneIdx));
      const sequenceState = copySequenceLaneStateForPreset({
        laneIdx,
        subLaneStates: seq.subLaneStates,
        clockDivs: seq.clockDivs,
        swings: seq.swings,
        linked: seq.linked,
        evolveConfigs: seq.evolveConfigs,
        pitchSettings: seq.pitchSettings,
      });
      return {
        ...extractEuclideanPatternLaneDataFromDrumState(currentState, laneIdx),
        ...(stepOverrides ? { [EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY]: stepOverrides } : {}),
        [EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY]: sequenceState,
      };
    },
    customApply: (currentState, data) => applyEuclideanPatternToDrumLaneState(currentState, data, laneIdx),
  })), [seq.clockDivs, seq.evolveConfigs, seq.linked, seq.pitchSettings, seq.stepOverrides, seq.subLaneStates, seq.swings]);

  const pendingSequenceHomeCaptureRef = useRef<number | null>(null);
  const pendingSequenceResetHomeRef = useRef<number | null>(null);
  const sequenceSubLaneHomeRef = useRef<(Record<SubLaneKind, SubLaneState> | null)[]>([null, null, null, null]);
  const [sequenceHomeCaptureVersion, setSequenceHomeCaptureVersion] = useState(0);
  const handleEuclidSequenceLoad = useCallback((laneIdx: number, entry: PresetEntry, data: Record<string, unknown>) => {
    setEuclidPresetNameForLane(laneIdx, entry.name);
    const stepOverrides = data[EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY] as SerializedStepOverrides | undefined;
    const sequenceState = data[EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY] as SerializedSequenceLanePresetState | undefined;
    seq.setStepOverrides((current) => applySequencePresetOverrides(current, stepOverrides ?? {}, laneIdx));
    seq.setSubLaneStates((current) => {
      const next = applySequencePresetSubLaneStates(current, sequenceState, laneIdx, stepOverrides);
      sequenceSubLaneHomeRef.current[laneIdx] = next[laneIdx] ?? null;
      return next;
    });
    seq.setClockDivs((current) => applySequencePresetClockDivs(current, sequenceState, laneIdx));
    seq.setSwings((current) => applySequencePresetSwings(current, sequenceState, laneIdx));
    seq.setLinked((current) => applySequencePresetLinked(current, sequenceState, laneIdx));
    seq.setEvolveConfigs((current) => applySequencePresetEvolveConfigs(current, sequenceState, laneIdx, 'drum'));
    seq.setPitchSettings((current) => applySequencePresetPitchSettings(current, sequenceState, laneIdx));
    pendingSequenceHomeCaptureRef.current = laneIdx;
    setSequenceHomeCaptureVersion((version) => version + 1);
  }, [seq, setEuclidPresetNameForLane]);

  const renderSequencePresetControl = useCallback((laneIdx: number) => (
    <div className="seq-sequence-preset-control" onClick={(e) => e.stopPropagation()}>
      <span className="seq-sequence-preset-label">Sequence</span>
      <PresetDropdown
        key={`drum-sequence-${laneIdx}`}
        level="engine"
        scope="euclideanPattern"
        state={state}
        currentName={euclidPresetNames[laneIdx]}
        onLoad={(entry: PresetEntry, data: Record<string, unknown>) => handleEuclidSequenceLoad(laneIdx, entry, data)}
        onStateChange={onStateChange}
        presetOptions={drumEuclideanPatternOptions[laneIdx]}
        showSaveButton
        saveButtonLabel="Save Sequence"
        saveDialogTitle="Save Sequence"
        defaultSaveName={`${LANE_CONFIGS[laneIdx]?.name ?? `Seq ${laneIdx + 1}`} Sequence`}
        showFileButtons={false}
        compact
        className="seq-sequence-preset-dropdown"
      />
    </div>
  ), [drumEuclideanPatternOptions, euclidPresetNames, handleEuclidSequenceLoad, onStateChange, state]);

  const handleResetEvolveHome = useCallback((laneIdx: number) => {
    pendingSequenceResetHomeRef.current = laneIdx;
    resetEvolveHome(laneIdx);
  }, [resetEvolveHome]);

  const setSharedSequencerBpm = useCallback((bpm: number) => {
    onParamChange('sequencerMasterBPM' as keyof SliderState, bpm);
    onParamChange('synthEuclidBaseBPM' as keyof SliderState, bpm);
    onParamChange('drumEuclidBaseBPM' as keyof SliderState, bpm);
  }, [onParamChange]);

  // Notify parent when viewMode changes so it persists across tab switches
  useEffect(() => {
    onViewModeChange?.(seq.viewMode);
  }, [seq.viewMode, onViewModeChange]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingSteps: number[] = [0, 0, 0, 0];
    let pendingHitCounts: number[] = [0, 0, 0, 0];
    setStepPositionCallback((nextSteps: number[], nextHitCounts: number[]) => {
      if (document.visibilityState !== 'visible') return;
      pendingSteps = [...nextSteps];
      pendingHitCounts = [...nextHitCounts];
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setPlayheads(pendingSteps);
        setHitCounts(pendingHitCounts);
      });
    });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      setStepPositionCallback(null);
    };
  }, [setStepPositionCallback]);

  useEffect(() => {
    setEvolveTriggerCallback((laneIndex: number) => {
      if (document.visibilityState !== 'visible') return;
      if (laneIndex < 0 || laneIndex > 3) return;
      setEvolveFlashing(prev => prev.map((value, index) => (index === laneIndex ? true : value)));

      const existingTimer = evolveFlashTimersRef.current[laneIndex];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      evolveFlashTimersRef.current[laneIndex] = window.setTimeout(() => {
        setEvolveFlashing(prev => prev.map((value, index) => (index === laneIndex ? false : value)));
        evolveFlashTimersRef.current[laneIndex] = null;
      }, 180);
    });

    return () => {
      setEvolveTriggerCallback(null);
      evolveFlashTimersRef.current.forEach((timer, laneIndex) => {
        if (timer) {
          window.clearTimeout(timer);
          evolveFlashTimersRef.current[laneIndex] = null;
        }
      });
    };
  }, [setEvolveTriggerCallback]);

  useEffect(() => {
    const lastTriggerTime: Record<string, number> = {};
    setTriggerCallback((voice: string, _velocity: number) => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - (lastTriggerTime[voice] || 0) < 80) return;
      lastTriggerTime[voice] = now;
      setTriggeredVoices(prev => ({ ...prev, [voice]: true }));
      const existingTimer = drumTriggerTimersRef.current[voice];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      drumTriggerTimersRef.current[voice] = window.setTimeout(() => {
        setTriggeredVoices(prev => ({ ...prev, [voice]: false }));
        drumTriggerTimersRef.current[voice] = null;
      }, 120);
    });

    return () => {
      setTriggerCallback(null);
      Object.values(drumTriggerTimersRef.current).forEach((timer) => {
        if (timer) {
          window.clearTimeout(timer);
        }
      });
      drumTriggerTimersRef.current = {};
    };
  }, [setTriggerCallback]);

  // Sync evolve configs to audio engine when they change
  const evolveConfigsRef = useRef(seq.evolveConfigs);
  useEffect(() => {
    if (evolveConfigsRef.current !== seq.evolveConfigs) {
      evolveConfigsRef.current = seq.evolveConfigs;
      onEvolveConfigsChange?.(seq.evolveConfigs);
    }
  }, [seq.evolveConfigs, onEvolveConfigsChange]);

  // Merge evolved overrides from audio engine into visualizer state
  const evolvedVersionRef = useRef(-1);
  useEffect(() => {
    if (!evolvedOverrides || evolvedOverrides.version === evolvedVersionRef.current) return;
    evolvedVersionRef.current = evolvedOverrides.version;
    const { laneIndex, data, swing, subLaneStates } = evolvedOverrides;
    const restoredPitchSettings = data.pitchSettings?.[laneIndex]
      ? normalizeSequencerPitchSettings(data.pitchSettings[laneIndex], seq.pitchSettings[laneIndex]) as PitchSettings
      : null;
    const restoreSequenceHome = pendingSequenceResetHomeRef.current === laneIndex;
    if (restoreSequenceHome) pendingSequenceResetHomeRef.current = null;
    const sequenceHome = restoreSequenceHome ? sequenceSubLaneHomeRef.current[laneIndex] : null;
    const effectiveSubLaneStates = sequenceHome
      ? Object.fromEntries(Object.entries(sequenceHome).map(([key, value]) => [
          key,
          { ...value, ...((subLaneStates as Record<string, Partial<SubLaneState>> | undefined)?.[key] ?? {}) },
        ])) as Partial<Record<SubLaneKind, Partial<SubLaneState>>>
      : subLaneStates;
    if (restoredPitchSettings) {
      seq.setPitchSettings(prev => prev.map((settings, index) => (index === laneIndex ? restoredPitchSettings : settings)));
    }
    if (typeof swing === 'number' && Number.isFinite(swing)) {
      seq.setSwings(prev => prev.map((value, index) => (index === laneIndex ? swing : value)));
    }
    if (effectiveSubLaneStates && typeof effectiveSubLaneStates === 'object') {
      seq.setSubLaneStates(prev => prev.map((laneState, index) => (
        index === laneIndex
          ? {
              ...laneState,
              ...Object.fromEntries(Object.entries(effectiveSubLaneStates).map(([key, patch]) => [
                key,
                { ...laneState[key as SubLaneKind], ...(patch ?? {}) },
              ])) as Record<SubLaneKind, SubLaneState>,
            }
          : laneState
      )));
    }
    seq.setStepOverrides(prev => {
      const next = { ...prev };
      if (data.triggerToggles?.[laneIndex] != null) {
        const arr = [...prev.triggerToggles];
        arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
        next.triggerToggles = arr;
      }
      const keys = ['probability', 'ratchet', 'trigCondition', 'expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const;
      for (const key of keys) {
        if (data[key] && data[key]![laneIndex] != null) {
          const arr = [...prev[key]];
          const values = data[key]![laneIndex];
          arr[laneIndex] = key === 'pitch' && Array.isArray(values)
            ? (values as number[]).map((value) => evolvedDrumPitchOffsetToUiValue(value, restoredPitchSettings ?? seq.pitchSettings[laneIndex], drumPitchBaseMidiFromState(state, laneIndex)))
            : values;
          (next as Record<string, unknown>)[key] = arr;
        }
      }
      const rangeKeys = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;
      for (const key of rangeKeys) {
        if (data[key]?.[laneIndex] != null) {
          const arr = [...(prev[key] ?? [null, null, null, null])];
          arr[laneIndex] = data[key]![laneIndex];
          (next as Record<string, unknown>)[key] = arr;
        }
      }
      const directionKeys = ['expressionDirection', 'pitchDirection', 'morphDirection', 'distanceDirection', 'sliceDirection', 'reverseDirection'] as const;
      for (const key of directionKeys) {
        if (data[key]?.[laneIndex] != null) {
          const arr = [...prev[key]];
          arr[laneIndex] = data[key]![laneIndex] ?? null;
          next[key] = arr;
        }
      }
      return next;
    });
    if (!sequenceHome) {
      seq.setSubLaneStates(prev => prev.map((laneState, index) => {
        if (index !== laneIndex) return laneState;
        const nextLane = { ...laneState };
        const lengthFields = {
          expression: data.expression?.[laneIndex]?.length,
          pitch: data.pitch?.[laneIndex]?.length,
          morph: data.morph?.[laneIndex]?.length,
          distance: data.distance?.[laneIndex]?.length,
          slice: data.slice?.[laneIndex]?.length,
          reverse: data.reverse?.[laneIndex]?.length,
        } as const;
        const directionFields = {
          expression: data.expressionDirection?.[laneIndex],
          pitch: data.pitchDirection?.[laneIndex],
          morph: data.morphDirection?.[laneIndex],
          distance: data.distanceDirection?.[laneIndex],
          slice: data.sliceDirection?.[laneIndex],
          reverse: data.reverseDirection?.[laneIndex],
        } as const;
        for (const lane of ['expression', 'pitch', 'morph', 'distance', 'slice', 'reverse'] as const) {
          const steps = lengthFields[lane];
          const direction = directionFields[lane];
          if (steps == null && direction == null) continue;
          nextLane[lane] = {
            ...nextLane[lane],
            ...(typeof steps === 'number' ? { steps } : {}),
            ...(direction ? { direction } : {}),
          };
        }
        return nextLane;
      }));
    }
  }, [evolvedOverrides, seq, state]);

  // Sync engine-ready step overrides while preserving raw UI pitch values for presets.
  const engineStepOverridesRef = useRef<StepOverrides | null>(null);
  const enginePitchSettingsRef = useRef<PitchSettings[] | null>(null);
  const engineSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | null>(null);
  useEffect(() => {
    const overridesChanged = engineStepOverridesRef.current !== seq.stepOverrides;
    const settingsChanged = enginePitchSettingsRef.current !== seq.pitchSettings;
    const subLaneStatesChanged = engineSubLaneStatesRef.current !== seq.subLaneStates;
    if (!overridesChanged && !settingsChanged && !subLaneStatesChanged) return;
    engineStepOverridesRef.current = seq.stepOverrides;
    enginePitchSettingsRef.current = seq.pitchSettings;
    engineSubLaneStatesRef.current = seq.subLaneStates;
    if (overridesChanged) {
      onRawStepOverridesChange?.(seq.stepOverrides);
    }

    const convertedPitch = seq.stepOverrides.pitch.map((offsets, laneIdx) => {
      if (!offsets || !seq.subLaneStates[laneIdx]?.pitch?.enabled) return null;
      const settings = seq.pitchSettings[laneIdx];
      const baseMidi = drumPitchBaseMidiFromState(state, laneIdx);
      return drumPitchUiValuesToEngineOffsets(
        offsets,
        settings,
        baseMidi,
        seq.subLaneStates[laneIdx]?.pitch?.scaleQuantize === true,
      );
    });
    const expressionRanges = seq.subLaneStates.map((laneState) => {
      const lane = laneState.expression;
      return lane.enabled && lane.valueMode === 'range'
        ? { min: Math.min(lane.rangeMin ?? 0.75, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0.75, lane.rangeMax ?? 1) }
        : null;
    });
    const morphRanges = seq.subLaneStates.map((laneState) => {
      const lane = laneState.morph;
      return lane.enabled && lane.valueMode === 'range'
        ? { min: Math.min(lane.rangeMin ?? 0, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0, lane.rangeMax ?? 1) }
        : null;
    });
    const distanceRanges = seq.subLaneStates.map((laneState) => {
      const lane = laneState.distance;
      return lane.enabled && lane.valueMode === 'range'
        ? { min: Math.min(lane.rangeMin ?? 0, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0, lane.rangeMax ?? 1) }
        : null;
    });
    onStepOverridesChange?.(stepOverridesForEngineSubLaneState({
      ...seq.stepOverrides,
      pitch: convertedPitch,
      expressionRanges,
      morphRanges,
      distanceRanges,
    }, seq.subLaneStates));
  }, [seq.stepOverrides, seq.pitchSettings, seq.subLaneStates, state, onStepOverridesChange, onRawStepOverridesChange]);

  // Persist sub-lane states (enabled/steps/direction) across tab switches
  const subLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | null>(null);
  useEffect(() => {
    if (subLaneStatesRef.current !== seq.subLaneStates) {
      subLaneStatesRef.current = seq.subLaneStates;
      onSubLaneStatesChange?.(seq.subLaneStates);
    }
  }, [seq.subLaneStates, onSubLaneStatesChange]);

  const pitchSettingsRef = useRef(seq.pitchSettings);
  useEffect(() => {
    if (pitchSettingsRef.current !== seq.pitchSettings) {
      pitchSettingsRef.current = seq.pitchSettings;
      onPitchSettingsChange?.(seq.pitchSettings);
    }
  }, [seq.pitchSettings, onPitchSettingsChange]);

  // Sync per-lane clock divisions to audio engine
  const clockDivsRef = useRef(seq.clockDivs);
  useEffect(() => {
    if (clockDivsRef.current !== seq.clockDivs) {
      clockDivsRef.current = seq.clockDivs;
      onClockDivsChange?.(seq.clockDivs);
    }
  }, [seq.clockDivs, onClockDivsChange]);

  // Sync per-lane swing amounts to audio engine
  const swingsRef = useRef(seq.swings);
  useEffect(() => {
    if (swingsRef.current !== seq.swings) {
      swingsRef.current = seq.swings;
      onSwingsChange?.(seq.swings);
    }
  }, [seq.swings, onSwingsChange]);

  const linkedRef = useRef(seq.linked);
  useEffect(() => {
    if (linkedRef.current !== seq.linked) {
      linkedRef.current = seq.linked;
      onLinkedChange?.(seq.linked);
    }
  }, [seq.linked, onLinkedChange]);

  useEffect(() => {
    const laneIndex = pendingSequenceHomeCaptureRef.current;
    if (laneIndex == null) return;
    pendingSequenceHomeCaptureRef.current = null;
    captureEvolveHome?.(laneIndex, sequenceSubLaneHomeRef.current[laneIndex]?.pitch ?? null);
  }, [sequenceHomeCaptureVersion, captureEvolveHome]);

  const activeSeq = seq.activeSeq;
  const activeKeyboardLane = getDrumKeyboardLane(seq.openLane);
  const activeKeyboardStep = keyboardLaneSteps[activeKeyboardLane][seq.activeTab] ?? 0;
  const activeTriggerKeyboardStep = keyboardLaneSteps.trigger[seq.activeTab] ?? 0;

  const getDrumKeyboardLaneStepCount = useCallback((laneIdx: number, lane: DrumKeyboardLane) => {
    if (lane === 'trigger') return seq.sequencerModels[laneIdx]?.trigger.steps ?? 0;
    return seq.subLaneStates[laneIdx]?.[lane]?.steps ?? 0;
  }, [seq.sequencerModels, seq.subLaneStates]);

  const selectDrumKeyboardStep = useCallback((laneIdx: number, lane: DrumKeyboardLane, step: number) => {
    const stepCount = getDrumKeyboardLaneStepCount(laneIdx, lane);
    if (stepCount <= 0) return;
    const normalizedStep = ((step % stepCount) + stepCount) % stepCount;
    seq.setActiveTab(laneIdx);
    setKeyboardLaneSteps((prev) => ({
      ...prev,
      [lane]: prev[lane].map((current, index) => index === laneIdx ? normalizedStep : current),
    }));
  }, [getDrumKeyboardLaneStepCount, seq]);

  const moveDrumKeyboardStep = useCallback((laneIdx: number, lane: DrumKeyboardLane, direction: 1 | -1) => {
    const stepCount = getDrumKeyboardLaneStepCount(laneIdx, lane);
    if (stepCount <= 0) return;
    const currentStep = keyboardLaneSteps[lane][laneIdx] ?? 0;
    selectDrumKeyboardStep(laneIdx, lane, currentStep + direction);
  }, [getDrumKeyboardLaneStepCount, keyboardLaneSteps, selectDrumKeyboardStep]);

  useEffect(() => {
    setKeyboardLaneSteps((prev) => {
      const next = makeDefaultKeyboardLaneSteps();
      DRUM_KEYBOARD_LANES.forEach((lane) => {
        next[lane] = prev[lane].map((step, laneIdx) => {
          const stepCount = getDrumKeyboardLaneStepCount(laneIdx, lane);
          if (stepCount <= 0) return 0;
          if (!Number.isFinite(step) || step < 0 || step >= stepCount) return 0;
          return step;
        });
      });
      return next;
    });
  }, [getDrumKeyboardLaneStepCount]);

  const cycleDrumKeyboardLane = useCallback((direction: 1 | -1) => {
    const currentLane = getDrumKeyboardLane(seq.openLane);
    const currentIndex = DRUM_KEYBOARD_LANES.indexOf(currentLane);
    const nextLane = DRUM_KEYBOARD_LANES[(currentIndex + direction + DRUM_KEYBOARD_LANES.length) % DRUM_KEYBOARD_LANES.length] ?? 'trigger';
    seq.setOpenLane(nextLane);
    seq.setViewMode('detail');
  }, [seq.openLane, seq.setOpenLane, seq.setViewMode]);

  const cycleDrumKeyboardSequencer = useCallback((direction: 1 | -1) => {
    const nextLaneIdx = (seq.activeTab + direction + LANE_CONFIGS.length) % LANE_CONFIGS.length;
    seq.setActiveTab(nextLaneIdx);
    seq.setViewMode('detail');
  }, [seq]);

  const adjustDrumKeyboardLaneSteps = useCallback((direction: 1 | -1) => {
    if (activeKeyboardLane === 'trigger') {
      const currentSteps = seq.sequencerModels[seq.activeTab]?.trigger.steps ?? 16;
      const nextSteps = clampEuclideanTriggerSteps(currentSteps + direction, currentSteps);
      if (nextSteps === currentSteps) return;
      seq.setParam(seq.activeTab, 'Steps', nextSteps);
      selectDrumKeyboardStep(seq.activeTab, 'trigger', Math.min(activeKeyboardStep, nextSteps - 1));
      return;
    }

    const currentSteps = seq.subLaneStates[seq.activeTab]?.[activeKeyboardLane]?.steps ?? 0;
    const nextSteps = clampEuclideanSubLaneSteps(currentSteps + direction, currentSteps);
    if (nextSteps === currentSteps) return;
    seq.setSubLaneSteps(seq.activeTab, activeKeyboardLane, nextSteps);
    selectDrumKeyboardStep(seq.activeTab, activeKeyboardLane, Math.min(activeKeyboardStep, nextSteps - 1));
  }, [activeKeyboardLane, activeKeyboardStep, selectDrumKeyboardStep, seq]);

  const toggleDrumKeyboardLane = useCallback(() => {
    if (activeKeyboardLane === 'trigger') {
      seq.toggleTriggerStep(seq.activeTab, activeKeyboardStep);
      return;
    }
    seq.toggleSubLaneEnabled(seq.activeTab, activeKeyboardLane);
  }, [activeKeyboardLane, activeKeyboardStep, seq]);

  const adjustDrumKeyboardLaneValue = useCallback((direction: 1 | -1, coarse: boolean) => {
    if (activeKeyboardLane === 'trigger') {
      const current = activeSeq.trigger.probability[activeKeyboardStep] ?? 1;
      const delta = coarse ? 0.2 : 0.05;
      const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 20) / 20));
      seq.setStepProbability(seq.activeTab, activeKeyboardStep, next);
      return;
    }

    if (activeKeyboardLane === 'pitch') {
      const current = seq.stepOverrides.pitch[seq.activeTab]?.[activeKeyboardStep]
        ?? activeSeq.pitch.offsets[activeKeyboardStep % Math.max(1, activeSeq.pitch.offsets.length)]
        ?? 0;
      const delta = coarse ? 4 : 1;
      seq.changeStepValue(seq.activeTab, 'pitch', activeKeyboardStep, current + direction * delta);
      return;
    }

    if (activeKeyboardLane === 'expression') {
      const current = seq.stepOverrides.expression[seq.activeTab]?.[activeKeyboardStep]
        ?? activeSeq.expression.velocities[activeKeyboardStep % Math.max(1, activeSeq.expression.velocities.length)]
        ?? 1;
      const delta = coarse ? 0.2 : 0.05;
      const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 20) / 20));
      seq.changeStepValue(seq.activeTab, 'expression', activeKeyboardStep, next);
      return;
    }

    if (activeKeyboardLane === 'morph') {
      const current = seq.stepOverrides.morph[seq.activeTab]?.[activeKeyboardStep]
        ?? activeSeq.morph.values[activeKeyboardStep % Math.max(1, activeSeq.morph.values.length)]
        ?? 0.5;
      const delta = coarse ? 0.1 : 0.025;
      const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 40) / 40));
      seq.changeStepValue(seq.activeTab, 'morph', activeKeyboardStep, next);
      return;
    }

    const current = seq.stepOverrides.distance[seq.activeTab]?.[activeKeyboardStep]
      ?? activeSeq.distance.values[activeKeyboardStep % Math.max(1, activeSeq.distance.values.length)]
      ?? 0;
    const delta = coarse ? 0.2 : 0.05;
    const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 20) / 20));
    seq.changeStepValue(seq.activeTab, 'distance', activeKeyboardStep, next);
  }, [activeKeyboardLane, activeKeyboardStep, activeSeq, seq]);

  // ── Keyboard shortcuts ──
  const triggerVoiceRef = useRef(triggerVoice);
  triggerVoiceRef.current = triggerVoice;

  const cycleDrumViewMode = useCallback((direction: 1 | -1) => {
    const modes: Array<'simple' | 'detail' | 'overview'> = ['simple', 'detail', 'overview'];
    const currentIndex = modes.indexOf(seq.viewMode);
    const nextMode = modes[(currentIndex + direction + modes.length) % modes.length] ?? 'detail';
    seq.setViewMode(nextMode);
  }, [seq.viewMode, seq.setViewMode]);

  const toggleDrumSequencerTransport = useCallback(() => {
    const next = !state.drumEuclidMasterEnabled;
    const startPatch: Partial<SliderState> = next ? { drumEuclidMasterEnabled: true } : {};
    if (next && !state.drumEnabled) {
      onSelectChange('drumEnabled', true);
      startPatch.drumEnabled = true;
    }
    if (next && !DRUM_LANE_ENABLED_KEYS.some((key) => Boolean(state[key]))) {
      const activeLaneEnabledKey = DRUM_LANE_ENABLED_KEYS[seq.activeTab] ?? DRUM_LANE_ENABLED_KEYS[0];
      onSelectChange(activeLaneEnabledKey, true);
      startPatch[activeLaneEnabledKey] = true;
    }
    onSelectChange('drumEuclidMasterEnabled', next);
    if (next && !isRunning) {
      onRequestPlaybackStart?.(startPatch);
    }
  }, [
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    seq.activeTab,
    state.drumEnabled,
    state.drumEuclid1Enabled,
    state.drumEuclid2Enabled,
    state.drumEuclid3Enabled,
    state.drumEuclid4Enabled,
    state.drumEuclidMasterEnabled,
  ]);

  const startDrumPlaybackForOverdub = useCallback(() => {
    const startPatch: Partial<SliderState> = { drumEuclidMasterEnabled: true };
    const activeLaneEnabledKey = DRUM_LANE_ENABLED_KEYS[seq.activeTab] ?? DRUM_LANE_ENABLED_KEYS[0];
    if (!state.drumEnabled) {
      onSelectChange('drumEnabled', true);
      startPatch.drumEnabled = true;
    }
    if (!Boolean(state[activeLaneEnabledKey])) {
      onSelectChange(activeLaneEnabledKey, true);
      startPatch[activeLaneEnabledKey] = true;
    }
    if (!state.drumEuclidMasterEnabled) {
      onSelectChange('drumEuclidMasterEnabled', true);
    }
    onRequestPlaybackStart?.(startPatch);
  }, [
    onRequestPlaybackStart,
    onSelectChange,
    seq.activeTab,
    state.drumEnabled,
    state.drumEuclid1Enabled,
    state.drumEuclid2Enabled,
    state.drumEuclid3Enabled,
    state.drumEuclid4Enabled,
    state.drumEuclidMasterEnabled,
  ]);

  const drumLiveOverdub = useLiveOverdubRecorder({
    bpm: Number(state.sequencerMasterBPM ?? state.drumEuclidBaseBPM ?? 120),
    onCountInComplete: startDrumPlaybackForOverdub,
  });

  const recordDrumLiveOverdubVoice = useCallback((voice: DrumVoiceType) => {
    const laneIdx = seq.activeTab;
    const triggerStepCount = seq.sequencerModels[laneIdx]?.trigger.steps ?? 16;
    if (triggerStepCount <= 0) return;
    const targetStep = liveOverdubTargetStep(seq.playheads[laneIdx], activeTriggerKeyboardStep, triggerStepCount);

    if (seq.pitchSettings[laneIdx]?.mode !== 'semitones') {
      seq.setPitchMode(laneIdx, 'semitones');
    }
    seq.setSubLaneStates((prev) => prev.map((laneState, index) => (
      index === laneIdx
        ? {
            ...laneState,
            pitch: {
              ...laneState.pitch,
              enabled: true,
              steps: triggerStepCount,
            },
          }
        : laneState
    )));
    DRUM_VOICE_ORDER.forEach((candidate) => {
      seq.setParamSelect(laneIdx, `Target${DRUM_TARGET_SUFFIX_BY_VOICE[candidate]}`, candidate === voice);
    });
    seq.setTriggerStep(laneIdx, targetStep, true);
    seq.changeStepValue(laneIdx, 'pitch', targetStep, 0);
    setKeyboardLaneSteps((prev) => ({
      ...prev,
      trigger: prev.trigger.map((value, index) => index === laneIdx ? targetStep : value),
      pitch: prev.pitch.map((value, index) => index === laneIdx ? targetStep : value),
    }));
    seq.setViewMode('detail');
    seq.setOpenLane('pitch');
  }, [
    activeTriggerKeyboardStep,
    seq,
  ]);

  const toggleDrumLiveOverdub = useCallback(() => {
    if (drumLiveOverdub.isArmed) {
      drumLiveOverdub.stop();
      return;
    }
    const laneIdx = seq.activeTab;
    const triggerStepCount = seq.sequencerModels[laneIdx]?.trigger.steps ?? 16;
    seq.setViewMode('detail');
    seq.setOpenLane('trigger');
    if (triggerStepCount > 0) {
      seq.setSubLaneStates((prev) => prev.map((laneState, index) => (
        index === laneIdx
          ? {
              ...laneState,
              pitch: {
                ...laneState.pitch,
                enabled: true,
                steps: triggerStepCount,
              },
            }
          : laneState
      )));
    }
    drumLiveOverdub.start();
  }, [
    drumLiveOverdub.isArmed,
    drumLiveOverdub.start,
    drumLiveOverdub.stop,
    seq,
  ]);

  const drumLiveOverdubStatus = drumLiveOverdub.status === 'count-in'
    ? `Count ${drumLiveOverdub.countInRemaining}`
    : drumLiveOverdub.status === 'recording'
      ? 'Recording'
      : 'Ready';

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.defaultPrevented) return;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.repeat) return;

    if (e.code === 'ShiftLeft') {
      leftShiftHeldRef.current = true;
      return;
    }
    if (e.shiftKey && e.code === 'KeyZ') {
      e.preventDefault();
      seq.toggleMute(seq.activeTab);
      return;
    }
    if (e.shiftKey && e.code === 'KeyX') {
      e.preventDefault();
      seq.toggleSolo(seq.activeTab);
      return;
    }
    if (e.code === 'KeyX') {
      e.preventDefault();
      seq.toggleTriggerStep(seq.activeTab, activeTriggerKeyboardStep);
      return;
    }
    if (e.code === 'KeyZ') {
      zHeldRef.current = true;
      return;
    }

    if (e.code === 'Comma') {
      e.preventDefault();
      cycleDrumViewMode(-1);
      return;
    }
    if (e.code === 'Period') {
      e.preventDefault();
      cycleDrumViewMode(1);
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      toggleDrumKeyboardLane();
      return;
    }

    if (leftShiftHeldRef.current && e.code === 'ArrowLeft') {
      e.preventDefault();
      cycleDrumKeyboardSequencer(-1);
      return;
    }
    if (leftShiftHeldRef.current && e.code === 'ArrowRight') {
      e.preventDefault();
      cycleDrumKeyboardSequencer(1);
      return;
    }
    if (leftShiftHeldRef.current && e.code === 'ArrowUp') {
      e.preventDefault();
      cycleDrumKeyboardLane(-1);
      return;
    }
    if (leftShiftHeldRef.current && e.code === 'ArrowDown') {
      e.preventDefault();
      cycleDrumKeyboardLane(1);
      return;
    }

    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (zHeldRef.current) {
        adjustDrumKeyboardLaneSteps(-1);
        return;
      }
      moveDrumKeyboardStep(seq.activeTab, activeKeyboardLane, -1);
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      if (zHeldRef.current) {
        adjustDrumKeyboardLaneSteps(1);
        return;
      }
      moveDrumKeyboardStep(seq.activeTab, activeKeyboardLane, 1);
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      adjustDrumKeyboardLaneValue(1, !zHeldRef.current);
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      adjustDrumKeyboardLaneValue(-1, !zHeldRef.current);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      toggleDrumSequencerTransport();
      return;
    }

    const voice = KEY_TO_VOICE[e.key?.toLowerCase()];
    if (!voice) return;
    e.preventDefault();
    triggerVoiceRef.current(voice);
    if (drumLiveOverdub.isRecording) {
      recordDrumLiveOverdubVoice(voice);
    }
  }, [
    activeKeyboardLane,
    adjustDrumKeyboardLaneValue,
    adjustDrumKeyboardLaneSteps,
    activeTriggerKeyboardStep,
    cycleDrumKeyboardLane,
    cycleDrumKeyboardSequencer,
    cycleDrumViewMode,
    drumLiveOverdub.isRecording,
    moveDrumKeyboardStep,
    recordDrumLiveOverdubVoice,
    seq.activeTab,
    toggleDrumKeyboardLane,
    toggleDrumSequencerTransport,
  ]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft') leftShiftHeldRef.current = false;
    if (e.code === 'KeyZ') zHeldRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="drum-root">
      <div className="container">
        {/* ═══ SOUND PANEL (left, 460px) ═══ */}
        <div className="sound-panel">
          {/* ═══ Drums Source Identity ═══ */}
          <div className="drums-source-preset-bar fx-page-header fx-page-header--identity">
            <span className="drums-source-preset-label fx-page-title">⋮⋮ Drums</span>
            <div className="fx-page-actions fx-page-actions--identity">
              <button
                className={`drum-enable-btn${state.drumEnabled ? ' on' : ''}`}
                onClick={() => onSelectChange('drumEnabled', !state.drumEnabled)}
                title={state.drumEnabled ? 'Drum engine ON' : 'Drum engine OFF'}
                aria-pressed={Boolean(state.drumEnabled)}
                {...bindHelp('drumEngineEnable')}
              >
                {state.drumEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="drums-kit-preset-card fx-kit-preset-card">
            <span className="fx-kit-preset-title">Kit</span>
            <PresetDropdown
              level="kit"
              scope="drumKit"
              state={state}
              currentName={kitPresetName}
              onLoad={handleKitPresetLoad}
              onStateChange={onStateChange}
              compact
            />
          </div>

          {/* Master strip */}
          <div className="master-strip">
            <div className="master-item master-item--slider">
              <Slider
                label="Level"
                value={state.drumLevel as number}
                paramKey="drumLevel"
                onChange={onParamChange}
                format={(value: number) => String(Math.round(value * 100))}
                unit="%"
                {...sliderProps('drumLevel')}
              />
            </div>
            <div className="master-item master-item--slider">
              <Slider
                label="Reverb"
                value={state.drumReverbSend as number}
                paramKey="drumReverbSend"
                onChange={onParamChange}
                format={(value: number) => String(Math.round(value * 100))}
                unit="%"
                {...sliderProps('drumReverbSend')}
              />
            </div>
            <button
              className={`master-anim-btn${state.drumMorphSliderAnimate ? ' on' : ''}`}
              onClick={() => onSelectChange('drumMorphSliderAnimate', !state.drumMorphSliderAnimate)}
              title="Animate slider positions during morph"
            >
              {state.drumMorphSliderAnimate ? '⟳ Anim' : '⟳'}
            </button>
          </div>

          {/* Voice cards */}
          <div className="voice-cards">
            <DrumPanel
              state={state}
              isMobile={isMobile}
              expandedPanels={expandedPanels}
              togglePanel={togglePanel}
              onParamChange={onParamChange as (key: keyof SliderState, value: SliderState[keyof SliderState]) => void}
              sliderProps={sliderProps}
              getPresetNames={getDrumPresetNames}
              triggerVoice={triggerVoice}
              SliderComponent={SliderComponent}
              CollapsiblePanelComponent={CollapsiblePanelComponent}
              editingVoice={editingVoice}
              onToggleEditing={onToggleEditing}
              triggeredVoices={triggeredVoices}
              getAnalyserNode={getAnalyserNode}
              preloadAudioEngine={preloadAudioEngine}
            />
          </div>

          {/* Status bar */}
          <div className="status-bar">
            <span className="count">64+</span> presets loaded across 7 voices
          </div>
        </div>

        {/* ═══ SEQUENCER PANEL (right, flex: 1) ═══ */}
        <div className="sequencer-panel">
          {/* Transport */}
          <div className="seq-transport">
            <button
              className={`seq-play-btn${state.drumEuclidMasterEnabled ? ' playing' : ''}`}
              data-sequencer-transport="drums"
              onClick={toggleDrumSequencerTransport}
              {...bindHelp('drumSeqPlayToggle')}
            >
              {state.drumEuclidMasterEnabled ? '■' : '▶'}
            </button>
            <DragNumber
              value={state.sequencerMasterBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={setSharedSequencerBpm}
              shapeByDrag
            />
            <div className={`live-overdub-controls${drumLiveOverdub.isArmed ? ' active' : ''}`}>
              <button
                type="button"
                className={`live-overdub-btn record${drumLiveOverdub.isArmed ? ' active' : ''}`}
                onClick={toggleDrumLiveOverdub}
                aria-pressed={drumLiveOverdub.isArmed}
              >
                REC
              </button>
              <button
                type="button"
                className={`live-overdub-btn${drumLiveOverdub.metronomeEnabled ? ' active' : ''}`}
                onClick={drumLiveOverdub.toggleMetronome}
                aria-pressed={drumLiveOverdub.metronomeEnabled}
              >
                Metro
              </button>
              <span className="live-overdub-status">{drumLiveOverdubStatus}</span>
            </div>
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'simple' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('simple')}
                {...bindHelp('drumSeqViewSimple')}
              >
                Simple
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'detail' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('detail')}
                {...bindHelp('drumSeqViewDetail')}
              >
                Detail
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'overview' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('overview')}
                {...bindHelp('drumSeqViewOverview')}
              >
                Overview
              </button>

            </div>
          </div>

          {/* ── Simple Mode (standalone random trigger) ── */}
          {seq.viewMode === 'simple' && (
            <SeqSimple
              triggerVoice={triggerVoice}
              drumEnabled={state.drumEnabled as boolean}
              masterEnabled={state.drumEuclidMasterEnabled as boolean}
              onEnableDrums={() => {
                if (!state.drumEnabled) {
                  onSelectChange('drumEnabled', true);
                }
              }}
              initialState={props.initialSeqSimpleState}
              onStateChange={props.onSeqSimpleStateChange}
            />
          )}

          {/* ── Detail Mode ── */}
          {seq.viewMode === 'detail' && (
            <div>
              {/* Tab bar */}
              <div className="seq-tab-bar">
                {seq.sequencerModels.map((seqModel, idx) => (
                  <div
                    key={seqModel.id}
                    className={`seq-tab${idx === seq.activeTab ? ' active' : ''}${seqModel.muted ? ' muted' : ''}${seq.evolveFlashing[idx] ? ' seq-evolve-flash' : ''}`}
                    style={{ '--sc': seqModel.color } as React.CSSProperties}
                    onClick={() => seq.setActiveTab(idx)}
                    role="button"
                    tabIndex={0}
                  >
                    <span>{seqModel.name}</span>
                    <div className="seq-tab-ms">
                      <button
                        className={`mute-btn${seqModel.muted ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleMute(idx); }}
                      >M</button>
                      <button
                        className={`solo-btn${seqModel.solo ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleSolo(idx); }}
                      >S</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Seq body */}
              <div className={`seq-body${seq.evolveFlashing[seq.activeTab] ? ' seq-evolve-flash' : ''}`} style={{ '--sc': activeSeq.color } as React.CSSProperties}>

                {/* ── Source voice toggles + per-seq controls (inline) ── */}
                <div className="seq-sources">
                  {DRUM_VOICE_ORDER.map((voice) => {
                    const isOn = Boolean(activeSeq.sources[voice as DrumVoiceType]);
                    const cfg = VOICE_CONFIG[voice];
                    return (
                      <button
                        key={voice}
                        className={`seq-source-toggle${isOn ? ' active' : ''}`}
                        style={{ '--vc': cfg.color } as React.CSSProperties}
                        onClick={() => seq.setParamSelect(seq.activeTab, `Target${voice.charAt(0).toUpperCase() + voice.slice(1)}`, !isOn as any)}
                        title={cfg.label}
                        {...bindHelp('drumSeqSourceToggle', { label: cfg.label })}
                      >
                        {cfg.icon}
                      </button>
                    );
                  })}

                  {/* ── Per-seq controls: Clock / Swing / Link / Evolve (inline) ── */}
                  <div className="seq-per-controls">
                  <label className="seq-clock-label">
                    Clock
                    <select
                      className="seq-clock-select"
                      value={seq.clockDivs[seq.activeTab]}
                      onChange={(e) => seq.setClockDiv(seq.activeTab, e.target.value as any)}
                      {...bindHelp('drumSeqClockSelect')}
                    >
                      <option value="1/4">1/4</option>
                      <option value="1/4T">1/4T</option>
                      <option value="1/8">1/8</option>
                      <option value="1/8T">1/8T</option>
                      <option value="1/16">1/16</option>
                      <option value="1/16T">1/16T</option>
                      <option value="1/32">1/32</option>
                      <option value="1/32T">1/32T</option>
                    </select>
                  </label>
                  <label className="seq-swing-label">
                    Swing
                    <input
                      type="range"
                      className="seq-swing-range"
                      min={0}
                      max={0.75}
                      step={0.05}
                      value={seq.swings[seq.activeTab] ?? 0}
                      onChange={(e) => seq.setSwing(seq.activeTab, parseFloat(e.target.value))}
                    />
                    <span className="seq-swing-val">{Math.round((seq.swings[seq.activeTab] ?? 0) * 100)}%</span>
                  </label>
                  <button
                    className={`seq-link-btn${seq.linked[seq.activeTab] ? ' on' : ''}`}
                    onClick={() => seq.toggleLinked(seq.activeTab)}
                    title={seq.linked[seq.activeTab] ? 'Sub-lanes linked to trigger steps' : 'Sub-lanes use independent step counts'}
                    {...bindHelp('drumSeqLink')}
                  >
                    Link
                  </button>
                  <button
                    className={`seq-evolve-btn${seq.evolveConfigs[seq.activeTab]?.enabled ? ' on' : ''}`}
                    onClick={() => {
                      seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                        idx === seq.activeTab ? { ...cfg, enabled: !cfg.enabled } : cfg
                      )));
                    }}
                    {...bindHelp('drumSeqEvolve')}
                  >
                    Evolve
                  </button>
                  </div>{/* end seq-per-controls */}
                </div>{/* end seq-sources */}
                <div className="seq-sequence-preset-row">
                  {renderSequencePresetControl(seq.activeTab)}
                </div>

                {/* Evolution panel */}
                <div className={`seq-evolve-panel${seq.evolveConfigs[seq.activeTab]?.enabled ? ' open' : ''}`}>
                  <div className="seq-evolve-row">
                    <DragNumber
                      value={seq.evolveConfigs[seq.activeTab]?.everyBars ?? 4}
                      min={1}
                      max={32}
                      label="Every"
                      onChange={(v) => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, everyBars: v } : cfg
                        )));
                      }}
                    />
                    <span className="seq-drag-num-label">bars</span>
                    <div className="seq-evolve-zone-wrap">
                      <label>
                        Evolution
                        <input
                          type="range" min={0} max={100} step={5}
                          value={Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}
                          onChange={(e) => {
                            const evolution = parseInt(e.target.value, 10) / 100;
                            seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                              if (idx !== seq.activeTab) return cfg;
                              const pct = evolution * 100;
                              const methods = {
                                rotateDrift: true,
                                swingDrift: true,
                                probDrift: pct > 30,
                                ghostNotes: pct > 60,
                                ratchetSpray: pct > 60,
                                hitDrift: pct > 80,
                                pitchWalk: pct > 80,
                                valueDrift: true,
                                valueScramble: pct > 40,
                                valueWiden: pct > 60,
                                subLaneLengthDrift: pct > 50,
                                subLaneDirectionFlip: pct > 80,
                              };
                              return { ...cfg, evolution, methods };
                            }));
                          }}
                        />
                        <span>{Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}%</span>
                      </label>
                      {(() => {
                        const pct = Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100);
                        return (
                          <div className="seq-evolve-methods">
                            <span className="seq-evolve-method on">Rotate</span>
                            <span className="seq-evolve-method on">Swing</span>
                            <span className="seq-evolve-method on">Drift</span>
                            <span className={`seq-evolve-method${pct > 30 ? ' on-t' : ''}`}>Probability</span>
                            <span className={`seq-evolve-method${pct > 40 ? ' on-t' : ''}`}>Scramble</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Length</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ghosts</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ratchet</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Widen</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Hits</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Pitch</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Direction</span>
                          </div>
                        );
                      })()}
                    </div>
                    <button className="seq-evolve-reset" onClick={() => handleResetEvolveHome(seq.activeTab)}>Reset</button>
                    {diceLane && (
                      <span className="seq-dice-group">
                        <SliderPrimitive
                          className="seq-dice-slider"
                          label="Dice"
                          mode="single"
                          value={Math.round(diceIntensity * 100)}
                          hero={SEQUENCER_SUB_LANE_COLORS.expression}
                          variant="full"
                          density="compact"
                          displayValue={`${Math.round(diceIntensity * 100)}%`}
                          formatValue={(value) => `${Math.round(value)}%`}
                          onValueChange={(value) => setDiceIntensity(Math.round(value / 5) * 5 / 100)}
                          title={`Dice intensity: ${Math.round(diceIntensity * 100)}%`}
                        />
                        <button className="seq-evolve-dice" onClick={() => diceLane(seq.activeTab, diceIntensity)} title={`Randomize lane (${Math.round(diceIntensity * 100)}%)`}>&#x1F3B2;</button>
                      </span>
                    )}
                  </div>
                  <button
                    className="seq-evolve-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                    {...bindHelp('drumSeqEvolveAdvanced')}
                  >
                    {showAdvanced ? '▾' : '▸'} Advanced
                  </button>
                  <div className={`seq-evolve-advanced-body${showAdvanced ? ' open' : ''}`}>
                    <div className="seq-evolve-advanced-row">
                      <label>Write Offset</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'auto' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 'auto' } : cfg))}
                          {...bindHelp('drumSeqWriteOffsetAuto')}
                        >Auto</button>
                        <button
                          className={`seq-evolve-mode-btn${typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 0 } : cfg))}
                          {...bindHelp('drumSeqWriteOffsetManual')}
                        >Manual</button>
                      </span>
                      {typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' && (
                        <input
                          type="range" min={0} max={Math.max(1, (activeSeq?.trigger?.steps ?? 16) - 1)} step={1}
                          value={seq.evolveConfigs[seq.activeTab]?.writeOffset as number}
                          onChange={(e) => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: parseInt(e.target.value, 10) } : cfg))}
                        />
                      )}
                    </div>
                    <div className="seq-evolve-advanced-row">
                      <label>Mutation</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'biased' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'biased' } : cfg))}
                          {...bindHelp('drumSeqMutationBiased')}
                        >Biased</button>
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'strict' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'strict' } : cfg))}
                          {...bindHelp('drumSeqMutationStrict')}
                        >Strict</button>
                      </span>
                    </div>
                    <div className="seq-evolve-checks">
                      {Object.keys(seq.evolveConfigs[seq.activeTab]?.methods ?? {}).map((method) => (
                        <label key={method}>
                          <input
                            type="checkbox"
                            checked={!!seq.evolveConfigs[seq.activeTab]?.methods[method]}
                            onChange={() => {
                              seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                                idx === seq.activeTab
                                  ? { ...cfg, methods: { ...cfg.methods, [method]: !cfg.methods[method] } }
                                  : cfg
                              )));
                            }}
                          />
                          {method}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── TRIGGER LANE – always visible ── */}
                <div className="seq-trigger-always">
                  {/* Trigger lane header: Steps / Hits / Rotation */}
                  <div className="seq-lane-header">
                    <button
                      className={`seq-lane-enable-btn trigger-toggle${!activeSeq.muted ? ' on' : ''}`}
                      style={!activeSeq.muted ? { background: activeSeq.color, color: '#000' } as React.CSSProperties : undefined}
                      onClick={() => seq.toggleMute(seq.activeTab)}
                    >
                      {activeSeq.muted ? 'Off' : 'On'}
                    </button>
                    <div className="seq-lane-controls">
                      <DragNumber
                        value={activeSeq.trigger.steps}
                        min={2}
                        max={EUCLIDEAN_STEP_MAX}
                        label="Steps"
                        shapeByDrag
                        onChange={(v) => seq.setParam(seq.activeTab, 'Steps', v)}
                      />
                      <DragNumber
                        value={activeSeq.trigger.hits}
                        min={0}
                        max={activeSeq.trigger.steps}
                        label="Hits"
                        onChange={(v) => seq.setParam(seq.activeTab, 'Hits', v)}
                      />
                      <div className="seq-rotation-control">
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation - 1)}>←</button>
                        <span className="seq-rotation-val">{activeSeq.trigger.rotation}</span>
                        <button onClick={() => seq.setParam(seq.activeTab, 'Rotation', activeSeq.trigger.rotation + 1)}>→</button>
                      </div>
                    </div>
                  </div>
                  <SeqLane
                    sequencer={activeSeq}
                    lane="trigger"
                    color={activeSeq.color}
                    playhead={seq.playheads[seq.activeTab] ?? 0}
                    hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                    selectedStep={activeKeyboardLane === 'trigger' ? activeKeyboardStep : null}
                    selectedStepLabel="⌖"
                    onToggleTriggerStep={(step) => seq.toggleTriggerStep(seq.activeTab, step)}
                    onSetProbability={(step, value) => seq.setStepProbability(seq.activeTab, step, value)}
                    onResetProbability={(step) => seq.resetStepProbability(seq.activeTab, step)}
                    onCycleRatchet={(step) => seq.cycleStepRatchet(seq.activeTab, step)}
                    onCycleTrigCondition={(step) => seq.cycleTrigCondition(seq.activeTab, step)}
                  />
                </div>

                {/* ── Sub-lane sparkline accordion (4 sub-lanes only) ── */}
                <div className="seq-spark-container">
                  {(['pitch', 'expression', 'morph', 'distance'] as const).map((laneKind) => {
                    const subState = seq.subLaneStates[seq.activeTab]?.[laneKind];
                    const laneColor = SEQUENCER_SUB_LANE_COLORS[laneKind];
                    return (
                      <React.Fragment key={laneKind}>
                        <SeqSparkline
                          label={`${laneKind.charAt(0).toUpperCase()}:`}
                          steps={subState?.steps ?? 5}
                          values={
                            laneKind === 'pitch'
                              ? activeSeq.pitch.offsets.map(off =>
                                  activeSeq.pitch.mode === 'notes'
                                    ? normalizeNoteDegreeOffset(off)
                                    : (off + 24) / 48
                                )
                              : laneKind === 'expression' && subState?.valueMode === 'range'
                                ? new Array(subState.steps).fill(((subState.rangeMin ?? 0.75) + (subState.rangeMax ?? 1)) * 0.5)
                                : laneKind === 'expression'
                                  ? activeSeq.expression.velocities
                                  : laneKind === 'morph' && subState?.valueMode === 'range'
                                    ? new Array(subState.steps).fill(((subState.rangeMin ?? 0.25) + (subState.rangeMax ?? 0.75)) * 0.5)
                                    : laneKind === 'morph'
                                      ? activeSeq.morph.values
                                      : subState?.valueMode === 'range'
                                        ? new Array(subState.steps).fill(((subState.rangeMin ?? 0) + (subState.rangeMax ?? 1)) * 0.5)
                                        : activeSeq.distance.values
                          }
                          color={laneColor}
                          playhead={seq.playheads[seq.activeTab]}
                          hitCount={seq.hitCounts[seq.activeTab]}
                          direction={subState?.direction ?? 'forward'}
                          bipolar={
                            laneKind === 'morph' ||
                            (laneKind === 'pitch' && activeSeq.pitch.mode !== 'notes')
                          }
                          invertFill={laneKind === 'expression'}
                          enabled={subState?.enabled ?? false}
                          expanded={seq.openLane === laneKind}
                          selectedStep={activeKeyboardLane === laneKind ? activeKeyboardStep : null}
                          onClick={() => seq.setOpenLane(seq.openLane === laneKind ? 'trigger' : laneKind)}
                          onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                        />
                        {/* Expanded sub-lane editor */}
                        {seq.openLane === laneKind && (
                          <div className="seq-lane-editor-wrap">
                            <SeqLane
                              sequencer={activeSeq}
                              lane={laneKind}
                              color={laneColor}
                              playhead={seq.playheads[seq.activeTab] ?? 0}
                              hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                              selectedStep={activeKeyboardLane === laneKind ? activeKeyboardStep : null}
                              selectedStepLabel="⌖"
                              onSelectStep={(step) => selectDrumKeyboardStep(seq.activeTab, laneKind, step)}
                              enabled={subState?.enabled ?? false}
                              direction={subState?.direction ?? 'forward'}
                              onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                              onChangeSteps={(v) => seq.setSubLaneSteps(seq.activeTab, laneKind, v)}
                              onCycleDirection={() => seq.cycleSubLaneDirection(seq.activeTab, laneKind)}
                              onChangeValue={(step, value) => seq.changeStepValue(seq.activeTab, laneKind, step, value)}
                              valueMode={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.valueMode ?? 'sequence' : undefined}
                              rangeMin={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.rangeMin : undefined}
                              rangeMax={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.rangeMax : undefined}
                              onChangeValueMode={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance'
                                ? (mode) => seq.setSubLaneValueMode(seq.activeTab, laneKind, mode)
                                : undefined}
                              onChangeRange={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance'
                                ? (min, max) => seq.setSubLaneRange(seq.activeTab, laneKind, min, max)
                                : undefined}
                              linked={seq.linked[seq.activeTab]}
                              {...(laneKind === 'expression' ? {
                                onCycleRatchet: (step: number) => seq.cycleStepRatchet(seq.activeTab, step),
                              } : {})}
                              {...(laneKind === 'pitch' ? {
                                onChangePitchMode: (mode) => seq.setPitchMode(seq.activeTab, mode),
                                onChangePitchRoot: (root) => seq.setPitchRoot(seq.activeTab, root),
                                onChangePitchScale: (scale) => seq.setPitchScale(seq.activeTab, scale),
                                onToggleScaleQuantize: () => seq.toggleScaleQuantize(seq.activeTab),
                                hidePitchNoteRange: true,
                              } : {})}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Mini overview at bottom — clickable to switch seq */}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => seq.setActiveTab(idx)}
              />
            </div>
          )}

          {/* ── Overview Mode ── */}
          {seq.viewMode === 'overview' && (
            <>
              <SeqOverview
                sequencers={seq.sequencerModels}
                playheads={seq.playheads}
                onSelectSequencer={(index) => {
                  seq.setActiveTab(index);
                  seq.setViewMode('detail');
                }}
                onSetParam={(seqIdx, param, value) => seq.setParam(seqIdx, param, value)}
                onToggleSource={(seqIdx, voice, on) => seq.setParamSelect(seqIdx, `Target${voice.charAt(0).toUpperCase() + voice.slice(1)}`, on as any)}
                onToggleMute={(seqIdx) => seq.toggleMute(seqIdx)}
                onToggleSolo={(seqIdx) => seq.toggleSolo(seqIdx)}
                onSetClockDiv={(seqIdx, div) => seq.setClockDiv(seqIdx, div)}
                onToggleTriggerStep={(seqIdx, step) => seq.toggleTriggerStep(seqIdx, step)}
                onSetProbability={(seqIdx, step, value) => seq.setStepProbability(seqIdx, step, value)}
                onResetProbability={(seqIdx, step) => seq.resetStepProbability(seqIdx, step)}
                onCycleTrigCondition={(seqIdx, step) => seq.cycleTrigCondition(seqIdx, step)}
              />
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => {
                  seq.setActiveTab(idx);
                  seq.setViewMode('detail');
                }}
              />
            </>
          )}


        </div>
      </div>
    </div>
  );
};

export default DrumPage;
