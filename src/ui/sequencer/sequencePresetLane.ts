import type { TrigCondition } from '../../audio/drumSeqTypes';
import type { ClockDivision, PitchBindingMode } from '../../audio/drumSeqTypes';
import type {
  SerializedEvolveConfig,
  SerializedPitchSettings,
  SerializedStepOverrides,
  SerializedSubLaneState,
} from '../state';
import { createEmptyStepOverrides, deserializeStepOverrides } from './stepOverrideSerialization';
import type {
  EvolveConfig,
  PitchSettings,
  StepOverrides,
  SubLaneKind,
  SubLaneState,
} from './useEuclideanSequencer';

const SEQUENCE_PRESET_SOURCE_LANE = 0;
const SUB_LANE_KINDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'slice', 'reverse'];

const STEP_OVERRIDE_ARRAY_FIELDS = [
  'probability',
  'ratchet',
  'trigCondition',
  'expression',
  'pitch',
  'morph',
  'distance',
  'slice',
  'reverse',
] as const;

const STEP_OVERRIDE_DIRECTION_FIELDS = [
  'expressionDirection',
  'morphDirection',
  'distanceDirection',
  'pitchDirection',
  'sliceDirection',
  'reverseDirection',
] as const;

const STEP_OVERRIDE_RANGE_FIELDS = [
  'expressionRanges',
  'morphRanges',
  'distanceRanges',
] as const;

type StepOverrideArrayLane = number[] | TrigCondition[] | null;

export interface SerializedSequenceLanePresetState {
  subLaneStates?: Partial<Record<SubLaneKind, SerializedSubLaneState>>;
  clockDiv?: ClockDivision;
  swing?: number;
  linked?: boolean;
  evolveConfig?: SerializedEvolveConfig;
  pitchSettings?: SerializedPitchSettings;
  pitchBindingMode?: PitchBindingMode;
}

function cloneSequenceLaneArray(lane: StepOverrideArrayLane | undefined): StepOverrideArrayLane {
  if (!Array.isArray(lane)) return null;
  return lane.map((item) => (Array.isArray(item) ? [...item] : item)) as StepOverrideArrayLane;
}

function cloneSubLaneState(state: SubLaneState | SerializedSubLaneState | undefined): SerializedSubLaneState | undefined {
  if (!state) return undefined;
  return {
    enabled: Boolean(state.enabled),
    steps: Math.max(1, Math.min(16, Math.floor(state.steps ?? 1))),
    direction: state.direction ?? 'forward',
    ...(typeof state.scaleQuantize === 'boolean' ? { scaleQuantize: state.scaleQuantize } : {}),
    ...(state.valueMode === 'sequence' || state.valueMode === 'range' ? { valueMode: state.valueMode } : {}),
    ...(typeof state.rangeMin === 'number' ? { rangeMin: state.rangeMin } : {}),
    ...(typeof state.rangeMax === 'number' ? { rangeMax: state.rangeMax } : {}),
  };
}

function cloneEvolveConfig(config: EvolveConfig | SerializedEvolveConfig | undefined): SerializedEvolveConfig | undefined {
  if (!config) return undefined;
  return {
    enabled: Boolean(config.enabled),
    everyBars: Math.max(1, Math.floor(config.everyBars ?? 1)),
    evolution: typeof config.evolution === 'number' ? config.evolution : 0,
    writeOffset: config.writeOffset === 'auto'
      ? 'auto'
      : Math.max(0, Math.floor(Number(config.writeOffset ?? 0))),
    mutationMode: config.mutationMode === 'strict' ? 'strict' : 'biased',
    methods: { ...(config.methods ?? {}) },
    ...(Array.isArray(config.enabledSubLanes) ? { enabledSubLanes: [...config.enabledSubLanes] } : {}),
  };
}

function clonePitchSettings(settings: PitchSettings | SerializedPitchSettings | undefined): SerializedPitchSettings | undefined {
  if (!settings) return undefined;
  return {
    mode: settings.mode,
    root: settings.root,
    scale: settings.scale,
  };
}

function replaceLane<T>(current: T[], laneIdx: number, value: T | undefined): T[] {
  if (value === undefined || laneIdx < 0 || laneIdx >= current.length) return current;
  const next = [...current];
  next[laneIdx] = value;
  return next;
}

export function copySequenceLaneForPreset(overrides: StepOverrides, laneIdx: number): StepOverrides {
  const next = createEmptyStepOverrides();
  next.triggerToggles[SEQUENCE_PRESET_SOURCE_LANE] = new Map(overrides.triggerToggles[laneIdx] ?? []);

  for (const field of STEP_OVERRIDE_ARRAY_FIELDS) {
    (next[field] as StepOverrideArrayLane[])[SEQUENCE_PRESET_SOURCE_LANE] = cloneSequenceLaneArray(
      overrides[field]?.[laneIdx] as StepOverrideArrayLane | undefined,
    );
  }

  for (const field of STEP_OVERRIDE_DIRECTION_FIELDS) {
    next[field][SEQUENCE_PRESET_SOURCE_LANE] = overrides[field]?.[laneIdx] ?? null;
  }

  for (const field of STEP_OVERRIDE_RANGE_FIELDS) {
    const range = overrides[field]?.[laneIdx];
    next[field]![SEQUENCE_PRESET_SOURCE_LANE] = range ? { min: range.min, max: range.max } : null;
  }

  return next;
}

