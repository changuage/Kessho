import { SCALES, type PitchMode, type ScaleName } from './drumSeqTypes';

export type SequencerPitchSettings = {
  mode: PitchMode;
  root: number;
  scale: ScaleName;
};

const DEFAULT_PITCH_SETTINGS: SequencerPitchSettings = {
  mode: 'semitones',
  root: 60,
  scale: 'Major',
};

export function normalizeSequencerPitchMode(value: unknown, fallback: PitchMode = 'semitones'): PitchMode {
  if (value === 'semitones' || value === 'notes' || value === 'noteRange') return value;
  return fallback;
}

export function normalizeSequencerPitchRoot(value: unknown, fallback = 60): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(127, Math.round(numeric)));
}

export function normalizeSequencerPitchScale(value: unknown, fallback: ScaleName = 'Major'): ScaleName {
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCALES, value)) {
    return value as ScaleName;
  }
  return fallback;
}

export function normalizeSequencerPitchSettings(
  value: unknown,
  fallback: Partial<SequencerPitchSettings> = DEFAULT_PITCH_SETTINGS,
): SequencerPitchSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<SequencerPitchSettings>
    : {};
  const normalizedFallback = {
    mode: normalizeSequencerPitchMode(fallback.mode, DEFAULT_PITCH_SETTINGS.mode),
    root: normalizeSequencerPitchRoot(fallback.root, DEFAULT_PITCH_SETTINGS.root),
    scale: normalizeSequencerPitchScale(fallback.scale, DEFAULT_PITCH_SETTINGS.scale),
  };
  return {
    mode: normalizeSequencerPitchMode(source.mode, normalizedFallback.mode),
    root: normalizeSequencerPitchRoot(source.root, normalizedFallback.root),
    scale: normalizeSequencerPitchScale(source.scale, normalizedFallback.scale),
  };
}

export function normalizeSequencerPitchSettingsArray(
  values: readonly unknown[] | undefined,
  laneCount: number,
  fallback: Partial<SequencerPitchSettings> = DEFAULT_PITCH_SETTINGS,
): SequencerPitchSettings[] {
  return Array.from({ length: laneCount }, (_, index) =>
    normalizeSequencerPitchSettings(values?.[index], fallback)
  );
}
