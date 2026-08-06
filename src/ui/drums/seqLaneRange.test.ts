import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSeqLaneRange,
  seqLaneRangeFromPercent,
  seqLaneRangeToPercent,
} from './seqLaneRange';
import { createRafCoalescedEmitter } from '../sliderSystem/useRafCoalescedEmitter';

test('SeqLane ranges are clamped and ordered before persistence callbacks', () => {
  assert.deepEqual(normalizeSeqLaneRange(0.9, 0.2), { min: 0.2, max: 0.9 });
  assert.deepEqual(normalizeSeqLaneRange(-1, 2), { min: 0, max: 1 });
  assert.deepEqual(normalizeSeqLaneRange(Number.NaN, 0.5), { min: 0, max: 0.5 });
});

test('SeqLane range conversion round-trips normalized endpoints', () => {
  const authored = { min: 0.25, max: 0.75 };
  assert.deepEqual(seqLaneRangeToPercent(authored), { min: 25, max: 75 });
  assert.deepEqual(seqLaneRangeFromPercent({ min: 75, max: 25 }), authored);

  // A collapsed authored range is valid (and relies on the adapter's
  // minRangeGap={0} primitive configuration), so it must not be widened.
  const collapsed = { min: 0.5, max: 0.5 };
  assert.deepEqual(seqLaneRangeFromPercent(seqLaneRangeToPercent(collapsed)), collapsed);
});

test('range pointer updates coalesce to one callback per frame and flush on release', () => {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const emitted: Array<{ min: number; max: number }> = [];
  const emitter = createRafCoalescedEmitter(
    (range: { min: number; max: number }) => emitted.push(range),
    (callback) => {
      const id = nextFrame++;
      callbacks.set(id, callback);
      return id;
    },
    (id) => callbacks.delete(id),
  );

  emitter.schedule({ min: 20, max: 80 });
  emitter.schedule({ min: 22, max: 78 });
  assert.equal(emitted.length, 0);
  callbacks.get(1)?.(0);
  assert.deepEqual(emitted, [{ min: 22, max: 78 }]);

  emitter.schedule({ min: 30, max: 70 });
  emitter.flush({ min: 31, max: 69 });
  assert.deepEqual(emitted, [
    { min: 22, max: 78 },
    { min: 31, max: 69 },
  ]);
});
