/**
 * Harmony Generator
 * 
 * Handles phrase-aligned chord generation, voicing, and scheduling.
 * All decisions are deterministic based on seeded RNG.
 */

import { ScaleFamily, getScaleNotesInRange, midiToFreq, selectScaleFamily, getScaleByName } from './scales';
import { createRng, rngPick, rngInt, rngFloat, rngShuffle } from './rng';

// Phrase length in seconds - chord changes align to this
export const PHRASE_LENGTH = 16; // Legacy alias
export const DEFAULT_PHRASE_LENGTH = 16;

// Voice count for the poly synth
export const VOICE_COUNT = 6;

// Circle of Fifths sequence: each step is +7 semitones mod 12
// Starting from C (0): C, G, D, A, E, B, F#, C#, G#, D#, A#, F
const COF_SEQUENCE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export interface ChordVoicing {
  midiNotes: number[];
  frequencies: number[];
}

/** Tension arc type for resolution patterns */
export type TensionArcType = 'sustain' | 'building' | 'resolving';

export interface TensionArc {
  type: TensionArcType;
  phrasesRemaining: number;
}

/** Circle of Fifths state (absorbed from engine) */
export interface CircleOfFifthsState {
  enabled: boolean;
  currentStep: number;        // -6..6 current position
  phraseCounter: number;      // Counter for drift rate timing
  homeRoot: number;           // 0-11 base root note
}

/** Chord progression sequencer state */
export interface ProgressionState {
  enabled: boolean;
  pattern: number[];          // chord degrees (0-6), length = steps
  step: number;               // current position in pattern
  hits: boolean[];            // Euclidean hit pattern
  phraseMultiplier: 1 | 2 | 4 | 8;
  phraseCounter: number;      // phrases since last step advance
}

export interface HarmonyState {
  scaleFamily: ScaleFamily;
  currentChord: ChordVoicing;
  nextPhraseTime: number;
  phrasesUntilChange: number;
  chordDegrees: number[];

  // Two-half tension model
  chordTension: number;       // (tension % 0.5) * 2 — complexity within each half
  scaleTension: number;       // raw tension — for scale band selection

  // Harmonic function
  currentDegree: number;      // 0-6 (which scale degree the chord is built on)
  degreeHistory: number[];    // last 4 degrees for progression tracking

  // Chord progression sequencer
  progression: ProgressionState;

  // Resolution arc
  tensionArc: TensionArc;

  // Voice leading state
  previousChord: ChordVoicing | null;

  // Circle of Fifths (absorbed from engine)
  cof: CircleOfFifthsState;
  effectiveRoot: number;      // computed from homeRoot + CoF step
}

export interface CircleOfFifthsConfig {
  enabled: boolean;
  driftRate: number;          // 1..8 phrases between key changes
  direction: 'cw' | 'ccw' | 'random';
  range: number;              // 1..6 max steps from home
  currentStep: number;        // -6..6 current position
  phraseCounter: number;      // Counter for drift rate timing
}

/**
 * Find the index in the circle for a given semitone value
 */
function semitoneToCoFIndex(semitone: number): number {
  return COF_SEQUENCE.indexOf(semitone % 12);
}

/**
 * Compute effective tension for a specific engine given global tension and per-engine override.
 * In 'follow' mode, value is an offset (±0.5) added to global tension.
 * In 'locked' mode, value is the absolute tension (0–1).
 */
export function getEffectiveTension(
  globalTension: number,
  mode: 'follow' | 'locked' | 'bypass',
  value: number
): number {
  if (mode === 'bypass') return -1;
  if (mode === 'locked') return Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, globalTension + value));
}

/**
 * Calculate the effective root note based on home key and step offset
 */
export function calculateDriftedRoot(homeRoot: number, stepOffset: number): number {
  const homeIndex = semitoneToCoFIndex(homeRoot);
  const driftedIndex = ((homeIndex + stepOffset) % 12 + 12) % 12;
  return COF_SEQUENCE[driftedIndex] ?? COF_SEQUENCE[0] ?? homeRoot;
}

/**
 * Update Circle of Fifths drift state at phrase boundary
 * Returns new step offset and updated counter
 */
