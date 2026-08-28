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
 * Amplitude onset tracker for voiced percussion syllables such as bum / dung /
 * deng. A generic sharp rise during an already-voiced sustain is deliberately
 * NOT a retrigger: a new onset requires a real low-energy valley first.
 *
 * This separates articulation timing from pitch. The consonant may establish
 * an onset even when it has no trustworthy fundamental, but cannot itself
 * decide the note pitch.
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
    const hadValley = this.quietFrameCount >= 1;
    const fromQuiet = hadValley && safeRms >= 0.009;
    const valleyRise = hadValley && previous <= 0.0075 && safeRms >= 0.011 && delta >= 0.0035 && ratio >= 1.3;
    const refractoryPassed = safeTime - this.lastOnsetMs >= 92;
    const onset = refractoryPassed && (fromQuiet || valleyRise);

    const riseStrength = Math.max(0, Math.min(1, delta / 0.03));
    const ratioStrength = Math.max(0, Math.min(1, (ratio - 1) / 1.8));
    const strength = onset
      ? Math.max(fromQuiet ? 0.6 : 0, riseStrength, ratioStrength)
      : 0;

    if (onset) this.lastOnsetMs = safeTime;
    this.quietFrameCount = safeRms < 0.0062 ? this.quietFrameCount + 1 : 0;
    this.previousRms = safeRms;
    return { onset, strength };
  }
}

type PhraseSpan = Readonly<{
  startStep: number;
  endStep: number;
}>;

type WeightedStep = Readonly<{
  event: VoiceStepEvent;
  step: number;
  weight: number;
}>;

function voicedEventAt(stepEvents: readonly (VoiceStepEvent | null)[], step: number): VoiceStepEvent | null {
  return step >= 0 && step < stepEvents.length ? stepEvents[step] ?? null : null;
}

function weightedMedianPitch(candidates: readonly WeightedStep[]): number {
  const sorted = candidates.slice().sort((left, right) => left.event.pitch - right.event.pitch);
  const total = sorted.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = 0;
  for (const candidate of sorted) {
    cursor += candidate.weight;
    if (cursor >= total * 0.5) return candidate.event.pitch;
  }
  return sorted[sorted.length - 1]?.event.pitch ?? 60;
}

/**
 * Derive one musical pitch from the middle of a phrase span. For spans of
 * three or more steps the first and last step are excluded whenever possible,
 * because those are the places where consonant attack and decaying tail most
 * often create false F0 estimates. Single-step syllables are already protected
 * by aggregateVoiceStep(), which trims the first/last analysis frames.
 */
function phraseFromSpan(
  span: PhraseSpan,
  stepEvents: readonly (VoiceStepEvent | null)[],
  onsetStrengthByStep: readonly number[],
): VoicePhraseNote | null {
  const all: WeightedStep[] = [];
  for (let step = span.startStep; step <= span.endStep; step += 1) {
    const event = voicedEventAt(stepEvents, step);
    if (!event) continue;
    all.push({
      event,
      step,
      weight: Math.max(0.001, event.confidence * event.confidence * Math.max(0.15, event.gate)),
    });
  }
  if (all.length === 0) return null;

  const durationSteps = span.endStep - span.startStep + 1;
  let middle = all;
  if (durationSteps >= 3) {
    const trimSteps = Math.max(1, Math.floor(durationSteps * 0.25));
    const middleStart = span.startStep + trimSteps;
    const middleEnd = span.endStep - trimSteps;
    const temporalCore = all.filter((candidate) => candidate.step >= middleStart && candidate.step <= middleEnd);
    if (temporalCore.length > 0) middle = temporalCore;
  }

  // Ignore weak edge-like pitch candidates even inside the temporal core when
  // stronger periodic vowel evidence exists.
  const strongestConfidence = Math.max(...middle.map((candidate) => candidate.event.confidence));
  const stableMiddle = middle.filter((candidate) => candidate.event.confidence >= strongestConfidence - 0.14);
  const pitchCandidates = stableMiddle.length > 0 ? stableMiddle : middle;
  const pitch = weightedMedianPitch(pitchCandidates);
  const representative = pitchCandidates
    .slice()
    .sort((left, right) => {
      const leftDistance = Math.abs(left.event.pitch - pitch);
      const rightDistance = Math.abs(right.event.pitch - pitch);
      return leftDistance - rightDistance || right.weight - left.weight;
    })[0]!;

  const totalWeight = pitchCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const confidence = Math.max(0, Math.min(1,
    pitchCandidates.reduce((sum, candidate) => sum + candidate.event.confidence * candidate.weight, 0) /
      Math.max(0.001, totalWeight),
  ));

  // Keep dynamics representative of the whole articulation rather than only
  // its middle; pitch and velocity intentionally have different time windows.
  const velocityWeight = all.reduce((sum, candidate) => sum + Math.max(0.05, candidate.event.gate), 0);
  const velocity = Math.max(1, Math.min(127, Math.round(
    all.reduce((sum, candidate) => sum + candidate.event.velocity * Math.max(0.05, candidate.event.gate), 0) /
      Math.max(0.05, velocityWeight),
  )));
  const gate = Math.max(...all.map((candidate) => candidate.event.gate));
  const onsetStrength = Math.max(
    0,
    ...Array.from({ length: Math.min(2, durationSteps) }, (_, offset) => onsetStrengthByStep[span.startStep + offset] ?? 0),
  );

  return {
    ...representative.event,
    step: span.startStep,
    endStep: span.endStep,
    durationSteps,
    articulation: durationSteps > 1 ? 'hold' : 'transient',
    pitch,
    velocity,
    confidence,
    gate,
    onsetStrength,
  };
}

