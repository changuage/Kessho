import { SCALES, semitoneToScaleDegree, type PitchMode, type ScaleName } from './drumSeqTypes';

type SynthPitchSetting = Partial<{ mode: PitchMode; root: number; scale: ScaleName }>;

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function pitchSettingAt(settings: unknown, laneIndex: number): SynthPitchSetting {
  if (!Array.isArray(settings)) return {};
  const value = settings[laneIndex];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SynthPitchSetting : {};
}

export function coreProductSynthMidiToUiPitch(
  midiNotes: readonly number[],
  settings: unknown,
  laneIndex: number,
  fallbackRoot: number,
): number[] {
  const setting = pitchSettingAt(settings, laneIndex);
  const mode = setting.mode ?? 'semitones';
  const root = finiteNumber(setting.root, fallbackRoot);
  if (mode === 'semitones') {
    return midiNotes.map((midi) => finiteNumber(midi, root) - root);
  }
  if (mode === 'noteRange') {
    return midiNotes.map((midi) => finiteNumber(midi, fallbackRoot) - fallbackRoot);
  }
  const scale = SCALES[setting.scale ?? 'Major'] ?? SCALES.Major;
  return midiNotes.map((midi) => semitoneToScaleDegree(finiteNumber(midi, root) - root, scale));
}
