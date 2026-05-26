import {
  NOTE_DEGREE_OFFSET_MAX,
  NOTE_DEGREE_OFFSET_MIN,
  SCALES,
  scaleDegreeToSemitone,
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

export function quantizeDrumPitchOffsetToScale(offset: number, scaleIntervals: readonly number[]): number {
  if (scaleIntervals.length === 0) return offset;
  const octaves = Math.floor(offset / 12);
  const remainder = ((offset % 12) + 12) % 12;
  let bestInterval = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const interval of scaleIntervals) {
    const distance = Math.min(Math.abs(interval - remainder), 12 - Math.abs(interval - remainder));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestInterval = interval;
    }
  }
  return octaves * 12 + bestInterval;
}

export function drumPitchUiValuesToEngineOffsets(
  values: readonly number[],
  settings: PitchSettings | undefined,
  baseMidi: number,
  scaleQuantize = false,
): number[] | null {
  const scaleIntervals = SCALES[settings?.scale ?? 'Major'] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11];
  const quantizeIfNeeded = (offset: number) => scaleQuantize
    ? quantizeDrumPitchOffsetToScale(offset, scaleIntervals)
    : offset;
  if (!settings || settings.mode === 'semitones') {
    return values.map((offset) => clampDrumPitchOffset(quantizeIfNeeded(offset)));
  }
  if (settings.mode === 'noteRange') return null;
  return values.map((degree) => clampDrumPitchOffset(
    quantizeIfNeeded(settings.root + scaleDegreeToSemitone(degree, scaleIntervals) - baseMidi),
  ));
}

export function evolvedDrumPitchOffsetToUiValue(
  offset: number,
  settings: PitchSettings | undefined,
  baseMidi: number,
): number {
  if (!settings || settings.mode === 'semitones') return clampDrumPitchOffset(offset);
  if (settings.mode === 'noteRange') return clampDrumPitchOffset(offset);
  const scaleIntervals = SCALES[settings.scale] || SCALES.Major || [0, 2, 4, 5, 7, 9, 11];
  const semitone = baseMidi + offset - settings.root;
  const octave = Math.floor(semitone / 12);
  const remainder = ((semitone % 12) + 12) % 12;
  let bestDegree = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  scaleIntervals.forEach((interval, degree) => {
    const distance = Math.abs(interval - remainder);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDegree = degree;
    }
  });
  return Math.max(NOTE_DEGREE_OFFSET_MIN, Math.min(NOTE_DEGREE_OFFSET_MAX, octave * scaleIntervals.length + bestDegree));
}