function referencePitch(
  stepEvents: readonly (VoiceStepEvent | null)[],
  startStep: number,
  endStep: number,
): number | null {
  const candidates: WeightedStep[] = [];
  for (let step = startStep; step <= endStep; step += 1) {
    const event = voicedEventAt(stepEvents, step);
    if (!event) continue;
    candidates.push({
      event,
      step,
      weight: Math.max(0.001, event.confidence * event.confidence * Math.max(0.15, event.gate)),
    });
  }
  return candidates.length > 0 ? weightedMedianPitch(candidates) : null;
}

function pitchChangePersists(
  stepEvents: readonly (VoiceStepEvent | null)[],
  step: number,
  currentPitch: number,
): boolean {
  const event = voicedEventAt(stepEvents, step);
  if (!event || event.pitch === currentPitch) return false;
  const next = voicedEventAt(stepEvents, step + 1);
  if (!next) return false;
  const change = Math.abs(event.pitch - currentPitch);
  const nextSupportsNewPitch = Math.abs(next.pitch - event.pitch) <= 1;
  const nextReturnsToCurrent = Math.abs(next.pitch - currentPitch) <= 0;
  return change >= 1 && nextSupportsNewPitch && !nextReturnsToCurrent;
}

/**
 * Converts step observations into phrase-level musical notes.
 *
 * Boundary rules intentionally favor continuity:
 * - a held note is not split by amplitude fluctuations;
 * - a one-step pitch excursion is treated as attack/tail/wobble noise;
 * - a new same-pitch note requires a genuine low-energy valley + re-attack;
 * - a legato pitch change must persist into the next voiced step;
 * - one short unvoiced hole may be bridged inside a hold.
 *
 * After boundaries are known, the note pitch is re-estimated from the middle
 * of the complete span rather than inherited from the attack step.
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
  const spans: PhraseSpan[] = [];
  let spanStart = -1;
  let spanEnd = -1;

  const finishSpan = () => {
    if (spanStart >= 0 && spanEnd >= spanStart) spans.push({ startStep: spanStart, endStep: spanEnd });
    spanStart = -1;
    spanEnd = -1;
  };

  for (let step = 0; step < stepEvents.length; step += 1) {
    const event = voicedEventAt(stepEvents, step);

    if (!event) {
      if (spanStart < 0) continue;
      const next = bridgeSingleMissingStep ? voicedEventAt(stepEvents, step + 1) : null;
      const nextOnset = (onsetStrengthByStep[step + 1] ?? 0) >= onsetThreshold;
      const currentPitch = referencePitch(stepEvents, spanStart, spanEnd);
      const bridgeCompatible = next && currentPitch !== null && Math.abs(next.pitch - currentPitch) <= 1;
      if (bridgeSingleMissingStep && bridgeCompatible && !nextOnset) {
        spanEnd = step;
        continue;
      }
      finishSpan();
      continue;
    }

    if (spanStart < 0) {
      spanStart = step;
      spanEnd = step;
      continue;
    }

    const currentPitch = referencePitch(stepEvents, spanStart, spanEnd) ?? event.pitch;
    const freshOnset = (onsetStrengthByStep[step] ?? 0) >= onsetThreshold;
    const spanLength = spanEnd - spanStart + 1;
    const stablePitchChange = spanLength >= 2 && pitchChangePersists(stepEvents, step, currentPitch);

    if (freshOnset || stablePitchChange) {
      finishSpan();
      spanStart = step;
      spanEnd = step;
      continue;
    }

    // Absorb attack/tail pitch anomalies and ordinary vibrato into the existing
    // phrase. If the new pitch is real, persistence will split on a later step.
    spanEnd = step;
  }

  finishSpan();
  return spans.flatMap((span) => {
    const note = phraseFromSpan(span, stepEvents, onsetStrengthByStep);
    return note ? [note] : [];
  });
}
