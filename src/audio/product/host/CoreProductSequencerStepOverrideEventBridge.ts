import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import type { CoreProductSequencerCacheState } from './CoreProductSequencerCacheBridge';
import { applyCoreProductSequencerStepEventToCache } from './CoreProductSequencerStepEventBridge';

type ApplyDrumStepOverrideEventResult = {
  handled: boolean;
  committed: boolean;
};

const DRUM_STEP_OVERRIDE_FIELD_MASK = 0xff00;

export function applyCoreProductDrumSequencerStepOverrideEvent(options: {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  cache: CoreProductSequencerCacheState;
  drumBaseMidi: (laneIndex: number) => number;
}): ApplyDrumStepOverrideEventResult {
  const { event, sequencer, laneIndex } = options;
  const flags = event.flags ?? 0;
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep) return { handled: false, committed: false };
  if ((flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideState) === 0) return { handled: false, committed: false };
  if (sequencer !== 'drum') return { handled: true, committed: false };
  if ((flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideCommit) !== 0) return { handled: true, committed: true };

  const cacheEvent = isDrumPitchOffsetValueEvent(event)
    ? drumPitchOffsetEventToMidiEvent(event, options.drumBaseMidi(laneIndex))
    : stripOverrideStateFlags(event);
  applyCoreProductSequencerStepEventToCache({ event: cacheEvent, sequencer, laneIndex, cache: options.cache });
  return { handled: true, committed: false };
}

function isDrumPitchOffsetValueEvent(event: CoreProductEvent): boolean {
  const flags = event.flags ?? 0;
  return (flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.drumPitchOffsetValue) !== 0 &&
    (flags & DRUM_STEP_OVERRIDE_FIELD_MASK) === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote;
}

function drumPitchOffsetEventToMidiEvent(event: CoreProductEvent, baseMidi: number): CoreProductEvent {
  const rawOffset = typeof event.value === 'number' && Number.isFinite(event.value) ? event.value : 0;
  const offset = Math.max(-24, Math.min(24, rawOffset));
  return {
    ...stripOverrideStateFlags(event),
    value: baseMidi + offset,
  };
}

function stripOverrideStateFlags(event: CoreProductEvent): CoreProductEvent {
  return {
    ...event,
    flags: (event.flags ?? 0) &
      ~CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideState &
      ~CORE_PRODUCT_STEP_TOGGLE_FLAGS.drumPitchOffsetValue,
  };
}
