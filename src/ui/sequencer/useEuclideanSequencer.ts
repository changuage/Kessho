/**
 * useEuclideanSequencer — Generic reusable hook for euclidean sequencer state management.
 *
 * Used by drums (4 lanes), and designed to be reused by lead/synth (1-4 lanes).
 * Parameterized by `prefix` so drums uses 'drum' → drumEuclid1Steps, etc.
 * and lead could use 'lead' → leadEuclid1Steps, etc.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { SliderState } from '../state';
import type {
  SequencerState,
  ClockDivision,
  LaneDirection,
  PitchMode,
  ScaleName,
  TrigCondition,
} from '../../audio/drumSeqTypes';
import {
  seqEuclidean,
  resolveDrumEuclidPatternParams,
  DRUM_EUCLID_PRESET_DATA,
} from '../../audio/drumSequencer';

// ── Types ──

export type LaneKind = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance';
export type SubLaneKind = Exclude<LaneKind, 'trigger'>;

/** Per-sub-lane UI state (per sequencer × per sub-lane) */
export interface SubLaneState {
  enabled: boolean;
  steps: number;
  direction: LaneDirection;
}

export interface StepOverrides {
  triggerToggles: Set<number>[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: (TrigCondition[] | null)[];
  expression: (number[] | null)[];
  pitch: (number[] | null)[];
  morph: (number[] | null)[];
  distance: (number[] | null)[];
  expressionDirection: (LaneDirection | null)[];
  morphDirection: (LaneDirection | null)[];
  distanceDirection: (LaneDirection | null)[];
  pitchDirection: (LaneDirection | null)[];
}

export interface EvolveConfig {
  enabled: boolean;
  everyBars: number;
  intensity: number;
  methods: Record<string, boolean>;
}

export interface EuclideanLaneConfig {
  color: string;
  name: string;
}

export interface UseEuclideanSequencerOptions {
  /** Full slider state */
  state: SliderState;
  /** Callback to change a numeric param */
  onParamChange: (key: keyof SliderState, value: number) => void;
  /** Callback to change any param (select, boolean, etc.) */
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  /** Prefix for param keys: 'drum' → drumEuclid1Steps, 'lead' → leadEuclid1Steps */
  prefix: string;
  /** Number of sequencer lanes (4 for drums, 1–4 for lead/synth) */
  laneCount: number;
  /** Per-lane visual config */
  lanes: EuclideanLaneConfig[];
  /** External playhead positions (set from audio engine callback) */
  playheads: number[];
  /** External hit counts per lane (for sub-lane playheads, Elektron-style) */
  hitCounts?: number[];
  /** External evolve flash state (set from audio engine callback) */
  evolveFlashing?: boolean[];
  /** Initial view mode to restore (persisted across tab switches) */
  initialViewMode?: 'simple' | 'detail' | 'overview';
}

export interface UseEuclideanSequencerResult {
  // ── Models ──
  sequencerModels: SequencerState[];
  miniPatterns: boolean[][];

  // ── View State ──
  viewMode: 'simple' | 'detail' | 'overview';
  setViewMode: React.Dispatch<React.SetStateAction<'simple' | 'detail' | 'overview'>>;
  activeTab: number;
  setActiveTab: React.Dispatch<React.SetStateAction<number>>;
  openLane: LaneKind;
  setOpenLane: React.Dispatch<React.SetStateAction<LaneKind>>;
  activeSeq: SequencerState;
  playheads: number[];
  hitCounts: number[];

  // ── Step Overrides ──
  stepOverrides: StepOverrides;
  toggleTriggerStep: (laneIdx: number, step: number) => void;
  changeStepValue: (laneIdx: number, lane: LaneKind, step: number, value: number) => void;
  setStepProbability: (laneIdx: number, step: number, value: number) => void;
  cycleStepRatchet: (laneIdx: number, step: number) => void;
  cycleTrigCondition: (laneIdx: number, step: number) => void;
  resetStepProbability: (laneIdx: number, step: number) => void;

