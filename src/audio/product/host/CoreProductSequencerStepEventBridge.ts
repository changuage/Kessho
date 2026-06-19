import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductEvent,
  type CoreProductStepValueField,
  type CoreProductSubLaneDirection,
} from '../../coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import {
  ensureCoreProductSequencerLaneCache,
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';

type ApplyStepEventOptions = {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  cache: CoreProductSequencerCacheState;
};

const STEP_FIELD_MASK = 0xff00;

function stepIndex(event: CoreProductEvent): number | null {
  if (typeof event.paramId !== 'number' || !Number.isInteger(event.paramId)) return null;
  return event.paramId >= 0 && event.paramId <= 63 ? event.paramId : null;
}

function subLaneConfigField(event: CoreProductEvent): CoreProductStepValueField | null {
  if (typeof event.paramId !== 'number' || !Number.isInteger(event.paramId)) return null;
  const field = event.paramId << 8;
  return Object.values(CORE_PRODUCT_STEP_VALUE_FIELDS).includes(field as CoreProductStepValueField)
    ? field as CoreProductStepValueField
    : null;
}

function valueField(event: CoreProductEvent): CoreProductStepValueField {
  return ((event.flags ?? 0) & STEP_FIELD_MASK) as CoreProductStepValueField;
}

export function applyCoreProductSequencerStepEventToCache(options: ApplyStepEventOptions): boolean {
  const { event, sequencer, laneIndex, cache } = options;
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep) return false;
  ensureCoreProductSequencerLaneCache(cache, sequencer, laneIndex);
  const lane = selectCoreProductSequencerCache(cache, sequencer);
  const flags = event.flags ?? 0;

  if ((flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane) !== 0) {
    lane.toggles[laneIndex] = [];
    lane.values[laneIndex] = [];
    lane.configs[laneIndex] = [];
    return true;
  }

  if (valueField(event) === CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig) {
    const field = subLaneConfigField(event);
    if (field === null) return true;
    const current = (lane.configs[laneIndex] ?? []).filter((config) => config.field !== field);
    if (event.value !== 0) {
      current.push({
        field,
        steps: Math.max(1, Math.min(64, Math.round(Number(event.value2 ?? 1)))),
        direction: Number(event.value3 ?? 0) as CoreProductSubLaneDirection,
      });
    }
    lane.configs[laneIndex] = current.sort((left, right) => left.field - right.field);
    return true;
  }

  const index = stepIndex(event);
  if (index === null) return true;
  const field = valueField(event);
  if (field === CORE_PRODUCT_STEP_VALUE_FIELDS.trigger) {
    const current = (lane.toggles[laneIndex] ?? []).filter((toggle) => toggle.step !== index);
    current.push({ step: index, value: event.value !== 0 });
    lane.toggles[laneIndex] = current.sort((left, right) => left.step - right.step);
    return true;
  }

  const current = (lane.values[laneIndex] ?? []).filter((value) => value.step !== index || value.field !== field);
  current.push({
    step: index,
    field,
    value: Number(event.value ?? 0),
    value2: Number(event.value2 ?? 0),
    range: (flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue) !== 0,
  });
  lane.values[laneIndex] = current.sort((left, right) => left.step - right.step || left.field - right.field);
  return true;
}
