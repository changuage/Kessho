/**
 * Single source of truth for per-engine output scaling.
 * Values below 1 attenuate; values above 1 boost.
 */
export const ENGINE_TRIMS = {
  pad: 0.5,
  lead: 0.5,
  piano: 0.8,
  drum: 1.0,
  granular: 2.0,
  reverb: 2.0,
  earth: 1.0,
} as const;

export const DEFAULT_MASTER_VOLUME = 0.85;
export const MASTER_OUTPUT_TRIM = 1.18;
