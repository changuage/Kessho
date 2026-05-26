import { SCALES, type PitchMode, type ScaleName } from './drumSeqTypes';

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
  const root = finiteNumber(setting.root, fallbackRoot);
  if (setting.mode === 'notes') {
    const scale = SCALES[setting.scale ?? 'Major'] ?? SCALES.Major;
    return midiNotes.map((midi) => {
      const semitone = finiteNumber(midi, root) - root;
      const octave = Math.floor(semitone / 12);
      const remainder = ((semitone % 12) + 12) % 12;
      let bestDegree = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      scale.forEach((degree, index) => {
        const distance = Math.abs(degree - remainder);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestDegree = index;
        }
      });
      return octave * scale.length + bestDegree;
    });
  }
  if (setting.mode === 'noteRange') {
    return midiNotes.map((midi) => finiteNumber(midi, fallbackRoot) - fallbackRoot);
  }
  return midiNotes.map((midi) => finiteNumber(midi, root) - root);
}
