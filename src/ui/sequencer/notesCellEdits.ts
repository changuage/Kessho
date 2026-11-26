/** Pure edits of Notes cells, shared by the Notes editor and its tests. */
import { createFixedChord, createFollowChord, type ChordNote } from '../../audio/harmony/chord';
import {
  createRestNotesCell,
  notesCellNotes,
  type NotesCell,
  type NotesCellArticulation,
  type NotesCellKind,
  type SynthVariationArpPayload,
} from './synthSequenceVariations';

export const NOTES_UNDO_DEPTH = 64;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** An independent deep copy: Place never shares arrays with the Copy source. */
export function cloneNotesCell(cell: NotesCell): NotesCell {
  return JSON.parse(JSON.stringify(cell)) as NotesCell;
}

export interface NotesCellKindContext {
  /** The part's authored root: what a Harmony cell's intervals sit on. */
  root: number;
  /** One grid step in beats; the length a cell takes when it first sounds. */
  stepBeats: number;
}

/** Switch a cell's kind, carrying over what it can. Rest keeps the payload so switching back restores it. */
export function withNotesCellKind(cell: NotesCell, kind: NotesCellKind, context: NotesCellKindContext): NotesCell {
  if (kind === cell.kind) return cell;
  const gateBeats = cell.gateBeats > 0 ? cell.gateBeats : context.stepBeats;
  if (kind === 'rest') return { ...cell, kind };
  if (kind === 'harmony') {
    const intervals: ChordNote[] = cell.intervals?.length
      ? cell.intervals
      : cell.chord?.behavior === 'fixed' && cell.chord.notes.length > 0
        ? cell.chord.notes.map((note) => ({ ...note, midi: clamp(note.midi - context.root, -48, 48) }))
        : [{ midi: 0, velocity: 1 }];
    return { ...cell, kind, intervals, gateBeats };
  }
  const chord = cell.chord ?? (cell.intervals?.length
    ? createFixedChord(cell.intervals.map((note) => ({ ...note, midi: clamp(context.root + note.midi, 0, 127) })))
    : createFollowChord(0));
  return { ...cell, kind, chord, gateBeats };
}

/** Replace the notes of a Chord cell by editing its Chord. */
export function withNotesCellChord(cell: NotesCell, chord: NonNullable<NotesCell['chord']>): NotesCell {
  return { ...cell, kind: 'chord', chord };
}

/** Replace the intervals of a Harmony cell; an empty list keeps the harmony pitch itself. */
export function withNotesCellIntervals(cell: NotesCell, intervals: ChordNote[]): NotesCell {
  return { ...cell, kind: 'harmony', intervals: intervals.length > 0 ? intervals : [{ midi: 0, velocity: 1 }] };
}

/** Set a cell's articulation. Choosing Arp gives the cell its own ARP payload to edit. */
export function withNotesCellArticulation(
  cell: NotesCell,
  articulation: NotesCellArticulation,
  arpDefault: SynthVariationArpPayload,
): NotesCell {
  if (articulation === 'arp' && !cell.arp) return { ...cell, articulation, arp: JSON.parse(JSON.stringify(arpDefault)) };
  return { ...cell, articulation };
}

/** Number of sounding notes a cell holds (a Follow chord counts as its one chord). */
export function notesCellVoiceCount(cell: NotesCell): number {
  return cell.kind === 'rest' ? 0 : Math.max(1, notesCellNotes(cell).length);
}

/** Push the cells a change replaces; the stack keeps the most recent `NOTES_UNDO_DEPTH`. Idempotent for the same array. */
export function pushNotesUndo(stack: readonly NotesCell[][], cells: NotesCell[]): NotesCell[][] {
  if (stack[stack.length - 1] === cells) return stack as NotesCell[][];
  return [...stack, cells].slice(-NOTES_UNDO_DEPTH);
}

export function createRestCells(count: number): NotesCell[] {
  return Array.from({ length: count }, () => createRestNotesCell());
}
