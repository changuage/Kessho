import type { VoicePitchObservation, VoiceStepEvent } from './voiceStepEntry';

export type VoicePhraseNote = VoiceStepEvent & Readonly<{
  endStep: number;
  durationSteps: number;
  articulation: 'transient' | 'hold';
  onsetStrength: number;
}>;

export type VoiceOnsetObservation = Readonly<{
  onset: boolean;
  strength: number;
}>;

/**
 * The prototype detector currently reads consistently low on the test iPhone.
 * Keep calibration explicit and outside the generic F0 estimator so the raw
 * detector remains reusable and device calibration can later become adaptive.
 */
export function calibrateVoicePitchObservation(
  observation: VoicePitchObservation,
  semitoneOffset: number,
): VoicePitchObservation {
  if (!Number.isFinite(semitoneOffset) || Math.abs(semitoneOffset) < 1e-6) return observation;
  const midiFloat = observation.midiFloat + semitoneOffset;
  const midi = Math.max(0, Math.min(127, Math.round(midiFloat)));
  return {
    ...observation,
    frequencyHz: observation.frequencyHz * 2 ** (semitoneOffset / 12),
    midiFloat,
    midi,
    cents: (midiFloat - midi) * 100,
  };
}

/**
 * Lightweight amplitude-onset tracker tuned for voiced percussion syllables
 * (bum / dung / deng) as well as sung notes. Consonant noise may have no valid
 * F0, so onset detection intentionally runs on RMS before pitch acceptance.
 */
export class VoiceOnsetTracker {
  private previousRms = 0;
  private quietFrameCount = 8;
  private lastOnsetMs = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.previousRms = 0;
    this.quietFrameCount = 8;
    this.lastOnsetMs = Number.NEGATIVE_INFINITY;
  }

  observe(rms: number, timestampMs: number): VoiceOnsetObservation {
    const safeRms = Math.max(0, Number.isFinite(rms) ? rms : 0);
    const safeTime = Number.isFinite(timestampMs) ? timestampMs : 0;
    const previous = this.previousRms;
    const delta = safeRms - previous;
    const ratio = safeRms / Math.max(0.004, previous);
    const fromQuiet = this.quietFrameCount >= 2 && safeRms >= 0.009;
    const sharpRise = safeRms >= 0.012 && delta >= 0.0055 && ratio >= 1.42;
    const refractoryPassed = safeTime - this.lastOnsetMs >= 82;
    const onset = refractoryPassed && (fromQuiet || sharpRise);

    const riseStrength = Math.max(0, Math.min(1, delta / 0.035));
    const ratioStrength = Math.max(0, Math.min(1, (ratio - 1) / 2.2));
    const strength = onset
      ? Math.max(fromQuiet ? 0.58 : 0, riseStrength, ratioStrength)
      : 0;

    if (onset) this.lastOnsetMs = safeTime;
    this.quietFrameCount = safeRms < 0.0065 ? this.quietFrameCount + 1 : 0;
    this.previousRms = safeRms;
    return { onset, strength };
  }
}

function mergePhraseNote(
  current: VoicePhraseNote,
  next: VoiceStepEvent,
  nextStep: number,
  onsetStrength: number,
): VoicePhraseNote {
  const durationSteps = nextStep - current.step + 1;
  const oldWeight = Math.max(1, current.durationSteps);
  const nextWeight = 1;
  const velocity = Math.round((current.velocity * oldWeight + next.velocity * nextWeight) / (oldWeight + nextWeight));
  const confidence = (current.confidence * oldWeight + next.confidence * nextWeight) / (oldWeight + nextWeight);
  return {
    ...current,
    endStep: nextStep,
    durationSteps,
    articulation: durationSteps > 1 ? 'hold' : 'transient',
    velocity,
    confidence,
    gate: Math.max(current.gate, next.gate),
    onsetStrength: Math.max(current.onsetStrength, onsetStrength),
  };
}

/**
 * Converts independently observed sequencer steps into musical note phrases.
 * A contiguous stable pitch is one held note unless a fresh vocal onset occurs.
 * Pitch movement itself always starts a new note, preserving legato melodies.
 */
export function segmentVoicePhrase(
  stepEvents: readonly (VoiceStepEvent | null)[],
  onsetStrengthByStep: readonly number[],
  options: Readonly<{
    onsetThreshold?: number;
    bridgeSingleMissingStep?: boolean;
  }> = {},
): VoicePhraseNote[] {
  const onsetThreshold = options.onsetThreshold ?? 0.42;
  const bridgeSingleMissingStep = options.bridgeSingleMissingStep ?? true;
  const notes: VoicePhraseNote[] = [];
  let current: VoicePhraseNote | null = null;

  const start = (event: VoiceStepEvent, step: number): VoicePhraseNote => ({
    ...event,
    step,
    endStep: step,
    durationSteps: 1,
    articulation: 'transient',
    onsetStrength: Math.max(0, onsetStrengthByStep[step] ?? 0),
  });

  for (let step = 0; step < stepEvents.length; step += 1) {
    const event = stepEvents[step] ?? null;
    if (!event) {
      if (!current) continue;
      const next = bridgeSingleMissingStep ? stepEvents[step + 1] ?? null : null;
      const nextHasOnset = (onsetStrengthByStep[step + 1] ?? 0) >= onsetThreshold;
      if (next && !nextHasOnset && next.pitch === current.pitch) {
        // Preserve one short consonant/unvoiced hole inside an otherwise held note.
        current = {
          ...current,
          endStep: step,
          durationSteps: step - current.step + 1,
          articulation: 'hold',
        };
        continue;
      }
      notes.push(current);
      current = null;
      continue;
    }

    if (!current) {
      current = start(event, step);
      continue;
    }

    const contiguous = step <= current.endStep + 1;
    const samePitch = event.pitch === current.pitch;
    const freshOnset = (onsetStrengthByStep[step] ?? 0) >= onsetThreshold;

    if (contiguous && samePitch && !freshOnset) {
      current = mergePhraseNote(current, event, step, onsetStrengthByStep[step] ?? 0);
      continue;
    }

    notes.push(current);
    current = start(event, step);
  }

  if (current) notes.push(current);
  return notes;
}
