/**
 * useEuclideanSequencer — Generic reusable hook for euclidean sequencer state management.
 *
 * Used by drums (4 lanes), and designed to be reused by lead/synth (1-4 lanes).
 * Parameterized by `prefix` so drums uses 'drum' → drumEuclid1Steps, etc.
 * and lead could use 'lead' → synthEuclid1Steps, etc.
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
import {
  SEQUENCER_RATCHET_CONTROL_MAX,
  clampSequencerRatchet,
  ratchetSubLaneStepIndex,
} from '../../audio/seqEvolveCore';
import { normalizeSequencerClockDivisions } from '../../audio/sequencerClockDivisions';
import { normalizeSequencerLaneDirection } from '../../audio/sequencerLaneDirection';
import {
  normalizeSequencerPitchMode,
  normalizeSequencerPitchRoot,
  normalizeSequencerPitchScale,
  normalizeSequencerPitchSettingsArray,
} from '../../audio/sequencerPitchSettings';
import { normalizeSequencerSwing, normalizeSequencerSwings } from '../../audio/sequencerSwing';
import { clampEuclideanSubLaneSteps } from './sequencerLimits';
import type { TriggerClip } from './triggerClip';
import {
  countTriggerHits,
  deserializeTriggerClip,
  resolveTriggerClip,
  resizeTriggerClip,
  rotateTriggerClip,
  serializeTriggerClip,
  setTriggerClipStep,
  toggleTriggerClipStep,
} from './triggerClip';
import {
  legacyEuclideanParamsToTriggerClip,
} from './triggerClipLegacyBridge';
import { createEuclideanTriggerClip } from './euclideanTriggerGenerator';
import { clampNudge } from './nudgeTiming';

// ── Types ──

/** Pitch sub-lane display settings (mode, root note, scale) */
export type PitchSettings = { mode: PitchMode; root: number; scale: ScaleName };

export type LaneKind = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance' | 'nudge' | 'slice' | 'reverse';
export type SubLaneKind = Exclude<LaneKind, 'trigger'>;
export type RangeSubLaneKind = Extract<SubLaneKind, 'expression' | 'morph' | 'distance'>;
export type SubLaneValueMode = 'sequence' | 'range';
export type SequencerViewMode = 'simple' | 'detail' | 'overview' | 'scatter' | 'chain';
type StepArrayOverrideKey =
  | 'probability'
  | 'ratchet'
  | 'trigCondition'
  | 'expression'
  | 'pitch'
  | 'morph'
  | 'distance'
  | 'nudge'
  | 'slice'
  | 'reverse';

/** Per-sub-lane UI state (per sequencer × per sub-lane) */
export interface SubLaneState {
  enabled: boolean;
  steps: number;
  direction: LaneDirection;
  /** Legacy pitch field retained for preset/home compatibility; quantize UI is removed. */
  scaleQuantize?: boolean;
  /** Expression / morph / distance can switch to per-trigger random range mode */
  valueMode?: SubLaneValueMode;
  rangeMin?: number;
  rangeMax?: number;
  /** Nudge remains indexed by active trigger hits even when global linking is off. */
  followTriggerHits?: boolean;
}

export interface StepOverrides {
  triggerClips?: (TriggerClip | null)[];
  triggerToggles: Map<number, boolean>[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: (TrigCondition[] | null)[];
  expression: (number[] | null)[];
  pitch: (number[] | null)[];
  morph: (number[] | null)[];
  distance: (number[] | null)[];
  nudge: (number[] | null)[];
  slice: (number[] | null)[];
  reverse: (number[] | null)[];
  expressionDirection: (LaneDirection | null)[];
  morphDirection: (LaneDirection | null)[];
  distanceDirection: (LaneDirection | null)[];
  nudgeDirection: (LaneDirection | null)[];
  pitchDirection: (LaneDirection | null)[];
  sliceDirection: (LaneDirection | null)[];
  reverseDirection: (LaneDirection | null)[];
  expressionRanges?: ({ min: number; max: number } | null)[];
  morphRanges?: ({ min: number; max: number } | null)[];
  distanceRanges?: ({ min: number; max: number } | null)[];
}

export interface EvolveConfig {
  enabled: boolean;
  everyBars: number;
  evolution: number;
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  methods: Record<string, boolean>;
  enabledSubLanes?: string[];  // synth only — which sub-lanes participate
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
  /** Prefix for param keys: 'drum' → drumEuclid1Steps, 'lead' → synthEuclid1Steps */
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
  initialViewMode?: SequencerViewMode;
  /** Initial step overrides to restore (persisted across tab switches) */
  initialStepOverrides?: StepOverrides;
  /** Initial sub-lane states to restore (persisted across tab switches) */
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  /** Initial clock divisions to restore (preset loading) */
  initialClockDivs?: ClockDivision[];
  /** Initial per-lane swing amounts to restore (preset loading) */
  initialSwings?: number[];
  /** Initial per-lane link state to restore (preset loading) */
  initialLinked?: boolean[];
  /** Initial pitch settings to restore (persisted across tab switches) */
  initialPitchSettings?: PitchSettings[];
  /** Fallback pitch settings when no initial/preset pitch settings exist. */
  defaultPitchSettings?: Partial<PitchSettings>;
  /** Initial evolve configs to restore (persisted across tab switches / preset load) */
  initialEvolveConfigs?: EvolveConfig[];
  /** Monotonically increasing key — when it changes, internal state resets from initial* props */
  resetKey?: number;
}

export interface UseEuclideanSequencerResult {
  // ── Models ──
  sequencerModels: SequencerState[];
  miniPatterns: boolean[][];

  // ── View State ──
  viewMode: SequencerViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<SequencerViewMode>>;
  activeTab: number;
  setActiveTab: React.Dispatch<React.SetStateAction<number>>;
  openLane: LaneKind;
  setOpenLane: React.Dispatch<React.SetStateAction<LaneKind>>;
  activeSeq: SequencerState;
  playheads: number[];
  hitCounts: number[];

  // ── Step Overrides ──
  stepOverrides: StepOverrides;
  setStepOverrides: React.Dispatch<React.SetStateAction<StepOverrides>>;
  toggleTriggerStep: (laneIdx: number, step: number) => void;
  setTriggerStep: (laneIdx: number, step: number, enabled: boolean) => void;
  copyLinkedTriggerCell: (laneIdx: number, step: number, subLanes?: readonly SubLaneKind[]) => boolean;
  pasteLinkedTriggerCell: (laneIdx: number, step: number, subLanes?: readonly SubLaneKind[]) => boolean;
  changeStepValue: (laneIdx: number, lane: LaneKind, step: number, value: number) => void;
  rotateSequence: (laneIdx: number, direction: 1 | -1) => void;
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
  setSubLaneStates: React.Dispatch<React.SetStateAction<Record<SubLaneKind, SubLaneState>[]>>;
  toggleSubLaneEnabled: (seqIdx: number, lane: SubLaneKind) => void;
  setSubLaneSteps: (seqIdx: number, lane: SubLaneKind, steps: number) => void;
  cycleSubLaneDirection: (seqIdx: number, lane: SubLaneKind) => void;
  setSubLaneValueMode: (seqIdx: number, lane: RangeSubLaneKind, mode: SubLaneValueMode) => void;
  setSubLaneRange: (seqIdx: number, lane: RangeSubLaneKind, min: number, max: number) => void;
  /** Per-sequencer linked state */
  linked: boolean[];
  setLinked: React.Dispatch<React.SetStateAction<boolean[]>>;
  toggleLinked: (seqIdx: number) => void;

