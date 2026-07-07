import { CORE_PRODUCT_SUBLANE_DIRECTIONS, CORE_PRODUCT_STEP_VALUE_FIELDS, type CoreProductStepValueField, type CoreProductSubLaneDirection } from './coreProductEvents';
import type { CoreProductSequencerLaneUiState } from './coreProductTelemetry';
import type { SequencerStepValueConfig, SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';
import { coreProductSynthMidiToUiPitch } from './CoreProductHostSynthPitch';
import { addCoreProductRangePayload, applyCoreProductRangeSubLanePatch } from './CoreProductHostSequencerRangePayload';

type LaneDirectionName = 'forward' | 'reverse' | 'pingpong';
type SubLaneName = 'pitch' | 'expression' | 'morph' | 'distance' | 'nudge';
type SubLanePatch = Partial<Record<SubLaneName, { enabled?: boolean; steps?: number; direction?: LaneDirectionName; valueMode?: 'range'; rangeMin?: number; rangeMax?: number }>>;
type MaskKey =
  | 'probabilityOverrideSetLow' | 'probabilityOverrideSetHigh'
  | 'ratchetOverrideSetLow' | 'ratchetOverrideSetHigh'
  | 'trigConditionOverrideSetLow' | 'trigConditionOverrideSetHigh'
  | 'midiNoteOverrideSetLow' | 'midiNoteOverrideSetHigh'
  | 'expressionOverrideSetLow' | 'expressionOverrideSetHigh'
  | 'morphOverrideSetLow' | 'morphOverrideSetHigh'
  | 'distanceOverrideSetLow' | 'distanceOverrideSetHigh'
  | 'nudgeOverrideSetLow' | 'nudgeOverrideSetHigh'
  | 'expressionRangeSetLow' | 'expressionRangeSetHigh'
  | 'morphRangeSetLow' | 'morphRangeSetHigh'
  | 'distanceRangeSetLow' | 'distanceRangeSetHigh';

const VALUE_FIELDS = [
  { key: 'probability', field: CORE_PRODUCT_STEP_VALUE_FIELDS.probability, low: 'probabilityOverrideSetLow', high: 'probabilityOverrideSetHigh', min: 0, max: 1 },
  { key: 'ratchet', field: CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, low: 'ratchetOverrideSetLow', high: 'ratchetOverrideSetHigh', min: 1, max: 8, round: true },
  { key: 'midiNote', field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, low: 'midiNoteOverrideSetLow', high: 'midiNoteOverrideSetHigh', min: 0, max: 127 },
  { key: 'expression', field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, low: 'expressionOverrideSetLow', high: 'expressionOverrideSetHigh', min: 0, max: 1, rangeLow: 'expressionRangeSetLow', rangeHigh: 'expressionRangeSetHigh', rangeMaxKey: 'expressionRangeMaxes' },
  { key: 'morph', field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph, low: 'morphOverrideSetLow', high: 'morphOverrideSetHigh', min: 0, max: 1, rangeLow: 'morphRangeSetLow', rangeHigh: 'morphRangeSetHigh', rangeMaxKey: 'morphRangeMaxes' },
  { key: 'distance', field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance, low: 'distanceOverrideSetLow', high: 'distanceOverrideSetHigh', min: 0, max: 1, rangeLow: 'distanceRangeSetLow', rangeHigh: 'distanceRangeSetHigh', rangeMaxKey: 'distanceRangeMaxes' },
  { key: 'nudge', field: CORE_PRODUCT_STEP_VALUE_FIELDS.nudge, low: 'nudgeOverrideSetLow', high: 'nudgeOverrideSetHigh', min: -1, max: 1 },
] as const;

const SUB_LANE_FIELDS = [
  { name: 'pitch', key: 'pitchDirection', field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote },
  { name: 'expression', key: 'expressionDirection', field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression },
  { name: 'morph', key: 'morphDirection', field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph },
  { name: 'distance', key: 'distanceDirection', field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance },
  { name: 'nudge', key: 'nudgeDirection', field: CORE_PRODUCT_STEP_VALUE_FIELDS.nudge },
] as const;

function stepFieldId(field: CoreProductStepValueField): number {
  const numeric = Number(field);
  return numeric >= 256 ? numeric >> 8 : numeric;
}

function laneNumber(lane: CoreProductSequencerLaneUiState, key: MaskKey): number | undefined {
  const value = (lane as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value >>> 0 : undefined;
}

function hasExplicitMask(lane: CoreProductSequencerLaneUiState, lowKey: MaskKey, highKey: MaskKey): boolean {
  return laneNumber(lane, lowKey) !== undefined || laneNumber(lane, highKey) !== undefined;
}

function maskHas(low: number, high: number, step: number): boolean {
  return step < 32 ? (low & (1 << step)) !== 0 : (high & (1 << (step - 32))) !== 0;
}

function fieldHasStep(lane: CoreProductSequencerLaneUiState, lowKey: MaskKey, highKey: MaskKey, step: number): boolean {
  if (!hasExplicitMask(lane, lowKey, highKey)) return true;
  return maskHas(laneNumber(lane, lowKey) ?? 0, laneNumber(lane, highKey) ?? 0, step);
}

function clamp(value: number, min: number, max: number, round = false): number {
  const numeric = round ? Math.round(value) : value;
  return Math.max(min, Math.min(max, numeric));
}

export function coreProductStepValueOverridesFromLane(
  lane: CoreProductSequencerLaneUiState,
  includeMidiNote: boolean,
  includeDenseValues = false,
): SequencerStepValueOverride[] {
  const out: SequencerStepValueOverride[] = [];
  for (const config of VALUE_FIELDS) {
    if (config.key === 'midiNote' && !includeMidiNote) continue;
    const values = lane[config.key];
    if (!Array.isArray(values)) continue;
    for (let step = 0; step < Math.min(values.length, 64); step += 1) {
      const value = values[step];
      if (typeof value === 'number' && Number.isFinite(value) && (includeDenseValues || fieldHasStep(lane, config.low, config.high, step))) {
        const normalized = clamp(value, config.min, config.max, 'round' in config && config.round === true);
        if ('rangeLow' in config && hasExplicitMask(lane, config.rangeLow, config.rangeHigh) && fieldHasStep(lane, config.rangeLow, config.rangeHigh, step)) {
          const maxes = lane[config.rangeMaxKey];
          const maxValue = Array.isArray(maxes) ? maxes[step] : undefined;
          if (typeof maxValue === 'number' && Number.isFinite(maxValue)) {
            const normalizedMax = clamp(maxValue, config.min, config.max);
            out.push({ step, field: config.field, value: Math.min(normalized, normalizedMax), value2: Math.max(normalized, normalizedMax), range: true });
            continue;
          }
        }
        out.push({ step, field: config.field, value: normalized });
      }
    }
  }
  if (Array.isArray(lane.trigCondition)) {
    for (let step = 0; step < Math.min(lane.trigCondition.length, 64); step += 1) {
      const value = lane.trigCondition[step];
      if (Array.isArray(value) && fieldHasStep(lane, 'trigConditionOverrideSetLow', 'trigConditionOverrideSetHigh', step)) {
        out.push({ step, field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition, value: value[0] ?? 1, value2: value[1] ?? 1 });
      }
    }
  }
  return out.sort((left, right) => left.step - right.step || left.field - right.field);
}

function normalizedDirection(value: unknown): CoreProductSubLaneDirection {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
  if (numeric === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
  if (numeric === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
  return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
}

function directionName(direction: CoreProductSubLaneDirection): LaneDirectionName {
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return 'reverse';
  if (direction === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return 'pingpong';
  return 'forward';
}

export function coreProductStepValueConfigsFromLane(
  lane: CoreProductSequencerLaneUiState,
  includeMidiNote: boolean,
): SequencerStepValueConfig[] {
  const enabledMask = lane.stepValueConfigEnabledMask ?? 0;
  const steps = lane.stepValueConfigSteps ?? [];
  const directions = lane.stepValueConfigDirections ?? [];
  const out: SequencerStepValueConfig[] = [];
  for (const field of Object.values(CORE_PRODUCT_STEP_VALUE_FIELDS) as CoreProductStepValueField[]) {
    if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig || field === CORE_PRODUCT_STEP_VALUE_FIELDS.playNote) continue;
    if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && !includeMidiNote) continue;
    const fieldId = stepFieldId(field);
    if ((enabledMask & (1 << fieldId)) === 0) continue;
    const stepCount = clamp(Number(steps[fieldId] ?? 0), 1, 64, true);
    out.push({ field, steps: stepCount, direction: normalizedDirection(directions[fieldId]) });
  }
  return out;
}

function laneArray<T>(value: T[] | null | undefined, laneIndex: number, includeEmpty: boolean): (T[] | null)[] {
  const lanes: (T[] | null)[] = [null, null, null, null];
  if (laneIndex < lanes.length) lanes[laneIndex] = Array.isArray(value) ? value : includeEmpty ? [] : null;
  return lanes;
}

function subLanePatch(lane: CoreProductSequencerLaneUiState, includeMidiNote: boolean, valueOverrides = coreProductStepValueOverridesFromLane(lane, includeMidiNote), includeEmpty = false): SubLanePatch | undefined {
  const patch: SubLanePatch = {};
  const configs = coreProductStepValueConfigsFromLane(lane, includeMidiNote);
  for (const entry of SUB_LANE_FIELDS) {
    if (entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && !includeMidiNote) continue;
    const config = configs.find((candidate) => candidate.field === entry.field);
    if (config) patch[entry.name] = { enabled: true, steps: config.steps, direction: directionName(config.direction) };
    else if (includeEmpty) patch[entry.name] = { enabled: false, steps: 1, direction: 'forward' };
  }
  applyCoreProductRangeSubLanePatch(patch, valueOverrides);
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function directionPayloads(lane: CoreProductSequencerLaneUiState, includeMidiNote: boolean): Record<string, LaneDirectionName> {
  const out: Record<string, LaneDirectionName> = {};
  const configs = coreProductStepValueConfigsFromLane(lane, includeMidiNote);
  for (const entry of SUB_LANE_FIELDS) {
    if (entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && !includeMidiNote) continue;
    const config = configs.find((candidate) => candidate.field === entry.field);
    if (config) out[entry.key] = directionName(config.direction);
  }
  return out;
}

export function coreProductSynthEvolvePayloadFromLane(
  lane: CoreProductSequencerLaneUiState,
  baseMidi: number,
  includeEmpty: boolean,
  pitchSettings?: unknown,
  laneIndex = 0,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { triggerToggles: lane.triggerToggles, swing: lane.swing };
  const valueOverrides = coreProductStepValueOverridesFromLane(lane, true);
  const pitch = Array.isArray(lane.midiNote) ? coreProductSynthMidiToUiPitch(lane.midiNote, pitchSettings, laneIndex, baseMidi) : null;
  for (const [key, values] of Object.entries({ pitch, expression: lane.expression, morph: lane.morph, distance: lane.distance, nudge: lane.nudge, probability: lane.probability, ratchet: lane.ratchet, trigCondition: lane.trigCondition })) {
    if (Array.isArray(values) || includeEmpty) payload[key] = Array.isArray(values) ? values : [];
  }
  addCoreProductRangePayload(payload, 'synth', laneIndex, valueOverrides);
  Object.assign(payload, directionPayloads(lane, true));
  const states = subLanePatch(lane, true, valueOverrides, includeEmpty);
  if (states) payload.subLaneStates = states;
  return payload;
}

export function coreProductDrumEvolvePayloadFromLane(
  lane: CoreProductSequencerLaneUiState,
  laneIndex: number,
  baseMidi: number,
  includeEmpty: boolean,
): Record<string, unknown> {
  const triggerToggles = [new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>()];
  if (laneIndex < triggerToggles.length) triggerToggles[laneIndex] = new Map(lane.triggerToggles);
  const valueOverrides = coreProductStepValueOverridesFromLane(lane, true);
  const pitch = Array.isArray(lane.midiNote) ? lane.midiNote.map((value) => Math.round(value - baseMidi)) : null;
  const payload: Record<string, unknown> = {
    triggerToggles,
    swing: lane.swing,
    probability: laneArray(lane.probability, laneIndex, includeEmpty),
    ratchet: laneArray(lane.ratchet, laneIndex, includeEmpty),
    trigCondition: laneArray(lane.trigCondition, laneIndex, includeEmpty),
    expression: laneArray(lane.expression, laneIndex, includeEmpty),
    pitch: laneArray(pitch, laneIndex, includeEmpty),
    morph: laneArray(lane.morph, laneIndex, includeEmpty),
    distance: laneArray(lane.distance, laneIndex, includeEmpty),
    nudge: laneArray(lane.nudge, laneIndex, includeEmpty),
  };
  addCoreProductRangePayload(payload, 'drum', laneIndex, valueOverrides);
  for (const [key, direction] of Object.entries(directionPayloads(lane, true))) payload[key] = laneArray([direction], laneIndex, false).map((values) => values?.[0] ?? null);
  const states = subLanePatch(lane, true, valueOverrides, includeEmpty);
  if (states) payload.subLaneStates = states;
  return payload;
}
