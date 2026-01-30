/**
 * Deterministic RNG System
 * 
 * Uses xmur3 for hashing and mulberry32 for PRNG.
 * NEVER use Math.random() - all randomness must flow through seeded RNG.
 */

/**
 * xmur3 hash function - creates a seed generator from a string
 * Returns a function that produces uint32 values
 */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * mulberry32 PRNG - fast, good quality 32-bit PRNG
 * Returns a function that produces values in [0, 1)
 */
export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a seeded RNG from a string
 */
export function createRng(seedMaterial: string): () => number {
  const hashFn = xmur3(seedMaterial);
  const seed = hashFn();
  return mulberry32(seed);
}

/**
 * RNG helper: get integer in range [min, max] inclusive
 */
export function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * RNG helper: get float in range [min, max]
 */
export function rngFloat(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/**
 * RNG helper: pick random element from array
 */
export function rngPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * RNG helper: shuffle array (Fisher-Yates)
 */
export function rngShuffle<T>(rng: () => number, arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * RNG helper: weighted random selection
 */
export function rngWeighted<T>(
  rng: () => number,
  items: readonly T[],
  weights: readonly number[]
): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = rng() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Get UTC bucket string for seed generation
 */
export function getUtcBucket(seedWindow: 'hour' | 'day'): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  if (seedWindow === 'day') {
    return `${year}-${month}-${day}`;
  }

  const hour = String(now.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}`;
}

/**
 * Compute deterministic seed from bucket and slider state
 */
export function computeSeed(bucket: string, sliderStateJson: string): number {
  const seedMaterial = `${bucket}|${sliderStateJson}|E_ROOT`;
  const hashFn = xmur3(seedMaterial);
  return hashFn();
}

/**
 * Pre-generate a sequence of random numbers for worklet use
 */
export function generateRandomSequence(rng: () => number, count: number): Float32Array {
  const sequence = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    sequence[i] = rng();
  }
  return sequence;
}
