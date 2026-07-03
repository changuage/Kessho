import {
  SCALES,
  semitoneToScaleDegree,
  type ScaleName,
} from '../../audio/drumSeqTypes';
import type { PitchSettings } from './useEuclideanSequencer';

export interface CapturedPitchCommit {
  pitchSettings: PitchSettings;
  pitchValues: number[];
  rootMidi: number;
}

export interface CapturedPitchReference {
  root: number;
  scale: ScaleName;
  scaleIntervals?: readonly number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 60;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid] ?? 60
    : ((sorted[mid - 1] ?? 60) + (sorted[mid] ?? 60)) * 0.5;
}

export function chooseCaptureRootMidi(midis: readonly number[]): number {
  if (midis.length === 0) return 60;
  const med = median(midis);
  const octaveRoot = Math.round(med / 12) * 12;
  return clamp(octaveRoot, 0, 127);
}

export function capturedMidisToSemitonePitchValues(
  midisByStep: readonly (number | null)[],
  reference?: CapturedPitchReference | null,
): CapturedPitchCommit {
  const capturedMidis = midisByStep.filter((value): value is number => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  const rootMidi = reference
    ? clamp(Math.round(reference.root), 0, 127)
    : chooseCaptureRootMidi(capturedMidis);
  const scale = reference?.scale ?? 'Chromatic';
  const scaleIntervals = reference?.scaleIntervals ?? SCALES[scale] ?? SCALES.Chromatic;
  const pitchValues = midisByStep.map((midi) => {
    if (typeof midi !== 'number' || !Number.isFinite(midi)) return 0;
    return clamp(semitoneToScaleDegree(Math.round(midi) - rootMidi, scaleIntervals), -48, 48);
  });

  return {
    rootMidi,
    pitchValues,
    pitchSettings: {
      mode: 'semitones',
      root: rootMidi,
      scale,
    },
  };
}

export function capturedMidisToNotePitchValues(
  midisByStep: readonly (number | null)[],
): CapturedPitchCommit {
  const capturedMidis = midisByStep.filter((value): value is number => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  const rootMidi = chooseCaptureRootMidi(capturedMidis);
  const pitchValues = midisByStep.map((midi) => (
    typeof midi === 'number' && Number.isFinite(midi)
      ? clamp(Math.round(midi), 0, 127)
      : rootMidi
  ));

  return {
    rootMidi,
    pitchValues,
    pitchSettings: {
      mode: 'notes',
      root: rootMidi,
      scale: 'Chromatic',
    },
  };
}
