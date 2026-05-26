export type LaneDirection = 'forward' | 'reverse' | 'pingpong';

export function isSequencerLaneDirection(value: unknown): value is LaneDirection {
  return value === 'forward' || value === 'reverse' || value === 'pingpong';
}

export function normalizeSequencerLaneDirection(
  value: unknown,
  fallback: LaneDirection = 'forward',
): LaneDirection {
  return isSequencerLaneDirection(value) ? value : fallback;
}

export function normalizeOptionalSequencerLaneDirection(value: unknown): LaneDirection | null {
  return isSequencerLaneDirection(value) ? value : null;
}
