import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chordIntentFields,
  chordName,
  chordNoteFields,
  chordDegreeLabels,
  normalizeChord,
  previewChordNotes,
  recognizeChord,
  type Chord,
} from './chord';

const follow = (patch: Partial<Chord> = {}): Chord => normalizeChord({ behavior: 'follow', ...patch })!;

test('normalizeChord rejects non-objects and clamps fields', () => {
  assert.equal(normalizeChord(null), null);
  assert.equal(normalizeChord('C'), null);
  const chord = normalizeChord({
    behavior: 'fixed', degree: 99.6, quality: 'bogus', extensions: ['9', 'nope', '7', '9'],
    voicing: { inversion: 12, spread: 3, register: -9, bass: 15 },
    notes: [{ midi: 60, velocity: 2, offset: -1, gate: 0.5, destination: 3.4 }, { midi: 200 }, { midi: 'x' }],
  })!;
  assert.equal(chord.behavior, 'fixed');
  assert.equal(chord.degree, 64);
  assert.equal(chord.quality, 'diatonic');
  assert.deepEqual(chord.extensions, ['7', '9']);
  assert.deepEqual(chord.voicing, { inversion: 7, spread: 1, register: -3, bass: 11 });
  assert.deepEqual(chord.notes, [{ midi: 60, velocity: 1, gate: 0.5, destination: 3 }]);
});

test('normalizeChord caps notes at eight and defaults to a follow tonic triad', () => {
  const chord = normalizeChord({ notes: Array.from({ length: 12 }, (_, i) => ({ midi: 40 + i })) })!;
  assert.equal(chord.notes.length, 8);
  const empty = normalizeChord({})!;
  assert.deepEqual(chordIntentFields(empty), {
    behavior: 0, degree: 0, quality: 0, extensions: 0, inversion: 0, spread: 0, registerOctave: 0, bassMode: 0, bassPitchClass: 0,
  });
  assert.deepEqual(empty.voicing.bass, 'inversion');
});

test('chordIntentFields maps the native layout', () => {
  const fields = chordIntentFields(follow({
    degree: -2, quality: 'sus4', extensions: ['7', 'dominant', '13'],
    voicing: { inversion: 2, spread: 0.5, register: 1, bass: 4 },
  }));
  assert.deepEqual(fields, {
    behavior: 0, degree: -2, quality: 6, extensions: 2 | 32 | 16, inversion: 2, spread: 0.5, registerOctave: 1, bassMode: 2, bassPitchClass: 4,
  });
  assert.equal(chordIntentFields(follow({ voicing: { inversion: 0, spread: 0, register: 0, bass: 'root' } })).bassMode, 1);
});

test('chordNoteFields sends Fixed notes only', () => {
  const fixed = normalizeChord({ behavior: 'fixed', notes: [{ midi: 60 }, { midi: 64, velocity: 0.5, offset: 0.25, gate: 1, destination: 7 }] })!;
  assert.deepEqual(chordNoteFields(fixed), [
    { midi: 60, velocity: 1, gateBeats: 0, offsetBeats: 0, destinationSourceId: 0 },
    { midi: 64, velocity: 0.5, gateBeats: 1, offsetBeats: 0.25, destinationSourceId: 7 },
  ]);
  assert.deepEqual(chordNoteFields(follow({ notes: [{ midi: 60 }] })), []);
});

test('chordName shows roman numerals for Follow and pitch names for Fixed', () => {
  assert.equal(chordName(follow(), 0, 1), 'I');
  assert.equal(chordName(follow({ degree: 1 }), 0, 1), 'ii');
  assert.equal(chordName(follow({ degree: 6 }), 0, 1), 'vii°');
  assert.equal(chordName(follow({ degree: 4, quality: 'major', extensions: ['7', 'dominant'] }), 0, 1), 'V7');
  assert.equal(chordName(follow({ quality: 'major', extensions: ['7'] }), 0, 1), 'Imaj7');
  assert.equal(chordName(follow({ degree: 5, quality: 'minor', extensions: ['9'] }), 0, 1), 'vi9');
  assert.equal(chordName(follow({ quality: 'sus2' }), 0, 1), 'Isus2');
  assert.equal(chordName(normalizeChord({ behavior: 'fixed', notes: [{ midi: 60 }, { midi: 64 }, { midi: 67 }] })!, 0, 1), 'C4 E4 G4');
});

test('recognizeChord finds the nearest in-scale degree and quality', () => {
  assert.deepEqual(recognizeChord([60, 64, 67], 0, 1), { degree: 0, quality: 'diatonic', extensions: [] });
  assert.deepEqual(recognizeChord([57, 60, 64], 0, 1), { degree: 5, quality: 'diatonic', extensions: [] });
  assert.deepEqual(recognizeChord([55, 59, 62, 65], 0, 1), { degree: 4, quality: 'diatonic', extensions: ['7'] });
  assert.deepEqual(recognizeChord([60, 64, 67, 70], 0, 1), { degree: 0, quality: 'diatonic', extensions: ['7', 'dominant'] });
  assert.deepEqual(recognizeChord([55, 60, 62], 0, 1), { degree: 4, quality: 'sus4', extensions: [] });
  assert.equal(recognizeChord([60, 61, 62], 0, 1), null);
  assert.equal(recognizeChord([], 0, 1), null);
});

test('previewChordNotes voices a Follow chord in the key and round-trips through recognizeChord', () => {
  // C major (scale 1): the V chord is G B D.
  const fifth = follow({ degree: 4 });
  assert.deepEqual(previewChordNotes(fifth, 0, 1), [55, 59, 62]);
  assert.deepEqual(recognizeChord(previewChordNotes(fifth, 0, 1), 0, 1), { degree: 4, quality: 'diatonic', extensions: [] });
  const inverted = follow({ degree: 0, voicing: { inversion: 1, spread: 0, register: 1, bass: 'inversion' } });
  assert.deepEqual(previewChordNotes(inverted, 0, 1), [64, 67, 72]);
  const fixed = normalizeChord({ behavior: 'fixed', notes: [{ midi: 60 }, { midi: 64 }] })!;
  assert.deepEqual(previewChordNotes(fixed, 0, 1), [60, 64]);
  assert.deepEqual(chordDegreeLabels(1), ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']);
});
