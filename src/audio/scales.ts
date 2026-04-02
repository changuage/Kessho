/**
 * E-Root Scale Families
 * 
 * All scales are defined as semitone offsets from E.
 * E = MIDI 40 (E2) or 52 (E3) as root.
 */

/** Chord quality for diatonic chord building */
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant';

/** Diatonic chord degree definition */
export interface DiatonicDegree {
  /** Semitone interval from root (scale degree offset) */
  root: number;
  /** Chord quality on this degree */
  quality: ChordQuality;
  /** Intervals from chord root: [3rd, 5th] in semitones */
  triad: readonly [number, number];
  /** 7th interval from chord root (semitones), for extended chords */
  seventh: number;
}

export interface ScaleFamily {
  name: string;
  intervals: readonly number[];
  tensionLevel: 'consonant' | 'color' | 'high';
  tensionValue: number; // 0-1 for sorting/selection
  /** Diatonic chord degrees (I through vii). Only defined for 7-note scales. */
  degrees?: readonly DiatonicDegree[];
}

export const SCALE_FAMILIES: readonly ScaleFamily[] = [
  // Consonant scales (tension 0.00–0.50)
  {
    name: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    tensionLevel: 'consonant',
    tensionValue: 0.0,
  },
  {
    name: 'Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    tensionLevel: 'consonant',
    tensionValue: 0.08,
    degrees: [
      { root: 0, quality: 'major', triad: [4, 7], seventh: 11 },      // I
      { root: 2, quality: 'minor', triad: [3, 7], seventh: 10 },      // ii
      { root: 4, quality: 'minor', triad: [3, 7], seventh: 10 },      // iii
      { root: 5, quality: 'major', triad: [4, 7], seventh: 11 },      // IV
      { root: 7, quality: 'dominant', triad: [4, 7], seventh: 10 },   // V
      { root: 9, quality: 'minor', triad: [3, 7], seventh: 10 },      // vi
      { root: 11, quality: 'diminished', triad: [3, 6], seventh: 9 }, // vii°
    ],
  },
  {
    name: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    tensionLevel: 'consonant',
    tensionValue: 0.18,
    degrees: [
      { root: 0, quality: 'major', triad: [4, 7], seventh: 11 },      // I
      { root: 2, quality: 'dominant', triad: [4, 7], seventh: 10 },   // II
      { root: 4, quality: 'minor', triad: [3, 7], seventh: 10 },      // iii
      { root: 6, quality: 'diminished', triad: [3, 6], seventh: 9 },  // #iv°
      { root: 7, quality: 'major', triad: [4, 7], seventh: 11 },      // V
      { root: 9, quality: 'minor', triad: [3, 7], seventh: 10 },      // vi
      { root: 11, quality: 'minor', triad: [3, 7], seventh: 10 },     // vii
    ],
  },
  {
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.28,
    degrees: [
      { root: 0, quality: 'dominant', triad: [4, 7], seventh: 10 },   // I7
      { root: 2, quality: 'minor', triad: [3, 7], seventh: 10 },      // ii
      { root: 4, quality: 'diminished', triad: [3, 6], seventh: 9 },  // iii°
      { root: 5, quality: 'major', triad: [4, 7], seventh: 11 },      // IV
      { root: 7, quality: 'minor', triad: [3, 7], seventh: 10 },      // v
      { root: 9, quality: 'minor', triad: [3, 7], seventh: 10 },      // vi
      { root: 10, quality: 'major', triad: [4, 7], seventh: 11 },     // bVII
    ],
  },
  {
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.38,
  },
  {
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.48,
    degrees: [
      { root: 0, quality: 'minor', triad: [3, 7], seventh: 10 },      // i
      { root: 2, quality: 'minor', triad: [3, 7], seventh: 10 },      // ii
      { root: 3, quality: 'major', triad: [4, 7], seventh: 11 },      // bIII
      { root: 5, quality: 'dominant', triad: [4, 7], seventh: 10 },   // IV7
      { root: 7, quality: 'minor', triad: [3, 7], seventh: 10 },      // v
      { root: 9, quality: 'diminished', triad: [3, 6], seventh: 9 },  // vi°
      { root: 10, quality: 'major', triad: [4, 7], seventh: 11 },     // bVII
    ],
  },

  // Color scales (tension 0.50–0.80)
  {
    name: 'Aeolian',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    tensionLevel: 'color',
    tensionValue: 0.55,
    degrees: [
      { root: 0, quality: 'minor', triad: [3, 7], seventh: 10 },      // i
      { root: 2, quality: 'diminished', triad: [3, 6], seventh: 9 },  // ii°
      { root: 3, quality: 'major', triad: [4, 7], seventh: 11 },      // bIII
      { root: 5, quality: 'minor', triad: [3, 7], seventh: 10 },      // iv
      { root: 7, quality: 'minor', triad: [3, 7], seventh: 10 },      // v
      { root: 8, quality: 'major', triad: [4, 7], seventh: 11 },      // bVI
      { root: 10, quality: 'dominant', triad: [4, 7], seventh: 10 },  // bVII
    ],
  },
  {
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    tensionLevel: 'color',
    tensionValue: 0.65,
    degrees: [
      { root: 0, quality: 'minor', triad: [3, 7], seventh: 11 },      // i (mMaj7)
      { root: 2, quality: 'diminished', triad: [3, 6], seventh: 10 }, // ii°
      { root: 3, quality: 'augmented', triad: [4, 8], seventh: 11 },  // bIII+
      { root: 5, quality: 'minor', triad: [3, 7], seventh: 10 },      // iv
      { root: 7, quality: 'dominant', triad: [4, 7], seventh: 10 },   // V
      { root: 8, quality: 'major', triad: [4, 7], seventh: 11 },      // bVI
      { root: 11, quality: 'diminished', triad: [3, 6], seventh: 9 }, // vii°
    ],
  },
  {
    name: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    tensionLevel: 'color',
    tensionValue: 0.75,
    degrees: [
      { root: 0, quality: 'minor', triad: [3, 7], seventh: 11 },      // i (mMaj7)
      { root: 2, quality: 'minor', triad: [3, 7], seventh: 10 },      // ii
      { root: 3, quality: 'augmented', triad: [4, 8], seventh: 11 },  // bIII+
      { root: 5, quality: 'dominant', triad: [4, 7], seventh: 10 },   // IV7
      { root: 7, quality: 'dominant', triad: [4, 7], seventh: 10 },   // V7
      { root: 9, quality: 'diminished', triad: [3, 6], seventh: 10 }, // vi° (half-dim)
      { root: 11, quality: 'diminished', triad: [3, 6], seventh: 10 },// vii° (half-dim)
    ],
  },

  // High tension scales (tension 0.80–1.00)
  {
    name: 'Octatonic Half-Whole',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    tensionLevel: 'high',
    tensionValue: 0.88,
  },
  {
    name: 'Phrygian Dominant',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    tensionLevel: 'high',
    tensionValue: 0.95,
    degrees: [
      { root: 0, quality: 'dominant', triad: [4, 7], seventh: 10 },   // I
      { root: 1, quality: 'major', triad: [4, 7], seventh: 11 },      // bII
      { root: 4, quality: 'minor', triad: [3, 7], seventh: 10 },      // iii
      { root: 5, quality: 'minor', triad: [3, 7], seventh: 10 },      // iv
      { root: 7, quality: 'diminished', triad: [3, 6], seventh: 9 },  // v°
      { root: 8, quality: 'major', triad: [4, 7], seventh: 11 },      // bVI
      { root: 10, quality: 'minor', triad: [3, 7], seventh: 10 },     // bvii
    ],
  },
] as const;

