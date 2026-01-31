/**
 * E-Root Scale Families
 * 
 * All scales are defined as semitone offsets from E.
 * E = MIDI 40 (E2) or 52 (E3) as root.
 */

export interface ScaleFamily {
  name: string;
  intervals: readonly number[];
  tensionLevel: 'consonant' | 'color' | 'high';
  tensionValue: number; // 0-1 for sorting/selection
}

export const SCALE_FAMILIES: readonly ScaleFamily[] = [
  // Consonant - Major/Bright (tension 0 - 0.5)
  {
    name: 'E Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    tensionLevel: 'consonant',
    tensionValue: 0.0,
  },
  {
    name: 'E Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    tensionLevel: 'consonant',
    tensionValue: 0.05,
  },
  {
    name: 'E Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    tensionLevel: 'consonant',
    tensionValue: 0.2,
  },
  {
    name: 'E Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.3,
  },
  {
    name: 'E Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.4,
  },
  {
    name: 'E Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    tensionLevel: 'consonant',
    tensionValue: 0.5,
  },

  // Color/Tension (tension 0.5 - 0.8)
  {
    name: 'E Aeolian',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    tensionLevel: 'color',
    tensionValue: 0.6,
  },
  {
    name: 'E Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    tensionLevel: 'color',
    tensionValue: 0.7,
  },
  {
    name: 'E Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    tensionLevel: 'color',
    tensionValue: 0.8,
  },

  // High tension (tension 0.8 - 1.0)
  {
    name: 'E Octatonic Half-Whole',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    tensionLevel: 'high',
    tensionValue: 0.9,
  },
  {
    name: 'E Phrygian Dominant',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    tensionLevel: 'high',
    tensionValue: 1.0,
  },
] as const;

/**
 * Get scales within a tension band
 */
export function getScalesInTensionBand(tension: number): ScaleFamily[] {
  if (tension <= 0.5) {
    return SCALE_FAMILIES.filter((s) => s.tensionLevel === 'consonant');
  } else if (tension <= 0.8) {
    // Include some consonant for smooth transitions
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

  // Weight by proximity to tension value - power of 1.5 for balanced falloff
  const weights = candidates.map((s) => {
    const distance = Math.abs(s.tensionValue - tension);
    // Power 1.5 weighting: sharp enough for preference, but no single scale dominates
    const base = 1 / (distance + 0.08);
    return Math.pow(base, 1.5);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = rng() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    random -= weights[i];
    if (random <= 0) return candidates[i];
  }

  return candidates[candidates.length - 1];
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
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
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
