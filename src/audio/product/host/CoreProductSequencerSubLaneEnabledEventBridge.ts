import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  type CoreProductEvent,
  type CoreProductStepValueField,
} from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';

type SubLaneEnabledResult = {
  handled: boolean;
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
};

export function applyCoreProductSequencerSubLaneEnabledEvent(options: {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
}): SubLaneEnabledResult {
  const { event, sequencer, laneIndex } = options;
  const base = { handled: false, synthSubLaneEnabled: options.synthSubLaneEnabled, drumSubLaneEnabled: options.drumSubLaneEnabled };
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep) return base;
  const flags = event.flags ?? 0;
  if ((flags & CORE_PRODUCT_STEP_TOGGLE_FLAGS.subLaneEnabledState) === 0 || (flags & CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig) === 0) return base;
  const key = subLaneKeyFromFieldIndex(event.paramId);
  if (!key) return { ...base, handled: true };
  const enabled = event.value === 1;
  if (sequencer === 'synth') {
    return { handled: true, synthSubLaneEnabled: patchLane(options.synthSubLaneEnabled, laneIndex, key, enabled), drumSubLaneEnabled: options.drumSubLaneEnabled };
  }
  return { handled: true, synthSubLaneEnabled: options.synthSubLaneEnabled, drumSubLaneEnabled: patchLane(options.drumSubLaneEnabled, laneIndex, key, enabled) };
}

function patchLane(
  states: Record<string, boolean>[],
  laneIndex: number,
  key: string,
  enabled: boolean,
): Record<string, boolean>[] {
  const laneCount = Math.max(4, Math.min(16, Math.max(states.length, laneIndex + 1)));
  const next = Array.from({ length: laneCount }, (_, index) => ({ ...(states[index] ?? {}) }));
  next[laneIndex] = { ...(next[laneIndex] ?? {}), [key]: enabled };
  return next;
}

function subLaneKeyFromFieldIndex(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  const field = (value << 8) as CoreProductStepValueField;
  switch (field) {
    case CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote:
      return 'pitch';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.expression:
      return 'expression';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.morph:
      return 'morph';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.distance:
      return 'distance';
    default:
      return null;
  }
}
