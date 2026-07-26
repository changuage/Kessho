import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_CHORD_BLACK_KEYS, LIVE_CHORD_KEY_MAP, LIVE_CHORD_WHITE_KEYS } from './liveKeyboardGeometry';

test('shared live keyboard keeps Journey white/black geometry and scoped QWERTY map', () => {
  assert.equal(LIVE_CHORD_WHITE_KEYS.length, 7);
  assert.equal(LIVE_CHORD_BLACK_KEYS.length, 5);
  assert.equal(LIVE_CHORD_KEY_MAP.a, 0);
  assert.equal(LIVE_CHORD_KEY_MAP.j, 11);
  assert.equal(Object.keys(LIVE_CHORD_KEY_MAP).length, LIVE_CHORD_WHITE_KEYS.length + LIVE_CHORD_BLACK_KEYS.length);
  assert.equal(new Set(Object.values(LIVE_CHORD_KEY_MAP)).size, 12);
});
