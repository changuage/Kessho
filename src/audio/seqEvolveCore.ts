/**
 * Shared mutation engine — pure logic, no audio dependencies.
 * Provides evolution zone model, mutation helpers, tension-scaled
 * mutation method selection, chord/passing ratio, and home gravity.
 */
import type { MutationMode } from './seqEvolveTypes';
import { METHOD_TENSION_AFFINITY } from './seqEvolveTypes';
import type { LaneDirection } from './drumSeqTypes';

// ── Helpers ──

/** Clamp value to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns true with probability `p` using the given rng */
export function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

/** Add random ±delta drift */
export function drift(value: number, delta: number, rng: () => number): number {
  return value + (rng() * 2 - 1) * delta;
}

// ── Evolution zone probabilities ──

/**
 * Zone A (evolution 0–0.5): pitch/expression mutation probability.
 * Returns 0 at evolution=0, ramps to 0.35 at evolution=0.5 and stays at 0.35 above.
 */
export function zoneAProbability(evolution: number): number {
  return Math.min(evolution / 0.5, 1.0) * 0.35;
}

/**
 * Zone B (evolution 0.5–1.0): gate pattern mutation probability.
 * Returns 0 below evolution 0.5, ramps to 0.20 at evolution=1.0.
 */
export function zoneBProbability(evolution: number): number {
  if (evolution <= 0.5) return 0;
  return ((evolution - 0.5) / 0.5) * 0.20;
}

// ── Mutation value ──

/**
 * Mutate a value based on mode.
 * - 'strict': full random resample in [0, 1]
 * - 'biased': 80% small gaussian drift, 20% larger jump
 */
export function mutateValue(current: number, mode: MutationMode, rng: () => number): number {
  if (mode === 'strict') return rng();
  // Biased: mostly small drift
  if (rng() < 0.8) {
    // Small gaussian-ish drift (±0.1)
    const delta = (rng() - 0.5) * 0.2;
    return clamp(current + delta, 0, 1);
  }
  // Larger jump (within ±0.4)
  const delta = (rng() - 0.5) * 0.8;
  return clamp(current + delta, 0, 1);
}

// ── Write-head offset ──

/**
 * Auto write-head offset: slowly sweeps through 1..length-1.
 * Uses tickCount to derive a smooth oscillation.
 */
export function autoWriteOffset(playHead: number, length: number, tickCount: number): number {
  if (length <= 1) return 0;
  // Slow sine sweep: full cycle every ~64 ticks
  const phase = (tickCount % 64) / 64;
  const offset = 1 + Math.floor(Math.sin(phase * Math.PI * 2) * 0.5 * (length - 2) + (length - 2) * 0.5);
  return ((playHead + clamp(offset, 1, length - 1)) % length);
}

/**
 * Apply write-offset masking: keep mutations only at the write position,
 * restore original values at all other positions.
 * No-op when writeOffset === 0 (mutate all steps — default behavior).
 */
export function maskByWriteOffset(
  original: number[],
  mutated: number[],
  writeOffset: number | 'auto',
  currentBar: number,
): number[] {
  if (writeOffset === 0 || original.length === 0 || original.length !== mutated.length) return mutated;
  const pos = writeOffset === 'auto'
    ? autoWriteOffset(0, original.length, currentBar)
    : writeOffset % original.length;
  return mutated.map((v, i) => i === pos ? v : original[i]);
}

// ── Home gravity ──

/**
 * Apply home gravity: pull value toward home with strength inversely proportional to evolution.
 * At low evolution: strong pull (values stay close to home).
 * At high evolution: weak pull (values drift freely).
 */
export function homeGravity(
  current: number,
  home: number,
  evolution: number,
  rng: () => number
): number {
  const pullChance = 0.15 * (1.2 - evolution);
  if (!chance(rng, pullChance)) return current;
  // Blend 20-30% back toward home
  const blend = 0.2 + rng() * 0.1;
  return current + (home - current) * blend;
}

// ── Tension integration ──

/**
 * Hook A: Tension-scaled chord/passing ratio.
 * Returns the probability of choosing a chord tone (vs passing tone).
 * At tension=0: 90% chord tones. At tension=1: 50% chord tones.
 */
export function chordBias(tension: number): number {
  return 0.9 - tension * 0.4;
}

/**
 * Hook C: Select a mutation method weighted by tension affinity.
 * Low tension → consonant methods dominate. High tension → dissonant methods dominate.
 */
