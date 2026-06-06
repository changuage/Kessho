import {
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from './coreProductEvents';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';

export type SequencerKind = 'synth' | 'drum';

export type SequencerStepToggleOverride = { step: number; value: boolean };
export type SequencerStepValueOverride = { step: number; field: CoreProductStepValueField; value: number; value2?: number; range?: boolean };
export type SequencerStepValueConfig = { field: CoreProductStepValueField; steps: number; direction: CoreProductSubLaneDirection };

export function normalizedUnitValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function normalizeClockDivisionValue(value: unknown, fallback: number): number {
  return sequencerClockDivisionToNumericValue(value, fallback);
}

export function normalizeSubLaneEnabledStates(states: unknown): Record<string, boolean>[] {
  const lanes = Array.isArray(states) ? states : [];
  return Array.from({ length: Math.max(4, Math.min(16, lanes.length || 4)) }, (_, laneIndex) => {
    const source = lanes[laneIndex];
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        out[key] = value;
      }
    }
    return out;
  });
}

export function normalizeSequencerStepToggleOverrides(
  overrides: unknown,
  fallback: SequencerStepToggleOverride[][],
): SequencerStepToggleOverride[][] {
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
    ? overrides as Record<string, unknown>
    : null;
  if (source && !Object.prototype.hasOwnProperty.call(source, 'triggerToggles')) {
    return cloneStepToggleOverrides(fallback);
  }
  const candidate = source ? source.triggerToggles : overrides;
  if (candidate === undefined) {
    return cloneStepToggleOverrides(fallback);
  }
  const lanes = Array.isArray(candidate) ? candidate : [];
  const laneCount = Math.max(4, Math.min(16, Math.max(lanes.length, fallback.length)));
  return Array.from({ length: laneCount }, (_, laneIndex) =>
    normalizeStepToggleLane(lanes[laneIndex]),
  );
}

function cloneStepToggleOverrides(overrides: SequencerStepToggleOverride[][]): SequencerStepToggleOverride[][] {
  return overrides.map((lane) => lane.map((toggle) => ({ ...toggle })));
}

function normalizeStepToggleLane(lane: unknown): SequencerStepToggleOverride[] {
  const toggles = new Map<number, boolean>();
  const add = (stepValue: unknown, enabledValue: unknown) => {
    if (typeof stepValue !== 'number' || !Number.isFinite(stepValue)) return;
    const step = Math.round(stepValue);
    if (step < 0 || step > 63) return;
    toggles.set(step, booleanToggleValue(enabledValue));
  };

  if (lane instanceof Map) {
    for (const [step, enabled] of lane.entries()) {
      add(step, enabled);
    }
  } else if (Array.isArray(lane)) {
    lane.forEach((entry, index) => {
      if (Array.isArray(entry)) {
        add(entry[0], entry[1]);
        return;
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        add(record.step, record.value);
        return;
      }
      if (typeof entry === 'boolean' || typeof entry === 'number') {
        add(index, entry);
      }
    });
  } else if (lane && typeof lane === 'object') {
    for (const [step, enabled] of Object.entries(lane as Record<string, unknown>)) {
      const parsedStep = Number(step);
      add(parsedStep, enabled);
    }
  }

  return Array.from(toggles.entries())
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value }));
}

function booleanToggleValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return Boolean(value);
}

export function normalizeSequencerStepValueOverrides(
  overrides: unknown,
  fallback: SequencerStepValueOverride[][],
  includeMidiNote: boolean,
): SequencerStepValueOverride[][] {
  return normalizeSequencerStepValueOverridesInternal(overrides, fallback, includeMidiNote, 0, 127);
}

export function normalizeDrumSequencerStepOffsetOverrides(
  overrides: unknown,
  fallback: SequencerStepValueOverride[][],
): SequencerStepValueOverride[][] {
  return normalizeSequencerStepValueOverridesInternal(
    overrides,
    fallback,
    true,
    -24,
    24,
  );
}

function normalizeSequencerStepValueOverridesInternal(
  overrides: unknown,
  fallback: SequencerStepValueOverride[][],
  includeMidiNote: boolean,
  midiNoteMin: number,
  midiNoteMax: number,
  midiNoteMap?: (value: number, laneIndex: number) => number,
): SequencerStepValueOverride[][] {
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
    ? overrides as Record<string, unknown>
    : null;
  if (!source) {
    return fallback.map((lane) => lane.map((entry) => ({ ...entry })));
  }
  const laneCount = Math.max(4, Math.min(16, fallback.length));
  const lanes: SequencerStepValueOverride[][] = Array.from({ length: laneCount }, () => []);
  const addNumericField = (
    key: string,
    field: CoreProductStepValueField,
    min: number,
    max: number,
    round = false,
  ) => {
    const value = source[key];
    if (!Array.isArray(value)) return;
    const count = Math.max(laneCount, Math.min(16, value.length));
    while (lanes.length < count) lanes.push([]);
    for (let laneIndex = 0; laneIndex < Math.min(value.length, lanes.length); laneIndex += 1) {
      const laneOut = lanes[laneIndex];
      if (!laneOut) continue;
      collectNumericStepValues(value[laneIndex], field, min, max, round, laneOut, laneIndex, field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote ? midiNoteMap : undefined);
    }
  };

  addNumericField('probability', CORE_PRODUCT_STEP_VALUE_FIELDS.probability, 0, 1);
  addNumericField('ratchet', CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, 1, 8, true);
  if (includeMidiNote) {
    addNumericField('pitch', CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, midiNoteMin, midiNoteMax);
  }
  addNumericField('expression', CORE_PRODUCT_STEP_VALUE_FIELDS.expression, 0, 1);
  addNumericField('morph', CORE_PRODUCT_STEP_VALUE_FIELDS.morph, 0, 1);
  addNumericField('distance', CORE_PRODUCT_STEP_VALUE_FIELDS.distance, 0, 1);
  addRangeField(source.expressionRanges, CORE_PRODUCT_STEP_VALUE_FIELDS.expression, lanes);
  addRangeField(source.morphRanges, CORE_PRODUCT_STEP_VALUE_FIELDS.morph, lanes);
  addRangeField(source.distanceRanges, CORE_PRODUCT_STEP_VALUE_FIELDS.distance, lanes);

  if (Array.isArray(source.trigCondition)) {
    for (let laneIndex = 0; laneIndex < Math.min(source.trigCondition.length, lanes.length); laneIndex += 1) {
      const laneOut = lanes[laneIndex];
      if (!laneOut) continue;
      collectTrigConditionStepValues(source.trigCondition[laneIndex], laneOut);
    }
  }
  return lanes.map((lane) => lane.sort((left, right) => left.step - right.step || left.field - right.field));
}

