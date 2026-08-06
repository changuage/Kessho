/** Canonical range mapping used by SeqLane's shared range slider. */

export interface SeqLaneRange {
  min: number;
  max: number;
}

export function clampSeqLaneUnit(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/** Clamp and order authored lane endpoints without changing their domain. */
export function normalizeSeqLaneRange(min: number, max: number): SeqLaneRange {
  const low = clampSeqLaneUnit(min);
  const high = clampSeqLaneUnit(max);
  return low <= high ? { min: low, max: high } : { min: high, max: low };
}

export function seqLaneRangeToPercent(range: SeqLaneRange): SeqLaneRange {
  return { min: range.min * 100, max: range.max * 100 };
}

export function seqLaneRangeFromPercent(range: SeqLaneRange): SeqLaneRange {
  const normalized = {
    min: clampSeqLaneUnit(range.min / 100),
    max: clampSeqLaneUnit(range.max / 100),
  };
  return normalizeSeqLaneRange(normalized.min, normalized.max);
}