export function copySequenceLaneStateForPreset(options: {
  laneIdx: number;
  subLaneStates: Record<SubLaneKind, SubLaneState>[];
  clockDivs: ClockDivision[];
  swings: number[];
  linked: boolean[];
  evolveConfigs: EvolveConfig[];
  pitchSettings?: PitchSettings[];
  pitchBindingModes?: PitchBindingMode[];
}): SerializedSequenceLanePresetState {
  const { laneIdx } = options;
  const sourceSubLaneStates = options.subLaneStates[laneIdx];
  const subLaneStates: Partial<Record<SubLaneKind, SerializedSubLaneState>> = {};
  if (sourceSubLaneStates) {
    for (const lane of SUB_LANE_KINDS) {
      const cloned = cloneSubLaneState(sourceSubLaneStates[lane]);
      if (cloned) subLaneStates[lane] = cloned;
    }
  }

  return {
    ...(Object.keys(subLaneStates).length ? { subLaneStates } : {}),
    ...(options.clockDivs[laneIdx] ? { clockDiv: options.clockDivs[laneIdx] } : {}),
    ...(typeof options.swings[laneIdx] === 'number' ? { swing: options.swings[laneIdx] } : {}),
    ...(typeof options.linked[laneIdx] === 'boolean' ? { linked: options.linked[laneIdx] } : {}),
    ...(options.evolveConfigs[laneIdx] ? { evolveConfig: cloneEvolveConfig(options.evolveConfigs[laneIdx]) } : {}),
    ...(options.pitchSettings?.[laneIdx] ? { pitchSettings: clonePitchSettings(options.pitchSettings[laneIdx]) } : {}),
    ...(options.pitchBindingModes?.[laneIdx] ? { pitchBindingMode: options.pitchBindingModes[laneIdx] } : {}),
  };
}

export function applySequencePresetOverrides(
  current: StepOverrides,
  serialized: SerializedStepOverrides | undefined,
  laneIdx: number,
): StepOverrides {
  const loaded = deserializeStepOverrides(serialized);
  if (!loaded) return current;

  const next: StepOverrides = {
    ...current,
    triggerToggles: [...current.triggerToggles],
    probability: [...current.probability],
    ratchet: [...current.ratchet],
    trigCondition: [...current.trigCondition],
    expression: [...current.expression],
    pitch: [...current.pitch],
    morph: [...current.morph],
    distance: [...current.distance],
    slice: [...current.slice],
    reverse: [...current.reverse],
    expressionDirection: [...current.expressionDirection],
    morphDirection: [...current.morphDirection],
    distanceDirection: [...current.distanceDirection],
    pitchDirection: [...current.pitchDirection],
    sliceDirection: [...current.sliceDirection],
    reverseDirection: [...current.reverseDirection],
    expressionRanges: [...(current.expressionRanges ?? Array.from({ length: 4 }, () => null))],
    morphRanges: [...(current.morphRanges ?? Array.from({ length: 4 }, () => null))],
    distanceRanges: [...(current.distanceRanges ?? Array.from({ length: 4 }, () => null))],
  };

  next.triggerToggles[laneIdx] = new Map(loaded.triggerToggles[SEQUENCE_PRESET_SOURCE_LANE] ?? []);

  for (const field of STEP_OVERRIDE_ARRAY_FIELDS) {
    (next[field] as StepOverrideArrayLane[])[laneIdx] = cloneSequenceLaneArray(
      loaded[field]?.[SEQUENCE_PRESET_SOURCE_LANE] as StepOverrideArrayLane | undefined,
    );
  }

  for (const field of STEP_OVERRIDE_DIRECTION_FIELDS) {
    next[field][laneIdx] = loaded[field]?.[SEQUENCE_PRESET_SOURCE_LANE] ?? null;
  }

  for (const field of STEP_OVERRIDE_RANGE_FIELDS) {
    const range = loaded[field]?.[SEQUENCE_PRESET_SOURCE_LANE];
    next[field]![laneIdx] = range ? { min: range.min, max: range.max } : null;
  }

  return next;
}

export function applySequencePresetSubLaneStates(
  current: Record<SubLaneKind, SubLaneState>[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): Record<SubLaneKind, SubLaneState>[] {
  if (!serialized?.subLaneStates || laneIdx < 0 || laneIdx >= current.length) return current;
  const currentLane = current[laneIdx];
  if (!currentLane) return current;

  const nextLane = { ...currentLane };
  for (const lane of SUB_LANE_KINDS) {
    const saved = serialized.subLaneStates[lane];
    if (saved) {
      nextLane[lane] = {
        ...currentLane[lane],
        ...saved,
      };
    }
  }

  return replaceLane(current, laneIdx, nextLane);
}

export function applySequencePresetClockDivs(
  current: ClockDivision[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): ClockDivision[] {
  return replaceLane(current, laneIdx, serialized?.clockDiv);
}

export function applySequencePresetSwings(
  current: number[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): number[] {
  return replaceLane(current, laneIdx, serialized?.swing);
}

export function applySequencePresetLinked(
  current: boolean[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): boolean[] {
  return replaceLane(current, laneIdx, serialized?.linked);
}

export function applySequencePresetEvolveConfigs(
  current: EvolveConfig[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): EvolveConfig[] {
  return replaceLane(current, laneIdx, cloneEvolveConfig(serialized?.evolveConfig) as EvolveConfig | undefined);
}

export function applySequencePresetPitchSettings(
  current: PitchSettings[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): PitchSettings[] {
  return replaceLane(current, laneIdx, clonePitchSettings(serialized?.pitchSettings) as PitchSettings | undefined);
}

export function applySequencePresetPitchBindingModes(
  current: PitchBindingMode[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): PitchBindingMode[] {
  return replaceLane(current, laneIdx, serialized?.pitchBindingMode);
}
