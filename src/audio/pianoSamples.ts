export type PianoSampleVariant = 'regular' | 'short';

export const PIANO_SAMPLE_ROOT = 'Piano';
export const PIANO_BASE_MIDI = 21;
export const PIANO_SAMPLE_COUNT = 64;
export const MANUAL_PIANO_KEYBOARD_SEMITONE_COUNT = 18;

const MANUAL_PIANO_PRIORITY_OCTAVES = [3, 4, 2, 5] as const;

export function getPianoSampleMidi(index: number): number {
  const safeIndex = Math.max(1, Math.min(PIANO_SAMPLE_COUNT, Math.round(index)));
  return PIANO_BASE_MIDI + safeIndex - 1;
}

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

export function choosePianoSampleVariant(midiNote: number, velocity = 0.8): PianoSampleVariant {
  const noteKey = Math.max(0, Math.round(midiNote));
  const velocityKey = Math.max(0, Math.min(127, Math.round(velocity * 127)));
  return ((noteKey * 31 + velocityKey) % 2) === 0 ? 'regular' : 'short';
}

export function frequencyToMidiNote(frequency: number): number {
  const safeFrequency = Math.max(frequency, 1e-6);
  return 69 + 12 * Math.log2(safeFrequency / 440);
}

export function getManualPianoPrioritySampleIndices(): number[] {
  const seen = new Set<number>();
  const indices: number[] = [];

  for (const octave of MANUAL_PIANO_PRIORITY_OCTAVES) {
    const baseMidi = 12 * (octave + 1);
    for (let semitone = 0; semitone < MANUAL_PIANO_KEYBOARD_SEMITONE_COUNT; semitone += 1) {
      const { index } = getNearestPianoSample(baseMidi + semitone);
      if (seen.has(index)) continue;
      seen.add(index);
      indices.push(index);
    }
  }

  return indices;
}
