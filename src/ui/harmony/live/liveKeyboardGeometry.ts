export const LIVE_CHORD_WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11] as const;
export const LIVE_CHORD_BLACK_KEYS = [1, 3, 6, 8, 10] as const;
export const LIVE_CHORD_KEY_MAP: Readonly<Record<string, number>> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11 };
