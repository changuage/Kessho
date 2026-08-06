import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  deriveLiveChordMidiRange,
  getLiveChordKeyPlacement,
  getLiveChordMidiPlacement,
  liveChordBaseMidi,
  liveChordQwertyBase,
  LIVE_CHORD_BLACK_KEYS,
  LIVE_CHORD_CHROMATIC_KEYS,
  LIVE_CHORD_KEY_MAP,
  LIVE_CHORD_WHITE_KEYS,
} from './liveKeyboardGeometry';

test('shared live keyboard keeps Journey white/black geometry and scoped QWERTY map', () => {
  assert.equal(LIVE_CHORD_WHITE_KEYS.length, 7);
  assert.equal(LIVE_CHORD_BLACK_KEYS.length, 5);
  assert.equal(LIVE_CHORD_KEY_MAP.a, 0);
  assert.equal(LIVE_CHORD_KEY_MAP.j, 11);
  assert.equal(Object.keys(LIVE_CHORD_KEY_MAP).length, LIVE_CHORD_WHITE_KEYS.length + LIVE_CHORD_BLACK_KEYS.length);
  assert.equal(new Set(Object.values(LIVE_CHORD_KEY_MAP)).size, 12);
});

test('shared live keyboard places accidentals at natural-key boundaries', () => {
  assert.deepEqual(LIVE_CHORD_CHROMATIC_KEYS, [...Array(12).keys()]);
  const cSharp = getLiveChordKeyPlacement(1);
  const dSharp = getLiveChordKeyPlacement(3);
  const fSharp = getLiveChordKeyPlacement(6);
  assert.equal(cSharp.kind, 'black');
  assert.equal(dSharp.kind, 'black');
  assert.equal(fSharp.kind, 'black');
  assert.ok(Math.abs(cSharp.left + cSharp.width / 2 - 100 / 7) < 1e-9);
  assert.ok(Math.abs(dSharp.left + dSharp.width / 2 - (100 / 7) * 2) < 1e-9);
  assert.ok(Math.abs(fSharp.left + fSharp.width / 2 - (100 / 7) * 4) < 1e-9);
  assert.equal(getLiveChordKeyPlacement(0).left, 0);
  assert.ok(Math.abs(getLiveChordKeyPlacement(11).left + getLiveChordKeyPlacement(11).width - 100) < 1e-9);
});

test('shared live keyboard uses conventional MIDI octave labels', () => {
  assert.equal(liveChordBaseMidi(-1), 0);
  assert.equal(liveChordBaseMidi(4), 60);
  assert.equal(liveChordBaseMidi(8), 108);
  assert.equal(liveChordBaseMidi(9), 108);
});

test('shared live keyboard always exposes one stable octave', () => {
  const range = deriveLiveChordMidiRange([60, 64, 67], 4);
  assert.equal(range.lowMidi, 60);
  assert.equal(range.highMidi, 71);
  assert.equal(range.midis.length, 12);
  assert.equal(range.whiteKeyCount, 7);
});

test('wide voicings overlay by pitch class without widening the surface', () => {
  const range = deriveLiveChordMidiRange([48, 72], 4);
  assert.deepEqual(range.midis, Array.from({ length: 12 }, (_, index) => 60 + index));
});

test('exact MIDI placement keeps accidentals between natural keys', () => {
  const range = deriveLiveChordMidiRange([], 4);
  const c4 = getLiveChordMidiPlacement(60, range);
  const cSharp4 = getLiveChordMidiPlacement(61, range);
  assert.equal(c4.kind, 'white');
  assert.equal(cSharp4.kind, 'black');
  assert.ok(Math.abs(cSharp4.left + cSharp4.width / 2 - (c4.left + c4.width)) < 1e-9);
});

test('QWERTY anchor is the first visible note', () => {
  const lowRange = deriveLiveChordMidiRange([36, 40, 43], 3);
  const highRange = deriveLiveChordMidiRange([84, 88, 91], 6);
  for (const [range, octave] of [[lowRange, 4], [highRange, 4]] as const) {
    const base = liveChordQwertyBase(range, octave);
    assert.equal(base, range.lowMidi);
  }
});

test('held piano styling never changes key geometry', () => {
  const css = readFileSync(fileURLToPath(new URL('./liveChordKeyboard.css', import.meta.url)), 'utf8');
  const heldStart = css.indexOf('.harmony-live-key.held');
  const heldRule = css.slice(heldStart, css.indexOf('}', heldStart));
  assert.equal(heldRule.includes('transform:'), false);
  const keyStart = css.indexOf('.harmony-live-keyboard-keys > .harmony-live-key-slot > .harmony-live-key');
  const keyRule = css.slice(keyStart, css.indexOf('}', keyStart));
  assert.equal(keyRule.includes('transition:') && keyRule.includes('transform'), false);
});
