/** The one authored chord value. Follow chords store intent resolved by the
 * native resolver; Fixed chords store exact notes. Nothing else defines a
 * chord shape. */
import type { CoreProductChordIntent, CoreProductChordNote } from '../coreProductSnapshotTypes';
import { DEFAULT_HARMONY_SCALE_INTERVALS, HARMONY_SCALE_INTERVALS } from './harmonyScaleIntervals';

export type ChordQuality = 'diatonic' | 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4';
export type ChordExtension = '6' | '7' | '9' | '11' | '13' | 'dominant';
export interface ChordNote {
  midi: number;
  velocity?: number;
  offset?: number;
  gate?: number;
  destination?: number;
}
export interface Chord {
  behavior: 'follow' | 'fixed';
  degree: number;
  quality: ChordQuality;
  extensions: ChordExtension[];
  voicing: { inversion: number; spread: number; register: number; bass: 'inversion' | 'root' | number };
  notes: ChordNote[];
}

export const CHORD_MAX_NOTES = 8;
const CHORD_QUALITIES: readonly ChordQuality[] = ['diatonic', 'major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4'];
/** Canonical order; the index is the native extension bit. */
const CHORD_EXTENSIONS: readonly ChordExtension[] = ['6', '7', '9', '11', '13', 'dominant'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const pc = (value: number) => ((Math.round(value) % 12) + 12) % 12;

function normalizeNote(value: unknown): ChordNote | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const midi = num(record.midi);
  if (midi === null || midi < 0 || midi > 127) return null;
  const note: ChordNote = { midi };
  const velocity = num(record.velocity);
  if (velocity !== null) note.velocity = clamp(velocity, 0, 1);
  const offset = num(record.offset);
  if (offset !== null && offset >= 0) note.offset = offset;
  const gate = num(record.gate);
  if (gate !== null && gate >= 0) note.gate = gate;
  const destination = num(record.destination);
  if (destination !== null && destination >= 0) note.destination = Math.round(destination);
  return note;
}

/** Validate and clamp an untrusted value; returns null when it is not a chord. */
export function normalizeChord(value: unknown): Chord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const voicing = record.voicing && typeof record.voicing === 'object' ? record.voicing as Record<string, unknown> : {};
  const bass = voicing.bass === 'root' ? 'root' : num(voicing.bass) !== null ? clamp(Math.round(num(voicing.bass)!), 0, 11) : 'inversion';
  const requested = Array.isArray(record.extensions) ? record.extensions : [];
  return {
    behavior: record.behavior === 'fixed' ? 'fixed' : 'follow',
    degree: clamp(Math.round(num(record.degree) ?? 0), -64, 64),
    quality: CHORD_QUALITIES.includes(record.quality as ChordQuality) ? record.quality as ChordQuality : 'diatonic',
    extensions: CHORD_EXTENSIONS.filter((extension) => requested.includes(extension)),
    voicing: {
      inversion: clamp(Math.round(num(voicing.inversion) ?? 0), 0, 7),
      spread: clamp(num(voicing.spread) ?? 0, 0, 1),
      register: clamp(Math.round(num(voicing.register) ?? 0), -3, 3),
      bass,
    },
    notes: (Array.isArray(record.notes) ? record.notes : []).map(normalizeNote).filter((n): n is ChordNote => n !== null).slice(0, CHORD_MAX_NOTES),
  };
}

/** Native KesshoProductChordIntent fields for a chord. */
export function chordIntentFields(chord: Chord): CoreProductChordIntent {
  const { bass } = chord.voicing;
  return {
    behavior: chord.behavior === 'fixed' ? 1 : 0,
    degree: chord.degree,
    quality: CHORD_QUALITIES.indexOf(chord.quality),
    extensions: chord.extensions.reduce((mask, extension) => mask | (1 << CHORD_EXTENSIONS.indexOf(extension)), 0),
    inversion: chord.voicing.inversion,
    spread: chord.voicing.spread,
    registerOctave: chord.voicing.register,
    bassMode: bass === 'inversion' ? 0 : bass === 'root' ? 1 : 2,
    bassPitchClass: typeof bass === 'number' ? bass : 0,
  };
}

/** Native KesshoProductChordNote entries. Follow chords send none: native
 * resolves them and `notes` is only a display cache. */
export function chordNoteFields(chord: Chord): CoreProductChordNote[] {
  if (chord.behavior !== 'fixed') return [];
  return chord.notes.slice(0, CHORD_MAX_NOTES).map((note) => ({
    midi: note.midi,
    velocity: note.velocity ?? 1,
    gateBeats: note.gate ?? 0,
    offsetBeats: note.offset ?? 0,
    destinationSourceId: note.destination ?? 0,
  }));
}

const PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;
const scaleOf = (scale: number) => HARMONY_SCALE_INTERVALS[Math.round(scale)] ?? DEFAULT_HARMONY_SCALE_INTERVALS;