/**
 * Get scales within a tension band
 * 0.00–0.50: Consonant only
 * 0.50–0.80: Color + consonant
 * 0.80–1.00: High tension + color
 */
export function getScalesInTensionBand(tension: number): ScaleFamily[] {
  if (tension <= 0.50) {
    return SCALE_FAMILIES.filter((s) => s.tensionLevel === 'consonant');
  } else if (tension <= 0.80) {
    return SCALE_FAMILIES.filter(
      (s) => s.tensionLevel === 'consonant' || s.tensionLevel === 'color'
    );
  } else {
    return SCALE_FAMILIES.filter(
      (s) => s.tensionLevel === 'color' || s.tensionLevel === 'high'
    );
  }
}

/**
 * Select a scale family based on tension using seeded RNG
 */
export function selectScaleFamily(
  rng: () => number,
  tension: number
): ScaleFamily {
  const candidates = getScalesInTensionBand(tension);

  // Weight by proximity to tension value using power 1.5 for stronger falloff
  // At distance=0: weight ≈ 89 (strongest)
  // At distance=0.1: weight ≈ 10.5 (much weaker)
  // Gives ~75% combined for Maj Pent + Major at tension 0
  const weights = candidates.map((s) => {
    const distance = Math.abs(s.tensionValue - tension);
    return Math.pow(1 / (distance + 0.05), 1.5);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = rng() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    random -= weights[i] ?? 0;
    const candidate = candidates[i];
    if (random <= 0 && candidate) return candidate;
  }

  const fallback = candidates[candidates.length - 1] ?? SCALE_FAMILIES[0];
  if (!fallback) {
    throw new Error('No scale families available');
  }
  return fallback;
}

/**
 * Get scale family by name
 */
export function getScaleByName(name: string): ScaleFamily | undefined {
  return SCALE_FAMILIES.find((s) => s.name === name);
}

/**
 * Convert scale interval to MIDI note
 * E2 = 40, E3 = 52
 */
export function intervalToMidi(interval: number, octave: number = 2): number {
  const E_BASE = 40; // E2
  return E_BASE + (octave - 2) * 12 + interval;
}

/**
 * MIDI note to frequency
 */
/** A4 tuning reference — 432 Hz (matching prototype) */
export const TUNING_A4 = 432;

export function midiToFreq(midi: number): number {
  return TUNING_A4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Get all MIDI notes in scale within a range
 * @param rootNote - 0-11 semitone offset from C (E=4 by default)
 */
export function getScaleNotesInRange(
  scale: ScaleFamily,
  lowMidi: number,
  highMidi: number,
  rootNote: number = 4 // E by default
): number[] {
  const notes: number[] = [];
  // Root at octave 2: C2=36, so root2 = 36 + rootNote
  const ROOT_BASE = 36 + rootNote; // e.g. E2 = 40 when rootNote = 4

  for (let octave = 0; octave < 8; octave++) {
    for (const interval of scale.intervals) {
      const midi = ROOT_BASE + octave * 12 + interval;
      if (midi >= lowMidi && midi <= highMidi) {
        notes.push(midi);
      }
    }
  }

  return notes.sort((a, b) => a - b);
}
