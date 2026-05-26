import type { LaneDirection, TrigCondition } from '../../audio/drumSeqTypes';
import { normalizeOptionalSequencerLaneDirection } from '../../audio/sequencerLaneDirection';
import type { SerializedStepOverrides, SerializedStepToggle } from '../state';
import type { StepOverrides } from './useEuclideanSequencer';

const LANE_COUNT = 4;

const ARRAY_FIELDS = [
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

const DIRECTION_FIELDS = [
  'expressionDirection',
  'morphDirection',
  'distanceDirection',
  'pitchDirection',
  'sliceDirection',
  'reverseDirection',
] as const;

const RANGE_FIELDS = [
  'expressionRanges',
  'morphRanges',
  'distanceRanges',
] as const;

function cloneArrayLane(value: number[] | TrigCondition[] | null | undefined): number[] | TrigCondition[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((item) => (Array.isArray(item) ? [...item] : item)) as number[] | TrigCondition[];
}

function normalizeLaneArray<T>(lanes: (T | null)[] | undefined, fallback: T | null = null): (T | null)[] {
  return Array.from({ length: LANE_COUNT }, (_, index) => lanes?.[index] ?? fallback);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const range = value as Partial<{ min: number; max: number }>;
  if (typeof range.min !== 'number' || typeof range.max !== 'number') return null;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const min = clampUnit(range.min);
  const max = clampUnit(range.max);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function hasLaneArrayContent(lanes: (unknown[] | null)[] | undefined): boolean {
  return !!lanes?.some((lane) => Array.isArray(lane) && lane.length > 0);
}

function hasDirectionContent(lanes: (LaneDirection | null)[] | undefined): boolean {
  return !!lanes?.some(Boolean);
}

function hasRangeContent(lanes: ({ min: number; max: number } | null)[] | undefined): boolean {
  return !!lanes?.some(Boolean);
}

function serializeToggleMap(map: Map<number, boolean> | undefined): SerializedStepToggle[] {
  if (!map?.size) return [];
  return [...map.entries()]
    .filter(([step]) => Number.isInteger(step) && step >= 0)
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value: Boolean(value) }));
}

function deserializeToggleMap(toggles: unknown): Map<number, boolean> {
  const map = new Map<number, boolean>();
  if (!Array.isArray(toggles)) return map;

  for (const toggle of toggles) {
    if (Array.isArray(toggle) && toggle.length >= 2) {
      const [step, value] = toggle;
      if (Number.isInteger(step) && step >= 0) map.set(step, Boolean(value));
      continue;
    }
    if (toggle && typeof toggle === 'object') {
      const record = toggle as Partial<SerializedStepToggle>;
      const step = record.step;
      if (Number.isInteger(step) && step !== undefined && step >= 0) {
        map.set(step, Boolean(record.value));
      }
    }
  }

  return map;
}

export function createEmptyStepOverrides(laneCount = LANE_COUNT): StepOverrides {
  return {
    triggerToggles: Array.from({ length: laneCount }, () => new Map<number, boolean>()),
    probability: Array.from({ length: laneCount }, () => null),
    ratchet: Array.from({ length: laneCount }, () => null),
    trigCondition: Array.from({ length: laneCount }, () => null),
    expression: Array.from({ length: laneCount }, () => null),
    pitch: Array.from({ length: laneCount }, () => null),
    morph: Array.from({ length: laneCount }, () => null),
    distance: Array.from({ length: laneCount }, () => null),
    slice: Array.from({ length: laneCount }, () => null),
    reverse: Array.from({ length: laneCount }, () => null),
    expressionDirection: Array.from({ length: laneCount }, () => null),
    morphDirection: Array.from({ length: laneCount }, () => null),
    distanceDirection: Array.from({ length: laneCount }, () => null),
    pitchDirection: Array.from({ length: laneCount }, () => null),
    sliceDirection: Array.from({ length: laneCount }, () => null),
    reverseDirection: Array.from({ length: laneCount }, () => null),
    expressionRanges: Array.from({ length: laneCount }, () => null),
    morphRanges: Array.from({ length: laneCount }, () => null),
    distanceRanges: Array.from({ length: laneCount }, () => null),
  };
}

export function serializeStepOverrides(overrides: StepOverrides | undefined): SerializedStepOverrides | undefined {
  if (!overrides) return undefined;

  const serialized: SerializedStepOverrides = {};
  const triggerToggles = Array.from({ length: LANE_COUNT }, (_, index) => (
    serializeToggleMap(overrides.triggerToggles?.[index])
  ));
  if (triggerToggles.some((lane) => lane.length > 0)) {
    serialized.triggerToggles = triggerToggles;
  }

  for (const field of ARRAY_FIELDS) {
    const lanes = normalizeLaneArray(overrides[field]?.map(cloneArrayLane) as never);
    if (hasLaneArrayContent(lanes as (unknown[] | null)[])) {
      (serialized as Record<string, unknown>)[field] = lanes;
    }
  }

  for (const field of DIRECTION_FIELDS) {
    const lanes = normalizeLaneArray(
      (overrides[field] as (LaneDirection | null)[] | undefined)?.map(normalizeOptionalSequencerLaneDirection),
    );
    if (hasDirectionContent(lanes)) {
      (serialized as Record<string, unknown>)[field] = lanes;
    }
  }

  for (const field of RANGE_FIELDS) {
    const lanes = normalizeLaneArray(overrides[field]?.map((range) => (
      normalizeRange(range)
    )));
    if (hasRangeContent(lanes)) {
      (serialized as Record<string, unknown>)[field] = lanes;
    }
  }

  return Object.keys(serialized).length ? serialized : undefined;
}

export function deserializeStepOverrides(serialized: SerializedStepOverrides | undefined): StepOverrides | undefined {
  if (!serialized) return undefined;

  const overrides = createEmptyStepOverrides();
  overrides.triggerToggles = Array.from({ length: LANE_COUNT }, (_, index) => (
    deserializeToggleMap(serialized.triggerToggles?.[index])
  ));

  for (const field of ARRAY_FIELDS) {
    overrides[field] = normalizeLaneArray(
      (serialized[field] as (number[] | TrigCondition[] | null)[] | undefined)
        ?.map(cloneArrayLane) as never,
    ) as never;
  }

  for (const field of DIRECTION_FIELDS) {
    overrides[field] = normalizeLaneArray(
      (serialized[field] as unknown[] | undefined)?.map(normalizeOptionalSequencerLaneDirection),
    ) as never;
  }

  for (const field of RANGE_FIELDS) {
    const lanes = normalizeLaneArray(
      (serialized[field] as unknown[] | undefined)?.map(normalizeRange),
    );
    if (lanes.some(Boolean)) {
      overrides[field] = lanes;
    }
  }

  return overrides;
}
