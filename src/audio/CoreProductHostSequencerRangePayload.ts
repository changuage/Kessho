import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductStepValueField,
} from './coreProductEvents';
import type { SequencerKind, SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';

export type CoreProductRangePayloadValue = { min: number; max: number };
export type CoreProductRangeSubLaneName = 'expression' | 'morph' | 'distance';
type CoreProductRangePayloadKey = 'expressionRanges' | 'morphRanges' | 'distanceRanges';
type CoreProductRangeSubLanePatch = {
  enabled?: boolean;
  valueMode?: 'range';
  rangeMin?: number;
  rangeMax?: number;
};

const RANGE_FIELDS: {
  field: CoreProductStepValueField;
  laneKey: CoreProductRangeSubLaneName;
  payloadKey: CoreProductRangePayloadKey;
}[] = [
  { field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, laneKey: 'expression', payloadKey: 'expressionRanges' },
  { field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph, laneKey: 'morph', payloadKey: 'morphRanges' },
  { field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance, laneKey: 'distance', payloadKey: 'distanceRanges' },
];

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function coreProductRangeForField(
  values: readonly SequencerStepValueOverride[],
  field: CoreProductStepValueField,
): CoreProductRangePayloadValue | null {
  const entry = values
    .filter((candidate) => candidate.field === field && candidate.range === true)
    .sort((left, right) => left.step - right.step)[0];
  if (!entry || !Number.isFinite(entry.value)) return null;
  const min = clampUnit(entry.value);
  const max = clampUnit(typeof entry.value2 === 'number' && Number.isFinite(entry.value2) ? entry.value2 : entry.value);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function addCoreProductRangePayload(
  payload: Record<string, unknown>,
  sequencer: SequencerKind,
  laneIndex: number,
  values: readonly SequencerStepValueOverride[],
): void {
  for (const rangeField of RANGE_FIELDS) {
    const range = coreProductRangeForField(values, rangeField.field);
    if (!range) continue;
    if (sequencer === 'synth') {
      payload[rangeField.payloadKey] = range;
    } else {
      const lanes: (CoreProductRangePayloadValue | null)[] = [null, null, null, null];
      if (laneIndex >= 0 && laneIndex < lanes.length) lanes[laneIndex] = range;
      payload[rangeField.payloadKey] = lanes;
    }
  }
}

export function applyCoreProductRangeSubLanePatch<
  T extends Partial<Record<CoreProductRangeSubLaneName, CoreProductRangeSubLanePatch>>,
>(
  patch: T,
  values: readonly SequencerStepValueOverride[],
): T {
  for (const rangeField of RANGE_FIELDS) {
    const range = coreProductRangeForField(values, rangeField.field);
    if (!range) continue;
    patch[rangeField.laneKey] = {
      ...(patch[rangeField.laneKey] ?? {}),
      enabled: true,
      valueMode: 'range',
      rangeMin: range.min,
      rangeMax: range.max,
    } as T[typeof rangeField.laneKey];
  }
  return patch;
}
