import { HARMONY_PALETTE_CAPACITY } from '../CoreProductHarmonyControl';
import { normalizeChord, type Chord } from './chord';

export type ChordPaletteSave =
  | { status: 'saved'; palette: Chord[] }
  | { status: 'duplicate' | 'full'; palette: Chord[] };

const comparable = (chord: Chord) => JSON.stringify(normalizeChord(chord));

/** Deep equality between two chords after normalization. */
export function chordsEqual(a: Chord, b: Chord): boolean {
  return comparable(a) === comparable(b);
}

/** Why Save is unavailable for this chord, or null when it can be saved. */
export function chordPaletteSaveBlock(palette: readonly Chord[], chord: Chord): string | null {
  if (palette.some((saved) => chordsEqual(saved, chord))) return 'Already in the Palette';
  if (palette.length >= HARMONY_PALETTE_CAPACITY) return `The Palette holds ${HARMONY_PALETTE_CAPACITY} chords; remove one to save another`;
  return null;
}

/** Append a copy of `chord`; duplicates and a full Palette leave it unchanged. */
export function saveChordToPalette(palette: readonly Chord[], chord: Chord): ChordPaletteSave {
  const block = chordPaletteSaveBlock(palette, chord);
  if (block) return { status: palette.length >= HARMONY_PALETTE_CAPACITY && !palette.some((saved) => chordsEqual(saved, chord)) ? 'full' : 'duplicate', palette: [...palette] };
  const copy = normalizeChord(structuredClone(chord));
  return copy ? { status: 'saved', palette: [...palette, copy] } : { status: 'duplicate', palette: [...palette] };
}

export function removeChordFromPalette(palette: readonly Chord[], index: number): Chord[] {
  return palette.filter((_, at) => at !== index);
}

/** An independent copy of a Palette chord; editing it never touches the Palette. */
export function placeChordFromPalette(palette: readonly Chord[], index: number): Chord | null {
  const chord = palette[index];
  return chord ? normalizeChord(structuredClone(chord)) : null;
}
