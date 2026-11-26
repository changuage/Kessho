import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProductArpConfig } from '../../audio/productArpeggiator';
import { createFixedChord } from '../../audio/harmony/chord';
import { createRestNotesCell, notesCellNotes, type NotesCell } from './synthSequenceVariations';
import {
  NOTES_UNDO_DEPTH,
  cloneNotesCell,
  pushNotesUndo,
  withNotesCellArticulation,
  withNotesCellKind,
} from './notesCellEdits';

const context = { root: 60, stepBeats: 0.25 };

test('Rest to Chord gives a Follow chord and the step length, and back to Rest keeps the payload', () => {
  const chord = withNotesCellKind(createRestNotesCell(), 'chord', context);
  assert.equal(chord.kind, 'chord');
  assert.equal(chord.chord?.behavior, 'follow');
  assert.equal(chord.gateBeats, 0.25);
  const rest = withNotesCellKind(chord, 'rest', context);
  assert.equal(rest.kind, 'rest');
  assert.equal(withNotesCellKind(rest, 'chord', context).chord, chord.chord);
});

test('Fixed chord to Harmony turns absolute notes into intervals from the root', () => {
  const cell: NotesCell = { kind: 'chord', chord: createFixedChord([{ midi: 60 }, { midi: 67 }]), gateBeats: 1, articulation: 'inherit' };
  const harmony = withNotesCellKind(cell, 'harmony', context);
  assert.deepEqual(notesCellNotes(harmony).map((note) => note.midi), [0, 7]);
  const back = withNotesCellKind({ ...harmony, chord: undefined }, 'chord', context);
  assert.deepEqual(notesCellNotes(back).map((note) => note.midi), [60, 67]);
});

test('choosing Arp attaches an independent arp payload', () => {
  const base = { config: defaultProductArpConfig(), spanBeats: 1 };
  const cell = withNotesCellArticulation({ kind: 'harmony', intervals: [{ midi: 0 }], gateBeats: 1, articulation: 'inherit' }, 'arp', base);
  assert.equal(cell.articulation, 'arp');
  assert.notEqual(cell.arp, base);
  assert.deepEqual(cell.arp, base);
  assert.equal(withNotesCellArticulation(cell, 'inherit', base).arp, cell.arp, 'leaving Arp keeps the payload');
});

test('Place writes an independent deep copy', () => {
  const source: NotesCell = { kind: 'chord', chord: createFixedChord([{ midi: 60 }]), gateBeats: 1, articulation: 'chord' };
  const placed = cloneNotesCell(source);
  placed.chord!.notes[0]!.midi = 72;
  assert.equal(source.chord!.notes[0]!.midi, 60);
});

test('the undo stack keeps the latest 64 entries and ignores a repeated push of the same array', () => {
  let stack: NotesCell[][] = [];
  const arrays = Array.from({ length: NOTES_UNDO_DEPTH + 10 }, () => [createRestNotesCell()]);
  for (const cells of arrays) stack = pushNotesUndo(stack, cells);
  assert.equal(stack.length, NOTES_UNDO_DEPTH);
  assert.equal(stack[0], arrays[10]);
  assert.equal(pushNotesUndo(stack, arrays[arrays.length - 1]!), stack);
});
