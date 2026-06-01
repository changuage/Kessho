import {
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  type CoreProductStepValueField,
} from '../../coreProductEvents';
import type { CoreProductSequencerLaneUiState } from '../../coreProductTelemetry';
import type { SequencerStepValueConfig } from '../../CoreProductHostSequencerAdapter';
import { coreProductStepValueConfigsFromLane } from '../../CoreProductHostSequencerUiState';

const CONFIG_VALUE_FIELDS: { key: keyof CoreProductSequencerLaneUiState; field: CoreProductStepValueField }[] = [
  { key: 'probability', field: CORE_PRODUCT_STEP_VALUE_FIELDS.probability },
  { key: 'ratchet', field: CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet },
  { key: 'trigCondition', field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition },
  { key: 'midiNote', field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote },
  { key: 'expression', field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression },
  { key: 'morph', field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph },
  { key: 'distance', field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance },
];

function laneIncludesStepValueConfig(lane: CoreProductSequencerLaneUiState): boolean {
  return typeof lane.stepValueConfigEnabledMask === 'number' ||
    Array.isArray(lane.stepValueConfigSteps) ||
    Array.isArray(lane.stepValueConfigDirections);
}

function inferCoreProductStepValueConfigsFromDenseLane(
  lane: CoreProductSequencerLaneUiState,
  includeMidiNote: boolean,
): SequencerStepValueConfig[] {
  const configs: SequencerStepValueConfig[] = [];
  for (const { key, field } of CONFIG_VALUE_FIELDS) {
    if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote && !includeMidiNote) continue;
    const values = lane[key];
    if (Array.isArray(values) && values.length > 0) {
      configs.push({ field, steps: Math.max(1, Math.min(64, values.length)), direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward });
    }
  }
  return configs;
}

export function coreProductStepValueConfigsFromLaneOrPrevious(
  lane: CoreProductSequencerLaneUiState,
  includeMidiNote: boolean,
  previous: SequencerStepValueConfig[],
  inferFromValues = false,
): SequencerStepValueConfig[] {
  const configs = coreProductStepValueConfigsFromLane(lane, includeMidiNote);
  if (configs.length > 0 || laneIncludesStepValueConfig(lane)) return configs;
  const preserved = previous.map((entry) => ({ ...entry }));
  return preserved.length > 0 || !inferFromValues ? preserved : inferCoreProductStepValueConfigsFromDenseLane(lane, includeMidiNote);
}
