import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import {
  CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS,
  createCoreProductHarmonyLiveChordGestureEvents,
} from './coreProductEvents';

test('HarmonyLiveChordGesture emits one bounded header and at most eight note records', () => {
  const events = createCoreProductHarmonyLiveChordGestureEvents({
    kind: 'seq-live',
    seqId: 2,
    latched: false,
    frame: { currentNotePool: [60, 64, 67, 71, 74, 77, 81, 84, 90] } as never,
  }, 9);
  assert.equal(events.length, 9);
  assert.equal(events[0]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture);
  assert.equal(events[0]?.flags, CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.header);
  assert.equal(events[0]?.targetId, 5);
  assert.equal(events[0]?.index, 4);
  assert.equal(events[0]?.value3, 8);
  assert.equal(events[8]?.flags, CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.note);
  assert.equal(events[8]?.value, 84);
});

test('HarmonyLiveChordGesture clear is a single bounded event', () => {
  const [event] = createCoreProductHarmonyLiveChordGestureEvents(null, 10);
  assert.equal(event?.eventKind, KESSHO_PRODUCT_EVENT_IDS.HarmonyLiveChordGesture);
  assert.equal(event?.flags, CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.header | CORE_PRODUCT_HARMONY_LIVE_GESTURE_FLAGS.clear);
  assert.equal(event?.value, 2);
  assert.equal(event?.value3, 0);
});
