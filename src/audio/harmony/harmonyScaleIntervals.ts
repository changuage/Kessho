/** Canonical pitch-class intervals for the Product Harmony scale IDs. */
export const HARMONY_SCALE_INTERVALS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  1: [0, 2, 4, 5, 7, 9, 11],
  2: [0, 2, 3, 5, 7, 8, 10],
  3: [0, 2, 4, 7, 9],
  4: [0, 1, 3, 4, 6, 7, 9, 10],
  5: [0, 2, 4, 6, 7, 9, 11],
  6: [0, 2, 4, 5, 7, 9, 10],
  7: [0, 3, 5, 7, 10],
  8: [0, 2, 3, 5, 7, 9, 10],
  9: [0, 2, 3, 5, 7, 8, 11],
  10: [0, 2, 3, 5, 7, 9, 11],
  11: [0, 1, 4, 5, 7, 8, 10],
});

export const DEFAULT_HARMONY_SCALE_INTERVALS = HARMONY_SCALE_INTERVALS[1]!;
