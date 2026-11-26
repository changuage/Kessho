import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProductPlayConfig,
  resolveProductChordChoiceIndex,
} from './productPlaySequencer';

function chordConfig(overrides: Record<string, unknown> = {}) {
  return normalizeProductPlayConfig({
    enabled: true,
    mode: 'chord',
    chord: {
      choiceLength: 3,
      steps: [{ slotId: 0 }, { slotId: 1 }, { slotId: 2 }],
      ...overrides,
    },
  });
}

test('chord choices follow audible hit ordinal and preserve 5-hit/3-choice polymeter', () => {
  const config = chordConfig();
  assert.deepEqual(
    Array.from({ length: 7 }, (_, ordinal) => config.chord.steps[resolveProductChordChoiceIndex('forward', 3, ordinal)]?.slotId),
    [0, 1, 2, 0, 1, 2, 0],
  );
});

test('reverse and pingpong traversal operate over choice length', () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, ordinal) => chordConfig({ flow: 'reverse' }).chord.steps[resolveProductChordChoiceIndex('reverse', 3, ordinal)]?.slotId), [2, 1, 0, 2, 1, 0, 2]);
  assert.deepEqual(Array.from({ length: 7 }, (_, ordinal) => chordConfig({ flow: 'pingpong' }).chord.steps[resolveProductChordChoiceIndex('pingpong', 3, ordinal)]?.slotId), [0, 1, 2, 1, 0, 1, 2]);
});

test('normalized chord cells are slot-only and expose choice length', () => {
  const normalized = normalizeProductPlayConfig({ mode: 'chord', chord: { length: 3, steps: [{ active: false, slotId: 2 }] } });
  assert.equal(normalized.chord.choiceLength, 3);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.chord.steps[0] ?? {}, 'active'), false);
});
