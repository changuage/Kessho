export const MAX_SEQUENCER_SWING = 0.75;

export function normalizeSequencerSwing(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(MAX_SEQUENCER_SWING, numeric));
}

export function normalizeSequencerSwings(values: unknown[] | undefined, laneCount: number, fallback = 0): number[] {
  return Array.from({ length: laneCount }, (_, index) => normalizeSequencerSwing(values?.[index], fallback));
}
