import type { PitchBindingMode } from './drumSeqTypes';

export function normalizeSequencerPitchBindingMode(value: unknown, fallback: PitchBindingMode = 'polyrhythmic'): PitchBindingMode {
  if (value === 'polyrhythmic' || value === 'linked' || value === 'sequence') return value;
  return fallback;
}

export function normalizeSequencerPitchBindingModes(
  values: readonly unknown[] | undefined,
  laneCount: number,
  fallback: PitchBindingMode = 'polyrhythmic',
): PitchBindingMode[] {
  return Array.from({ length: laneCount }, (_, index) =>
    normalizeSequencerPitchBindingMode(values?.[index], fallback)
  );
}

export function sequencerPitchBindingModeToProductId(value: unknown): 0 | 1 {
  return normalizeSequencerPitchBindingMode(value) === 'sequence' ? 1 : 0;
}