export function normalizeSequencerStepValueConfigs(
  overrides: unknown,
  fallback: SequencerStepValueConfig[][],
  includeMidiNote: boolean,
): SequencerStepValueConfig[][] {
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
    ? overrides as Record<string, unknown>
    : null;
  if (!source) {
    return fallback.map((lane) => lane.map((entry) => ({ ...entry })));
  }

  const laneCount = Math.max(4, Math.min(16, fallback.length));
  const lanes: SequencerStepValueConfig[][] = Array.from({ length: laneCount }, () => []);
  const addConfig = (
    valueKey: string,
    directionKey: string,
    field: CoreProductStepValueField,
  ) => {
    const values = source[valueKey];
    if (!Array.isArray(values)) return;
    const directions = Array.isArray(source[directionKey]) ? source[directionKey] as unknown[] : [];
    while (lanes.length < Math.min(16, values.length)) lanes.push([]);
    for (let laneIndex = 0; laneIndex < Math.min(values.length, lanes.length); laneIndex += 1) {
      const laneValues = values[laneIndex];
      if (!Array.isArray(laneValues) || laneValues.length === 0) continue;
      const laneOut = lanes[laneIndex];
      if (!laneOut) continue;
      laneOut.push({
        field,
        steps: Math.max(1, Math.min(64, laneValues.length)),
        direction: normalizeSubLaneDirection(directions[laneIndex]),
      });
    }
  };

  if (includeMidiNote) {
    addConfig('pitch', 'pitchDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote);
  }
  addConfig('ratchet', 'expressionDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet);
  addConfig('expression', 'expressionDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.expression);
  addConfig('morph', 'morphDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.morph);
  addConfig('distance', 'distanceDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.distance);

  return lanes;
}

function normalizeSubLaneDirection(value: unknown): CoreProductSubLaneDirection {
  const text = String(value ?? 'forward').toLowerCase();
  if (text === 'reverse') return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
  if (text === 'pingpong') return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
  return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
}

function collectNumericStepValues(
  lane: unknown,
  field: CoreProductStepValueField,
  min: number,
  max: number,
  round: boolean,
  out: SequencerStepValueOverride[],
  laneIndex: number,
  mapValue?: (value: number, laneIndex: number) => number,
): void {
  if (!Array.isArray(lane)) return;
  for (let step = 0; step < Math.min(64, lane.length); step += 1) {
    const raw = lane[step];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    const normalized = Math.max(min, Math.min(max, round ? Math.round(raw) : raw));
    const value = mapValue ? mapValue(normalized, laneIndex) : normalized;
    out.push({ step, field, value });
  }
}

function addRangeField(
  value: unknown,
  field: CoreProductStepValueField,
  lanes: SequencerStepValueOverride[][],
): void {
  if (!Array.isArray(value)) return;
  while (lanes.length < Math.min(16, value.length)) lanes.push([]);
  for (let laneIndex = 0; laneIndex < Math.min(value.length, lanes.length); laneIndex += 1) {
    const range = value[laneIndex];
    if (!range || typeof range !== 'object') continue;
    const min = normalizedUnitValue((range as { min?: unknown }).min, Number.NaN);
    const max = normalizedUnitValue((range as { max?: unknown }).max, Number.NaN);
    if (Number.isFinite(min) && Number.isFinite(max)) lanes[laneIndex]?.push({ step: 0, field, value: Math.min(min, max), value2: Math.max(min, max), range: true });
  }
}

function collectTrigConditionStepValues(lane: unknown, out: SequencerStepValueOverride[]): void {
  if (!Array.isArray(lane)) return;
  for (let step = 0; step < Math.min(64, lane.length); step += 1) {
    const condition = lane[step];
    if (!Array.isArray(condition)) continue;
    const numerator = typeof condition[0] === 'number' && Number.isFinite(condition[0])
      ? Math.max(1, Math.min(16, Math.round(condition[0])))
      : 1;
    const denominator = typeof condition[1] === 'number' && Number.isFinite(condition[1])
      ? Math.max(1, Math.min(16, Math.round(condition[1])))
      : 1;
    out.push({
      step,
      field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition,
      value: Math.min(numerator, denominator),
      value2: denominator,
    });
  }
}
