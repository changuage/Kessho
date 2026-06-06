import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepOverrideCommitEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  type CoreProductEvent,
} from '../coreProductEvents';
import {
  normalizeDrumSequencerStepOffsetOverrides,
  normalizeSequencerStepToggleOverrides,
  normalizeSequencerStepValueConfigs,
  normalizeSequencerStepValueOverrides,
  type SequencerKind,
  type SequencerStepToggleOverride,
  type SequencerStepValueConfig,
  type SequencerStepValueOverride,
} from '../CoreProductHostSequencerAdapter';

function emptyLaneState<T>(): T[][] {
  return [[], [], [], []];
}

export function createCoreProductSynthSequencerStepOverrideEvents(overrides: unknown): CoreProductEvent[] {
  const toggles = normalizeSequencerStepToggleOverrides(overrides, emptyLaneState());
  const values = normalizeSequencerStepValueOverrides(overrides, emptyLaneState(), true);
  const configs = normalizeSequencerStepValueConfigs(overrides, emptyLaneState(), true);
  return createCoreProductSequencerStepOverrideEvents('synth', toggles, values, configs);
}

export function createCoreProductDrumSequencerStepOverrideEvents(overrides: unknown): CoreProductEvent[] {
  const toggles = normalizeSequencerStepToggleOverrides(overrides, emptyLaneState());
  const values = normalizeDrumSequencerStepOffsetOverrides(overrides, emptyLaneState());
  const configs = normalizeSequencerStepValueConfigs(overrides, emptyLaneState(), true);
  return createCoreProductSequencerStepOverrideEvents(
    'drum',
    toggles,
    values,
    configs,
    CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideState,
    true,
  );
}

function createCoreProductSequencerStepOverrideEvents(
  sequencer: SequencerKind,
  toggles: SequencerStepToggleOverride[][],
  values: SequencerStepValueOverride[][],
  configs: SequencerStepValueConfig[][],
  stateFlags = 0,
  commitBatch = false,
): CoreProductEvent[] {
  const laneCount = Math.max(toggles.length, values.length, configs.length);
  const events: CoreProductEvent[] = [];

  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    events.push(withExtraFlags(createCoreProductSequencerClearStepsEvent(sequencer, laneIndex), stateFlags));
    for (const config of configs[laneIndex] ?? []) {
      events.push(createCoreProductSequencerSubLaneConfigEvent(sequencer, laneIndex, config.field, config.steps, config.direction, true, stateFlags));
    }
    for (const toggle of toggles[laneIndex] ?? []) {
      events.push(withExtraFlags(createCoreProductSequencerStepEvent(sequencer, laneIndex, toggle.step, toggle.value), stateFlags));
    }
    for (const value of values[laneIndex] ?? []) {
      events.push(createCoreProductSequencerStepValueEvent(
        sequencer,
        laneIndex,
        value.step,
        value.field,
        value.value,
        value.value2 ?? 0,
        valueFlags(value, stateFlags),
      ));
    }
  }

  if (commitBatch) {
    events.push(createCoreProductSequencerStepOverrideCommitEvent(sequencer, 0, stateFlags));
  }

  return events;
}

function valueFlags(value: SequencerStepValueOverride, stateFlags: number): number {
  let flags = stateFlags;
  if (value.range) flags |= CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue;
  if (stateFlags !== 0 && value.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote) {
    flags |= CORE_PRODUCT_STEP_TOGGLE_FLAGS.drumPitchOffsetValue;
  }
  return flags;
}

function withExtraFlags(event: CoreProductEvent, extraFlags: number): CoreProductEvent {
  return extraFlags === 0 ? event : { ...event, flags: (event.flags ?? 0) | extraFlags };
}
