/**
 * Euclidean rhythm generator (Bjorklund's algorithm).
 * Extracted from drumSequencer.ts for shared use across drum, pad, and lead sequencers.
 */

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
    for (let i = 0; i < count; i++) build(lvl - 1);
    if ((remainders[lvl] ?? 0) !== 0) build(lvl - 2);
  };

  build(level);
  const rotated = new Array(safeSteps).fill(false);
  const rot = ((rotation % safeSteps) + safeSteps) % safeSteps;
  for (let i = 0; i < safeSteps; i++) {
    rotated[(i + rot) % safeSteps] = (pattern[i] ?? 0) === 1;
  }
  return rotated;
}