  // ── Per-Seq Param Helpers ──
  /** Get a per-lane param value: getParam(0, 'Steps') → state[`${prefix}Euclid1Steps`] */
  getParam: (laneIdx: number, suffix: string) => SliderState[keyof SliderState];
  /** Set a per-lane numeric param */
  setParam: (laneIdx: number, suffix: string, value: number) => void;
  /** Set a per-lane non-numeric param */
  setParamSelect: (laneIdx: number, suffix: string, value: SliderState[keyof SliderState]) => void;
  /** Get a global param: getGlobalParam('Division') → state[`${prefix}EuclidDivision`] */
  getGlobalParam: (suffix: string) => SliderState[keyof SliderState];
  /** Set a global numeric param */
  setGlobalParam: (suffix: string, value: number) => void;
  /** Set a global non-numeric param */
  setGlobalParamSelect: (suffix: string, value: SliderState[keyof SliderState]) => void;

  // ── Evolve ──
  evolveConfigs: EvolveConfig[];
  setEvolveConfigs: React.Dispatch<React.SetStateAction<EvolveConfig[]>>;
  evolveFlashing: boolean[];

  // ── Mute/Solo ──
  toggleMute: (laneIdx: number) => void;
  toggleSolo: (laneIdx: number) => void;

  // ── Sub-Lane State ──
  /** Per-sequencer, per-sub-lane state (indexed [seqIdx][subLaneKind]) */
  subLaneStates: Record<SubLaneKind, SubLaneState>[];
  toggleSubLaneEnabled: (seqIdx: number, lane: SubLaneKind) => void;
  setSubLaneSteps: (seqIdx: number, lane: SubLaneKind, steps: number) => void;
  cycleSubLaneDirection: (seqIdx: number, lane: SubLaneKind) => void;
  /** Per-sequencer linked state */
  linked: boolean[];
  toggleLinked: (seqIdx: number) => void;

  // ── Per-Seq Clock/Swing ──
  clockDivs: ClockDivision[];
  setClockDiv: (seqIdx: number, div: ClockDivision) => void;
  swings: number[];
  setSwing: (seqIdx: number, value: number) => void;

  // ── Per-Seq Pitch Settings ──
  pitchSettings: { mode: PitchMode; root: number; scale: ScaleName }[];
  setPitchMode: (seqIdx: number, mode: PitchMode) => void;
  setPitchRoot: (seqIdx: number, root: number) => void;
  setPitchScale: (seqIdx: number, scale: ScaleName) => void;