export function selectMutationMethod(
  enabledMethods: string[],
  tension: number,
  rng: () => number
): string | null {
  if (enabledMethods.length === 0) return null;

  const weights = enabledMethods.map(method => {
    const affinity = METHOD_TENSION_AFFINITY[method] ?? 0.5;
    return 1 / (Math.abs(affinity - tension) + 0.15);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * totalWeight;
  for (let i = 0; i < enabledMethods.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return enabledMethods[i];
  }
  return enabledMethods[enabledMethods.length - 1];
}

/**
 * Hook E: Tension-scaled chordToneGravity pull strength.
 * At tension=0: 0.5 (strong pull). At tension=1: 0.1 (weak pull).
 */
export function gravityStrength(tension: number): number {
  return 0.5 - tension * 0.4;
}

// ── Dice (one-shot regeneration) ──

/**
 * Generate a new Euclidean pattern (boolean array) for dice feature.
 * intensity (0-1) scales hit count variation: 0 = ±1 (subtle), 1 = ±4 (wild).
 */
export function generateDicePattern(
  steps: number,
  hits: number,
  rng: () => number,
  intensity: number = 1,
): boolean[] {
  const maxDelta = Math.round(1 + intensity * 3); // 1..4
  const newHits = clamp(hits + Math.round((rng() - 0.5) * 2 * maxDelta), 1, steps - 1);
  // Build Euclidean pattern
  const pattern: boolean[] = new Array(steps).fill(false);
  if (newHits >= steps) {
    pattern.fill(true);
    return pattern;
  }

  // Bjorklund algorithm
  let counts: number[][] = [];
  let remainders: number[][] = [];
  for (let i = 0; i < newHits; i++) counts.push([1]);
  for (let i = 0; i < steps - newHits; i++) remainders.push([0]);

  while (remainders.length > 1) {
    const newCounts: number[][] = [];
    const minLen = Math.min(counts.length, remainders.length);
    for (let i = 0; i < minLen; i++) {
      newCounts.push([...counts[i], ...remainders[i]]);
    }
    const leftoverCounts = counts.slice(minLen);
    const leftoverRemainders = remainders.slice(minLen);
    counts = newCounts;
    remainders = [...leftoverCounts, ...leftoverRemainders];
  }
  if (remainders.length === 1) counts.push(remainders[0]);

  const flat = counts.flat();
  // Random rotation
  const rotation = Math.floor(rng() * steps);
  for (let i = 0; i < steps; i++) {
    pattern[i] = flat[(i + rotation) % steps] === 1;
  }
  return pattern;
}

/**
 * Generate random velocity/expression values for dice.
 * intensity (0-1) controls spread: 0 = tight around 0.7, 1 = full 0.2-1.0 range.
 */
export function generateDiceValues(count: number, rng: () => number, intensity: number = 1): number[] {
  const center = 0.7;
  const spread = 0.15 + intensity * 0.35; // 0.15..0.50
  return Array.from({ length: count }, () =>
    clamp(center + (rng() - 0.5) * 2 * spread, 0.2, 1.0)
  );
}

/**
 * Blend current values toward random targets by intensity.
 * At intensity=0: returns current values unchanged.
 * At intensity=1: returns fully random targets.
 */
export function blendDiceValues(
  current: number[] | null,
  targets: number[],
  intensity: number,
): number[] {
  if (!current || current.length !== targets.length) return targets;
  return targets.map((t, i) => current[i] + (t - current[i]) * intensity);
}

// ── Tension gate ──

/**
 * Tension-biased method gate: when tension is provided, scale the base
 * probability by how well the method's affinity matches the current tension.
 * Methods whose affinity is close to the current tension fire more often.
 */
export function tensionGate(
  rng: () => number,
  methodName: string,
  baseProbability: number,
  tension?: number,
): boolean {
  if (tension === undefined) return chance(rng, baseProbability);
  const affinity = METHOD_TENSION_AFFINITY[methodName] ?? 0.5;
  const match = 1 - Math.abs(tension - affinity); // 0..1, higher = better fit
  return chance(rng, baseProbability * (0.3 + 0.7 * match));
}

// ── Direction helpers ──

/** Pick a random direction that isn't the current one */
export function randomOtherDirection(current: LaneDirection, rng: () => number): LaneDirection {
  const dirs: LaneDirection[] = ['forward', 'reverse', 'pingpong'];
  const cur = dirs.indexOf(current);
  return dirs[(cur + 1 + Math.floor(rng() * 2)) % 3];
}

/**
 * Generate random pitch offsets within a range for dice.
 * intensity (0-1) scales the range: 0 = ±1,  1 = ±range.
 */
export function generateDicePitchOffsets(count: number, range: number, rng: () => number, intensity: number = 1): number[] {
  const effectiveRange = Math.max(1, Math.round(range * (0.25 + intensity * 0.75)));
  return Array.from({ length: count }, () =>
    Math.round((rng() - 0.5) * 2 * effectiveRange)
  );
}

/**
 * Home-biased ratchet mutation.
 * At any intensity the distribution favours single hits (home=1).
 * Higher intensity allows occasional 2x/3x/4x but the probability
 * is always skewed toward `home`.
 *
 * When the current value is above home there is an additional
 * revert-toward-home pull (60-75 % chance to step back).
 *
 * @param current  Current ratchet count (1-4)
 * @param home     Home ratchet count (typically 1)
 * @param intensity Evolution intensity (0-1)
 * @param rng      Random number generator [0,1)
 * @returns New ratchet count (1-4)
 */
export function mutateRatchetHomeBiased(
  current: number,
  home: number,
  intensity: number,
  rng: () => number,
): number {
  // If current is above home, strong pull back toward home
  if (current > home) {
    const revertChance = 0.60 + (1 - intensity) * 0.15; // 60-75%
    if (rng() < revertChance) {
      return Math.max(home, current - 1);
    }
  }

  // Weighted distribution favouring home (1x)
  // At max intensity: 1x=58%, 2x=27%, 3x=11%, 4x=4%
  // At moderate intensity (0.5): 1x≈78%, 2x≈18%, 3x≈4%, 4x≈0%
  const r = rng();
  const i2 = intensity * intensity; // quadratic scaling so high ratchets are rare
  if (r < 0.04 * i2)        return 4;
  if (r < 0.15 * i2)        return 3;
  if (r < 0.31 * intensity) return 2;
  return home;
}
