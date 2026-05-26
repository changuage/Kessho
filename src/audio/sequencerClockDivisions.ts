import type { ClockDivision } from './drumSeqTypes';

const CLOCK_DIVISION_NUMERIC_VALUES: Record<ClockDivision, number> = {
  '1/4': 4,
  '1/4T': 6,
  '1/8': 8,
  '1/8T': 12,
  '1/16': 16,
  '1/16T': 24,
  '1/32': 32,
  '1/32T': 48,
  '1/64': 64,
};

const CLOCK_DIVISION_ALIASES: Record<string, ClockDivision> = {
  '1/4': '1/4',
  '1/4T': '1/4T',
  '1/4t': '1/4T',
  '1/8': '1/8',
  '1/8T': '1/8T',
  '1/8t': '1/8T',
  '1/16': '1/16',
  '1/16T': '1/16T',
  '1/16t': '1/16T',
  '1/32': '1/32',
  '1/32T': '1/32T',
  '1/32t': '1/32T',
  '1/64': '1/64',
};

export function defaultEuclideanClockDivision(laneIndex: number): ClockDivision {
  if (laneIndex === 0) return '1/8';
  if (laneIndex === 1) return '1/16';
  if (laneIndex === 2) return '1/8T';
  return '1/4';
}

export function normalizeSequencerClockDivision(value: unknown, fallback: ClockDivision): ClockDivision {
  if (typeof value !== 'string') return fallback;
  return CLOCK_DIVISION_ALIASES[value] ?? fallback;
}

export function normalizeSequencerClockDivisions(
  values: readonly unknown[] | undefined,
  laneCount: number,
): ClockDivision[] {
  return Array.from({ length: laneCount }, (_, laneIndex) =>
    normalizeSequencerClockDivision(values?.[laneIndex], defaultEuclideanClockDivision(laneIndex)),
  );
}

export function sequencerClockDivisionToNumericValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(128, Math.round(value)));
  }
  const normalized = typeof value === 'string' ? CLOCK_DIVISION_ALIASES[value] : undefined;
  return normalized ? CLOCK_DIVISION_NUMERIC_VALUES[normalized] : fallback;
}

export function sequencerClockDivisionToSeconds(
  value: unknown,
  beatDuration: number,
  fallback: ClockDivision = '1/8',
): number {
  return beatDuration * 4 / sequencerClockDivisionToNumericValue(value, CLOCK_DIVISION_NUMERIC_VALUES[fallback]);
}