  // ── Presets ──
  presetNames: string[];
}

const DEFAULT_EVOLVE_METHODS: Record<string, boolean> = {
  rotateDrift: true,
  velocityBreath: true,
  swingDrift: true,
  probDrift: false,
  morphDrift: false,
  ghostNotes: false,
  ratchetSpray: false,
  hitDrift: false,
  pitchWalk: false,
};

function makeKey(prefix: string, laneNum: number, suffix: string): keyof SliderState {
  return `${prefix}Euclid${laneNum}${suffix}` as keyof SliderState;
}

function makeGlobalKey(prefix: string, suffix: string): keyof SliderState {
  return `${prefix}Euclid${suffix}` as keyof SliderState;
}

export function useEuclideanSequencer(opts: UseEuclideanSequencerOptions): UseEuclideanSequencerResult {
  const {
    state,
    onParamChange,
    onSelectChange,
    prefix,
    laneCount,
    lanes,
    playheads,
    hitCounts: hitCountsOpt,
    evolveFlashing: externalEvolveFlashing,
    initialViewMode,
  } = opts;

  const hitCounts = hitCountsOpt ?? Array.from({ length: laneCount }, () => 0);
  const evolveFlashing = externalEvolveFlashing ?? Array.from({ length: laneCount }, () => false);

  // ── View State ──
  const [viewMode, setViewMode] = useState<'simple' | 'detail' | 'overview'>(initialViewMode ?? 'detail');
  const [activeTab, setActiveTab] = useState(0);
  const [openLane, setOpenLane] = useState<LaneKind>('trigger');

  // ── Step Overrides ──
  const [stepOverrides, setStepOverrides] = useState<StepOverrides>(() => ({
    triggerToggles: Array.from({ length: laneCount }, () => new Set<number>()),
    probability: Array.from({ length: laneCount }, () => null as number[] | null),
    ratchet: Array.from({ length: laneCount }, () => null as number[] | null),
    trigCondition: Array.from({ length: laneCount }, () => null as TrigCondition[] | null),
    expression: Array.from({ length: laneCount }, () => null as number[] | null),
    pitch: Array.from({ length: laneCount }, () => null as number[] | null),
    morph: Array.from({ length: laneCount }, () => null as number[] | null),
    distance: Array.from({ length: laneCount }, () => null as number[] | null),
    expressionDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    morphDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    distanceDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    pitchDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
  }));

  // ── Evolve ──
  const [evolveConfigs, setEvolveConfigs] = useState<EvolveConfig[]>(() =>
    Array.from({ length: laneCount }, () => ({
      enabled: false,
      everyBars: 4,
      intensity: 0.25,
      methods: { ...DEFAULT_EVOLVE_METHODS },
    }))
  );

  // ── Sub-Lane State (per-sequencer, per-sub-lane) ──
  const SUB_LANE_KINDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance'];
  const DIRECTION_ORDER: LaneDirection[] = ['forward', 'reverse', 'pingpong'];

  const [subLaneStates, setSubLaneStates] = useState<Record<SubLaneKind, SubLaneState>[]>(() =>
    Array.from({ length: laneCount }, () => ({
      pitch: { enabled: false, steps: 5, direction: 'forward' as LaneDirection },
      expression: { enabled: false, steps: 5, direction: 'forward' as LaneDirection },
      morph: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
      distance: { enabled: false, steps: 4, direction: 'forward' as LaneDirection },
    }))
  );

  const [linked, setLinked] = useState<boolean[]>(() =>
    Array.from({ length: laneCount }, () => false)
  );

  // ── Per-Seq Clock/Swing ──
  const [clockDivs, setClockDivs] = useState<ClockDivision[]>(() =>
    Array.from({ length: laneCount }, (_, i) =>
      i === 0 ? '1/8' as ClockDivision : i === 1 ? '1/16' as ClockDivision : i === 2 ? '1/8T' as ClockDivision : '1/4' as ClockDivision
    )
  );
  const [swings, setSwings] = useState<number[]>(() =>
    Array.from({ length: laneCount }, () => 0)
  );

  // ── Solo tracking (set of soloed lane indices; empty = no solo) ──
  const [soloSet, setSoloSet] = useState<Set<number>>(new Set());

  // ── Per-Seq Pitch Settings ──
  const [pitchSettings, setPitchSettings] = useState<{ mode: PitchMode; root: number; scale: ScaleName }[]>(() =>
    Array.from({ length: laneCount }, () => ({ mode: 'semitones' as PitchMode, root: 60, scale: 'Major' as ScaleName }))
  );

  const setPitchMode = useCallback((seqIdx: number, mode: PitchMode) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, mode } : s));
  }, []);

  const setPitchRoot = useCallback((seqIdx: number, root: number) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, root: Math.max(0, Math.min(127, root)) } : s));
  }, []);

  const setPitchScale = useCallback((seqIdx: number, scale: ScaleName) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, scale } : s));
  }, []);

  const setClockDiv = useCallback((seqIdx: number, div: ClockDivision) => {
    setClockDivs(prev => prev.map((d, i) => i === seqIdx ? div : d));
  }, []);

  const setSwingVal = useCallback((seqIdx: number, value: number) => {
    setSwings(prev => prev.map((s, i) => i === seqIdx ? value : s));
  }, []);

  const toggleSubLaneEnabled = useCallback((seqIdx: number, lane: SubLaneKind) => {
    setSubLaneStates(prev => prev.map((s, i) =>
      i === seqIdx ? { ...s, [lane]: { ...s[lane], enabled: !s[lane].enabled } } : s
    ));
  }, []);

  const setSubLaneSteps = useCallback((seqIdx: number, lane: SubLaneKind, steps: number) => {
    setSubLaneStates(prev => prev.map((s, i) =>
      i === seqIdx ? { ...s, [lane]: { ...s[lane], steps: Math.max(1, Math.min(16, steps)) } } : s
    ));
  }, []);

  const cycleSubLaneDirection = useCallback((seqIdx: number, lane: SubLaneKind) => {
    setSubLaneStates(prev => {
      const updated = prev.map((s, i) => {
        if (i !== seqIdx) return s;
        const cur = s[lane].direction;
        const nextIdx = (DIRECTION_ORDER.indexOf(cur) + 1) % DIRECTION_ORDER.length;
        return { ...s, [lane]: { ...s[lane], direction: DIRECTION_ORDER[nextIdx] } };
      });
      // Also sync direction into stepOverrides so it flows to audio engine
      const newDir = updated[seqIdx]?.[lane]?.direction ?? 'forward';
      const dirKey = `${lane}Direction` as keyof StepOverrides;
      setStepOverrides(old => {
        const arr = [...(old[dirKey] as (LaneDirection | null)[])];
        arr[seqIdx] = newDir;
        return { ...old, [dirKey]: arr };
      });
      return updated;
    });
  }, []);

  const toggleLinked = useCallback((seqIdx: number) => {
    setLinked(prev => prev.map((v, i) => i === seqIdx ? !v : v));
  }, []);

  // When linked is on, force sub-lane steps to match active hit count
  // (prototype: seqSyncLinkedSteps — sets sub-lane steps = pattern.filter(x=>x).length)
  useEffect(() => {
    linked.forEach((isLinked, seqIdx) => {
      if (!isLinked) return;
      // Compute the final pattern (Euclidean + toggle overrides) to count active hits
      const laneNum = seqIdx + 1;
      const preset = state[makeKey(prefix, laneNum, 'Preset')] as string;
      const steps = state[makeKey(prefix, laneNum, 'Steps')] as number;
      const hits = state[makeKey(prefix, laneNum, 'Hits')] as number;
      const rotation = state[makeKey(prefix, laneNum, 'Rotation')] as number;
      const resolved = resolveDrumEuclidPatternParams(preset, steps, hits, rotation);
      const basePattern = seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);
      const toggleSet = stepOverrides.triggerToggles[seqIdx];
      const pattern = basePattern.map((v, i) => (toggleSet?.has(i) ? !v : v));
      const activeHits = pattern.filter(x => x).length;
      if (activeHits < 1) return;

      setSubLaneStates(prev => {
        const cur = prev[seqIdx];
        const needsUpdate = SUB_LANE_KINDS.some(k => cur[k].steps !== activeHits);
        if (!needsUpdate) return prev;
        return prev.map((s, i) => {
          if (i !== seqIdx) return s;
          const updated = { ...s };
          for (const k of SUB_LANE_KINDS) {
            updated[k] = { ...updated[k], steps: activeHits };
          }
          return updated;
        });
      });
    });
  }, [linked, state, prefix, stepOverrides.triggerToggles]);

  // ── Param helpers ──
  const getParam = useCallback(
    (laneIdx: number, suffix: string) => state[makeKey(prefix, laneIdx + 1, suffix)],
    [state, prefix]
  );

  const setParam = useCallback(
    (laneIdx: number, suffix: string, value: number) =>
      onParamChange(makeKey(prefix, laneIdx + 1, suffix), value),
    [onParamChange, prefix]
  );

  const setParamSelect = useCallback(
    (laneIdx: number, suffix: string, value: SliderState[keyof SliderState]) =>
      onSelectChange(makeKey(prefix, laneIdx + 1, suffix), value),
    [onSelectChange, prefix]
  );

  const getGlobalParam = useCallback(
    (suffix: string) => state[makeGlobalKey(prefix, suffix)],
    [state, prefix]
  );

  const setGlobalParam = useCallback(
    (suffix: string, value: number) =>
      onParamChange(makeGlobalKey(prefix, suffix), value),
    [onParamChange, prefix]
  );

  const setGlobalParamSelect = useCallback(
    (suffix: string, value: SliderState[keyof SliderState]) =>
      onSelectChange(makeGlobalKey(prefix, suffix), value),
    [onSelectChange, prefix]
  );

  // ── Reset overrides when steps/hits change ──
  const prevParamsRef = useRef<string[]>([]);
  useEffect(() => {
    const current = Array.from({ length: laneCount }, (_, i) => {
      const s = state[makeKey(prefix, i + 1, 'Steps')];
      const h = state[makeKey(prefix, i + 1, 'Hits')];
      return `${s}:${h}`;
    });
    const prev = prevParamsRef.current;
    if (prev.length > 0) {
      const changed = current.some((v, i) => v !== prev[i]);
      if (changed) {
        setStepOverrides((old) => {
          const next = { ...old };
          let dirty = false;
          current.forEach((v, i) => {
            if (v !== prev[i]) {
              dirty = true;
              next.triggerToggles = [...next.triggerToggles];
              next.triggerToggles[i] = new Set();
              next.probability = [...next.probability];
              (next.probability as (number[] | null)[])[i] = null;
              next.ratchet = [...next.ratchet];
              (next.ratchet as (number[] | null)[])[i] = null;
              for (const key of ['expression', 'pitch', 'morph', 'distance'] as const) {
                next[key] = [...next[key]];
                (next[key] as (number[] | null)[])[i] = null;
              }
            }
          });
          return dirty ? next : old;
        });
      }
    }
    prevParamsRef.current = current;
  }); // runs every render — checks are internal

  // ── Mini patterns ──
  const miniPatterns = useMemo(() => {
    return Array.from({ length: laneCount }, (_, idx) => {
      const laneNum = idx + 1;
      const preset = state[makeKey(prefix, laneNum, 'Preset')] as string;
      const steps = state[makeKey(prefix, laneNum, 'Steps')] as number;
      const hits = state[makeKey(prefix, laneNum, 'Hits')] as number;
      const rotation = state[makeKey(prefix, laneNum, 'Rotation')] as number;
      const resolved = resolveDrumEuclidPatternParams(preset, steps, hits, rotation);
      return seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);
    });
  }, [state, prefix, laneCount]);

  // ── Sequencer models ──
  const sequencerModels = useMemo<SequencerState[]>(() => {
    return Array.from({ length: laneCount }, (_, idx) => {
      const laneNum = idx + 1;
      const preset = state[makeKey(prefix, laneNum, 'Preset')] as string;
      const steps = state[makeKey(prefix, laneNum, 'Steps')] as number;
      const hits = state[makeKey(prefix, laneNum, 'Hits')] as number;
      const rotation = state[makeKey(prefix, laneNum, 'Rotation')] as number;
      const probability = state[makeKey(prefix, laneNum, 'Probability')] as number;
      const resolved = resolveDrumEuclidPatternParams(preset, steps, hits, rotation);
      const basePattern = seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);

      // Merge trigger overrides
      const toggleSet = stepOverrides.triggerToggles[idx];
      const pattern = basePattern.map((v, i) => (toggleSet?.has(i) ? !v : v));

      // Read source voice booleans
      const sources: Record<string, boolean> = {};
      for (const voiceKey of ['Sub', 'Kick', 'Click', 'BeepHi', 'BeepLo', 'Noise', 'Membrane']) {
        const key = makeKey(prefix, laneNum, `Target${voiceKey}`);
        sources[voiceKey.charAt(0).toLowerCase() + voiceKey.slice(1)] = Boolean(state[key]);
      }

      // Muted = !Enabled (the Enabled param in SliderState is inverted for mute)
      const enabled = state[makeKey(prefix, laneNum, 'Enabled')] as boolean;

      const cfg = lanes[idx] ?? { color: '#a855f7', name: `Seq ${laneNum}` };

      return {
        id: idx,
        rng: Math.random,
        color: cfg.color,
        name: cfg.name,
        muted: !enabled,
        solo: soloSet.has(idx),
        clockDiv: clockDivs[idx] ?? '1/8',
        swing: swings[idx] ?? 0,
        sources: sources as SequencerState['sources'],
        trigger: {
          enabled: true,
          steps: resolved.steps,
          hits: resolved.hits,
          rotation: resolved.rotation,
          pattern,
          overrides: new Set<number>(),
          probability: stepOverrides.probability[idx] ?? new Array(resolved.steps).fill(probability),
          ratchet: stepOverrides.ratchet[idx] ?? new Array(resolved.steps).fill(1),
          trigCondition: stepOverrides.trigCondition[idx] ?? new Array(resolved.steps).fill([1, 1] as TrigCondition),
        },
        pitch: {
          enabled: subLaneStates[idx]?.pitch.enabled ?? false,
          steps: subLaneStates[idx]?.pitch.steps ?? 5,
          direction: subLaneStates[idx]?.pitch.direction ?? 'forward',
          _ppForward: true,
          offsets: stepOverrides.pitch[idx] ?? new Array(subLaneStates[idx]?.pitch.steps ?? 5).fill(0),
          mode: pitchSettings[idx]?.mode ?? 'semitones',
          root: pitchSettings[idx]?.root ?? 60,
          scale: pitchSettings[idx]?.scale ?? 'Major',
        },
        expression: {
          enabled: subLaneStates[idx]?.expression.enabled ?? false,
          steps: subLaneStates[idx]?.expression.steps ?? 5,
          direction: subLaneStates[idx]?.expression.direction ?? 'forward',
          _ppForward: true,
          velocities: stepOverrides.expression[idx] ?? new Array(subLaneStates[idx]?.expression.steps ?? 5).fill(1.0),
        },
        morph: {
          enabled: subLaneStates[idx]?.morph.enabled ?? false,
          steps: subLaneStates[idx]?.morph.steps ?? 4,
          direction: subLaneStates[idx]?.morph.direction ?? 'forward',
          _ppForward: true,
          values: stepOverrides.morph[idx] ?? new Array(subLaneStates[idx]?.morph.steps ?? 4).fill(0),
        },
        distance: {
          enabled: subLaneStates[idx]?.distance.enabled ?? false,
          steps: subLaneStates[idx]?.distance.steps ?? 4,
          direction: subLaneStates[idx]?.distance.direction ?? 'forward',
          _ppForward: true,
          values: stepOverrides.distance[idx] ?? new Array(subLaneStates[idx]?.distance.steps ?? 4).fill(0.5),
        },
        stepIndex: 0,
        hitCount: 0,
        nextTime: 0,
        lastDisplayStep: -1,
        totalStepCount: 0,
        linked: linked[idx] ?? false,
        evolve: {
          enabled: evolveConfigs[idx]?.enabled ?? false,
          everyBars: evolveConfigs[idx]?.everyBars ?? 4,
          intensity: evolveConfigs[idx]?.intensity ?? 0.25,
          lastEvolveBar: -1,
          methods: evolveConfigs[idx]?.methods ?? { ...DEFAULT_EVOLVE_METHODS },
          home: null,
        },
      } satisfies SequencerState;
    });
  }, [state, prefix, laneCount, lanes, stepOverrides, evolveConfigs, subLaneStates, linked, clockDivs, swings, pitchSettings, soloSet]);

  // ── Callbacks ──
  const toggleTriggerStep = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, triggerToggles: [...prev.triggerToggles] };
        const s = new Set(next.triggerToggles[laneIdx]);
        if (s.has(step)) s.delete(step);
        else s.add(step);
        next.triggerToggles[laneIdx] = s;
        return next;
      });
    },
    []
  );

  const changeStepValue = useCallback(
    (laneIdx: number, lane: LaneKind, step: number, value: number) => {
      if (lane === 'trigger') return;
      const subLane = lane as SubLaneKind;
      setStepOverrides((prev) => {
        const next = { ...prev, [lane]: [...prev[lane]] };
        const subSteps = subLaneStates[laneIdx]?.[subLane]?.steps ?? 5;
        const arr = next[lane][laneIdx]
          ? [...(next[lane][laneIdx] as number[])]
          : new Array(subSteps).fill(lane === 'pitch' ? 0 : lane === 'expression' ? 1.0 : lane === 'morph' ? 0 : 0.5);
        arr[step] = value;
        (next[lane] as (number[] | null)[])[laneIdx] = arr;
        return next;
      });
    },
    [subLaneStates]
  );

  const setStepProbability = useCallback(
    (laneIdx: number, step: number, value: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, probability: [...prev.probability] };
        const steps = (state[makeKey(prefix, laneIdx + 1, 'Steps')] as number) ?? 16;
        const arr = next.probability[laneIdx]
          ? [...(next.probability[laneIdx] as number[])]
          : new Array(steps).fill(1.0);
        arr[step] = Math.max(0, Math.min(1, Math.round(value * 20) / 20)); // 5% snap
        next.probability[laneIdx] = arr;
        return next;
      });
    },
    [state, prefix]
  );

  const resetStepProbability = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, probability: [...prev.probability] };
        if (!next.probability[laneIdx]) return prev;
        const arr = [...(next.probability[laneIdx] as number[])];
        arr[step] = 1.0;
        next.probability[laneIdx] = arr;
        return next;
      });
    },
    []
  );

  const cycleStepRatchet = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, ratchet: [...prev.ratchet] };
        const steps = (state[makeKey(prefix, laneIdx + 1, 'Steps')] as number) ?? 16;
        const arr = next.ratchet[laneIdx]
          ? [...(next.ratchet[laneIdx] as number[])]
          : new Array(steps).fill(1);
        arr[step] = arr[step] >= 4 ? 1 : arr[step] + 1;
        next.ratchet[laneIdx] = arr;
        return next;
      });
    },
    [state, prefix]
  );

  /* Elektron-style trig conditions: cycle through n:N pairs */
  const TRIG_COND_CYCLE: TrigCondition[] = [
    [1,1],[1,2],[2,2],[1,3],[2,3],[3,3],[1,4],[2,4],[3,4],[4,4],
  ];
  const cycleTrigCondition = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, trigCondition: [...prev.trigCondition] };
        const steps = (state[makeKey(prefix, laneIdx + 1, 'Steps')] as number) ?? 16;
        const arr = next.trigCondition[laneIdx]
          ? [...(next.trigCondition[laneIdx] as TrigCondition[])]
          : new Array(steps).fill([1, 1] as TrigCondition);
        const cur = arr[step] ?? [1, 1];
        const curIdx = TRIG_COND_CYCLE.findIndex(
          (c) => c[0] === cur[0] && c[1] === cur[1]
        );
        const nextIdx = (curIdx + 1) % TRIG_COND_CYCLE.length;
        arr[step] = TRIG_COND_CYCLE[nextIdx];
        next.trigCondition[laneIdx] = arr;
        return next;
      });
    },
    [state, prefix]
  );

  // ── Mute/Solo ──
  const toggleMute = useCallback(
    (laneIdx: number) => {
      const key = makeKey(prefix, laneIdx + 1, 'Enabled');
      onSelectChange(key, !(state[key] as boolean));
    },
    [state, prefix, onSelectChange]
  );

  const toggleSolo = useCallback(
    (laneIdx: number) => {
      setSoloSet(prev => {
        const next = new Set(prev);
        if (next.has(laneIdx)) {
          next.delete(laneIdx);
        } else {
          next.add(laneIdx);
        }
        // If no lanes are soloed, re-enable all; otherwise enable only soloed lanes
        if (next.size === 0) {
          for (let i = 0; i < laneCount; i++) {
            onSelectChange(makeKey(prefix, i + 1, 'Enabled'), true);
          }
        } else {
          for (let i = 0; i < laneCount; i++) {
            onSelectChange(makeKey(prefix, i + 1, 'Enabled'), next.has(i));
          }
        }
        return next;
      });
    },
    [prefix, laneCount, onSelectChange]
  );

  // ── Preset names ──
  const presetNames = useMemo(
    () => ['custom', ...Object.keys(DRUM_EUCLID_PRESET_DATA)],
    []
  );

  const activeSeq = sequencerModels[activeTab] ?? sequencerModels[0];

  return {
    sequencerModels,
    miniPatterns,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    openLane,
    setOpenLane,
    activeSeq,
    playheads,
    hitCounts,
    stepOverrides,
    toggleTriggerStep,
    changeStepValue,
    setStepProbability,
    cycleStepRatchet,
    cycleTrigCondition,
    resetStepProbability,
    getParam,
    setParam,
    setParamSelect,
    getGlobalParam,
    setGlobalParam,
    setGlobalParamSelect,
    evolveConfigs,
    setEvolveConfigs,
    evolveFlashing,
    toggleMute,
    toggleSolo,
    presetNames,
    subLaneStates,
    toggleSubLaneEnabled,
    setSubLaneSteps,
    cycleSubLaneDirection,
    linked,
    toggleLinked,
    clockDivs,
    setClockDiv,
    swings,
    setSwing: setSwingVal,
    pitchSettings,
    setPitchMode,
    setPitchRoot,
    setPitchScale,
  };
}
