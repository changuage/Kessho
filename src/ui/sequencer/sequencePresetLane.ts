import type { TrigCondition } from '../../audio/drumSeqTypes';
import type { SerializedStepOverrides } from '../state';
import { createEmptyStepOverrides, deserializeStepOverrides } from './stepOverrideSerialization';
import type { StepOverrides } from './useEuclideanSequencer';

const SEQUENCE_PRESET_SOURCE_LANE = 0;

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

function cloneSequenceLaneArray(lane: StepOverrideArrayLane | undefined): StepOverrideArrayLane {
  if (!Array.isArray(lane)) return null;
  return lane.map((item) => (Array.isArray(item) ? [...item] : item)) as StepOverrideArrayLane;
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
