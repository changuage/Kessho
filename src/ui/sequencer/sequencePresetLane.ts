import type { TrigCondition } from '../../audio/drumSeqTypes';
import type { ClockDivision, PitchBindingMode } from '../../audio/drumSeqTypes';
import type { ProductArpConfig } from '../../audio/productArpeggiator';
import type { ProductPlayConfig } from '../../audio/productPlaySequencer';
import { normalizeSequencerLaneDirection, normalizeOptionalSequencerLaneDirection } from '../../audio/sequencerLaneDirection';
import { normalizeSequencerClockDivision } from '../../audio/sequencerClockDivisions';
import { normalizeSequencerPitchBindingMode } from '../../audio/sequencerPitchBinding';
import { normalizeSequencerPitchSettings } from '../../audio/sequencerPitchSettings';
import { normalizeSequencerSwing } from '../../audio/sequencerSwing';
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
import { normalizeSequencerEvolveConfig } from './useEuclideanSequencer';
import { clampEuclideanSubLaneSteps } from './sequencerLimits';
import { deserializeTriggerClip, serializeTriggerClip } from './triggerClip';

const SEQUENCE_PRESET_SOURCE_LANE = 0;
const SUB_LANE_KINDS: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'nudge', 'slice', 'reverse'];

const STEP_OVERRIDE_ARRAY_FIELDS = [
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
] as const;

