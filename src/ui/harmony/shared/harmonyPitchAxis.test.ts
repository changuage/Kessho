import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveHarmonyPitchAxis } from './harmonyPitchAxis';

test('pitch axis follows only visible row notes with a two-note margin', () => {
  assert.deepEqual(deriveHarmonyPitchAxis([[60, 64, 67], [62, 65, 69]]), Array.from({ length: 14 }, (_, index) => 58 + index));
});

test('pitch axis stays empty when visible rows have no notes', () => {
  assert.deepEqual(deriveHarmonyPitchAxis([[], []]), []);
});

test('pitch axis clamps safely at MIDI boundaries', () => {
  assert.deepEqual(deriveHarmonyPitchAxis([[0, 127]], 2), Array.from({ length: 128 }, (_, index) => index));
});