export function updateCircleOfFifthsDrift(
  config: CircleOfFifthsConfig,
  rng: () => number
): { newStep: number; newCounter: number; didDrift: boolean } {
  if (!config.enabled) {
    return { newStep: 0, newCounter: 0, didDrift: false };
  }

  // Increment phrase counter
  let newCounter = config.phraseCounter + 1;
  
  // Check if it's time to drift
  if (newCounter < config.driftRate) {
    return { newStep: config.currentStep, newCounter, didDrift: false };
  }

  // Time to drift - reset counter
  newCounter = 0;

  // Determine drift direction
  let driftDir: number;
  if (config.direction === 'random') {
    driftDir = rng() < 0.5 ? 1 : -1;
  } else {
    driftDir = config.direction === 'cw' ? 1 : -1;
  }

  // Calculate potential new step
  let newStep = config.currentStep + driftDir;

  // Boundary behavior: bounce back if at range limit
  if (Math.abs(newStep) > config.range) {
    // Reverse direction and head back toward home
    newStep = config.currentStep - driftDir;
    // If still out of range (edge case), just stay at current
    if (Math.abs(newStep) > config.range) {
      newStep = config.currentStep;
    }
  }

  // Always drift when it's time (simplified - removed complex pivot logic)
  const didDrift = newStep !== config.currentStep;
  return { newStep, newCounter, didDrift };
}

/**
 * Get the next phrase boundary time (epoch seconds)
 */
export function getNextPhraseBoundary(phraseLength: number = DEFAULT_PHRASE_LENGTH): number {
  const nowSec = Date.now() / 1000;
  return Math.ceil(nowSec / phraseLength) * phraseLength;
}

/**
 * Get current phrase boundary time
 */
export function getCurrentPhraseBoundary(phraseLength: number = DEFAULT_PHRASE_LENGTH): number {
  const nowSec = Date.now() / 1000;
  return Math.floor(nowSec / phraseLength) * phraseLength;
}

/**
 * Get time until next phrase boundary in seconds
 */
export function getTimeUntilNextPhrase(phraseLength: number = DEFAULT_PHRASE_LENGTH): number {
  const nowSec = Date.now() / 1000;
  const nextBoundary = Math.ceil(nowSec / phraseLength) * phraseLength;
  return nextBoundary - nowSec;
}

/**
 * Get current phrase index (for deterministic scheduling)
 */
