import assert from 'node:assert/strict';
import test from 'node:test';
import { convertLegacyPadParamArray, convertLegacyPadPitchFields, formatPadPitch } from './padPitch';

test('Pad pitch formatting preserves semitone and cent intent', () => {
  assert.equal(formatPadPitch(12), '+12 st');
  assert.equal(formatPadPitch(7), '+7 st');
  assert.equal(formatPadPitch(0.08), '+8 ct');
  assert.equal(formatPadPitch(12.08), '+12 st +8 ct');
  assert.equal(formatPadPitch(-12.14), '-12 st -14 ct');
  assert.equal(formatPadPitch(0), '0 st');
});

test('legacy Pad fields convert once and disappear', () => {
  const data: Record<string, unknown> = {
    padOscAOctave: -1,
    padOscADetune: 7,
    padOscBOctave: 0,
    padOscBDetune: -14,
  };
  assert.equal(convertLegacyPadPitchFields(data), true);
  assert.equal(data.padOscAPitch, -11.93);
  assert.equal(data.padOscBPitch, -0.14);
  assert.equal('padOscAOctave' in data, false);
  assert.equal('padOscBDetune' in data, false);
  assert.equal(convertLegacyPadPitchFields(data), false);
});

test('legacy exact Pad array maps to 58 canonical values', () => {
  const old = new Array<number>(52).fill(0);
  old[0] = 2;
  old[1] = -1;
  old[2] = 7;
  old[5] = 0;
  old[6] = -14;
  old[16] = 0.4;
  old[51] = 0.72;
  const converted = convertLegacyPadParamArray(old);
  assert.equal(converted.length, 58);
  assert.equal(converted[1], -11.93);
  assert.equal(converted[5], -0.14);
  assert.equal(converted[56], 2);
  assert.equal(converted[57], 0.72);
});
