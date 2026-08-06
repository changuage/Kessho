import {
  recognizeHarmonyCandidatesFromMidiPool,
  type HarmonyChordQuality,
} from '../../audio/CoreProductHarmonyControl';
import type { HarmonyRecognitionCandidate } from '../../audio/harmony/harmonyTypes';

const CHORD_QUALITY_COMPLEXITY: Readonly<Record<HarmonyChordQuality, number>> = {
  maj: 0,
  min: 0,
  dim: 0,
  sus: 0,
  six: 1,
  maj7: 1,
  min7: 1,
  dom7: 1,
  add9: 2,
  sixNine: 2,
  nine: 2,
  quartal: 3,
  cluster: 3,
  auto: 4,
  custom: 4,
};

export interface ManualChordIdentityContext {
  rootMidi: number;
  scaleId: number;
  tension: number;
}

/**
 * Prefer the simplest candidate within the recognition confidence margin.
 * This keeps a one-octave E–G–C gesture legible as C/E instead of promoting
 * an omitted-tone extension merely because both shapes are plausible.
 */
export function recognizeClosestManualChord(
  notes: readonly number[],
  context: ManualChordIdentityContext,
): HarmonyRecognitionCandidate | null {
  if (notes.length < 3) return null;
  const candidates = recognizeHarmonyCandidatesFromMidiPool({
    midiNotes: notes,
    previousIntent: null,
    rootMidi: context.rootMidi,
    scaleId: context.scaleId,
    tension: context.tension,
    maxCandidates: 8,
  });
  const bestConfidence = candidates[0]?.confidence ?? 0;
  return candidates
    .filter((candidate) => candidate.confidence >= bestConfidence - 0.06)
    .sort((left, right) => {
      const omissions = left.voicing.omittedChordTones.length - right.voicing.omittedChordTones.length;
      if (omissions !== 0) return omissions;
      const complexity = CHORD_QUALITY_COMPLEXITY[left.quality] - CHORD_QUALITY_COMPLEXITY[right.quality];
      if (complexity !== 0) return complexity;
      const pitchFit = right.pitchClassScore - left.pitchClassScore;
      if (Math.abs(pitchFit) > 1e-6) return pitchFit;
      return right.confidence - left.confidence;
    })[0] ?? null;
}

export function manualChordInversionLabel(inversion: number | null): string {
  if (inversion == null) return '';
  if (inversion === 0) return 'Root position';
  const suffix = inversion === 1 ? 'st' : inversion === 2 ? 'nd' : inversion === 3 ? 'rd' : 'th';
  return `${inversion}${suffix} inversion`;
}
