export type EuclideanSequencerKind = 'synth' | 'drum';

export const SYNTH_EUCLIDEAN_LANE_COUNT = 4 as const;
export const DRUM_EUCLIDEAN_LANE_COUNT = 6 as const;

export const SYNTH_EUCLIDEAN_LANE_NUMBERS = [1, 2, 3, 4] as const;
export const DRUM_EUCLIDEAN_LANE_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

export function euclideanLaneCount(kind: EuclideanSequencerKind): number {
  return kind === 'synth' ? SYNTH_EUCLIDEAN_LANE_COUNT : DRUM_EUCLIDEAN_LANE_COUNT;
}

export function euclideanLaneNumbers(kind: EuclideanSequencerKind): readonly number[] {
  return kind === 'synth' ? SYNTH_EUCLIDEAN_LANE_NUMBERS : DRUM_EUCLIDEAN_LANE_NUMBERS;
}