const STEP_OVERRIDE_DIRECTION_FIELDS = [
  'expressionDirection',
  'morphDirection',
  'distanceDirection',
  'nudgeDirection',
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
type StepOverrideDirectionField = typeof STEP_OVERRIDE_DIRECTION_FIELDS[number];
type StepOverrideRangeField = typeof STEP_OVERRIDE_RANGE_FIELDS[number];

const SUB_LANE_DIRECTION_FIELDS: Record<SubLaneKind, StepOverrideDirectionField> = {
  expression: 'expressionDirection',
  morph: 'morphDirection',
  distance: 'distanceDirection',
  nudge: 'nudgeDirection',
  pitch: 'pitchDirection',
  slice: 'sliceDirection',
  reverse: 'reverseDirection',
};

const SUB_LANE_RANGE_FIELDS: Partial<Record<SubLaneKind, StepOverrideRangeField>> = {
  expression: 'expressionRanges',
  morph: 'morphRanges',
  distance: 'distanceRanges',
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface SerializedSequenceLanePresetState {
  subLaneStates?: Partial<Record<SubLaneKind, SerializedSubLaneState>>;
  clockDiv?: ClockDivision;
  swing?: number;
  linked?: boolean;
  evolveConfig?: SerializedEvolveConfig;
  pitchSettings?: SerializedPitchSettings;
  pitchBindingMode?: PitchBindingMode;
  playConfig?: ProductPlayConfig;
  arpConfig?: ProductArpConfig | ProductPlayConfig;
}

function cloneSequenceLaneArray(lane: StepOverrideArrayLane | undefined): StepOverrideArrayLane {
  if (!Array.isArray(lane)) return null;
  return lane.map((item) => (Array.isArray(item) ? [...item] : item)) as StepOverrideArrayLane;
}

function cloneSubLaneState(state: SubLaneState | SerializedSubLaneState | undefined): SerializedSubLaneState | undefined {
  if (!state) return undefined;
  const steps = typeof state.steps === 'number' && Number.isFinite(state.steps)
    ? clampEuclideanSubLaneSteps(Math.floor(state.steps))
    : 1;
  const rangeMin = typeof state.rangeMin === 'number' && Number.isFinite(state.rangeMin) ? clampUnit(state.rangeMin) : undefined;
  const rangeMax = typeof state.rangeMax === 'number' && Number.isFinite(state.rangeMax) ? clampUnit(state.rangeMax) : undefined;
  return {
    enabled: Boolean(state.enabled),
    steps,
    direction: normalizeSequencerLaneDirection(state.direction),
    ...(typeof state.scaleQuantize === 'boolean' ? { scaleQuantize: false } : {}),
    ...(typeof state.followTriggerHits === 'boolean' ? { followTriggerHits: state.followTriggerHits } : {}),
    ...(state.valueMode === 'sequence' || state.valueMode === 'range' ? { valueMode: state.valueMode } : {}),
    ...(rangeMin !== undefined ? { rangeMin: Math.min(rangeMin, rangeMax ?? rangeMin) } : {}),
    ...(rangeMax !== undefined ? { rangeMax: Math.max(rangeMax, rangeMin ?? rangeMax) } : {}),
  };
}

function cloneEvolveConfig(config: EvolveConfig | SerializedEvolveConfig | undefined): SerializedEvolveConfig | undefined {
  if (!config) return undefined;
  const everyBars = typeof config.everyBars === 'number' && Number.isFinite(config.everyBars)
    ? Math.max(1, Math.floor(config.everyBars))
    : 1;
  const evolution = typeof config.evolution === 'number' && Number.isFinite(config.evolution)
    ? clampUnit(config.evolution)
    : 0;
  const writeOffset = config.writeOffset === 'auto'
    ? 'auto'
    : typeof config.writeOffset === 'number' && Number.isFinite(config.writeOffset)
      ? Math.max(0, Math.floor(config.writeOffset))
      : 0;
  const methods: Record<string, boolean> = {};
  if (config.methods && typeof config.methods === 'object') {
    for (const [key, value] of Object.entries(config.methods)) {
      methods[key] = value === true;
    }
  }
  const enabledSubLanes = Array.isArray(config.enabledSubLanes)
    ? config.enabledSubLanes.filter((lane): lane is string => typeof lane === 'string')
    : undefined;
  return {
    enabled: Boolean(config.enabled),
    everyBars,
    evolution,
    writeOffset,
    mutationMode: config.mutationMode === 'strict' ? 'strict' : 'biased',
    methods,
    ...(enabledSubLanes ? { enabledSubLanes } : {}),
  };
}

function clonePitchSettings(settings: PitchSettings | SerializedPitchSettings | undefined): SerializedPitchSettings | undefined {
  if (!settings) return undefined;
  return normalizeSequencerPitchSettings(settings);
}

function inferLegacySubLaneStatesFromLoadedOverrides(
  loaded: StepOverrides,
  sourceLane: number,
): Partial<Record<SubLaneKind, SerializedSubLaneState>> {
  const inferred: Partial<Record<SubLaneKind, SerializedSubLaneState>> = {};
  for (const lane of SUB_LANE_KINDS) {
    const values = loaded[lane]?.[sourceLane];
    if (!Array.isArray(values) || values.length === 0) continue;
    const direction = normalizeSequencerLaneDirection(
      loaded[SUB_LANE_DIRECTION_FIELDS[lane]]?.[sourceLane],
    );
    const rangeField = SUB_LANE_RANGE_FIELDS[lane];
    const range = rangeField ? loaded[rangeField]?.[sourceLane] : null;
    inferred[lane] = {
      enabled: true,
      steps: clampEuclideanSubLaneSteps(values.length),
      direction,
      ...(range ? { valueMode: 'range', rangeMin: range.min, rangeMax: range.max } : {}),
    };
  }
  return inferred;
}

export function inferLegacySubLaneStatesFromOverrides(
  serialized: SerializedStepOverrides | undefined,
): Partial<Record<SubLaneKind, SerializedSubLaneState>> {
  const loaded = deserializeStepOverrides(serialized);
  if (!loaded) return {};
  return inferLegacySubLaneStatesFromLoadedOverrides(loaded, SEQUENCE_PRESET_SOURCE_LANE);
}

export function inferLegacySequencerSubLaneStatesFromOverrides(
  serialized: SerializedStepOverrides | undefined,
  laneCount = 4,
): Partial<Record<SubLaneKind, SerializedSubLaneState>>[] | undefined {
  const loaded = deserializeStepOverrides(serialized);
  if (!loaded) return undefined;
  const count = Math.max(1, Math.min(16, Math.floor(laneCount)));
  const lanes = Array.from({ length: count }, (_, laneIndex) =>
    inferLegacySubLaneStatesFromLoadedOverrides(loaded, laneIndex)
  );
  return lanes.some((lane) => Object.keys(lane).length > 0) ? lanes : undefined;
}

function replaceLane<T>(current: T[], laneIdx: number, value: T | undefined): T[] {
  if (value === undefined || laneIdx < 0 || laneIdx >= current.length) return current;
  const next = [...current];
  next[laneIdx] = value;
  return next;
}

export function copySequenceLaneForPreset(overrides: StepOverrides, laneIdx: number): StepOverrides {
  const next = createEmptyStepOverrides();
  next.triggerClips![SEQUENCE_PRESET_SOURCE_LANE] = deserializeTriggerClip(
    serializeTriggerClip(overrides.triggerClips?.[laneIdx] ?? null),
  );
  next.triggerToggles[SEQUENCE_PRESET_SOURCE_LANE] = new Map(overrides.triggerToggles[laneIdx] ?? []);

  for (const field of STEP_OVERRIDE_ARRAY_FIELDS) {
    (next[field] as StepOverrideArrayLane[])[SEQUENCE_PRESET_SOURCE_LANE] = cloneSequenceLaneArray(
      overrides[field]?.[laneIdx] as StepOverrideArrayLane | undefined,
    );
  }

  for (const field of STEP_OVERRIDE_DIRECTION_FIELDS) {
    next[field][SEQUENCE_PRESET_SOURCE_LANE] = normalizeOptionalSequencerLaneDirection(overrides[field]?.[laneIdx]);
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
    ...(typeof options.swings[laneIdx] === 'number' ? { swing: normalizeSequencerSwing(options.swings[laneIdx]) } : {}),
    ...(typeof options.linked[laneIdx] === 'boolean' ? { linked: options.linked[laneIdx] } : {}),
    ...(options.evolveConfigs[laneIdx] ? { evolveConfig: cloneEvolveConfig(options.evolveConfigs[laneIdx]) } : {}),
    ...(options.pitchSettings?.[laneIdx] ? { pitchSettings: clonePitchSettings(options.pitchSettings[laneIdx]) } : {}),
    ...(options.pitchBindingModes?.[laneIdx] ? { pitchBindingMode: normalizeSequencerPitchBindingMode(options.pitchBindingModes[laneIdx]) } : {}),
  };
}

export function applySequencePresetOverrides(
  current: StepOverrides,
  serialized: SerializedStepOverrides | undefined,
  laneIdx: number,
): StepOverrides {
  const loaded = deserializeStepOverrides(serialized);
  if (!loaded) return current;
  const fallbackLaneCount = Math.max(4, current.triggerToggles.length, laneIdx + 1);

  const next: StepOverrides = {
    ...current,
    triggerClips: [...(current.triggerClips ?? Array.from({ length: fallbackLaneCount }, () => null))],
    triggerToggles: [...current.triggerToggles],
    probability: [...current.probability],
    ratchet: [...current.ratchet],
    trigCondition: [...current.trigCondition],
    expression: [...current.expression],
    pitch: [...current.pitch],
    morph: [...current.morph],
    distance: [...current.distance],
    nudge: [...current.nudge],
    slice: [...current.slice],
    reverse: [...current.reverse],
    expressionDirection: [...current.expressionDirection],
    morphDirection: [...current.morphDirection],
    distanceDirection: [...current.distanceDirection],
    nudgeDirection: [...current.nudgeDirection],
    pitchDirection: [...current.pitchDirection],
    sliceDirection: [...current.sliceDirection],
    reverseDirection: [...current.reverseDirection],
    expressionRanges: [...(current.expressionRanges ?? Array.from({ length: fallbackLaneCount }, () => null))],
    morphRanges: [...(current.morphRanges ?? Array.from({ length: fallbackLaneCount }, () => null))],
    distanceRanges: [...(current.distanceRanges ?? Array.from({ length: fallbackLaneCount }, () => null))],
  };

  next.triggerClips![laneIdx] = deserializeTriggerClip(
    serializeTriggerClip(loaded.triggerClips?.[SEQUENCE_PRESET_SOURCE_LANE] ?? null),
  );
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
  serializedOverrides?: SerializedStepOverrides,
): Record<SubLaneKind, SubLaneState>[] {
  if (laneIdx < 0 || laneIdx >= current.length) return current;
  const currentLane = current[laneIdx];
  if (!currentLane) return current;
  const savedSubLaneStates = {
    ...inferLegacySubLaneStatesFromOverrides(serializedOverrides),
    ...(serialized?.subLaneStates ?? {}),
  };
  if (Object.keys(savedSubLaneStates).length === 0) return current;

  const nextLane = { ...currentLane };
  for (const lane of SUB_LANE_KINDS) {
    const saved = savedSubLaneStates[lane];
    const sanitized = cloneSubLaneState(saved);
    if (sanitized) {
      nextLane[lane] = {
        ...currentLane[lane],
        ...sanitized,
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
  if (!serialized?.clockDiv || laneIdx < 0 || laneIdx >= current.length) return current;
  return replaceLane(current, laneIdx, normalizeSequencerClockDivision(serialized.clockDiv, current[laneIdx] ?? '1/8'));
}

export function applySequencePresetSwings(
  current: number[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): number[] {
  return replaceLane(current, laneIdx, serialized?.swing === undefined
    ? undefined
    : normalizeSequencerSwing(serialized.swing, current[laneIdx] ?? 0));
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
  prefix = 'synth',
): EvolveConfig[] {
  if (!serialized?.evolveConfig || laneIdx < 0 || laneIdx >= current.length) return current;
  const base = current[laneIdx];
  const normalized = normalizeSequencerEvolveConfig(prefix, serialized.evolveConfig);
  return replaceLane(current, laneIdx, {
    ...normalized,
    methods: {
      ...(base?.methods ?? normalized.methods),
      ...normalized.methods,
    },
  });
}

export function applySequencePresetPitchSettings(
  current: PitchSettings[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): PitchSettings[] {
  if (!serialized?.pitchSettings || laneIdx < 0 || laneIdx >= current.length) return current;
  return replaceLane(current, laneIdx, normalizeSequencerPitchSettings(serialized.pitchSettings, current[laneIdx]));
}

export function applySequencePresetPitchBindingModes(
  current: PitchBindingMode[],
  serialized: SerializedSequenceLanePresetState | undefined,
  laneIdx: number,
): PitchBindingMode[] {
  return replaceLane(current, laneIdx, serialized?.pitchBindingMode === undefined
    ? undefined
    : normalizeSequencerPitchBindingMode(serialized.pitchBindingMode, current[laneIdx] ?? 'polyrhythmic'));
}
