export type PianoSampleVariant = 'regular' | 'short';

export const PIANO_SAMPLE_ROOT = 'Piano';
export const PIANO_BASE_MIDI = 21;
export const PIANO_SAMPLE_COUNT = 64;

export function getNearestPianoSample(midiNote: number): { index: number; sampleMidi: number } {
  const clampedMidi = Math.max(
    PIANO_BASE_MIDI,
    Math.min(PIANO_BASE_MIDI + PIANO_SAMPLE_COUNT - 1, Math.round(midiNote)),
  );
  const index = clampedMidi - PIANO_BASE_MIDI + 1;
  return {
    index,
    sampleMidi: PIANO_BASE_MIDI + index - 1,
  };
}

export function getPianoSamplePath(variant: PianoSampleVariant, index: number): string {
  const safeIndex = String(Math.max(1, Math.min(PIANO_SAMPLE_COUNT, Math.round(index)))).padStart(2, '0');
  const fileName = variant === 'short'
    ? `piano short_${safeIndex}.ogg`
    : `piano_${safeIndex}.ogg`;
  return `${PIANO_SAMPLE_ROOT}/${fileName}`;
}

export function frequencyToMidiNote(frequency: number): number {
  const safeFrequency = Math.max(frequency, 1e-6);
  return 69 + 12 * Math.log2(safeFrequency / 440);
}