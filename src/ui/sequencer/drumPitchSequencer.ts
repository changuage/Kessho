import {
  clampMidiNote,
  NOTE_DEGREE_OFFSET_MAX,
  NOTE_DEGREE_OFFSET_MIN,
  SCALES,
  scaleDegreeToSemitone,
  semitoneToScaleDegree,
} from '../../audio/drumSeqTypes';
import type { SliderState } from '../state';
import type { PitchSettings } from './useEuclideanSequencer';

const DRUM_PITCH_BASE_TARGETS = [
  { suffix: 'Sub', voiceIndex: 0 },
  { suffix: 'Kick', voiceIndex: 1 },
  { suffix: 'Click', voiceIndex: 2 },
  { suffix: 'BeepHi', voiceIndex: 3 },
  { suffix: 'BeepLo', voiceIndex: 4 },
  { suffix: 'Noise', voiceIndex: 5 },
  { suffix: 'Membrane', voiceIndex: 6 },
] as const;

function defaultDrumPitchTargetSuffix(laneNumber: number): (typeof DRUM_PITCH_BASE_TARGETS)[number]['suffix'] {
  if (laneNumber === 2) return 'BeepHi';
  if (laneNumber === 3) return 'Click';
  if (laneNumber === 4) return 'Noise';
  return 'Kick';
}

export function drumPitchBaseMidiFromState(state: SliderState, laneIdx: number): number {
  const laneNumber = laneIdx + 1;
  const prefix = `drumEuclid${laneNumber}`;
  const fallbackSuffix = defaultDrumPitchTargetSuffix(laneNumber);
  const selected = DRUM_PITCH_BASE_TARGETS.find((target) => Boolean(
    state[`${prefix}Target${target.suffix}` as keyof SliderState] ?? target.suffix === fallbackSuffix,
  ));
  return 36 + (selected?.voiceIndex ?? 1);
}

export function clampDrumPitchOffset(value: number): number {
  return Math.max(-24, Math.min(24, Math.round(value)));
}

export function drumPitchUiValuesToEngineOffsets(
  values: readonly number[],
  settings: PitchSettings | undefined,
  baseMidi: number,
): number[] | null {
  const scaleIntervals = SCALES[settings?.scale ?? 'Major'] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11];
  if (!settings || settings.mode === 'semitones') {
    const root = settings?.root ?? baseMidi;
    return values.map((degree) => clampDrumPitchOffset(
      root + scaleDegreeToSemitone(degree, scaleIntervals) - baseMidi,
    ));
  }
  if (settings.mode === 'noteRange') return null;
  return values.map((midi) => clampDrumPitchOffset(clampMidiNote(midi) - baseMidi));
}

export function evolvedDrumPitchOffsetToUiValue(
  offset: number,
  settings: PitchSettings | undefined,
  baseMidi: number,
): number {
  if (!settings || settings.mode === 'semitones') {
    const scaleIntervals = SCALES[settings?.scale ?? 'Major'] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11];
    const root = settings?.root ?? baseMidi;
    return Math.max(
      NOTE_DEGREE_OFFSET_MIN,
      Math.min(NOTE_DEGREE_OFFSET_MAX, semitoneToScaleDegree(baseMidi + offset - root, scaleIntervals)),
    );
  }
  if (settings.mode === 'noteRange') return clampDrumPitchOffset(offset);
  return clampMidiNote(baseMidi + offset);
}
