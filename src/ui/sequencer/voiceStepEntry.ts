export { createProductVoiceStepCommit as buildVoiceTakeProductCoreCommit } from '../../audio/product/ProductVoiceStepEntryEvents';

export type VoicePitchObservation = Readonly<{
  frequencyHz: number;
  midiFloat: number;
  midi: number;
  cents: number;
  confidence: number;
  rms: number;
}>;

export type VoiceStepEvent = Readonly<{
  step: number;
  pitch: number;
  velocity: number;
  gate: number;
  confidence: number;
  cents: number;
  frequencyHz: number;
}>;

export type VoiceScaleMode = 'chromatic' | 'major' | 'minor' | 'dorian';

const SCALE_INTERVALS: Record<Exclude<VoiceScaleMode, 'chromatic'>, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const rounded = Math.max(0, Math.min(127, Math.round(midi)));
  return `${names[rounded % 12]}${Math.floor(rounded / 12) - 1}`;
}

export function snapMidiToScale(midi: number, rootPitchClass: number, mode: VoiceScaleMode): number {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  if (mode === 'chromatic') return clamped;
  const root = ((Math.round(rootPitchClass) % 12) + 12) % 12;
  const intervals = SCALE_INTERVALS[mode];
  let best = clamped;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let candidate = Math.max(0, clamped - 6); candidate <= Math.min(127, clamped + 6); candidate += 1) {
    const pitchClass = ((candidate - root) % 12 + 12) % 12;
    if (!intervals.includes(pitchClass)) continue;
    const distance = Math.abs(candidate - clamped);
    if (distance < bestDistance || (distance === bestDistance && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Lightweight monophonic fundamental estimator for voice/humming.
 * Uses normalized autocorrelation instead of a model so it stays local,
 * deterministic, and inexpensive enough for mobile prototype use.
 */
export function analyzeMonophonicPitch(
  samples: Float32Array,
  sampleRate: number,
  options: Readonly<{
    minHz?: number;
    maxHz?: number;
    minRms?: number;
    minConfidence?: number;
  }> = {},
): VoicePitchObservation | null {
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 1000;
  const minRms = options.minRms ?? 0.012;
  const minConfidence = options.minConfidence ?? 0.55;
  if (samples.length < 128 || sampleRate <= 0) return null;

  let energy = 0;
  let mean = 0;
  for (let i = 0; i < samples.length; i += 1) mean += samples[i] ?? 0;
  mean /= samples.length;

  const centered = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = (samples[i] ?? 0) - mean;
    centered[i] = value;
    energy += value * value;
  }
  const rms = Math.sqrt(energy / samples.length);
  if (!Number.isFinite(rms) || rms < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(samples.length - 3, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return null;

  let bestLag = 0;
  let bestCorrelation = -1;
  const correlations = new Float32Array(maxLag + 2);

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    const count = centered.length - lag;
    for (let i = 0; i < count; i += 1) {
      const left = centered[i] ?? 0;
      const right = centered[i + lag] ?? 0;
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const correlation = denominator > 1e-12 ? dot / denominator : 0;
    correlations[lag] = correlation;

    // Prefer the first strong local peak. This reduces octave-down mistakes
    // caused by later harmonic peaks while retaining a global fallback.
    const previous = lag > minLag ? correlations[lag - 1] ?? -1 : -1;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
    if (lag > minLag + 1 && previous > 0.9 && previous >= (correlations[lag - 2] ?? -1) && previous >= correlation) {
      bestLag = lag - 1;
      bestCorrelation = previous;
      break;
    }
  }

  if (bestLag <= 0 || bestCorrelation < minConfidence) return null;

  const left = correlations[bestLag - 1] ?? bestCorrelation;
  const center = correlations[bestLag] ?? bestCorrelation;
  const right = correlations[bestLag + 1] ?? bestCorrelation;
  const denominator = left - 2 * center + right;
  const correction = Math.abs(denominator) > 1e-9
    ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator))
    : 0;
  const interpolatedLag = bestLag + correction;
  const frequencyHz = sampleRate / interpolatedLag;
  if (!Number.isFinite(frequencyHz) || frequencyHz < minHz || frequencyHz > maxHz) return null;

  const midiFloat = frequencyToMidi(frequencyHz);
  const midi = Math.max(0, Math.min(127, Math.round(midiFloat)));
  const cents = (midiFloat - midi) * 100;
  return {
    frequencyHz,
    midiFloat,
    midi,
    cents,
    confidence: Math.max(0, Math.min(1, bestCorrelation)),
    rms,
  };
}

export class DynamicVoiceVelocityTracker {
  private floor = 0.018;
  private ceiling = 0.11;

  reset(): void {
    this.floor = 0.018;
    this.ceiling = 0.11;
  }

  observe(rms: number): number {
    const safe = Math.max(0, Math.min(1, Number.isFinite(rms) ? rms : 0));
    if (safe > 0.004) {
      this.floor = Math.min(this.floor * 0.995 + safe * 0.005, safe);
      if (safe > this.ceiling) this.ceiling = this.ceiling * 0.92 + safe * 0.08;
      else this.ceiling = this.ceiling * 0.998 + Math.max(safe, this.floor + 0.04) * 0.002;
    }
    const span = Math.max(0.045, this.ceiling - this.floor);
    const normalized = Math.max(0, Math.min(1, (safe - this.floor) / span));
    const compressed = Math.sqrt(normalized);
    return Math.round(28 + compressed * 99);
  }
}

type WeightedVoiceFrame = Readonly<{
  midiFloat: number;
  frequencyHz: number;
  confidence: number;
  velocity: number;
  weight: number;
}>;

/**
 * Pitch for percussive vocal syllables should come from the stable vowel body,
 * not the consonant attack or decaying tail. Preserve original ordering long
 * enough to trim those temporal edges, then perform the weighted pitch median.
 */
function middlePitchFrames(
  frames: readonly VoicePitchObservation[],
  velocities: readonly number[],
): WeightedVoiceFrame[] {
  const count = frames.length;
  let start = 0;
  let end = count;

  if (count >= 5) {
    const trim = Math.max(1, Math.floor(count * 0.2));
    start = trim;
    end = Math.max(start + 1, count - trim);
  } else if (count >= 3) {
    start = 1;
    end = count - 1;
  }

  const temporalCore = frames.slice(start, end).map((frame, localIndex) => {
    const originalIndex = start + localIndex;
    return {
      midiFloat: frame.midiFloat,
      frequencyHz: frame.frequencyHz,
      confidence: frame.confidence,
      velocity: velocities[originalIndex] ?? 64,
      // Confidence is squared so periodic vowel frames dominate borderline
      // consonant/noise frames that happen to return a plausible F0.
      weight: Math.max(0.001, frame.confidence * frame.confidence * Math.max(0.01, frame.rms)),
    };
  });

  return temporalCore.length > 0 ? temporalCore : frames.map((frame, index) => ({
    midiFloat: frame.midiFloat,
    frequencyHz: frame.frequencyHz,
    confidence: frame.confidence,
    velocity: velocities[index] ?? 64,
    weight: Math.max(0.001, frame.confidence * frame.confidence * Math.max(0.01, frame.rms)),
  }));
}

export function aggregateVoiceStep(
  step: number,
  frames: readonly VoicePitchObservation[],
  velocities: readonly number[],
  expectedFrameCount: number,
  rootPitchClass: number,
  scaleMode: VoiceScaleMode,
): VoiceStepEvent | null {
  if (frames.length === 0) return null;

  const pitchFrames = middlePitchFrames(frames, velocities)
    .slice()
    .sort((a, b) => a.midiFloat - b.midiFloat);
  const totalPitchWeight = pitchFrames.reduce((sum, frame) => sum + frame.weight, 0);
  let cursor = 0;
  let median = pitchFrames[0]!;
  for (const frame of pitchFrames) {
    cursor += frame.weight;
    if (cursor >= totalPitchWeight * 0.5) {
      median = frame;
      break;
    }
  }

  const rawMidi = Math.round(median.midiFloat);
  const pitch = snapMidiToScale(rawMidi, rootPitchClass, scaleMode);

  // Dynamics may legitimately live in the attack, so velocity still uses all
  // accepted voiced frames even though pitch ignores the temporal edges.
  const velocityWeights = frames.map((frame) => Math.max(0.001, frame.confidence * Math.max(0.01, frame.rms)));
  const totalVelocityWeight = velocityWeights.reduce((sum, weight) => sum + weight, 0);
  const velocity = Math.max(1, Math.min(127, Math.round(
    frames.reduce((sum, _frame, index) => sum + (velocities[index] ?? 64) * (velocityWeights[index] ?? 0), 0) /
      Math.max(0.001, totalVelocityWeight),
  )));
  const confidence = Math.max(0, Math.min(1,
    pitchFrames.reduce((sum, frame) => sum + frame.confidence * frame.weight, 0) /
      Math.max(0.001, totalPitchWeight),
  ));
  const gate = Math.max(0.08, Math.min(1, frames.length / Math.max(1, expectedFrameCount)));
  const cents = (median.midiFloat - rawMidi) * 100;

  return {
    step,
    pitch,
    velocity,
    gate,
    confidence,
    cents,
    frequencyHz: median.frequencyHz,
  };
}
