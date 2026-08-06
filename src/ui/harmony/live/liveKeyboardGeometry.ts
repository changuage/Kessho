export const LIVE_CHORD_WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11] as const;
export const LIVE_CHORD_BLACK_KEYS = [1, 3, 6, 8, 10] as const;
/** One octave in chromatic/focus order. Keep this as the source order for the shared surface. */
export const LIVE_CHORD_CHROMATIC_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const LIVE_CHORD_KEY_MAP: Readonly<Record<string, number>> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };

export type LiveChordKeyPlacement = {
  readonly kind: 'white' | 'black';
  /** Percentage from the left edge of the seven-white-key bed. */
  readonly left: number;
  /** Percentage width of the key. */
  readonly width: number;
};

export type LiveChordMidiRange = {
  readonly lowMidi: number;
  readonly highMidi: number;
  readonly midis: readonly number[];
  readonly whiteKeyCount: number;
};

const WHITE_KEY_WIDTH = 100 / LIVE_CHORD_WHITE_KEYS.length;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.58;
const BLACK_KEY_BOUNDARIES: Readonly<Record<number, number>> = {
  1: 1,
  3: 2,
  6: 4,
  8: 5,
  10: 6,
};

const WHITE_KEY_INDEX: Readonly<Record<number, number>> = Object.fromEntries(
  LIVE_CHORD_WHITE_KEYS.map((pitchClass, index) => [pitchClass, index]),
);

/** Returns the touch geometry for a chromatic pitch in the one-octave bed. */
export function getLiveChordKeyPlacement(pitchClass: number): LiveChordKeyPlacement {
  const normalizedPitch = ((Math.round(pitchClass) % 12) + 12) % 12;
  const boundary = BLACK_KEY_BOUNDARIES[normalizedPitch];
  if (boundary != null) {
    return {
      kind: 'black',
      left: boundary * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2,
      width: BLACK_KEY_WIDTH,
    };
  }
  const index = WHITE_KEY_INDEX[normalizedPitch] ?? 0;
  return { kind: 'white', left: index * WHITE_KEY_WIDTH, width: WHITE_KEY_WIDTH };
}

/** Conventional MIDI octave math: C4 is 60 and C-1 is 0. */
export function liveChordBaseMidi(octave: number): number {
  const normalizedOctave = Math.max(-1, Math.min(8, Math.round(octave)));
  return (normalizedOctave + 1) * 12;
}

function clampMidi(midi: number): number {
  return Math.max(0, Math.min(127, Math.round(midi)));
}

export function isLiveChordWhiteMidi(midi: number): boolean {
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
  return (LIVE_CHORD_WHITE_KEYS as readonly number[]).includes(pitchClass);
}

function countWhiteMidis(lowMidi: number, highMidi: number): number {
  let count = 0;
  for (let midi = lowMidi; midi <= highMidi; midi += 1) {
    if (isLiveChordWhiteMidi(midi)) count += 1;
  }
  return count;
}

/** Build the stable one-octave pitch-class surface used in every Harmony view. */
export function deriveLiveChordMidiRange(
  notes: readonly number[],
  fallbackOctave = 4,
  paddingSemitones = 1,
): LiveChordMidiRange {
  void notes;
  void paddingSemitones;
  const lowMidi = Math.min(116, liveChordBaseMidi(fallbackOctave));
  const highMidi = lowMidi + 11;
  const midis = Array.from({ length: 12 }, (_, index) => lowMidi + index);
  return {
    lowMidi,
    highMidi,
    midis,
    whiteKeyCount: LIVE_CHORD_WHITE_KEYS.length,
  };
}

/** Returns the piano placement for an exact MIDI note inside a derived range. */
export function getLiveChordMidiPlacement(midi: number, range: LiveChordMidiRange): LiveChordKeyPlacement {
  const normalizedMidi = clampMidi(midi);
  const width = 100 / Math.max(1, range.whiteKeyCount);
  const kind = isLiveChordWhiteMidi(normalizedMidi) ? 'white' : 'black';
  const whiteKeysBefore = countWhiteMidis(range.lowMidi, normalizedMidi - 1);
  if (kind === 'black') {
    const blackWidth = width * 0.58;
    return {
      kind,
      left: whiteKeysBefore * width - blackWidth / 2,
      width: blackWidth,
    };
  }
  return { kind, left: whiteKeysBefore * width, width };
}

/** QWERTY maps directly to the twelve visible notes. */
export function liveChordQwertyBase(range: LiveChordMidiRange, octave: number): number {
  void octave;
  return range.lowMidi;
}
