import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultHarmonyIntent } from '../CoreProductHarmonyControl';
import type { HarmonyIntent } from './harmonyTypes';
import { recognizeHarmonyCandidates, recognizeHarmonyIntentFromCandidates } from './chordRecognition';
import { editSharedChordExactNotes } from './harmonyChordAdapters';

const recognize = (notes: number[], previousIntent: HarmonyIntent | null = defaultHarmonyIntent('slot'), maxCandidates = 5) =>
  recognizeHarmonyCandidates({ midiNotes: notes, previousIntent, rootMidi: 60, scaleId: 1, tension: 0.35, maxCandidates });

test('recognizes Cmaj7 independent of octave, order, inversion, and open voicing', () => {
  const root = recognize([60, 64, 67, 71]);
  assert.equal(root[0]?.label, 'Cmaj7');
  assert.equal(root[0]?.quality, 'maj7');
  assert.equal(root[0]?.voicing.inversion, 0);

  const inversion = recognize([64, 67, 71, 72]);
  assert.equal(inversion[0]?.label, 'Cmaj7/E');
  assert.equal(inversion[0]?.voicing.inversion, 1);
  assert.equal(inversion[0]?.voicing.bassMidi, 64);
  assert.equal(inversion[0]?.intent.inversion, 1);
  assert.equal(inversion[0]?.intent.bassNote, 64);

  const open = recognize([60, 67, 76, 83]);
  assert.equal(open[0]?.label, 'Cmaj7');
  assert.equal(open[0]?.voicing.spread, 23);
  assert.equal(recognize([83, 60, 76, 67])[0]?.label, 'Cmaj7');
});

test('reports fifth omission and doublings without changing exact notes', () => {
  const omitted = recognize([60, 64, 71]);
  assert.equal(omitted[0]?.label, 'Cmaj7');
  assert.deepEqual(omitted[0]?.voicing.omittedChordTones, ['fifth']);

  const doubled = recognize([60, 72, 64, 67]);
  assert.equal(doubled[0]?.label, 'C');
  assert.deepEqual(doubled[0]?.voicing.doubledPitchClasses, [0]);
});

test('returns ranked alternatives and keeps an unsupported cluster Custom', () => {
  const candidates = recognize([60, 61, 66], null, 4);
  assert.ok(candidates.length > 1);
  assert.equal(recognizeHarmonyIntentFromCandidates({ midiNotes: [60, 61, 66], rootMidi: 60, scaleId: 1, tension: 0.35 }).quality, 'custom');
});

test('maps recognized roots through the selected non-major scale family', () => {
  const previous = { ...defaultHarmonyIntent('slot'), rootMode: 'degree' as const };
  const candidates = recognizeHarmonyCandidates({
    midiNotes: [63, 67, 70],
    previousIntent: previous,
    rootMidi: 60,
    scaleId: 2,
    tension: 0.35,
  });
  assert.equal(candidates[0]?.label, 'Eb');
  assert.equal(candidates[0]?.intent.rootMode, 'degree');
  assert.equal(candidates[0]?.intent.degree, 2);
});

test('confirmed semantic intent survives an exact edit and exposes mismatch choices', () => {
  const intent = { ...defaultHarmonyIntent('slot'), rootMode: 'absolute' as const, rootNote: 0, quality: 'maj' as const };
  const exact = [60, 64, 67];
  const chord = {
    intent,
    intentSource: 'confirmed' as const,
    exactMidiNotes: exact.slice(),
    recognizedLabel: 'C',
    playbackBehavior: 'auto' as const,
    capturedContext: { rootMidi: 60, rootMidiAnchor: 60, scaleId: 1 },
  };
  const editedNotes = [62, 66, 69];
  const edited = editSharedChordExactNotes(chord, editedNotes);
  assert.deepEqual(editedNotes, [62, 66, 69]);
  assert.equal(edited.intent, intent);
  assert.equal(edited.recognitionMismatch, true);
  assert.ok((edited.recognitionCandidates?.length ?? 0) > 1);
});
