import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  createCoreProductSequencerSubLaneConfigEvent,
  type CoreProductEvent,
  type CoreProductStepValueField,
} from '../coreProductEvents';
import {
  normalizeSubLaneEnabledStates,
  type SequencerKind,
} from '../CoreProductHostSequencerAdapter';

const SUB_LANE_FIELDS: ReadonlyArray<readonly [string, CoreProductStepValueField]> = Object.freeze([
  ['pitch', CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote],
  ['expression', CORE_PRODUCT_STEP_VALUE_FIELDS.expression],
  ['morph', CORE_PRODUCT_STEP_VALUE_FIELDS.morph],
  ['distance', CORE_PRODUCT_STEP_VALUE_FIELDS.distance],
  ['nudge', CORE_PRODUCT_STEP_VALUE_FIELDS.nudge],
] as const);

export function createCoreProductSequencerSubLaneEnabledEvents(
  sequencer: SequencerKind,
  states: unknown,
): CoreProductEvent[] {
  const normalized = normalizeSubLaneEnabledStates(states);
  const events: CoreProductEvent[] = [];
  for (let laneIndex = 0; laneIndex < normalized.length; laneIndex += 1) {
    const state = normalized[laneIndex] ?? {};
    for (const [key, field] of SUB_LANE_FIELDS) {
      events.push(createCoreProductSequencerSubLaneConfigEvent(
        sequencer,
        laneIndex,
        field,
        1,
        CORE_PRODUCT_SUBLANE_DIRECTIONS.forward,
        state[key] === true,
        CORE_PRODUCT_STEP_TOGGLE_FLAGS.subLaneEnabledState,
      ));
    }
  }
  return events;
}
