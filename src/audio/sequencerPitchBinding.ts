import type { PitchBindingMode } from './drumSeqTypes';

export const SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS = Object.freeze({
  polyrhythmic: 0,
  linked: 1,
  sequence: 2,
} as const);

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

export function sequencerPitchBindingModeToEventId(value: unknown): 0 | 1 | 2 {
  return SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS[normalizeSequencerPitchBindingMode(value)];
}

export function sequencerPitchBindingModeFromEventId(
  value: unknown,
  fallback: PitchBindingMode = 'polyrhythmic',
): PitchBindingMode {
  if (value === SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS.polyrhythmic) return 'polyrhythmic';
  if (value === SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS.linked) return 'linked';
  if (value === SEQUENCER_PITCH_BINDING_MODE_EVENT_IDS.sequence) return 'sequence';
  return fallback;
}
