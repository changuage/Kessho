import assert from 'node:assert/strict';
import test from 'node:test';
import { manualChordInversionLabel, recognizeClosestManualChord } from './harmonyManualChordIdentity';

const context = { rootMidi: 60, scaleId: 1, tension: 0.35 };

test('one-octave triads report the closest simple inversion', () => {
  const root = recognizeClosestManualChord([60, 64, 67], context);
  const first = recognizeClosestManualChord([64, 67, 72], context);
  const second = recognizeClosestManualChord([67, 72, 76], context);
  assert.equal(root?.label, 'C');
  assert.equal(root?.voicing.inversion, 0);
  assert.equal(first?.label, 'C/E');
  assert.equal(first?.voicing.inversion, 1);
  assert.equal(second?.label, 'C/G');
  assert.equal(second?.voicing.inversion, 2);
});

test('inversion labels stay concise beside the keyboard', () => {
  assert.equal(manualChordInversionLabel(null), '');
  assert.equal(manualChordInversionLabel(0), 'Root position');
  assert.equal(manualChordInversionLabel(1), '1st inversion');
  assert.equal(manualChordInversionLabel(2), '2nd inversion');
});