  // ── Per-Seq Clock/Swing ──
  clockDivs: ClockDivision[];
  setClockDivs: React.Dispatch<React.SetStateAction<ClockDivision[]>>;
  setClockDiv: (seqIdx: number, div: ClockDivision) => void;
  swings: number[];
  setSwings: React.Dispatch<React.SetStateAction<number[]>>;
  setSwing: (seqIdx: number, value: number) => void;

  // ── Per-Seq Pitch Settings ──
  pitchSettings: PitchSettings[];
  setPitchSettings: React.Dispatch<React.SetStateAction<PitchSettings[]>>;
  setPitchMode: (seqIdx: number, mode: PitchMode) => void;
  setPitchRoot: (seqIdx: number, root: number) => void;
  setPitchScale: (seqIdx: number, scale: ScaleName) => void;

  // ── Presets ──
  presetNames: string[];
}

const DRUM_EVOLVE_METHODS: Record<string, boolean> = {
  rotateDrift: true,
  swingDrift: true,
  probDrift: false,
  ghostNotes: false,
  ratchetSpray: false,
  hitDrift: false,
  pitchWalk: false,
  valueDrift: true,
  valueScramble: false,
  valueWiden: false,
  subLaneLengthDrift: false,
  subLaneDirectionFlip: false,
};

const SYNTH_GRANULAR_EVOLVE_METHODS: Record<string, boolean> = {
  swingDrift: true,
  probDrift: false,
  ratchetSpray: false,
  pitchWalk: false,
  valueDrift: true,
  valueScramble: false,
  valueWiden: false,
  subLaneLengthDrift: false,
  subLaneDirectionFlip: false,
  triggerToggle: false,
};

export function getDefaultEvolveMethods(prefix: string): Record<string, boolean> {
  return prefix === 'drum' ? { ...DRUM_EVOLVE_METHODS } : { ...SYNTH_GRANULAR_EVOLVE_METHODS };
}

export function createDefaultEvolveConfig(prefix: string): EvolveConfig {
  return {
    enabled: false,
    everyBars: 4,
    evolution: 0.25,
    writeOffset: 0,
    mutationMode: 'biased',
    methods: getDefaultEvolveMethods(prefix),
  };
}

export function normalizeSequencerEvolveConfig(prefix: string, config?: Partial<EvolveConfig> | null): EvolveConfig {
  const base = createDefaultEvolveConfig(prefix);
  if (!config) return base;
  const { enabledSubLanes: rawEnabledSubLanes, methods: rawMethods, ...rest } = config;
  const everyBars = typeof config.everyBars === 'number' && Number.isFinite(config.everyBars)
    ? Math.max(1, Math.round(config.everyBars))
    : base.everyBars;
  const evolution = typeof config.evolution === 'number' && Number.isFinite(config.evolution)
    ? Math.max(0, Math.min(1, config.evolution))
    : base.evolution;
  const writeOffset = config.writeOffset === 'auto'
    ? 'auto'
    : typeof config.writeOffset === 'number' && Number.isFinite(config.writeOffset)
      ? Math.max(0, Math.round(config.writeOffset))
      : base.writeOffset;
  const methods: Record<string, boolean> = { ...base.methods };
  if (rawMethods && typeof rawMethods === 'object') {
    for (const [key, value] of Object.entries(rawMethods)) {
      methods[key] = value === true;
    }
  }
  const enabledSubLanes = Array.isArray(rawEnabledSubLanes)
    ? rawEnabledSubLanes.filter((lane): lane is string => typeof lane === 'string')
    : undefined;

  return {
    ...base,
    ...rest,
    enabled: config.enabled === true,
    everyBars,
    evolution,
    writeOffset,
    mutationMode: config.mutationMode === 'strict' ? 'strict' : 'biased',
    methods,
    ...(enabledSubLanes ? { enabledSubLanes } : {}),
  };
}

export function normalizeSequencerEvolveConfigs(
  prefix: string,
  configs: Partial<EvolveConfig>[] | undefined,
  laneCount: number,
): EvolveConfig[] {
  return Array.from({ length: laneCount }, (_, index) => normalizeSequencerEvolveConfig(prefix, configs?.[index]));
}

function makeKey(prefix: string, laneNum: number, suffix: string): keyof SliderState {
  return `${prefix}Euclid${laneNum}${suffix}` as keyof SliderState;
}

function makeGlobalKey(prefix: string, suffix: string): keyof SliderState {
  return `${prefix}Euclid${suffix}` as keyof SliderState;
}

const RANGE_DEFAULTS: Record<RangeSubLaneKind, { min: number; max: number }> = {
  expression: { min: 0.75, max: 1 },
  morph: { min: 0.25, max: 0.75 },
  distance: { min: 0, max: 1 },
};

function isRangeSubLane(lane: SubLaneKind): lane is RangeSubLaneKind {
  return lane === 'expression' || lane === 'morph' || lane === 'distance';
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeRangeState(
  lane: RangeSubLaneKind,
  state?: Partial<SubLaneState>,
): Pick<SubLaneState, 'valueMode' | 'rangeMin' | 'rangeMax'> {
  const defaults = RANGE_DEFAULTS[lane];
  const rawMin = typeof state?.rangeMin === 'number' && Number.isFinite(state.rangeMin) ? clampUnit(state.rangeMin) : defaults.min;
  const rawMax = typeof state?.rangeMax === 'number' && Number.isFinite(state.rangeMax) ? clampUnit(state.rangeMax) : defaults.max;
  return {
    valueMode: state?.valueMode === 'range' ? 'range' : 'sequence',
    rangeMin: Math.min(rawMin, rawMax),
    rangeMax: Math.max(rawMin, rawMax),
  };
}

function getDefaultSubLaneState(lane: SubLaneKind): SubLaneState {
  const base: SubLaneState = {
    enabled: false,
    steps: lane === 'pitch' ? 5 : 4,
    direction: 'forward' as LaneDirection,
    ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
    ...(lane === 'nudge' ? { followTriggerHits: true } : {}),
  };
  if (isRangeSubLane(lane)) {
    return {
      ...base,
      ...normalizeRangeState(lane),
    };
  }
  return base;
}

function normalizeSubLaneState(lane: SubLaneKind, state?: Partial<SubLaneState>): SubLaneState {
  const fallback = getDefaultSubLaneState(lane);
  const steps = typeof state?.steps === 'number' && Number.isFinite(state.steps)
    ? clampEuclideanSubLaneSteps(Math.floor(state.steps), fallback.steps)
    : fallback.steps;
  const next: SubLaneState = {
    ...fallback,
    ...state,
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
  if (isRangeSubLane(lane)) {
    Object.assign(next, normalizeRangeState(lane, state));
  }
  return next;
}

function deriveRangeFromValues(
  lane: RangeSubLaneKind,
  values: number[] | null | undefined,
): { min: number; max: number } {
  const defaults = RANGE_DEFAULTS[lane];
  if (!values || values.length === 0) return defaults;
  const numeric = values.filter((value) => Number.isFinite(value)).map(clampUnit);
  if (numeric.length === 0) return defaults;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  if (max - min > 0.0005) {
    return { min, max };
  }
  if (lane === 'distance' && (numeric[0] ?? 0) <= 0.0005) {
    return defaults;
  }
  const center = numeric[0] ?? ((defaults.min + defaults.max) * 0.5);
  const spread = lane === 'expression' ? 0.25 : 0.2;
  return {
    min: clampUnit(center - spread),
    max: clampUnit(center + spread),
  };
}

function createEmptyStepOverrides(laneCount: number): StepOverrides {
  return {
    triggerClips: Array.from({ length: laneCount }, () => null),
    triggerToggles: Array.from({ length: laneCount }, () => new Map<number, boolean>()),
    probability: Array.from({ length: laneCount }, () => null as number[] | null),
    ratchet: Array.from({ length: laneCount }, () => null as number[] | null),
    trigCondition: Array.from({ length: laneCount }, () => null as TrigCondition[] | null),
    expression: Array.from({ length: laneCount }, () => null as number[] | null),
    pitch: Array.from({ length: laneCount }, () => null as number[] | null),
    morph: Array.from({ length: laneCount }, () => null as number[] | null),
    distance: Array.from({ length: laneCount }, () => null as number[] | null),
    nudge: Array.from({ length: laneCount }, () => null as number[] | null),
    slice: Array.from({ length: laneCount }, () => null as number[] | null),
    reverse: Array.from({ length: laneCount }, () => null as number[] | null),
    expressionDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    morphDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    distanceDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    nudgeDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    pitchDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    sliceDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    reverseDirection: Array.from({ length: laneCount }, () => null as LaneDirection | null),
    expressionRanges: Array.from({ length: laneCount }, () => null as { min: number; max: number } | null),
    morphRanges: Array.from({ length: laneCount }, () => null as { min: number; max: number } | null),
    distanceRanges: Array.from({ length: laneCount }, () => null as { min: number; max: number } | null),
  };
}

const STEP_ARRAY_OVERRIDE_KEYS: StepArrayOverrideKey[] = [
  'probability',
  'ratchet',
  'trigCondition',
  'expression',
  'pitch',
  'morph',
  'distance',
  'nudge',
  'slice',
  'reverse',
];

const SUB_LANE_KINDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'nudge', 'slice', 'reverse'];

type LinkedTriggerCellClipboard = {
  enabled: boolean;
  probability: number;
  trigCondition: TrigCondition;
  ratchet?: number;
  subLaneValues: Partial<Record<SubLaneKind, number>>;
};

function positiveModulo(value: number, divisor: number): number {
  const safeDivisor = Math.max(1, Math.round(divisor));
  return ((Math.round(value) % safeDivisor) + safeDivisor) % safeDivisor;
}

function rotateArray<T>(values: readonly T[], direction: 1 | -1): T[] {
  if (values.length <= 1) return [...values];
  const shift = positiveModulo(direction, values.length);
  return values.map((_, index) => values[positiveModulo(index - shift, values.length)]!);
}

function rotateFullStepArray(values: readonly unknown[] | null | undefined, stepCount: number, direction: 1 | -1): unknown[] | null {
  if (!values || values.length !== stepCount) return null;
  return rotateArray(values, direction);
}

function defaultSubLaneValue(lane: SubLaneKind): number {
  if (lane === 'expression') return 1;
  return 0;
}

function defaultStepArrayValue(field: StepArrayOverrideKey): number | TrigCondition {
  if (field === 'expression') return 1;
  if (field === 'ratchet') return 1;
  if (field === 'trigCondition') return [1, 1];
  return 0;
}

function cloneTrigCondition(value: TrigCondition | undefined): TrigCondition {
  return value ? [value[0], value[1]] : [1, 1];
}

function cloneStepArrayValue<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

function ensureStepArray<T>(
  values: readonly T[] | null | undefined,
  length: number,
  defaultValue: T,
): T[] {
  const targetLength = Math.max(1, Math.floor(length));
  const next = values ? values.map(cloneStepArrayValue) : [];
  while (next.length < targetLength) next.push(cloneStepArrayValue(defaultValue));
  if (next.length > targetLength) next.length = targetLength;
  return next;
}

function cloneTriggerClip(clip: TriggerClip | null | undefined): TriggerClip | null {
  return deserializeTriggerClip(serializeTriggerClip(clip ?? null));
}

function legacyTriggerClipForLane(
  sliderState: SliderState,
  prefix: string,
  laneIdx: number,
  toggleMap?: Map<number, boolean>,
): TriggerClip {
  const laneNum = laneIdx + 1;
  const preset = sliderState[makeKey(prefix, laneNum, 'Preset')] as string;
  const steps = sliderState[makeKey(prefix, laneNum, 'Steps')] as number;
  const hits = sliderState[makeKey(prefix, laneNum, 'Hits')] as number;
  const rotation = sliderState[makeKey(prefix, laneNum, 'Rotation')] as number;
  const resolved = resolveDrumEuclidPatternParams(preset, steps, hits, rotation);
  return legacyEuclideanParamsToTriggerClip({
    preset,
    steps: resolved.steps,
    hits: resolved.hits,
    rotation: resolved.rotation,
    triggerToggles: toggleMap,
  });
}

function triggerClipForLane(
  sliderState: SliderState,
  prefix: string,
  laneIdx: number,
  overrides: StepOverrides,
): TriggerClip {
  return cloneTriggerClip(overrides.triggerClips?.[laneIdx])
    ?? legacyTriggerClipForLane(sliderState, prefix, laneIdx, overrides.triggerToggles?.[laneIdx]);
}

function triggerPatternForLane(
  sliderState: SliderState,
  prefix: string,
  laneIdx: number,
  overrides: StepOverrides,
): boolean[] {
  return resolveTriggerClip(triggerClipForLane(sliderState, prefix, laneIdx, overrides));
}

function hitIndexForTriggerStep(pattern: readonly boolean[], step: number): number | null {
  if (!pattern[step]) return null;
  let hitIndex = -1;
  for (let index = 0; index <= step; index += 1) {
    if (pattern[index]) hitIndex += 1;
  }
  return hitIndex >= 0 ? hitIndex : null;
}

function activeHitCount(pattern: readonly boolean[]): number {
  let count = 0;
  for (const enabled of pattern) {
    if (enabled) count += 1;
  }
  return count;
}

function normalizeLinkedSubLanes(subLanes?: readonly SubLaneKind[]): SubLaneKind[] {
  if (!subLanes || subLanes.length === 0) return [...SUB_LANE_KINDS];
  const unique: SubLaneKind[] = [];
  for (const lane of subLanes) {
    if (SUB_LANE_KINDS.includes(lane) && !unique.includes(lane)) unique.push(lane);
  }
  return unique.length > 0 ? unique : [...SUB_LANE_KINDS];
}

function explicitTriggerMapCoversStepCount(
  map: Map<number, boolean> | undefined,
  stepCount: number,
): boolean {
  const safeStepCount = Math.max(0, Math.round(stepCount));
  if (!map || safeStepCount <= 0 || map.size !== safeStepCount) return false;
  for (let step = 0; step < safeStepCount; step += 1) {
    if (!map.has(step)) return false;
  }
  return true;
}

function normalizeStepOverrides(overrides: StepOverrides | undefined, laneCount: number): StepOverrides {
  const fallback = createEmptyStepOverrides(laneCount);
  if (!overrides) return fallback;
  return {
    ...fallback,
    ...overrides,
    triggerClips: Array.from({ length: laneCount }, (_, index) => cloneTriggerClip(overrides.triggerClips?.[index] ?? null)),
    triggerToggles: overrides.triggerToggles?.map((map) => new Map(map)) ?? fallback.triggerToggles,
    probability: overrides.probability ?? fallback.probability,
    ratchet: overrides.ratchet ?? fallback.ratchet,
    trigCondition: overrides.trigCondition ?? fallback.trigCondition,
    expression: overrides.expression ?? fallback.expression,
    pitch: overrides.pitch ?? fallback.pitch,
    morph: overrides.morph ?? fallback.morph,
    distance: overrides.distance ?? fallback.distance,
    nudge: overrides.nudge ?? fallback.nudge,
    slice: overrides.slice ?? fallback.slice,
    reverse: overrides.reverse ?? fallback.reverse,
    expressionDirection: overrides.expressionDirection ?? fallback.expressionDirection,
    morphDirection: overrides.morphDirection ?? fallback.morphDirection,
    distanceDirection: overrides.distanceDirection ?? fallback.distanceDirection,
    nudgeDirection: overrides.nudgeDirection ?? fallback.nudgeDirection,
    pitchDirection: overrides.pitchDirection ?? fallback.pitchDirection,
    sliceDirection: overrides.sliceDirection ?? fallback.sliceDirection,
    reverseDirection: overrides.reverseDirection ?? fallback.reverseDirection,
    expressionRanges: overrides.expressionRanges ?? fallback.expressionRanges,
    morphRanges: overrides.morphRanges ?? fallback.morphRanges,
    distanceRanges: overrides.distanceRanges ?? fallback.distanceRanges,
  };
}

function normalizeSubLaneStates(
  states: Record<SubLaneKind, SubLaneState>[] | undefined,
  laneCount: number,
): Record<SubLaneKind, SubLaneState>[] {
  return Array.from({ length: laneCount }, (_, index) => {
    const incoming = states?.[index];
    return {
      pitch: normalizeSubLaneState('pitch', incoming?.pitch),
      expression: normalizeSubLaneState('expression', incoming?.expression),
      morph: normalizeSubLaneState('morph', incoming?.morph),
      distance: normalizeSubLaneState('distance', incoming?.distance),
      nudge: normalizeSubLaneState('nudge', incoming?.nudge),
      slice: normalizeSubLaneState('slice', incoming?.slice),
      reverse: normalizeSubLaneState('reverse', incoming?.reverse),
    };
  });
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
    initialStepOverrides,
    initialSubLaneStates,
    initialClockDivs,
    initialSwings,
    initialLinked,
    initialPitchSettings,
    defaultPitchSettings,
    initialEvolveConfigs,
  } = opts;
  const resetKey = opts.resetKey;

  const hitCounts = hitCountsOpt ?? Array.from({ length: laneCount }, () => 0);
  const evolveFlashing = externalEvolveFlashing ?? Array.from({ length: laneCount }, () => false);

  // Keep a ref to state so useCallback closures can read current values
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── View State ──
  const [viewMode, setViewMode] = useState<SequencerViewMode>(initialViewMode ?? 'detail');
  const [activeTab, setActiveTab] = useState(0);
  const [openLane, setOpenLane] = useState<LaneKind>('trigger');

  // ── Step Overrides ──
  const [stepOverrides, setStepOverrides] = useState<StepOverrides>(() => normalizeStepOverrides(initialStepOverrides, laneCount));
  const linkedTriggerCellClipboardRef = useRef<LinkedTriggerCellClipboard | null>(null);

  // ── Evolve ──
  const [evolveConfigs, setEvolveConfigs] = useState<EvolveConfig[]>(() =>
    normalizeSequencerEvolveConfigs(prefix, initialEvolveConfigs, laneCount)
  );

  // ── Sub-Lane State (per-sequencer, per-sub-lane) ──
  const DIRECTION_ORDER: LaneDirection[] = ['forward', 'reverse', 'pingpong'];

  const [subLaneStates, setSubLaneStates] = useState<Record<SubLaneKind, SubLaneState>[]>(() =>
    normalizeSubLaneStates(initialSubLaneStates, laneCount)
  );

  const [linked, setLinked] = useState<boolean[]>(() =>
    initialLinked ?? Array.from({ length: laneCount }, () => false)
  );

  // ── Per-Seq Clock/Swing ──
  const [clockDivs, setClockDivs] = useState<ClockDivision[]>(() =>
    normalizeSequencerClockDivisions(initialClockDivs, laneCount)
  );
  const [swings, setSwings] = useState<number[]>(() =>
    normalizeSequencerSwings(initialSwings, laneCount)
  );

  // ── Solo tracking (set of soloed lane indices; empty = no solo) ──
  const [soloSet, setSoloSet] = useState<Set<number>>(new Set());

  // ── Preset reset: when resetKey changes, re-initialize internal state from initial* props ──
  const prevResetKey = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== prevResetKey.current) {
      prevResetKey.current = resetKey;
      setStepOverrides(normalizeStepOverrides(initialStepOverrides, laneCount));
      setSubLaneStates(normalizeSubLaneStates(initialSubLaneStates, laneCount));
      setClockDivs(normalizeSequencerClockDivisions(initialClockDivs, laneCount));
      setSwings(normalizeSequencerSwings(initialSwings, laneCount));
      setLinked(initialLinked ?? Array.from({ length: laneCount }, () => false));
      setPitchSettings(normalizeSequencerPitchSettingsArray(initialPitchSettings, laneCount, defaultPitchSettings) as PitchSettings[]);
      setEvolveConfigs(normalizeSequencerEvolveConfigs(prefix, initialEvolveConfigs, laneCount));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // ── Per-Seq Pitch Settings ──
  const [pitchSettings, setPitchSettings] = useState<PitchSettings[]>(() =>
    normalizeSequencerPitchSettingsArray(initialPitchSettings, laneCount, defaultPitchSettings) as PitchSettings[]
  );

  const setPitchMode = useCallback((seqIdx: number, mode: PitchMode) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, mode: normalizeSequencerPitchMode(mode, s.mode) } : s));
  }, []);

  const setPitchRoot = useCallback((seqIdx: number, root: number) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, root: normalizeSequencerPitchRoot(root, s.root) } : s));
  }, []);

  const setPitchScale = useCallback((seqIdx: number, scale: ScaleName) => {
    setPitchSettings(prev => prev.map((s, i) => i === seqIdx ? { ...s, scale: normalizeSequencerPitchScale(scale, s.scale) } : s));
  }, []);

  const setClockDiv = useCallback((seqIdx: number, div: ClockDivision) => {
    setClockDivs(prev => prev.map((d, i) => i === seqIdx ? div : d));
  }, []);

  const setSwingVal = useCallback((seqIdx: number, value: number) => {
    setSwings(prev => prev.map((s, i) => i === seqIdx ? normalizeSequencerSwing(value, s) : s));
  }, []);

  const toggleSubLaneEnabled = useCallback((seqIdx: number, lane: SubLaneKind) => {
    setSubLaneStates(prev => {
      const wasEnabled = prev[seqIdx]?.[lane]?.enabled ?? false;
      const nowEnabled = !wasEnabled;
      const updated = prev.map((s, i) =>
        i === seqIdx ? { ...s, [lane]: { ...s[lane], enabled: nowEnabled } } : s
      );
      // Sync default values into stepOverrides so the audio engine gets them immediately
      const subSteps = prev[seqIdx]?.[lane]?.steps ?? 5;
      if (nowEnabled) {
        // Populate defaults if no data exists yet
        setStepOverrides(old => {
          if (old[lane][seqIdx] != null) return old; // already has data
          const next = { ...old, [lane]: [...old[lane]] };
          const defaultValue = defaultSubLaneValue(lane);
          const defaults = new Array(subSteps).fill(defaultValue);
          (next[lane] as (number[] | null)[])[seqIdx] = defaults;
          return next;
        });
      } else if (lane !== 'nudge') {
        // Clear override data when disabling
        setStepOverrides(old => {
          if (old[lane][seqIdx] == null) return old; // already null
          const next = { ...old, [lane]: [...old[lane]] };
          (next[lane] as (number[] | null)[])[seqIdx] = null;
          return next;
        });
      }
      return updated;
    });
  }, []);

  const setSubLaneSteps = useCallback((seqIdx: number, lane: SubLaneKind, steps: number) => {
    const newSteps = clampEuclideanSubLaneSteps(steps);
    setSubLaneStates(prev => prev.map((s, i) =>
      i === seqIdx ? { ...s, [lane]: { ...s[lane], steps: newSteps } } : s
    ));
    // Preserve hidden values when shrinking so extending the lane can recall them later.
    setStepOverrides(old => {
      const existing = old[lane][seqIdx];
      if (!existing) return old; // no data to resize
      const next = { ...old, [lane]: [...old[lane]] };
      const defaultVal = defaultSubLaneValue(lane);
      const resized = [...existing];
      if (resized.length < newSteps) {
        resized.push(...new Array(newSteps - resized.length).fill(defaultVal));
      }
      (next[lane] as (number[] | null)[])[seqIdx] = resized;
      if (lane === 'expression' && old.ratchet[seqIdx]) {
        next.ratchet = [...old.ratchet];
        const ratchets = [...(old.ratchet[seqIdx] as number[])];
        while (ratchets.length < newSteps) ratchets.push(1);
        if (ratchets.length > newSteps) ratchets.length = newSteps;
        next.ratchet[seqIdx] = ratchets;
      }
      return next;
    });
  }, []);

  const setSubLaneValueMode = useCallback((seqIdx: number, lane: RangeSubLaneKind, mode: SubLaneValueMode) => {
    setSubLaneStates(prev => prev.map((state, index) => {
      if (index !== seqIdx) return state;
      const currentLane = state[lane];
      const derivedRange = deriveRangeFromValues(lane, stepOverrides[lane][seqIdx]);
      return {
        ...state,
        [lane]: {
          ...currentLane,
          ...normalizeRangeState(lane, currentLane),
          valueMode: mode,
          rangeMin: currentLane.rangeMin ?? derivedRange.min,
          rangeMax: currentLane.rangeMax ?? derivedRange.max,
        },
      };
    }));
  }, [stepOverrides]);

  const setSubLaneRange = useCallback((seqIdx: number, lane: RangeSubLaneKind, min: number, max: number) => {
    const rangeMin = clampUnit(Math.min(min, max));
    const rangeMax = clampUnit(Math.max(min, max));
    setSubLaneStates(prev => prev.map((state, index) => (
      index === seqIdx
        ? {
            ...state,
            [lane]: {
              ...state[lane],
              ...normalizeRangeState(lane, state[lane]),
              rangeMin,
              rangeMax,
            },
          }
        : state
    )));
  }, []);

  const cycleSubLaneDirection = useCallback((seqIdx: number, lane: SubLaneKind) => {
    setSubLaneStates(prev => {
      const updated = prev.map((s, i) => {
        if (i !== seqIdx) return s;
        const cur = s[lane].direction;
        const curIdx = DIRECTION_ORDER.indexOf(cur);
        const nextIdx = ((curIdx >= 0 ? curIdx : 0) + 1) % DIRECTION_ORDER.length;
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
      const pattern = triggerPatternForLane(state, prefix, seqIdx, stepOverrides);
      const activeHits = pattern.filter(x => x).length;
      if (activeHits < 1) return;

      setSubLaneStates(prev => {
        const cur = prev[seqIdx];
        if (!cur) return prev;
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
  }, [linked, state, prefix, stepOverrides]);

  useEffect(() => {
    setSubLaneStates(prev => {
      let dirty = false;
      const next = prev.map((laneState, seqIdx) => {
        const nudgeState = laneState.nudge;
        if (nudgeState?.followTriggerHits === false) return laneState;
        const pattern = triggerPatternForLane(state, prefix, seqIdx, stepOverrides);
        const activeHits = Math.max(1, activeHitCount(pattern));
        if (nudgeState.steps === activeHits && nudgeState.followTriggerHits === true) return laneState;
        dirty = true;
        return {
          ...laneState,
          nudge: {
            ...nudgeState,
            steps: activeHits,
            followTriggerHits: true,
          },
        };
      });
      return dirty ? next : prev;
    });
  }, [state, prefix, stepOverrides]);

  // ── Param helpers ──
  const getParam = useCallback(
    (laneIdx: number, suffix: string) => state[makeKey(prefix, laneIdx + 1, suffix)],
    [state, prefix]
  );

  const setParam = useCallback(
    (laneIdx: number, suffix: string, value: number) => {
      if (suffix === 'Steps' || suffix === 'Hits' || suffix === 'Rotation') {
        setStepOverrides((prev) => {
          const clip = cloneTriggerClip(prev.triggerClips?.[laneIdx] ?? null);
          if (!clip) return prev;

          const laneNum = laneIdx + 1;
          const currentPreset = stateRef.current[makeKey(prefix, laneNum, 'Preset')] as string;
          const currentSteps = Number(stateRef.current[makeKey(prefix, laneNum, 'Steps')] ?? clip.steps);
          const currentHits = Number(stateRef.current[makeKey(prefix, laneNum, 'Hits')] ?? countTriggerHits(clip));
          const currentRotation = Number(stateRef.current[makeKey(prefix, laneNum, 'Rotation')] ?? 0);
          let nextClip = clip;

          if (clip.generator?.kind === 'euclidean') {
            const resolved = resolveDrumEuclidPatternParams(
              currentPreset,
              suffix === 'Steps' ? value : currentSteps,
              suffix === 'Hits' ? value : currentHits,
              suffix === 'Rotation' ? value : currentRotation,
            );
            nextClip = createEuclideanTriggerClip({
              preset: currentPreset,
              steps: resolved.steps,
              hits: resolved.hits,
              rotation: resolved.rotation,
              label: clip.label,
            });
            nextClip.edits = new Map(clip.edits);
            nextClip.dirty = nextClip.edits.size > 0;
          } else if (suffix === 'Steps') {
            nextClip = resizeTriggerClip(clip, value);
          }

          if (nextClip === clip) return prev;
          const next = {
            ...prev,
            triggerClips: [...(prev.triggerClips ?? Array.from({ length: laneCount }, () => null))],
            triggerToggles: [...prev.triggerToggles],
          };
          next.triggerClips[laneIdx] = nextClip;
          next.triggerToggles[laneIdx] = new Map();
          return next;
        });
      }
      onParamChange(makeKey(prefix, laneIdx + 1, suffix), value);
      // Auto-switch to 'custom' when Steps/Hits/Rotation are manually changed
      if (suffix === 'Steps' || suffix === 'Hits' || suffix === 'Rotation') {
        const currentPreset = state[makeKey(prefix, laneIdx + 1, 'Preset')];
        if (currentPreset !== 'custom') {
          onSelectChange(makeKey(prefix, laneIdx + 1, 'Preset'), 'custom' as any);
        }
      }
    },
    [laneCount, onParamChange, onSelectChange, state, prefix]
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

  // ── Reset trigger-lane overrides when steps/hits change ──
  // Only reset trigger-specific data (toggles, probability, trigCondition).
  // Sub-lane data (expression, pitch, morph, distance, ratchet) has its own
  // independent step count and should NOT be erased when the trigger pattern changes.
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
              if (old.triggerClips?.[i]) {
                return;
              }
              const rawStepCount = Number(state[makeKey(prefix, i + 1, 'Steps')]);
              const stepCount = Number.isFinite(rawStepCount)
                ? Math.max(1, Math.round(rawStepCount))
                : 0;
              if (explicitTriggerMapCoversStepCount(old.triggerToggles[i], stepCount)) {
                return;
              }
              dirty = true;
              // Reset trigger-lane overrides only
              next.triggerToggles = [...next.triggerToggles];
              next.triggerToggles[i] = new Map();
              next.probability = [...next.probability];
              (next.probability as (number[] | null)[])[i] = null;
              next.trigCondition = [...next.trigCondition];
              (next.trigCondition as (unknown[] | null)[])[i] = null;
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
      return triggerPatternForLane(state, prefix, idx, stepOverrides);
    });
  }, [state, prefix, laneCount, stepOverrides]);

  // ── Sequencer models ──
  const sequencerModels = useMemo<SequencerState[]>(() => {
    return Array.from({ length: laneCount }, (_, idx) => {
      const laneNum = idx + 1;
      const probability = state[makeKey(prefix, laneNum, 'Probability')] as number;
      const triggerClip = triggerClipForLane(state, prefix, idx, stepOverrides);
      const pattern = resolveTriggerClip(triggerClip);
      const triggerSteps = triggerClip.steps;
      const triggerHits = countTriggerHits(triggerClip);
      const triggerRotation = triggerClip.generator?.kind === 'euclidean'
        ? triggerClip.generator.rotation
        : 0;

      // Read source voice booleans
      const sources: Record<string, boolean> = {};
      for (const voiceKey of ['Sub', 'Kick', 'Click', 'BeepHi', 'BeepLo', 'Noise', 'Membrane']) {
        const key = makeKey(prefix, laneNum, `Target${voiceKey}`);
        sources[voiceKey.charAt(0).toLowerCase() + voiceKey.slice(1)] = Boolean(state[key]);
      }

      // Muted = !Enabled (the Enabled param in SliderState is inverted for mute)
      const enabled = state[makeKey(prefix, laneNum, 'Enabled')] as boolean;

      const cfg = lanes[idx] ?? { color: '#a855f7', name: `Seq ${laneNum}` };
      const expressionState = subLaneStates[idx]?.expression;
      const activeRatchet = expressionState?.enabled === true ? stepOverrides.ratchet[idx] : null;

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
          steps: triggerSteps,
          hits: triggerHits,
          rotation: triggerRotation,
          pattern,
          overrides: new Set<number>(triggerClip.edits.keys()),
          probability: stepOverrides.probability[idx] ?? new Array(triggerSteps).fill(probability),
          ratchet: activeRatchet ?? new Array(expressionState?.steps ?? 5).fill(1),
          trigCondition: stepOverrides.trigCondition[idx] ?? new Array(triggerSteps).fill([1, 1] as TrigCondition),
          sourceOrigin: triggerClip.origin,
          sourceLabel: triggerClip.label,
          sourceDirty: triggerClip.dirty,
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
          scaleQuantize: false,
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
          values: stepOverrides.distance[idx] ?? new Array(subLaneStates[idx]?.distance.steps ?? 4).fill(0),
        },
        nudge: {
          enabled: subLaneStates[idx]?.nudge.enabled ?? false,
          steps: subLaneStates[idx]?.nudge.steps ?? 4,
          direction: subLaneStates[idx]?.nudge.direction ?? 'forward',
          _ppForward: true,
          values: stepOverrides.nudge[idx] ?? new Array(subLaneStates[idx]?.nudge.steps ?? 4).fill(0),
        },
        slice: {
          enabled: subLaneStates[idx]?.slice.enabled ?? false,
          steps: subLaneStates[idx]?.slice.steps ?? 4,
          direction: subLaneStates[idx]?.slice.direction ?? 'forward',
          _ppForward: true,
          values: stepOverrides.slice[idx] ?? new Array(subLaneStates[idx]?.slice.steps ?? 4).fill(0),
        },
        reverse: {
          enabled: subLaneStates[idx]?.reverse.enabled ?? false,
          steps: subLaneStates[idx]?.reverse.steps ?? 4,
          direction: subLaneStates[idx]?.reverse.direction ?? 'forward',
          _ppForward: true,
          values: stepOverrides.reverse[idx] ?? new Array(subLaneStates[idx]?.reverse.steps ?? 4).fill(0),
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
          evolution: evolveConfigs[idx]?.evolution ?? 0.25,
          writeOffset: evolveConfigs[idx]?.writeOffset ?? 'auto',
          mutationMode: evolveConfigs[idx]?.mutationMode ?? 'biased',
          lastEvolveBar: -1,
          methods: evolveConfigs[idx]?.methods ?? getDefaultEvolveMethods(prefix),
          home: null,
        },
      } satisfies SequencerState;
    });
  }, [state, prefix, laneCount, lanes, stepOverrides, evolveConfigs, subLaneStates, linked, clockDivs, swings, pitchSettings, soloSet]);

  // ── Callbacks ──
  const toggleTriggerStep = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const clip = cloneTriggerClip(prev.triggerClips?.[laneIdx] ?? null);
        if (clip) {
          const next = {
            ...prev,
            triggerClips: [...(prev.triggerClips ?? Array.from({ length: laneCount }, () => null))],
            triggerToggles: [...prev.triggerToggles],
          };
          next.triggerClips[laneIdx] = toggleTriggerClipStep(clip, step);
          next.triggerToggles[laneIdx] = new Map();
          return next;
        }

        const next = { ...prev, triggerToggles: [...prev.triggerToggles] };
        const m = new Map(next.triggerToggles[laneIdx]);
        // Compute base Euclidean pattern
        const laneNum = laneIdx + 1;
        const preset = stateRef.current[makeKey(prefix, laneNum, 'Preset')] as string;
        const stepsVal = stateRef.current[makeKey(prefix, laneNum, 'Steps')] as number;
        const hitsVal = stateRef.current[makeKey(prefix, laneNum, 'Hits')] as number;
        const rotVal = stateRef.current[makeKey(prefix, laneNum, 'Rotation')] as number;
        const resolved = resolveDrumEuclidPatternParams(preset, stepsVal, hitsVal, rotVal);
        const basePattern = seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);
        const baseVal = basePattern[step] ?? false;
        // Current visible state: override if present, else base
        const currentVal = m.has(step) ? m.get(step)! : baseVal;
        // Toggle to opposite of what's currently shown
        const newVal = !currentVal;
        // If new value matches base, remove override (revert to Euclidean)
        if (newVal === baseVal) {
          m.delete(step);
        } else {
          m.set(step, newVal);
        }
        next.triggerToggles[laneIdx] = m;
        return next;
      });
    },
    [laneCount, prefix]
  );

  const setTriggerStep = useCallback(
    (laneIdx: number, step: number, enabled: boolean) => {
      setStepOverrides((prev) => {
        const clip = cloneTriggerClip(prev.triggerClips?.[laneIdx] ?? null);
        if (clip) {
          const next = {
            ...prev,
            triggerClips: [...(prev.triggerClips ?? Array.from({ length: laneCount }, () => null))],
            triggerToggles: [...prev.triggerToggles],
          };
          next.triggerClips[laneIdx] = setTriggerClipStep(clip, step, enabled);
          next.triggerToggles[laneIdx] = new Map();
          return next;
        }

        const next = { ...prev, triggerToggles: [...prev.triggerToggles] };
        const m = new Map(next.triggerToggles[laneIdx]);
        const laneNum = laneIdx + 1;
        const preset = stateRef.current[makeKey(prefix, laneNum, 'Preset')] as string;
        const stepsVal = stateRef.current[makeKey(prefix, laneNum, 'Steps')] as number;
        const hitsVal = stateRef.current[makeKey(prefix, laneNum, 'Hits')] as number;
        const rotVal = stateRef.current[makeKey(prefix, laneNum, 'Rotation')] as number;
        const resolved = resolveDrumEuclidPatternParams(preset, stepsVal, hitsVal, rotVal);
        const basePattern = seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);
        const safeStep = ((Math.round(step) % Math.max(1, resolved.steps)) + Math.max(1, resolved.steps)) % Math.max(1, resolved.steps);
        const baseVal = basePattern[safeStep] ?? false;
        if (enabled === baseVal) {
          m.delete(safeStep);
        } else {
          m.set(safeStep, enabled);
        }
        next.triggerToggles[laneIdx] = m;
        return next;
      });
    },
    [laneCount, prefix]
  );

  const copyLinkedTriggerCell = useCallback((
    laneIdx: number,
    step: number,
    subLanes?: readonly SubLaneKind[],
  ): boolean => {
    if (laneIdx < 0 || laneIdx >= laneCount) return false;
    const pattern = triggerPatternForLane(
      stateRef.current,
      prefix,
      laneIdx,
      stepOverrides,
    );
    if (pattern.length === 0) return false;

    const targetStep = positiveModulo(step, pattern.length);
    const enabled = pattern[targetStep] === true;
    const hitIndex = enabled ? hitIndexForTriggerStep(pattern, targetStep) : null;
    const linkedSubLanes = normalizeLinkedSubLanes(subLanes);
    const subLaneValues: Partial<Record<SubLaneKind, number>> = {};

    if (hitIndex !== null) {
      for (const lane of linkedSubLanes) {
        const values = stepOverrides[lane][laneIdx] as number[] | null | undefined;
        const value = values?.[hitIndex] ?? defaultSubLaneValue(lane);
        if (typeof value === 'number' && Number.isFinite(value)) {
          subLaneValues[lane] = value;
        }
      }
    }

    const probabilityFallback = stateRef.current[makeKey(prefix, laneIdx + 1, 'Probability')] as number;
    const probabilityValue = stepOverrides.probability[laneIdx]?.[targetStep] ?? probabilityFallback ?? 1;
    const probability = typeof probabilityValue === 'number' && Number.isFinite(probabilityValue)
      ? Math.max(0, Math.min(1, probabilityValue))
      : 1;

    linkedTriggerCellClipboardRef.current = {
      enabled,
      probability,
      trigCondition: cloneTrigCondition(stepOverrides.trigCondition[laneIdx]?.[targetStep]),
      ...(hitIndex !== null && linkedSubLanes.includes('expression')
        ? { ratchet: stepOverrides.ratchet[laneIdx]?.[hitIndex] ?? 1 }
        : {}),
      subLaneValues,
    };
    return true;
  }, [laneCount, prefix, stepOverrides]);

  const pasteLinkedTriggerCell = useCallback((
    laneIdx: number,
    step: number,
    subLanes?: readonly SubLaneKind[],
  ): boolean => {
    const clipboard = linkedTriggerCellClipboardRef.current;
    if (!clipboard || laneIdx < 0 || laneIdx >= laneCount) return false;

    const linkedSubLanes = normalizeLinkedSubLanes(subLanes);
    const currentPattern = triggerPatternForLane(
      stateRef.current,
      prefix,
      laneIdx,
      stepOverrides,
    );
    if (currentPattern.length === 0) return false;

    const targetStep = positiveModulo(step, currentPattern.length);
    const nextPattern = [...currentPattern];
    nextPattern[targetStep] = clipboard.enabled;
    const nextHitCount = Math.max(1, activeHitCount(nextPattern));
    const previousHitIndex = hitIndexForTriggerStep(currentPattern, targetStep);
    const nextHitIndex = clipboard.enabled ? hitIndexForTriggerStep(nextPattern, targetStep) : null;

    setStepOverrides((prev) => {
      const existingClip = cloneTriggerClip(prev.triggerClips?.[laneIdx] ?? null);
      const next: StepOverrides = {
        ...prev,
        triggerClips: [...(prev.triggerClips ?? Array.from({ length: laneCount }, () => null))],
        triggerToggles: [...prev.triggerToggles],
        probability: [...prev.probability],
        trigCondition: [...prev.trigCondition],
      };

      if (existingClip) {
        next.triggerClips![laneIdx] = setTriggerClipStep(existingClip, targetStep, clipboard.enabled);
        next.triggerToggles[laneIdx] = new Map();
      } else {
        const basePattern = resolveTriggerClip(legacyTriggerClipForLane(
          stateRef.current,
          prefix,
          laneIdx,
        ));
        const toggleMap = new Map(next.triggerToggles[laneIdx]);
        if (clipboard.enabled === (basePattern[targetStep] ?? false)) {
          toggleMap.delete(targetStep);
        } else {
          toggleMap.set(targetStep, clipboard.enabled);
        }
        next.triggerToggles[laneIdx] = toggleMap;
      }

      const probabilityFallback = stateRef.current[makeKey(prefix, laneIdx + 1, 'Probability')] as number;
      const probabilityDefault = typeof probabilityFallback === 'number' && Number.isFinite(probabilityFallback)
        ? Math.max(0, Math.min(1, probabilityFallback))
        : 1;
      const probability = ensureStepArray(
        prev.probability[laneIdx],
        currentPattern.length,
        probabilityDefault,
      );
      probability[targetStep] = clipboard.probability;
      next.probability[laneIdx] = probability;

      const trigCondition = ensureStepArray(
        prev.trigCondition[laneIdx],
        currentPattern.length,
        defaultStepArrayValue('trigCondition') as TrigCondition,
      );
      trigCondition[targetStep] = cloneTrigCondition(clipboard.trigCondition);
      next.trigCondition[laneIdx] = trigCondition;

      if (linkedSubLanes.includes('expression') && (previousHitIndex !== null || nextHitIndex !== null)) {
        next.ratchet = [...prev.ratchet];
        const ratchetValues = ensureStepArray(
          prev.ratchet[laneIdx],
          Math.max(1, activeHitCount(currentPattern)),
          1,
        );
        if (previousHitIndex !== null) {
          ratchetValues.splice(previousHitIndex, 1);
        }
        if (nextHitIndex !== null) {
          const insertIndex = previousHitIndex !== null && previousHitIndex < nextHitIndex
            ? nextHitIndex - 1
            : nextHitIndex;
          ratchetValues.splice(insertIndex, 0, clipboard.ratchet ?? 1);
        }
        while (ratchetValues.length < nextHitCount) ratchetValues.push(1);
        if (ratchetValues.length > nextHitCount) ratchetValues.length = nextHitCount;
        next.ratchet[laneIdx] = ratchetValues;
      }

      for (const lane of linkedSubLanes) {
        if (previousHitIndex === null && nextHitIndex === null) continue;
        const copiedValue = clipboard.subLaneValues[lane] ?? defaultSubLaneValue(lane);
        const currentHitCount = Math.max(1, activeHitCount(currentPattern));
        const values = ensureStepArray(
          prev[lane][laneIdx] as number[] | null | undefined,
          currentHitCount,
          defaultSubLaneValue(lane),
        );

        if (previousHitIndex !== null) {
          values.splice(previousHitIndex, 1);
        }
        if (nextHitIndex !== null) {
          const insertIndex = previousHitIndex !== null && previousHitIndex < nextHitIndex
            ? nextHitIndex - 1
            : nextHitIndex;
          values.splice(insertIndex, 0, copiedValue);
        }
        while (values.length < nextHitCount) values.push(defaultSubLaneValue(lane));
        if (values.length > nextHitCount) values.length = nextHitCount;

        const field = [...prev[lane]] as (number[] | null)[];
        field[laneIdx] = values;
        (next as unknown as Record<SubLaneKind, (number[] | null)[]>)[lane] = field;
      }

      return next;
    });

    return true;
  }, [laneCount, prefix, stepOverrides]);

  const changeStepValue = useCallback(
    (laneIdx: number, lane: LaneKind, step: number, value: number) => {
      if (lane === 'trigger') return;
      const subLane = lane as SubLaneKind;
      setStepOverrides((prev) => {
        const next = { ...prev, [lane]: [...prev[lane]] };
        const subSteps = subLaneStates[laneIdx]?.[subLane]?.steps ?? 5;
        const defaultValue = defaultSubLaneValue(subLane);
        const targetLength = Math.max(subSteps, step + 1);
        const arr = next[lane][laneIdx]
          ? [...(next[lane][laneIdx] as number[])]
          : new Array(targetLength).fill(defaultValue);
        if (arr.length < targetLength) {
          arr.push(...new Array(targetLength - arr.length).fill(defaultValue));
        }
        arr[step] = subLane === 'nudge' ? clampNudge(value) : value;
        (next[lane] as (number[] | null)[])[laneIdx] = arr;
        return next;
      });
    },
    [subLaneStates]
  );

  const rotateSequence = useCallback((laneIdx: number, direction: 1 | -1) => {
    const normalizedDirection = direction < 0 ? -1 : 1;
    const laneNum = laneIdx + 1;
    const preset = stateRef.current[makeKey(prefix, laneNum, 'Preset')] as string;
    const stepsVal = stateRef.current[makeKey(prefix, laneNum, 'Steps')] as number;
    const hitsVal = stateRef.current[makeKey(prefix, laneNum, 'Hits')] as number;
    const rotVal = stateRef.current[makeKey(prefix, laneNum, 'Rotation')] as number;
    const resolved = resolveDrumEuclidPatternParams(preset, stepsVal, hitsVal, rotVal);
    const currentClip = cloneTriggerClip(stepOverrides.triggerClips?.[laneIdx] ?? null);
    const stepCount = Math.max(1, currentClip?.steps ?? resolved.steps);
    const hasRotatableOverrides = !!currentClip
      || (stepOverrides.triggerToggles[laneIdx]?.size ?? 0) > 0
      || STEP_ARRAY_OVERRIDE_KEYS.some((key) => {
        const laneValues = stepOverrides[key]?.[laneIdx];
        return Array.isArray(laneValues) && laneValues.length === stepCount;
      });

    setStepOverrides((prev) => {
      const existingClip = cloneTriggerClip(prev.triggerClips?.[laneIdx] ?? null);
      const currentToggles = prev.triggerToggles[laneIdx] ?? new Map<number, boolean>();
      const hasTriggerOverrides = currentToggles.size > 0;
      const hasFullStepArrays = STEP_ARRAY_OVERRIDE_KEYS.some((key) => {
        const laneValues = prev[key]?.[laneIdx];
        return Array.isArray(laneValues) && laneValues.length === stepCount;
      });

      if (!existingClip && !hasTriggerOverrides && !hasFullStepArrays) return prev;

      const next: StepOverrides = {
        ...prev,
        triggerClips: [...(prev.triggerClips ?? Array.from({ length: laneCount }, () => null))],
        triggerToggles: [...prev.triggerToggles],
      };

      if (existingClip) {
        next.triggerClips![laneIdx] = rotateTriggerClip(existingClip, normalizedDirection);
        next.triggerToggles[laneIdx] = new Map();
      } else if (hasTriggerOverrides) {
        const basePattern = seqEuclidean(resolved.steps, resolved.hits, resolved.rotation);
        const visiblePattern = basePattern.map((value, step) => (
          currentToggles.has(step) ? currentToggles.get(step)! : value
        ));
        next.triggerToggles[laneIdx] = new Map(
          rotateArray(visiblePattern, normalizedDirection).map((enabled, step) => [step, enabled]),
        );
      }

      for (const key of STEP_ARRAY_OVERRIDE_KEYS) {
        const laneValues = prev[key]?.[laneIdx];
        const rotated = rotateFullStepArray(laneValues, stepCount, normalizedDirection);
        if (!rotated) continue;
        const nextLaneValues = [...prev[key]] as Array<unknown[] | null>;
        nextLaneValues[laneIdx] = rotated;
        (next as unknown as Record<StepArrayOverrideKey, Array<unknown[] | null>>)[key] = nextLaneValues;
      }

      return next;
    });

    const currentRotation = Number(stateRef.current[makeKey(prefix, laneNum, 'Rotation')] ?? 0);
    if (currentClip && currentClip.generator?.kind !== 'euclidean') {
      return;
    }
    if (hasRotatableOverrides) {
      onParamChange(makeKey(prefix, laneNum, 'Rotation'), currentRotation + normalizedDirection);
      return;
    }
    setParam(laneIdx, 'Rotation', currentRotation + normalizedDirection);
  }, [laneCount, onParamChange, prefix, setParam, stepOverrides]);

  const setStepProbability = useCallback(
    (laneIdx: number, step: number, value: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, probability: [...prev.probability] };
        const steps = triggerClipForLane(stateRef.current, prefix, laneIdx, prev).steps;
        const arr = next.probability[laneIdx]
          ? [...(next.probability[laneIdx] as number[])]
          : new Array(steps).fill(1.0);
        arr[step] = Math.max(0, Math.min(1, Math.round(value * 20) / 20)); // 5% snap
        next.probability[laneIdx] = arr;
        return next;
      });
    },
    [prefix]
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
        // Use expression sub-lane step count so ratchet can be polyrhythmic
        const exprSteps = subLaneStates[laneIdx]?.expression?.steps ?? 5;
        const arr = next.ratchet[laneIdx]
          ? [...(next.ratchet[laneIdx] as number[])]
          : new Array(exprSteps).fill(1);
        // Resize if expression step count changed
        while (arr.length < exprSteps) arr.push(1);
        if (arr.length > exprSteps) arr.length = exprSteps;
        const ratchetStep = ratchetSubLaneStepIndex(step, exprSteps);
        const current = clampSequencerRatchet(arr[ratchetStep], 1, SEQUENCER_RATCHET_CONTROL_MAX);
        arr[ratchetStep] = current >= SEQUENCER_RATCHET_CONTROL_MAX ? 1 : current + 1;
        next.ratchet[laneIdx] = arr;
        return next;
      });
    },
    [subLaneStates]
  );

  /* Elektron-style trig conditions: cycle through n:N pairs */
  const TRIG_COND_CYCLE: TrigCondition[] = [
    [1,1],[1,2],[2,2],[1,3],[2,3],[3,3],[1,4],[2,4],[3,4],[4,4],
  ];
  const cycleTrigCondition = useCallback(
    (laneIdx: number, step: number) => {
      setStepOverrides((prev) => {
        const next = { ...prev, trigCondition: [...prev.trigCondition] };
        const steps = triggerClipForLane(stateRef.current, prefix, laneIdx, prev).steps;
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
    [prefix]
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

  const fallbackSeq = sequencerModels[0];
  if (!fallbackSeq) {
    throw new Error('Expected at least one sequencer model');
  }
  const activeSeq = sequencerModels[activeTab] ?? fallbackSeq;

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
    setStepOverrides,
    toggleTriggerStep,
    setTriggerStep,
    copyLinkedTriggerCell,
    pasteLinkedTriggerCell,
    changeStepValue,
    rotateSequence,
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
    setSubLaneStates,
    toggleSubLaneEnabled,
    setSubLaneSteps,
    cycleSubLaneDirection,
    setSubLaneValueMode,
    setSubLaneRange,
    linked,
    setLinked,
    toggleLinked,
    clockDivs,
    setClockDivs,
    setClockDiv,
    swings,
    setSwings,
    setSwing: setSwingVal,
    pitchSettings,
    setPitchSettings,
    setPitchMode,
    setPitchRoot,
    setPitchScale,
  };
}
