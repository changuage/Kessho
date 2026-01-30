/**
 * Harmony Generator
 * 
 * Handles phrase-aligned chord generation, voicing, and scheduling.
 * All decisions are deterministic based on seeded RNG.
 */

import { ScaleFamily, getScaleNotesInRange, midiToFreq, selectScaleFamily, getScaleByName } from './scales';
import { createRng, rngPick, rngInt, rngFloat, rngShuffle } from './rng';

// Phrase length in seconds - chord changes align to this
export const PHRASE_LENGTH = 16;

// Voice count for the poly synth
export const VOICE_COUNT = 6;

export interface ChordVoicing {
  midiNotes: number[];
  frequencies: number[];
}

export interface HarmonyState {
  scaleFamily: ScaleFamily;
  currentChord: ChordVoicing;
  nextPhraseTime: number;
  phrasesUntilChange: number;
  chordDegrees: number[];
}

/**
 * Get the next phrase boundary time (epoch seconds)
 */
export function getNextPhraseBoundary(): number {
  const nowSec = Date.now() / 1000;
  return Math.ceil(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH;
}

/**
 * Get current phrase boundary time
 */
export function getCurrentPhraseBoundary(): number {
  const nowSec = Date.now() / 1000;
  return Math.floor(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH;
}

/**
 * Get time until next phrase boundary in seconds
 */
export function getTimeUntilNextPhrase(): number {
  const nowSec = Date.now() / 1000;
  const nextBoundary = Math.ceil(nowSec / PHRASE_LENGTH) * PHRASE_LENGTH;
  return nextBoundary - nowSec;
}

/**
 * Get current phrase index (for deterministic scheduling)
 */
export function getCurrentPhraseIndex(): number {
  const nowSec = Date.now() / 1000;
  return Math.floor(nowSec / PHRASE_LENGTH);
}

/**
 * Generate a chord voicing from a scale
 * @param rootNote - 0-11 semitone offset from C (E=4 by default)
 */
export function generateChordVoicing(
  rng: () => number,
  scale: ScaleFamily,
  tension: number,
  voicingSpread: number,
  detuneCents: number,
  rootNote: number = 4 // E by default
): ChordVoicing {
  // Root at octave 2: C2=36, so root2 = 36 + rootNote
  const rootBase = 36 + rootNote; // e.g. E2 = 40 when rootNote = 4
  
  // Get available notes in playable range (root2 to root5)
  const availableNotes = getScaleNotesInRange(scale, rootBase, rootBase + 36, rootNote);

  // Number of notes in chord based on tension
  const noteCount = tension < 0.5 ? rngInt(rng, 3, 4) : rngInt(rng, 4, 5);

  // Select chord tones
  // Prefer root and fifth for stability
  const baseRoot = rootBase + (rngInt(rng, 0, 1) * 12); // root2 or root3
  const selectedNotes: number[] = [baseRoot];

  // Add fifth if in scale
  const fifthInterval = 7;
  if (scale.intervals.includes(fifthInterval)) {
    const fifthNote = baseRoot + fifthInterval;
    if (!selectedNotes.includes(fifthNote)) {
      selectedNotes.push(fifthNote);
    }
  }

  // Fill remaining voices from scale
  const remainingNotes = availableNotes.filter((n) => !selectedNotes.includes(n));
  const shuffled = rngShuffle(rng, remainingNotes);

  while (selectedNotes.length < noteCount && shuffled.length > 0) {
    const note = shuffled.pop()!;
    // Apply voicing spread - higher spread = more octave displacement
    if (voicingSpread > 0.5 && rng() < voicingSpread) {
      // Possibly shift octave up or down
      const shift = rngPick(rng, [-12, 12]);
      const shiftedNote = note + shift;
      if (shiftedNote >= 36 && shiftedNote <= 84 && !selectedNotes.includes(shiftedNote)) {
        selectedNotes.push(shiftedNote);
      } else if (!selectedNotes.includes(note)) {
        selectedNotes.push(note);
      }
    } else if (!selectedNotes.includes(note)) {
      selectedNotes.push(note);
    }
  }

  // Sort and limit to voice count
  const finalNotes = selectedNotes.sort((a, b) => a - b).slice(0, VOICE_COUNT);

  // Convert to frequencies with optional detune
  const frequencies = finalNotes.map((midi) => {
    const detuneOffset = rngFloat(rng, -detuneCents, detuneCents);
    return midiToFreq(midi + detuneOffset / 100);
  });

  return {
    midiNotes: finalNotes,
    frequencies,
  };
}

/**
 * Create initial harmony state
 * @param rootNote - 0-11 semitone offset from C (E=4 by default)
 */
export function createHarmonyState(
  seedMaterial: string,
  tension: number,
  chordRate: number,
  voicingSpread: number,
  detuneCents: number,
  scaleMode: 'auto' | 'manual',
  manualScaleName: string,
  rootNote: number = 4
): HarmonyState {
  const rng = createRng(seedMaterial);

  // Select scale
  let scaleFamily: ScaleFamily;
  if (scaleMode === 'manual') {
    scaleFamily = getScaleByName(manualScaleName) || selectScaleFamily(rng, tension);
  } else {
    scaleFamily = selectScaleFamily(rng, tension);
  }

  // Generate initial chord
  const currentChord = generateChordVoicing(rng, scaleFamily, tension, voicingSpread, detuneCents, rootNote);

  // Calculate phrases per chord change
  const phrasesPerChord = Math.max(1, Math.round(chordRate / PHRASE_LENGTH));

  return {
    scaleFamily,
    currentChord,
    nextPhraseTime: getNextPhraseBoundary(),
    phrasesUntilChange: phrasesPerChord,
    chordDegrees: currentChord.midiNotes.map((n) => n % 12),
  };
}

/**
 * Update harmony state at phrase boundary
 * @param rootNote - 0-11 semitone offset from C (E=4 by default)
 */
export function updateHarmonyState(
  state: HarmonyState,
  seedMaterial: string,
  phraseIndex: number,
  tension: number,
  chordRate: number,
  voicingSpread: number,
  detuneCents: number,
  scaleMode: 'auto' | 'manual',
  manualScaleName: string,
  rootNote: number = 4
): HarmonyState {
  // Create RNG seeded with phrase index for determinism
  const rng = createRng(`${seedMaterial}|phrase:${phraseIndex}`);

  const phrasesPerChord = Math.max(1, Math.round(chordRate / PHRASE_LENGTH));

  // Check if we need a new chord
  if (state.phrasesUntilChange <= 1) {
    // Select potentially new scale
    let scaleFamily: ScaleFamily;
    if (scaleMode === 'manual') {
      scaleFamily = getScaleByName(manualScaleName) || state.scaleFamily;
    } else {
      // In auto mode, always re-evaluate scale based on current tension
      // This ensures tension changes are reflected immediately on next chord
      scaleFamily = selectScaleFamily(rng, tension);
    }

    // Generate new chord
    const currentChord = generateChordVoicing(rng, scaleFamily, tension, voicingSpread, detuneCents, rootNote);

    return {
      scaleFamily,
      currentChord,
      nextPhraseTime: getNextPhraseBoundary(),
      phrasesUntilChange: phrasesPerChord,
      chordDegrees: currentChord.midiNotes.map((n) => n % 12),
    };
  }

  // No chord change, just update countdown
  return {
    ...state,
    nextPhraseTime: getNextPhraseBoundary(),
    phrasesUntilChange: state.phrasesUntilChange - 1,
  };
}

/**
 * Format chord degrees for display
 */
export function formatChordDegrees(midiNotes: number[]): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return midiNotes
    .map((midi) => {
      const noteName = noteNames[midi % 12];
      const octave = Math.floor(midi / 12) - 1;
      return `${noteName}${octave}`;
    })
    .join(' ');
}
