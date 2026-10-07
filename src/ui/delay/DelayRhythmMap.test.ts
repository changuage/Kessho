import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELAY_RHYTHM_MAP_FRAME_MS,
  DELAY_RHYTHM_MAP_TARGET_FPS,
  shouldDrawDelayRhythmMapFrame,
} from './DelayRhythmMap';

test('DelayRhythmMap cadence gates early high-refresh rAF callbacks', () => {
  assert.equal(DELAY_RHYTHM_MAP_TARGET_FPS, 30);
  assert.equal(shouldDrawDelayRhythmMapFrame(Number.NEGATIVE_INFINITY, 0), true);
  assert.equal(shouldDrawDelayRhythmMapFrame(0, DELAY_RHYTHM_MAP_FRAME_MS - 1), false);
  assert.equal(shouldDrawDelayRhythmMapFrame(0, DELAY_RHYTHM_MAP_FRAME_MS), true);
});