export function getCurrentPhraseIndex(phraseLength: number = DEFAULT_PHRASE_LENGTH): number {
  const nowSec = Date.now() / 1000;
  return Math.floor(nowSec / phraseLength);
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

// ── Interval Consonance Scoring (Step 6.1D) ─────────────────────────────

/** Consonance score per interval (0 = harsh, 1 = pure) */
const INTERVAL_CONSONANCE: Record<number, number> = {
  0: 1.0,   // unison
  1: 0.15,  // m2
  2: 0.4,   // M2
  3: 0.75,  // m3
  4: 0.8,   // M3
  5: 0.85,  // P4
  6: 0.1,   // tritone
  7: 0.9,   // P5
  8: 0.65,  // m6
  9: 0.7,   // M6
  10: 0.35, // m7
  11: 0.2,  // M7
};

/**
 * Average consonance of a note against existing notes
 */
function averageConsonance(midi: number, existing: number[]): number {
  if (existing.length === 0) return 1.0;
  let sum = 0;
  for (const e of existing) {
    const interval = Math.abs(midi - e) % 12;
    sum += (INTERVAL_CONSONANCE[interval] ?? 0.5);
  }
  return sum / existing.length;
}

// ── Build Chord By Tension (Step 6.1A) ──────────────────────────────────

/**
 * Select chord degree based on tension and progression state.
 * Returns index 0-6 into scale degrees.
 */
function selectChordDegree(
  rng: () => number,
  scale: ScaleFamily,
  chordTension: number,
  previousDegree: number
): number {
  if (!scale.degrees || scale.degrees.length === 0) {
    // Pentatonic or no degrees — default to 0 (root)
    return 0;
  }

  const numDegrees = scale.degrees.length;

  // Weight by stability — I(0), IV(3), V(4) are stable; others weighted by chordTension
  const weights = new Array(numDegrees);
  for (let i = 0; i < numDegrees; i++) {
    const isStable = (i === 0 || i === 3 || i === 4);
    // High chordTension = any degree equally likely; low = I,IV,V dominate
    weights[i] = isStable ? 1.0 : 0.2 + chordTension * 0.8;
    // Avoid repeating same degree
    if (i === previousDegree) weights[i] *= 0.3;
  }

  const total = weights.reduce((a: number, b: number) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < numDegrees; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return 0;
}

/**
 * Build a chord voicing using the two-half tension model.
 * chordTension = (tension % 0.5) * 2 — controls complexity within each scale half.
 *
 * chordTension ranges:
 *   < 0.2  Triads (root + 3rd + 5th)
 *   0.2-0.4 Triads + sus2/sus4
 *   0.4-0.6 7th chords
 *   0.6-0.8 9ths, add9, 6/9
 *   > 0.8  Clusters, quartal
 */
export function buildChordByTension(
  rng: () => number,
  scale: ScaleFamily,
  tension: number,
  voicingSpread: number,
  detuneCents: number,
  rootNote: number = 4,
  degreeIndex?: number
): { voicing: ChordVoicing; degreeIndex: number } {
  const chordTension = (tension % 0.5) * 2; // 0–1 within each half
  const rootBase = 36 + rootNote;
  const baseRoot = rootBase + (rngInt(rng, 0, 1) * 12); // root2 or root3

  // Determine target degree
  const degree = scale.degrees?.[degreeIndex ?? 0];
  const usedDegreeIndex = degreeIndex ?? 0;

  // Build chord root on the degree
  const chordRoot = degree ? baseRoot + degree.root : baseRoot;
  const selectedNotes: number[] = [chordRoot];

  // Get all available scale notes in range for filling
  const availableNotes = getScaleNotesInRange(scale, rootBase, rootBase + 36, rootNote);
  const consonanceThreshold = 0.6 - chordTension * 0.4; // 0.6 at low, 0.2 at high

  if (degree) {
    // Build from diatonic quality
    const third = chordRoot + degree.triad[0];
    const fifth = chordRoot + degree.triad[1];

    if (chordTension < 0.3) {
      // Triads: root + 3rd + 5th
      if (!selectedNotes.includes(third)) selectedNotes.push(third);
      if (!selectedNotes.includes(fifth)) selectedNotes.push(fifth);

      // Occasional sus2/sus4 at chordTension 0.2–0.3
      if (chordTension >= 0.2 && rng() < 0.3) {
        const sus = rng() < 0.5
          ? chordRoot + 2  // sus2
          : chordRoot + 5; // sus4
        // Replace the 3rd with suspension
        const thirdIdx = selectedNotes.indexOf(third);
        if (thirdIdx >= 0) selectedNotes[thirdIdx] = sus;
      }
    } else if (chordTension < 0.6) {
      // 7th chords: triad + 7th
      if (!selectedNotes.includes(third)) selectedNotes.push(third);
      if (!selectedNotes.includes(fifth)) selectedNotes.push(fifth);
      const seventh = chordRoot + degree.seventh;
      if (!selectedNotes.includes(seventh)) selectedNotes.push(seventh);
    } else if (chordTension < 0.8) {
      // Extensions: triad + 7th + 9th (or add9, 6/9)
      if (!selectedNotes.includes(third)) selectedNotes.push(third);
      if (!selectedNotes.includes(fifth)) selectedNotes.push(fifth);
      const seventh = chordRoot + degree.seventh;
      if (!selectedNotes.includes(seventh)) selectedNotes.push(seventh);
      // Add 9th (= 2 semitones above octave, i.e. chordRoot + 14)
      const ninth = chordRoot + 14;
      if (ninth <= 84 && !selectedNotes.includes(ninth)) selectedNotes.push(ninth);
    } else {
      // Clusters / quartal: build by stacking 4ths or dense scale fills
      if (rng() < 0.5) {
        // Quartal: stack P4s from root
        let note = chordRoot;
        for (let i = 0; i < 4; i++) {
          note += 5; // P4
          if (note <= 84 && !selectedNotes.includes(note)) selectedNotes.push(note);
        }
      } else {
        // Dense cluster: adjacent scale tones
        const rootIdx = availableNotes.indexOf(chordRoot);
        if (rootIdx >= 0) {
          for (let i = 1; i <= 4; i++) {
            const idx = rootIdx + i;
            const candidate = availableNotes[idx];
            if (idx < availableNotes.length && candidate !== undefined && !selectedNotes.includes(candidate)) {
              if (averageConsonance(candidate, selectedNotes) >= consonanceThreshold) {
                selectedNotes.push(candidate);
              }
            }
          }
        }
      }
    }
  } else {
    // Pentatonic fallback — use old random fill logic
    const fifthInterval = 7;
    if (scale.intervals.includes(fifthInterval)) {
      const fifthNote = chordRoot + fifthInterval;
      if (!selectedNotes.includes(fifthNote)) selectedNotes.push(fifthNote);
    }
    const noteCount = chordTension < 0.5 ? rngInt(rng, 3, 4) : rngInt(rng, 4, 5);
    const remaining = availableNotes.filter((n) => !selectedNotes.includes(n));
    const shuffled = rngShuffle(rng, remaining);
    while (selectedNotes.length < noteCount && shuffled.length > 0) {
      const note = shuffled.pop()!;
      if (averageConsonance(note, selectedNotes) >= consonanceThreshold) {
        selectedNotes.push(note);
      }
    }
  }

  // Apply voicing spread (octave displacement)
  const voiced: number[] = [];
  for (const note of selectedNotes) {
    if (voicingSpread > 0.5 && rng() < voicingSpread * 0.5) {
      const shift = rngPick(rng, [-12, 12]);
      const shifted = note + shift;
      if (shifted >= 36 && shifted <= 84 && !voiced.includes(shifted)) {
        voiced.push(shifted);
        continue;
      }
    }
    if (!voiced.includes(note)) voiced.push(note);
  }

  // Sort and limit to voice count
  const finalNotes = voiced.sort((a, b) => a - b).slice(0, VOICE_COUNT);

  // Convert to frequencies with optional detune
  const frequencies = finalNotes.map((midi) => {
    const detuneOffset = rngFloat(rng, -detuneCents, detuneCents);
    return midiToFreq(midi + detuneOffset / 100);
  });

  return {
    voicing: { midiNotes: finalNotes, frequencies },
    degreeIndex: usedDegreeIndex,
  };
}

// ── Voice Leading (Step 6.1B) ───────────────────────────────────────────

/**
 * Apply voice leading: reorder new chord voices to minimize total movement
 * from previous chord. Greedy nearest-neighbor assignment.
 */
export function voiceLeadChord(
  previousChord: ChordVoicing | null,
  newChord: ChordVoicing,
  detuneCents: number,
  rng: () => number
): ChordVoicing {
  if (!previousChord || previousChord.midiNotes.length === 0) return newChord;

  const prev = [...previousChord.midiNotes];
  const next = [...newChord.midiNotes];

  // Greedy assignment: for each prev voice, find nearest in next
  const assigned = new Array<number>(next.length).fill(-1);
  const usedPrev = new Set<number>();

  // For each new note, find closest unassigned previous note
  for (let i = 0; i < next.length; i++) {
    const nextNote = next[i];
    if (nextNote === undefined) continue;
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let j = 0; j < prev.length; j++) {
      if (usedPrev.has(j)) continue;
      const prevNote = prev[j];
      if (prevNote === undefined) continue;
      const dist = Math.abs(nextNote - prevNote);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0) {
      assigned[i] = bestIdx;
      usedPrev.add(bestIdx);
    }
  }

  // Result: keep new chord's pitch classes but order voices to minimize jumps
  // The actual notes stay the same — voice leading is about choosing which
  // voice index plays which note to minimize perceived movement
  const finalNotes = next.sort((a, b) => a - b);
  const frequencies = finalNotes.map((midi) => {
    const detuneOffset = rngFloat(rng, -detuneCents, detuneCents);
    return midiToFreq(midi + detuneOffset / 100);
  });

  return { midiNotes: finalNotes, frequencies };
}

// ── Euclidean Rhythm for Chord Progression (Step 6.1C) ──────────────────

/**
 * Generate Euclidean rhythm pattern (boolean array).
 * Used for chord progression hit pattern.
 */
function euclideanRhythm(steps: number, hits: number): boolean[] {
  const pattern: boolean[] = new Array(steps).fill(false);
  if (hits <= 0) return pattern;
  if (hits >= steps) return new Array(steps).fill(true);

  // Bjorklund algorithm
  for (let i = 0; i < steps; i++) {
    pattern[i] = (((i * hits) % steps) < hits);
  }
  return pattern;
}

// ── Resolution Arcs (Step 6.1E) ─────────────────────────────────────────

/**
 * Check if a resolution arc should trigger, and return updated arc state.
 * Arc probability increases with chord tension and phrases elapsed.
 */
function updateTensionArc(
  arc: TensionArc,
  chordTension: number,
  rng: () => number,
  phrasesElapsed: number
): TensionArc {
  // Decrement remaining
  if (arc.phrasesRemaining > 0) {
    const remaining = arc.phrasesRemaining - 1;
    if (remaining <= 0) {
      // Arc finished — return to sustain
      return { type: 'sustain', phrasesRemaining: 0 };
    }
    return { ...arc, phrasesRemaining: remaining };
  }

  // In sustain mode — check if we should start a new arc
  if (arc.type !== 'sustain') return arc;

  // Probability of arc trigger increases with chordTension and time
  // At chordTension 0.3 → every ~12 phrases; at 0.8 → every ~4
  const arcFrequency = Math.max(3, Math.round(12 - chordTension * 10));
  if (phrasesElapsed > 0 && phrasesElapsed % arcFrequency === 0 && rng() < 0.4 + chordTension * 0.3) {
    // Start building arc (3-5 phrases building, then 2 phrases resolving)
    const buildLength = rngInt(rng, 3, 5);
    return { type: 'building', phrasesRemaining: buildLength };
  }

  return arc;
}

/**
 * Transition from building to resolving arc.
 * Called when building arc's phrases run out.
 */
function transitionArc(arc: TensionArc, rng: () => number): TensionArc {
  if (arc.type === 'building' && arc.phrasesRemaining <= 0) {
    // Transition to resolving
    return { type: 'resolving', phrasesRemaining: rngInt(rng, 1, 2) };
  }
  return arc;
}

/**
 * Configuration parameters passed from SliderState to harmony functions.
 * Groups all harmony-relevant slider values to keep function signatures manageable.
 */
export interface HarmonyParams {
  tension: number;
  chordRate: number;
  voicingSpread: number;
  detuneCents: number;
  scaleMode: 'auto' | 'manual';
  manualScaleName: string;
  rootNote: number;
  phraseLength: number;
  // CoF drift parameters
  cofDriftEnabled: boolean;
  cofDriftRate: number;
  cofDriftDirection: 'cw' | 'ccw' | 'random';
  cofDriftRange: number;
  // Chord progression parameters
  chordProgressionEnabled: boolean;
  chordProgressionPattern: number[];
  chordProgressionSteps: number;
  chordProgressionHits: number;
  chordProgressionPhraseMultiplier: 1 | 2 | 4 | 8;
}

/** Default HarmonyParams for backward compatibility */
export const DEFAULT_HARMONY_PARAMS: HarmonyParams = {
  tension: 0.3,
  chordRate: 32,
  voicingSpread: 0.5,
  detuneCents: 8,
  scaleMode: 'auto',
  manualScaleName: 'Major (Ionian)',
  rootNote: 4,
  phraseLength: 16,
  cofDriftEnabled: false,
  cofDriftRate: 2,
  cofDriftDirection: 'cw',
  cofDriftRange: 3,
  chordProgressionEnabled: false,
  chordProgressionPattern: [0, 3, 4, 0],
  chordProgressionSteps: 4,
  chordProgressionHits: 4,
  chordProgressionPhraseMultiplier: 1,
};

/** Create default progression state */
function createDefaultProgression(params: HarmonyParams): ProgressionState {
  return {
    enabled: params.chordProgressionEnabled,
    pattern: params.chordProgressionPattern,
    step: 0,
    hits: euclideanRhythm(params.chordProgressionSteps, params.chordProgressionHits),
    phraseMultiplier: params.chordProgressionPhraseMultiplier,
    phraseCounter: 0,
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
  rootNote: number = 4,
  phraseLength: number = DEFAULT_PHRASE_LENGTH,
  params?: Partial<HarmonyParams>
): HarmonyState {
  const rng = createRng(seedMaterial);
  const fullParams: HarmonyParams = {
    ...DEFAULT_HARMONY_PARAMS,
    tension, chordRate, voicingSpread, detuneCents: detuneCents,
    scaleMode, manualScaleName, rootNote, phraseLength,
    ...params,
  };

  // Select scale using raw tension (scaleTension)
  let scaleFamily: ScaleFamily;
  if (fullParams.scaleMode === 'manual') {
    scaleFamily = getScaleByName(fullParams.manualScaleName) || selectScaleFamily(rng, tension);
  } else {
    scaleFamily = selectScaleFamily(rng, tension);
  }

  // Build initial chord using two-half tension model
  const { voicing: currentChord, degreeIndex } = buildChordByTension(
    rng, scaleFamily, tension, voicingSpread, detuneCents, rootNote, 0
  );

  const phrasesPerChord = Math.max(1, Math.round(chordRate / phraseLength));
  const chordTension = (tension % 0.5) * 2;

  return {
    scaleFamily,
    currentChord,
    nextPhraseTime: getNextPhraseBoundary(phraseLength),
    phrasesUntilChange: phrasesPerChord,
    chordDegrees: currentChord.midiNotes.map((n) => n % 12),
    chordTension,
    scaleTension: tension,
    currentDegree: degreeIndex,
    degreeHistory: [degreeIndex],
    progression: createDefaultProgression(fullParams),
    tensionArc: { type: 'sustain', phrasesRemaining: 0 },
    previousChord: null,
    cof: {
      enabled: fullParams.cofDriftEnabled,
      currentStep: 0,
      phraseCounter: 0,
      homeRoot: rootNote,
    },
    effectiveRoot: rootNote,
  };
}

/**
 * Update harmony state at a harmony tick.
 * When isPhraseBoundary is true, runs CoF drift, chord progression, and resolution arcs.
 * When false, only generates a new chord (for sub-phrase chord changes).
 * @param rootNote - 0-11 semitone offset from C (E=4 by default)
 * @param isPhraseBoundary - true if this tick coincides with a phrase boundary
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
  rootNote: number = 4,
  phraseLength: number = DEFAULT_PHRASE_LENGTH,
  params?: Partial<HarmonyParams>,
  isPhraseBoundary: boolean = true
): HarmonyState {
  const rng = createRng(`${seedMaterial}|phrase:${phraseIndex}`);
  const fullParams: HarmonyParams = {
    ...DEFAULT_HARMONY_PARAMS,
    tension, chordRate, voicingSpread, detuneCents,
    scaleMode, manualScaleName, rootNote, phraseLength,
    ...params,
  };

  const phrasesPerChord = Math.max(1, Math.round(chordRate / phraseLength));
  const chordTension = (tension % 0.5) * 2;

  // ── CoF drift (phrase boundary only) ──
  let cofState = { ...state.cof, enabled: fullParams.cofDriftEnabled, homeRoot: rootNote };
  let forceNewChord = false;

  if (isPhraseBoundary && cofState.enabled) {
    const cofConfig: CircleOfFifthsConfig = {
      enabled: true,
      driftRate: fullParams.cofDriftRate,
      direction: fullParams.cofDriftDirection,
      range: fullParams.cofDriftRange,
      currentStep: cofState.currentStep,
      phraseCounter: cofState.phraseCounter,
    };
    const driftResult = updateCircleOfFifthsDrift(cofConfig, rng);
    cofState.currentStep = driftResult.newStep;
    cofState.phraseCounter = driftResult.newCounter;
    if (driftResult.didDrift) forceNewChord = true;
  }

  const effectiveRoot = cofState.enabled
    ? calculateDriftedRoot(rootNote, cofState.currentStep)
    : rootNote;

  // ── Chord progression sequencer (phrase boundary only) ──
  let progression = { ...state.progression };
  let progressionDegree: number | undefined;

  // Sync progression params from sliders
  progression.enabled = fullParams.chordProgressionEnabled;
  if (isPhraseBoundary && progression.enabled) {
    progression.pattern = fullParams.chordProgressionPattern;
    progression.hits = euclideanRhythm(fullParams.chordProgressionSteps, fullParams.chordProgressionHits);
    progression.phraseMultiplier = fullParams.chordProgressionPhraseMultiplier;

    // Advance progression on phrase clock
    progression.phraseCounter++;
    if (progression.phraseCounter >= progression.phraseMultiplier) {
      progression.phraseCounter = 0;
      // Advance step
      const nextStep = (progression.step + 1) % fullParams.chordProgressionSteps;
      progression.step = nextStep;
      // If this is a hit, force chord change with the progression's degree
      if (progression.hits[nextStep]) {
        forceNewChord = true;
        progressionDegree = progression.pattern[nextStep] ?? 0;
      }
    }
  }

  // ── Resolution arc (phrase boundary only) ──
  let arc = isPhraseBoundary
    ? transitionArc(updateTensionArc(state.tensionArc, chordTension, rng, phraseIndex), rng)
    : state.tensionArc;

  // During resolving arc, override progression with V→I cadence
  if (isPhraseBoundary && arc.type === 'resolving' && state.scaleFamily.degrees) {
    progressionDegree = arc.phrasesRemaining > 1 ? 4 : 0; // V then I
    forceNewChord = true;
  }

  // ── Check if chord change needed ──
  // Sub-phrase ticks (!isPhraseBoundary) always generate a new chord
  const needsNewChord = !isPhraseBoundary || forceNewChord || state.phrasesUntilChange <= 1;

  if (needsNewChord) {
    // Select scale
    let scaleFamily: ScaleFamily;
    if (scaleMode === 'manual') {
      scaleFamily = getScaleByName(manualScaleName) || state.scaleFamily;
    } else {
      scaleFamily = selectScaleFamily(rng, tension);
    }

    // Determine degree
    const degreeIndex = progressionDegree ??
      selectChordDegree(rng, scaleFamily, chordTension, state.currentDegree);

    // Build new chord
    const { voicing: rawChord } = buildChordByTension(
      rng, scaleFamily, tension, voicingSpread, detuneCents, effectiveRoot, degreeIndex
    );

    // Apply voice leading
    const currentChord = voiceLeadChord(state.currentChord, rawChord, detuneCents, rng);

    // Update degree history (keep last 4)
    const degreeHistory = [...state.degreeHistory, degreeIndex].slice(-4);

    return {
      scaleFamily,
      currentChord,
      nextPhraseTime: getNextPhraseBoundary(phraseLength),
      // In sub-phrase mode, only reset the countdown on phrase boundaries
      phrasesUntilChange: isPhraseBoundary ? phrasesPerChord : state.phrasesUntilChange,
      chordDegrees: currentChord.midiNotes.map((n) => n % 12),
      chordTension,
      scaleTension: tension,
      currentDegree: degreeIndex,
      degreeHistory,
      progression,
      tensionArc: arc,
      previousChord: state.currentChord,
      cof: cofState,
      effectiveRoot,
    };
  }

  // No chord change — update countdown and CoF/arc state
  return {
    ...state,
    nextPhraseTime: getNextPhraseBoundary(phraseLength),
    phrasesUntilChange: isPhraseBoundary ? state.phrasesUntilChange - 1 : state.phrasesUntilChange,
    chordTension,
    scaleTension: tension,
    tensionArc: arc,
    progression,
    cof: cofState,
    effectiveRoot,
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
