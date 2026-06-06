import {
  CORE_PRODUCT_HOME_CAPTURE_FLAGS,
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import type { LaneDirection } from '../../sequencerLaneDirection';

export function applyCoreProductSequencerHomeCaptureEvent(options: {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  capture: (
    sequencer: SequencerKind,
    laneIndex: number,
    force: boolean,
    requireContent: boolean,
    pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null,
  ) => void;
}): boolean {
  const { event, sequencer, laneIndex } = options;
  const flags = event.flags ?? 0;
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep) return false;
  if ((flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.homeCaptureState) === 0) return false;
  const valueFlags = typeof event.value === 'number' && Number.isFinite(event.value) ? Math.trunc(event.value) : 0;
  options.capture(
    sequencer,
    laneIndex,
    (valueFlags & CORE_PRODUCT_HOME_CAPTURE_FLAGS.force) !== 0,
    (valueFlags & CORE_PRODUCT_HOME_CAPTURE_FLAGS.requireContent) !== 0,
    decodePitchState(event, valueFlags),
  );
  return true;
}

function decodePitchState(
  event: CoreProductEvent,
  valueFlags: number,
): { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null {
  if ((valueFlags & CORE_PRODUCT_HOME_CAPTURE_FLAGS.hasPitchState) === 0) return null;
  const state: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } = {};
  if (typeof event.value2 === 'number' && Number.isFinite(event.value2) && event.value2 > 0) {
    state.steps = Math.max(1, Math.min(64, Math.round(event.value2)));
  }
  const direction = decodeDirection(event.value3);
  if (direction) state.direction = direction;
  if ((valueFlags & CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantizeSet) !== 0) {
    state.scaleQuantize = (valueFlags & CORE_PRODUCT_HOME_CAPTURE_FLAGS.pitchScaleQuantize) !== 0;
  }
  return state;
}

function decodeDirection(value: unknown): LaneDirection | null {
  if (value === CORE_PRODUCT_SUBLANE_DIRECTIONS.forward) return 'forward';
  if (value === CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse) return 'reverse';
  if (value === CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong) return 'pingpong';
  return null;
}
