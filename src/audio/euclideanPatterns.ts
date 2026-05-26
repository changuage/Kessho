export type EuclideanPatternParams = {
  steps: number;
  hits: number;
  rotation: number;
};

const SYNTH_EUCLID_DEFAULTS = [
  { steps: 16, hits: 4, rotation: 0 },
  { steps: 8, hits: 3, rotation: 1 },
  { steps: 16, hits: 2, rotation: 0 },
  { steps: 16, hits: 6, rotation: 2 },
] as const satisfies readonly EuclideanPatternParams[];

const DRUM_EUCLID_DEFAULTS = [
  { steps: 8, hits: 5, rotation: 0 },
  { steps: 16, hits: 3, rotation: 0 },
  { steps: 12, hits: 5, rotation: 0 },
  { steps: 8, hits: 3, rotation: 0 },
] as const satisfies readonly EuclideanPatternParams[];

function defaultLane(defaults: readonly EuclideanPatternParams[], laneIndex: number): EuclideanPatternParams {
  const index = Math.max(0, Math.min(defaults.length - 1, Math.trunc(laneIndex)));
  return defaults[index] ?? defaults[0]!;
}

export function defaultSynthEuclidPattern(laneIndex: number): EuclideanPatternParams {
  return defaultLane(SYNTH_EUCLID_DEFAULTS, laneIndex);
}

export function defaultDrumEuclidPattern(laneIndex: number): EuclideanPatternParams {
  return defaultLane(DRUM_EUCLID_DEFAULTS, laneIndex);
}

export const DRUM_EUCLID_PRESET_DATA: Record<string, EuclideanPatternParams> = {
  sparse: { steps: 16, hits: 1, rotation: 0 },
  dense: { steps: 8, hits: 7, rotation: 0 },
  longSparse: { steps: 32, hits: 3, rotation: 0 },
  poly3v4: { steps: 12, hits: 3, rotation: 0 },
  poly4v3: { steps: 12, hits: 4, rotation: 0 },
  poly5v4: { steps: 20, hits: 5, rotation: 0 },
  lancaran: { steps: 16, hits: 4, rotation: 0 },
  ketawang: { steps: 16, hits: 2, rotation: 0 },
  ladrang: { steps: 32, hits: 8, rotation: 0 },
  gangsaran: { steps: 8, hits: 4, rotation: 0 },
  kotekan: { steps: 8, hits: 3, rotation: 1 },
  kotekan2: { steps: 8, hits: 3, rotation: 4 },
  srepegan: { steps: 16, hits: 6, rotation: 2 },
  sampak: { steps: 8, hits: 5, rotation: 0 },
  ayak: { steps: 16, hits: 3, rotation: 4 },
  bonang: { steps: 12, hits: 5, rotation: 2 },
  tresillo: { steps: 8, hits: 3, rotation: 0 },
  cinquillo: { steps: 8, hits: 5, rotation: 0 },
  rumba: { steps: 16, hits: 5, rotation: 0 },
  bossa: { steps: 16, hits: 5, rotation: 3 },
  son: { steps: 16, hits: 7, rotation: 0 },
  shiko: { steps: 16, hits: 5, rotation: 0 },
  soukous: { steps: 12, hits: 7, rotation: 0 },
  gahu: { steps: 16, hits: 7, rotation: 0 },
  bembe: { steps: 12, hits: 7, rotation: 0 },
  clapping: { steps: 12, hits: 8, rotation: 0 },
  clappingB: { steps: 12, hits: 8, rotation: 5 },
  additive7: { steps: 7, hits: 4, rotation: 0 },
  additive11: { steps: 11, hits: 5, rotation: 0 },
  additive13: { steps: 13, hits: 5, rotation: 0 },
  reich18: { steps: 12, hits: 7, rotation: 3 },
  drumming: { steps: 8, hits: 6, rotation: 1 },
};

export function seqEuclidean(steps: number, hits: number, rotation: number): boolean[] {
  const safeSteps = Math.max(1, Math.floor(steps));
  const safeHits = Math.max(0, Math.min(Math.floor(hits), safeSteps));

  if (safeHits === 0) return new Array(safeSteps).fill(false);
  if (safeHits >= safeSteps) return new Array(safeSteps).fill(true);

  const counts: number[] = [];
  const remainders: number[] = [safeHits];
  let divisor = safeSteps - safeHits;
  let level = 0;

  while ((remainders[level] ?? 0) > 1) {
    const remainder = remainders[level] ?? 1;
    counts.push(Math.floor(divisor / remainder));
    remainders.push(divisor % remainder);
    divisor = remainder;
    level += 1;
  }
  counts.push(divisor);

  const pattern: number[] = [];
  const build = (lvl: number): void => {
    if (lvl === -1) {
      pattern.push(0);
      return;
    }
    if (lvl === -2) {
      pattern.push(1);
      return;
    }
    const count = counts[lvl] ?? 0;
    for (let i = 0; i < count; i += 1) build(lvl - 1);
    if ((remainders[lvl] ?? 0) !== 0) build(lvl - 2);
  };

  build(level);
  const rotated = new Array(safeSteps).fill(false);
  const rot = ((rotation % safeSteps) + safeSteps) % safeSteps;
  for (let i = 0; i < safeSteps; i += 1) {
    rotated[(i + rot) % safeSteps] = (pattern[i] ?? 0) === 1;
  }
  return rotated;
}

export function resolveEuclidPatternParams(
  preset: string,
  steps: number,
  hits: number,
  rotation: number,
): EuclideanPatternParams {
  if (preset === 'custom' || !DRUM_EUCLID_PRESET_DATA[preset]) {
    return { steps, hits, rotation };
  }
  const presetData = DRUM_EUCLID_PRESET_DATA[preset];
  return {
    steps: presetData.steps,
    hits: presetData.hits,
    rotation: (presetData.rotation + rotation) % presetData.steps,
  };
}

export function euclideanPatternMask(
  steps: number,
  hits: number,
  rotation: number,
): { low: number; high: number } {
  let low = 0;
  let high = 0;
  const pattern = seqEuclidean(Math.min(64, steps), hits, rotation);
  for (let step = 0; step < Math.min(pattern.length, 64); step += 1) {
    if (!pattern[step]) continue;
    if (step < 32) {
      low |= 1 << step;
    } else {
      high |= 1 << (step - 32);
    }
  }
  return { low: low >>> 0, high: high >>> 0 };
}

export function euclideanMaskHit(low: number, high: number, step: number): boolean {
  const normalizedStep = Math.max(0, Math.min(63, Math.floor(step)));
  if (normalizedStep < 32) {
    return ((low >>> 0) & (1 << normalizedStep)) !== 0;
  }
  return ((high >>> 0) & (1 << (normalizedStep - 32))) !== 0;
}
