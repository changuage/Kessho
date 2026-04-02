/**
 * Shared evolve types — used by both drum and synth evolve systems.
 * Provides the evolution zone model: 0–0.5 = expression/pitch, 0.5–1.0 = also gate mutations.
 */

/** Mutation mode: 'strict' = full random resample, 'biased' = small drift with occasional jump */
export type MutationMode = 'strict' | 'biased';

/** Evolve methods available to synth and granular engines (subset of drum methods) */
export type SynthGranularEvolveMethod =
  | 'swingDrift'
  | 'probDrift'
  | 'ratchetSpray'
  | 'pitchWalk'
  | 'valueDrift'
  | 'valueScramble'
  | 'valueWiden'
  | 'subLaneDirectionFlip';

/** Result of a mutation pass */
export interface MutationResult {
  changed: boolean;
  changedParams: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// Generic sub-lane value mutation utilities
// ═══════════════════════════════════════════════════════════════════════

export type SubLaneValueType = 'continuous' | 'integer' | 'binary';

export interface SubLaneValueConfig {
  type: SubLaneValueType;
  min: number;
  max: number;
  driftScale: number;  // base drift magnitude (scaled by evolution)
}

/** Value configs for each drum sub-lane */
export const SUB_LANE_VALUE_CONFIGS: Record<string, SubLaneValueConfig> = {
  expression:  { type: 'continuous', min: 0.2, max: 1.0, driftScale: 0.08 },
  morph:       { type: 'continuous', min: 0,   max: 1.0, driftScale: 0.05 },
  distance:    { type: 'continuous', min: 0,   max: 1.0, driftScale: 0.06 },
  pitch:       { type: 'integer',    min: -12, max: 12,  driftScale: 1 },
  slice:       { type: 'integer',    min: 0,   max: 15,  driftScale: 1 },
  reverse:     { type: 'binary',     min: 0,   max: 1,   driftScale: 1 },
};

function clampVal(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Drift: nudge values randomly within their range.
 * - continuous: additive random walk scaled by evolution
 * - integer: ±1 step with probability scaled by evolution
 * - binary: probabilistic flip
 * In 'strict' mode, occasionally fully randomizes a value instead of drifting.
 */
export function mutateValueDrift(
  values: number[],
  config: SubLaneValueConfig,
  evolution: number,
  rng: () => number,
  mode: MutationMode = 'biased',
): number[] {
  return values.map(v => {
    // strict mode: 20% chance to fully randomize instead of drift
    if (mode === 'strict' && rng() < 0.2 * evolution) {
      if (config.type === 'binary') return rng() < 0.5 ? 0 : 1;
      const raw = config.min + rng() * (config.max - config.min);
      return config.type === 'integer' ? Math.round(raw) : raw;
    }
    if (config.type === 'binary') {
      return (rng() < 0.15 * evolution) ? (v === 0 ? 1 : 0) : v;
    }
    const delta = (rng() * 2 - 1) * config.driftScale * evolution;
    let result = v + delta;
    result = clampVal(result, config.min, config.max);
    if (config.type === 'integer') result = Math.round(result);
    return result;
  });
}

/**
 * Scramble: swap step values to reorder the pattern.
 * Preserves the value set, changes the sequence.
 */
export function mutateValueScramble(
  values: number[],
  swapCount: number,
  rng: () => number,
): number[] {
  const out = [...values];
  for (let s = 0; s < swapCount; s++) {
    const a = Math.floor(rng() * out.length);
    const b = Math.floor(rng() * out.length);
    if (a !== b) { const tmp = out[a]; out[a] = out[b]; out[b] = tmp; }
  }
  return out;
}

/**
 * Widen: expand values away from their center, increasing contrast/range.
 * No-op for binary values.
 */
export function mutateValueWiden(
  values: number[],
  config: SubLaneValueConfig,
  evolution: number,
  rng: () => number,
): number[] {
  if (config.type === 'binary') return values;
  const center = (config.min + config.max) / 2;
  return values.map(v => {
    // Only widen a subset of values per pass (60% chance per value)
    if (rng() > 0.6) return v;
    const expanded = center + (v - center) * (1 + evolution * 0.5);
    let result = clampVal(expanded, config.min, config.max);
    if (config.type === 'integer') result = Math.round(result);
    return result;
  });
}

/**
 * Home gravity for a values array: pull each value toward its home value.
 * Returns new array.
 */
export function gravityPullValues(
  current: number[],
  home: number[],
  config: SubLaneValueConfig,
  strength: number,
): number[] {
  return current.map((v, i) => {
    const hv = home[i] ?? v;
    if (config.type === 'binary') return hv; // snap back for binary
    let result = v + (hv - v) * strength;
    if (config.type === 'integer') result = Math.round(result);
    return result;
  });
}

/** Tension affinity per mutation method: 0 = consonant-favored, 1 = dissonant-favored */
export const METHOD_TENSION_AFFINITY: Record<string, number> = {
  // Consonant methods
  scaleDegreeWalk: 0.2,
  chordToneGravity: 0.1,
  intervalPreserve: 0.3,
  expressionBreath: 0.3,
  valueDrift: 0.3,
  swingDrift: 0.3,
  probDrift: 0.3,
  rotateDrift: 0.4,
  // Dissonant methods
  octaveDisplace: 0.6,
  contourInvert: 0.7,
  ghostNotes: 0.6,
  ratchetSpray: 0.6,
  hitDrift: 0.7,
  pitchWalk: 0.5,
  valueScramble: 0.5,
  valueWiden: 0.7,
  passingToneInject: 0.9,
  subLaneLengthDrift: 0.7,
  subLaneDirectionFlip: 0.8,
  gateMutate: 0.6,
  triggerToggle: 0.7,
};