/** Semitones above the key root of the scale step at (possibly out of range) `degree`. */
function degreeOffset(degree: number, scale: number): number {
  const intervals = scaleOf(scale);
  const octave = Math.floor(degree / intervals.length);
  return intervals[degree - octave * intervals.length]! + 12 * octave;
}

/** Pitch classes above the root for a chord's tones; mirrors the native tone table. */
function chordOffsets(degree: number, quality: ChordQuality, extensions: readonly ChordExtension[], scale: number): number[] {
  const has = (e: ChordExtension) => extensions.includes(e);
  const seventh = has('7');
  const tones: number[] = [];
  if (quality === 'diatonic') {
    const at = (steps: number) => degreeOffset(degree + steps, scale) - degreeOffset(degree, scale);
    tones.push(0, at(2), at(4));
    if (has('6')) tones.push(at(5));
    if (seventh) tones.push(has('dominant') ? 10 : at(6));
    if (has('9')) tones.push(at(8));
    if (has('11')) tones.push(at(10));
    if (has('13')) tones.push(at(12));
  } else {
    const triad = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7] }[quality];
    tones.push(...triad);
    if (has('6')) tones.push(9);
    if (seventh) tones.push(has('dominant') ? 10 : quality === 'minor' ? 10 : quality === 'diminished' ? 9 : 11);
    if (has('9')) tones.push(14);
    if (has('11')) tones.push(17);
    if (has('13')) tones.push(21);
  }
  return [...new Set(tones.map(pc))].sort((a, b) => a - b);
}

/** Display name: roman numeral plus quality for Follow, pitch names for Fixed. */
export function chordName(chord: Chord, keyRoot: number, scale: number): string {
  if (chord.behavior === 'fixed') {
    return chord.notes.map((note) => `${PITCH_NAMES[pc(note.midi)]}${Math.floor(Math.round(note.midi) / 12) - 1}`).join(' ') || 'Empty';
  }
  const intervals = scaleOf(scale);
  const octave = Math.floor(chord.degree / intervals.length);
  const index = chord.degree - octave * intervals.length;
  const offsets = chordOffsets(chord.degree, chord.quality, [], scale);
  const lower = chord.quality === 'minor' || chord.quality === 'diminished' || (chord.quality === 'diatonic' && offsets.includes(3));
  const numeral = ROMAN[index % ROMAN.length] ?? String(index + 1);
  let name = lower ? numeral.toLowerCase() : numeral;
  const diminished = chord.quality === 'diminished' || (chord.quality === 'diatonic' && offsets.includes(6) && offsets.includes(3));
  if (diminished) name += '°';
  if (chord.quality === 'augmented') name += '+';
  if (chord.quality === 'sus2' || chord.quality === 'sus4') name += chord.quality;
  const has = (e: ChordExtension) => chord.extensions.includes(e);
  if (has('6')) name += '6';
  const top = (['13', '11', '9'] as const).find(has);
  if (top) name += top;
  else if (has('7')) name += has('dominant') || lower || diminished ? '7' : 'maj7';
  const { bass } = chord.voicing;
  if (bass === 'root') name += `/${PITCH_NAMES[pc(keyRoot + degreeOffset(chord.degree, scale))]}`;
  else if (typeof bass === 'number') name += `/${PITCH_NAMES[pc(bass)]}`;
  return name;
}

const RECOGNIZED_EXTENSIONS: readonly ChordExtension[][] = [[], ['7'], ['7', 'dominant'], ['6']];

/** Nearest in-scale degree, quality and extensions whose pitch-class set equals
 * the notes'. Prefers the bass note as root, the diatonic quality, then fewer
 * extensions. Null when nothing matches exactly. */
export function recognizeChord(notes: readonly number[], keyRoot: number, scale: number): Pick<Chord, 'degree' | 'quality' | 'extensions'> | null {
  if (notes.length === 0) return null;
  const target = [...new Set(notes.map(pc))].sort((a, b) => a - b).join(',');
  const bassPc = pc(Math.min(...notes));
  const count = scaleOf(scale).length;
  let best: { score: number; result: Pick<Chord, 'degree' | 'quality' | 'extensions'> } | null = null;
  for (let degree = 0; degree < count; degree += 1) {
    const rootPc = pc(keyRoot + degreeOffset(degree, scale));
    for (const extensions of RECOGNIZED_EXTENSIONS) {
      CHORD_QUALITIES.forEach((quality, qualityIndex) => {
        const set = chordOffsets(degree, quality, extensions, scale).map((offset) => pc(rootPc + offset)).sort((a, b) => a - b).join(',');
        if (set !== target) return;
        const score = (rootPc === bassPc ? 100 : 0) - qualityIndex - extensions.length * 10;
        if (!best || score > best.score) best = { score, result: { degree, quality, extensions: [...extensions] } };
      });
    }
  }
  return (best as { result: Pick<Chord, 'degree' | 'quality' | 'extensions'> } | null)?.result ?? null;
}
