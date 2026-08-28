import {
  midiToFrequency,
  snapMidiToScale,
  type VoiceScaleMode,
} from './voiceStepEntry';
import type { VoicePhraseNote } from './voicePhraseInterpreter';

export type VoiceAlgorithmId =
  | 'basic-pitch'
  | 'basic-pitch-pitchy'
  | 'crepe'
  | 'pyin'
  | 'pitchy';

export type VoiceAlgorithmPresetId = 'neutral' | 'sung-held' | 'vocal-percussive' | 'custom';

export type VoiceAlgorithmModifierState = Readonly<{
  preset: VoiceAlgorithmPresetId;
  minHz: number;
  maxHz: number;
  minNoteMs: number;
  gapBridgeMs: number;
  octavePersistenceFrames: number;
  centerTrimFraction: number;
  basicPitch: Readonly<{
    onsetThreshold: number;
    frameThreshold: number;
    minNoteFrames: number;
    inferOnsets: boolean;
    melodiaTrick: boolean;
    energyTolerance: number;
  }>;
  hybrid: Readonly<{
    bodyStartFraction: number;
    bodyEndFraction: number;
    clarityThreshold: number;
  }>;
  crepe: Readonly<{
    confidenceThreshold: number;
    frameSize: number;
    hopSize: number;
    trajectorySmoothing: boolean;
  }>;
  pyin: Readonly<{
    clarityThreshold: number;
    frameSize: number;
    hopSize: number;
    maxTransitionSemitonesPerSecond: number;
  }>;
  pitchy: Readonly<{
    clarityThreshold: number;
    frameSize: number;
    hopSize: number;
  }>;
}>;

export type VoiceAlgorithmOptions = Readonly<{
  stepDurationSeconds: number;
  stepCount: number;
  calibrationSemitones: number;
  rootPitchClass: number;
  scaleMode: VoiceScaleMode;
  modifiers?: VoiceAlgorithmModifierState;
  onProgress?: (progress: number, label: string) => void;
}>;

export type VoiceAlgorithmResult = Readonly<{
  algorithm: VoiceAlgorithmId;
  notes: VoicePhraseNote[];
  elapsedMs: number;
  detail: string;
}>;

type RawNote = {
  startSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
  confidence: number;
};

type PitchFrame = {
  timeSeconds: number;
  frequencyHz: number | null;
  confidence: number;
  rms: number;
};

type ExternalModule = Record<string, any>;
type BasicPitchModelOutput = {
  frames: number[][];
  onsets: number[][];
  contours: number[][];
};

const BASIC_PITCH_MODULE_URL = 'https://esm.sh/@spotify/basic-pitch@1.0.1?bundle';
const BASIC_PITCH_MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';
const PITCHY_MODULE_URL = 'https://esm.sh/pitchy@4.1.0';
const AUDIO_PITCH_MODULE_URL = 'https://esm.sh/@audio/pitch@2.0.3?bundle';
const CREPE_MODULE_URL = 'https://esm.sh/@playground-sessions/pitch-detection-analysis@0.1.1?bundle';

const DEFAULT_FRAME_SIZE = 2048;
const DEFAULT_HOP_SIZE = 512;

const preset = (
  id: Exclude<VoiceAlgorithmPresetId, 'custom'>,
  state: Omit<VoiceAlgorithmModifierState, 'preset'>,
): VoiceAlgorithmModifierState => ({ preset: id, ...state });

export const VOICE_ALGORITHM_PRESETS: Readonly<Record<Exclude<VoiceAlgorithmPresetId, 'custom'>, VoiceAlgorithmModifierState>> = {
  neutral: preset('neutral', {
    minHz: 55,
    maxHz: 1200,
    minNoteMs: 60,
    gapBridgeMs: 35,
    octavePersistenceFrames: 3,
    centerTrimFraction: 0.2,
    basicPitch: {
      onsetThreshold: 0.34,
      frameThreshold: 0.24,
      minNoteFrames: 5,
      inferOnsets: true,
      melodiaTrick: true,
      energyTolerance: 11,
    },
    hybrid: { bodyStartFraction: 0.25, bodyEndFraction: 0.75, clarityThreshold: 0.66 },
    crepe: { confidenceThreshold: 0.48, frameSize: 2048, hopSize: 512, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.3, frameSize: 4096, hopSize: 512, maxTransitionSemitonesPerSecond: 36 },
    pitchy: { clarityThreshold: 0.35, frameSize: 2048, hopSize: 512 },
  }),
  'sung-held': preset('sung-held', {
    minHz: 65,
    maxHz: 900,
    minNoteMs: 100,
    gapBridgeMs: 90,
    octavePersistenceFrames: 4,
    centerTrimFraction: 0.25,
    basicPitch: {
      onsetThreshold: 0.4,
      frameThreshold: 0.2,
      minNoteFrames: 7,
      inferOnsets: false,
      melodiaTrick: true,
      energyTolerance: 18,
    },
    hybrid: { bodyStartFraction: 0.28, bodyEndFraction: 0.72, clarityThreshold: 0.72 },
    crepe: { confidenceThreshold: 0.58, frameSize: 4096, hopSize: 256, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.42, frameSize: 4096, hopSize: 256, maxTransitionSemitonesPerSecond: 14 },
    pitchy: { clarityThreshold: 0.55, frameSize: 4096, hopSize: 256 },
  }),
  'vocal-percussive': preset('vocal-percussive', {
    minHz: 65,
    maxHz: 900,
    minNoteMs: 70,
    gapBridgeMs: 65,
    octavePersistenceFrames: 3,
    centerTrimFraction: 0.28,
    basicPitch: {
      onsetThreshold: 0.45,
      frameThreshold: 0.22,
      minNoteFrames: 5,
      inferOnsets: false,
      melodiaTrick: true,
      energyTolerance: 13,
    },
    hybrid: { bodyStartFraction: 0.3, bodyEndFraction: 0.7, clarityThreshold: 0.7 },
    crepe: { confidenceThreshold: 0.6, frameSize: 2048, hopSize: 256, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.42, frameSize: 4096, hopSize: 256, maxTransitionSemitonesPerSecond: 20 },
    pitchy: { clarityThreshold: 0.55, frameSize: 4096, hopSize: 256 },
  }),
};

function cloneModifierState(state: VoiceAlgorithmModifierState): VoiceAlgorithmModifierState {
  return {
    ...state,
    basicPitch: { ...state.basicPitch },
    hybrid: { ...state.hybrid },
    crepe: { ...state.crepe },
    pyin: { ...state.pyin },
    pitchy: { ...state.pitchy },
  };
}

let globalModifierState: VoiceAlgorithmModifierState = cloneModifierState(VOICE_ALGORITHM_PRESETS.neutral);

export function getVoiceAlgorithmModifierState(): VoiceAlgorithmModifierState {
  return cloneModifierState(globalModifierState);
}

export function setVoiceAlgorithmModifierState(state: VoiceAlgorithmModifierState): void {
  globalModifierState = sanitizeModifierState(state);
}

export function applyVoiceAlgorithmPreset(id: Exclude<VoiceAlgorithmPresetId, 'custom'>): VoiceAlgorithmModifierState {
  globalModifierState = cloneModifierState(VOICE_ALGORITHM_PRESETS[id]);
  return getVoiceAlgorithmModifierState();
}

function sanitizeModifierState(state: VoiceAlgorithmModifierState): VoiceAlgorithmModifierState {
  const minHz = clamp(Number(state.minHz) || 55, 35, 1000);
  const maxHz = clamp(Number(state.maxHz) || 1200, minHz + 20, 3000);
  return {
    ...cloneModifierState(state),
    minHz,
    maxHz,
    minNoteMs: clamp(Number(state.minNoteMs) || 60, 20, 500),
    gapBridgeMs: clamp(Number(state.gapBridgeMs) || 35, 0, 250),
    octavePersistenceFrames: Math.round(clamp(Number(state.octavePersistenceFrames) || 3, 1, 10)),
    centerTrimFraction: clamp(Number(state.centerTrimFraction) || 0.2, 0, 0.42),
    basicPitch: {
      onsetThreshold: clamp(Number(state.basicPitch.onsetThreshold) || 0.34, 0.05, 0.95),
      frameThreshold: clamp(Number(state.basicPitch.frameThreshold) || 0.24, 0.05, 0.95),
      minNoteFrames: Math.round(clamp(Number(state.basicPitch.minNoteFrames) || 5, 1, 40)),
      inferOnsets: Boolean(state.basicPitch.inferOnsets),
      melodiaTrick: Boolean(state.basicPitch.melodiaTrick),
      energyTolerance: Math.round(clamp(Number(state.basicPitch.energyTolerance) || 11, 0, 60)),
    },
    hybrid: {
      bodyStartFraction: clamp(Number(state.hybrid.bodyStartFraction) || 0.25, 0, 0.45),
      bodyEndFraction: clamp(Number(state.hybrid.bodyEndFraction) || 0.75, 0.55, 1),
      clarityThreshold: clamp(Number(state.hybrid.clarityThreshold) || 0.66, 0.1, 0.99),
    },
    crepe: {
      confidenceThreshold: clamp(Number(state.crepe.confidenceThreshold) || 0.48, 0.1, 0.99),
      frameSize: sanitizeFrameSize(state.crepe.frameSize),
      hopSize: sanitizeHopSize(state.crepe.hopSize),
      trajectorySmoothing: Boolean(state.crepe.trajectorySmoothing),
    },
    pyin: {
      clarityThreshold: clamp(Number(state.pyin.clarityThreshold) || 0.3, 0.1, 0.99),
      frameSize: sanitizeFrameSize(state.pyin.frameSize),
      hopSize: sanitizeHopSize(state.pyin.hopSize),
      maxTransitionSemitonesPerSecond: clamp(Number(state.pyin.maxTransitionSemitonesPerSecond) || 36, 2, 120),
    },
    pitchy: {
      clarityThreshold: clamp(Number(state.pitchy.clarityThreshold) || 0.35, 0.1, 0.99),
      frameSize: sanitizeFrameSize(state.pitchy.frameSize),
      hopSize: sanitizeHopSize(state.pitchy.hopSize),
    },
  };
}

function sanitizeFrameSize(value: number): number {
  const allowed = [1024, 2048, 4096, 8192];
  return allowed.reduce((best, candidate) => Math.abs(candidate - Number(value)) < Math.abs(best - Number(value)) ? candidate : best, 2048);
}

function sanitizeHopSize(value: number): number {
  const allowed = [128, 256, 512, 1024];
  return allowed.reduce((best, candidate) => Math.abs(candidate - Number(value)) < Math.abs(best - Number(value)) ? candidate : best, 512);
}

let pitchyModulePromise: Promise<ExternalModule> | null = null;
let audioPitchModulePromise: Promise<ExternalModule> | null = null;
let crepeModulePromise: Promise<ExternalModule> | null = null;
let basicPitchModulePromise: Promise<ExternalModule> | null = null;

function loadExternal(url: string): Promise<ExternalModule> {
  return import(/* @vite-ignore */ url) as Promise<ExternalModule>;
}

function getPitchyModule(): Promise<ExternalModule> {
  pitchyModulePromise ??= loadExternal(PITCHY_MODULE_URL);
  return pitchyModulePromise;
}

function getAudioPitchModule(): Promise<ExternalModule> {
  audioPitchModulePromise ??= loadExternal(AUDIO_PITCH_MODULE_URL);
  return audioPitchModulePromise;
}

function getCrepeModule(): Promise<ExternalModule> {
  crepeModulePromise ??= loadExternal(CREPE_MODULE_URL);
  return crepeModulePromise;
}

function getBasicPitchModule(): Promise<ExternalModule> {
  basicPitchModulePromise ??= loadExternal(BASIC_PITCH_MODULE_URL);
  return basicPitchModulePromise;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

function rms(samples: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    energy += value * value;
  }
  return Math.sqrt(energy / Math.max(1, samples.length));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? Number.NaN;
}

function resampleLinear(samples: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return samples.slice();
  const length = Math.max(1, Math.round(samples.length * outputRate / inputRate));
  const output = new Float32Array(length);
  const ratio = inputRate / outputRate;
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const mix = position - left;
    output[i] = (samples[left] ?? 0) * (1 - mix) + (samples[right] ?? 0) * mix;
  }
  return output;
}

function frameAt(samples: Float32Array, offset: number, size = DEFAULT_FRAME_SIZE): Float32Array {
  const out = new Float32Array(size);
  out.set(samples.subarray(offset, Math.min(samples.length, offset + size)));
  return out;
}

function centralPitch(frames: readonly PitchFrame[], modifiers: VoiceAlgorithmModifierState): number {
  const voiced = frames.filter((frame) =>
    frame.frequencyHz !== null
    && frame.frequencyHz >= modifiers.minHz
    && frame.frequencyHz <= modifiers.maxHz
    && frame.confidence >= 0.4,
  );
  if (voiced.length === 0) return Number.NaN;
  const trim = voiced.length >= 5
    ? Math.min(Math.floor((voiced.length - 1) / 2), Math.floor(voiced.length * modifiers.centerTrimFraction))
    : 0;
  const middle = trim > 0 ? voiced.slice(trim, Math.max(trim + 1, voiced.length - trim)) : voiced;
  const strong = middle.filter((frame) => frame.confidence >= 0.55);
  const source = strong.length > 0 ? strong : middle;
  const weightedMedianPool: number[] = [];
  for (const frame of source) {
    if (!frame.frequencyHz) continue;
    const repeats = Math.max(1, Math.round(frame.confidence * 4));
    const midi = frequencyToMidi(frame.frequencyHz);
    for (let i = 0; i < repeats; i += 1) weightedMedianPool.push(midi);
  }
  return median(weightedMedianPool);
}

function suppressTransientOctaveJumps(
  frames: readonly PitchFrame[],
  persistenceFrames: number,
): PitchFrame[] {
  const output = frames.map((frame) => ({ ...frame }));
  let referenceMidi: number | null = null;
  for (let index = 0; index < output.length; index += 1) {
    const frame = output[index]!;
    if (!frame.frequencyHz) continue;
    const midi = frequencyToMidi(frame.frequencyHz);
    if (referenceMidi === null) {
      referenceMidi = midi;
      continue;
    }
    const delta = midi - referenceMidi;
    const octaveLike = Math.abs(delta) >= 7 && Math.abs(Math.abs(delta) - 12) <= 3;
    if (!octaveLike) {
      if (Math.abs(delta) < 3) referenceMidi = referenceMidi * 0.8 + midi * 0.2;
      continue;
    }
    let persisted = 1;
    for (let lookahead = index + 1; lookahead < Math.min(output.length, index + persistenceFrames); lookahead += 1) {
      const nextFrequency = output[lookahead]?.frequencyHz;
      if (!nextFrequency) break;
      const nextMidi = frequencyToMidi(nextFrequency);
      if (Math.abs(nextMidi - midi) <= 1.5) persisted += 1;
      else break;
    }
    if (persisted < persistenceFrames) {
      frame.frequencyHz = midiToFrequency(referenceMidi);
      frame.confidence *= 0.8;
    } else {
      referenceMidi = midi;
    }
  }
  return output;
}

function decodeOctaveTrajectory(
  frames: readonly PitchFrame[],
  modifiers: VoiceAlgorithmModifierState,
  maxTransitionSemitonesPerSecond: number,
): PitchFrame[] {
  const output = frames.map((frame) => ({ ...frame }));
  const voicedIndices = output.map((frame, index) => frame.frequencyHz ? index : -1).filter((index) => index >= 0);
  if (voicedIndices.length < 2) return output;

  type Candidate = { hz: number; midi: number; emission: number };
  const candidateSets = voicedIndices.map((index) => {
    const frame = output[index]!;
    const base = frame.frequencyHz!;
    const variants = [base / 2, base, base * 2]
      .filter((hz) => hz >= modifiers.minHz && hz <= modifiers.maxHz)
      .map((hz) => ({
        hz,
        midi: frequencyToMidi(hz),
        emission: hz === base ? 0 : 0.72 + (1 - frame.confidence) * 0.35,
      }));
    return variants.length > 0 ? variants : [{ hz: base, midi: frequencyToMidi(base), emission: 0 }];
  });

  const costs: number[][] = [];
  const back: number[][] = [];
  costs[0] = candidateSets[0]!.map((candidate) => candidate.emission);
  back[0] = candidateSets[0]!.map(() => -1);

  for (let t = 1; t < candidateSets.length; t += 1) {
    const currentIndex = voicedIndices[t]!;
    const previousIndex = voicedIndices[t - 1]!;
    const dt = Math.max(0.001, output[currentIndex]!.timeSeconds - output[previousIndex]!.timeSeconds);
    const allowance = Math.max(0.5, maxTransitionSemitonesPerSecond * dt);
    costs[t] = [];
    back[t] = [];
    for (let j = 0; j < candidateSets[t]!.length; j += 1) {
      const candidate = candidateSets[t]![j]!;
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPrevious = 0;
      for (let k = 0; k < candidateSets[t - 1]!.length; k += 1) {
        const previous = candidateSets[t - 1]![k]!;
        const movement = Math.abs(candidate.midi - previous.midi);
        const transition = movement <= allowance ? movement * 0.025 : 0.35 + (movement - allowance) * 0.18;
        const total = (costs[t - 1]![k] ?? Number.POSITIVE_INFINITY) + transition + candidate.emission;
        if (total < bestCost) {
          bestCost = total;
          bestPrevious = k;
        }
      }
      costs[t]![j] = bestCost;
      back[t]![j] = bestPrevious;
    }
  }

  let state = (costs[costs.length - 1] ?? []).reduce(
    (best, value, index, array) => value < (array[best] ?? Number.POSITIVE_INFINITY) ? index : best,
    0,
  );
  for (let t = candidateSets.length - 1; t >= 0; t -= 1) {
    const index = voicedIndices[t]!;
    output[index]!.frequencyHz = candidateSets[t]![state]!.hz;
    state = Math.max(0, back[t]![state] ?? 0);
  }
  return output;
}

function framesToRawNotes(
  frames: readonly PitchFrame[],
  hopSeconds: number,
  modifiers: VoiceAlgorithmModifierState,
): RawNote[] {
  if (frames.length === 0) return [];
  const octaveStable = suppressTransientOctaveJumps(frames, modifiers.octavePersistenceFrames);
  const voicedRms = octaveStable.map((frame) => frame.rms).filter((value) => value > 0.0005);
  const energyFloor = Math.max(0.0035, (median(voicedRms) || 0.006) * 0.22);
  const usable = octaveStable.map((frame) => ({
    ...frame,
    midi: frame.frequencyHz
      && frame.frequencyHz >= modifiers.minHz
      && frame.frequencyHz <= modifiers.maxHz
      && frame.confidence >= 0.4
      && frame.rms >= energyFloor
      ? frequencyToMidi(frame.frequencyHz)
      : null,
  }));

  const smoothed = usable.map((frame, index) => {
    const neighborhood = usable.slice(Math.max(0, index - 1), Math.min(usable.length, index + 2));
    const candidates = neighborhood.map((candidate) => candidate.midi).filter((value): value is number => value !== null);
    return { ...frame, midi: candidates.length >= 2 ? median(candidates) : frame.midi };
  });

  type Segment = { start: number; end: number };
  const segments: Segment[] = [];
  let segmentStart = -1;
  let missingFrames = 0;
  const gapFrames = Math.max(0, Math.round((modifiers.gapBridgeMs / 1000) / Math.max(0.001, hopSeconds)));

  for (let index = 0; index < smoothed.length; index += 1) {
    const frame = smoothed[index]!;
    const voiced = frame.midi !== null;
    if (voiced) {
      if (segmentStart < 0) segmentStart = index;
      missingFrames = 0;
      continue;
    }
    if (segmentStart < 0) continue;
    missingFrames += 1;
    if (missingFrames <= gapFrames) continue;
    segments.push({ start: segmentStart, end: Math.max(segmentStart, index - missingFrames) });
    segmentStart = -1;
    missingFrames = 0;
  }
  if (segmentStart >= 0) segments.push({ start: segmentStart, end: Math.max(segmentStart, smoothed.length - 1 - missingFrames) });

  const splitSegments: Segment[] = [];
  for (const segment of segments) {
    let start = segment.start;
    let reference = smoothed[start]?.midi ?? null;
    let changeStart = -1;
    for (let index = start + 1; index <= segment.end; index += 1) {
      const midi = smoothed[index]?.midi;
      if (midi === null || reference === null) continue;
      const changed = Math.abs(midi - reference) >= 0.85;
      if (changed && changeStart < 0) changeStart = index;
      if (!changed) changeStart = -1;
      if (changeStart >= 0 && index - changeStart + 1 >= modifiers.octavePersistenceFrames) {
        const splitAt = changeStart;
        if (splitAt - start >= 2) splitSegments.push({ start, end: splitAt - 1 });
        start = splitAt;
        reference = smoothed[index]?.midi ?? reference;
        changeStart = -1;
      } else if (Math.abs(midi - reference) < 0.45) {
        reference = reference * 0.82 + midi * 0.18;
      }
    }
    if (segment.end - start >= 1) splitSegments.push({ start, end: segment.end });
  }

  const notes: RawNote[] = [];
  for (const segment of splitSegments) {
    const segmentFrames = octaveStable.slice(segment.start, segment.end + 1);
    const pitchMidi = centralPitch(segmentFrames, modifiers);
    if (!Number.isFinite(pitchMidi)) continue;
    const durationSeconds = Math.max(hopSeconds, (segment.end - segment.start + 1) * hopSeconds);
    if (durationSeconds * 1000 < modifiers.minNoteMs) continue;
    const startSeconds = Math.max(0, octaveStable[segment.start]?.timeSeconds ?? segment.start * hopSeconds);
    const amplitude = clamp(Math.max(...segmentFrames.map((frame) => frame.rms)) * 7.5, 0.04, 1);
    const confidence = clamp(median(segmentFrames.map((frame) => frame.confidence)), 0, 1);
    notes.push({ startSeconds, durationSeconds, pitchMidi, amplitude, confidence });
  }
  return notes;
}

function monophonize(raw: readonly RawNote[]): RawNote[] {
  const sorted = [...raw]
    .filter((note) => Number.isFinite(note.pitchMidi) && note.durationSeconds > 0)
    .sort((a, b) => a.startSeconds - b.startSeconds || b.amplitude - a.amplitude);
  const out: RawNote[] = [];
  for (const note of sorted) {
    const end = note.startSeconds + note.durationSeconds;
    const overlapIndex = out.findIndex((existing) => {
      const existingEnd = existing.startSeconds + existing.durationSeconds;
      const overlap = Math.min(end, existingEnd) - Math.max(note.startSeconds, existing.startSeconds);
      return overlap > Math.min(note.durationSeconds, existing.durationSeconds) * 0.55;
    });
    if (overlapIndex < 0) {
      out.push(note);
      continue;
    }
    const existing = out[overlapIndex]!;
    if (note.amplitude * note.confidence > existing.amplitude * existing.confidence) out[overlapIndex] = note;
  }
  return out.sort((a, b) => a.startSeconds - b.startSeconds);
}

function rawNotesToPhraseNotes(rawNotes: readonly RawNote[], options: VoiceAlgorithmOptions): VoicePhraseNote[] {
  const modifiers = sanitizeModifierState(options.modifiers ?? globalModifierState);
  const notes = monophonize(rawNotes).filter((note) =>
    note.durationSeconds * 1000 >= modifiers.minNoteMs
    && midiToFrequency(note.pitchMidi) >= modifiers.minHz
    && midiToFrequency(note.pitchMidi) <= modifiers.maxHz,
  );
  const byStep = new Map<number, VoicePhraseNote>();
  for (const raw of notes) {
    const startStep = clamp(Math.round(raw.startSeconds / options.stepDurationSeconds), 0, options.stepCount - 1);
    const endSeconds = raw.startSeconds + raw.durationSeconds;
    const endExclusive = clamp(Math.ceil(endSeconds / options.stepDurationSeconds), startStep + 1, options.stepCount);
    const durationSteps = Math.max(1, endExclusive - startStep);
    const calibratedMidi = raw.pitchMidi + options.calibrationSemitones;
    const rawMidi = clamp(Math.round(calibratedMidi), 0, 127);
    const pitch = snapMidiToScale(rawMidi, options.rootPitchClass, options.scaleMode);
    const velocity = Math.round(28 + Math.sqrt(clamp(raw.amplitude, 0, 1)) * 99);
    const note: VoicePhraseNote = {
      step: startStep,
      endStep: Math.min(options.stepCount - 1, startStep + durationSteps - 1),
      durationSteps,
      articulation: durationSteps > 1 ? 'hold' : 'transient',
      onsetStrength: raw.confidence,
      pitch,
      velocity: clamp(velocity, 1, 127),
      gate: 1,
      confidence: clamp(raw.confidence, 0, 1),
      cents: (calibratedMidi - Math.round(calibratedMidi)) * 100,
      frequencyHz: midiToFrequency(calibratedMidi),
    };
    const existing = byStep.get(startStep);
    if (!existing || note.confidence * note.velocity > existing.confidence * existing.velocity) byStep.set(startStep, note);
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

async function runPitchyFrames(
  samples: Float32Array,
  sampleRate: number,
  modifiers: VoiceAlgorithmModifierState,
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getPitchyModule();
  const PitchDetector = module.PitchDetector;
  if (!PitchDetector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
  const { frameSize, hopSize, clarityThreshold } = modifiers.pitchy;
  const detector = PitchDetector.forFloat32Array(frameSize);
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - frameSize) / hopSize) + 1);
  const frames: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += hopSize) {
    const frame = frameAt(samples, offset, frameSize);
    const [frequency, clarity] = detector.findPitch(frame, sampleRate) as [number, number];
    const inRange = Number.isFinite(frequency) && frequency >= modifiers.minHz && frequency <= modifiers.maxHz;
    frames.push({
      timeSeconds: offset / sampleRate,
      frequencyHz: inRange && clarity >= clarityThreshold ? frequency : null,
      confidence: clamp(Number(clarity) || 0, 0, 1),
      rms: rms(frame),
    });
    if (index % 12 === 0) {
      onProgress?.(Math.min(0.98, index / frameCount), 'Pitchy / McLeod');
      await Promise.resolve();
    }
  }
  return frames;
}

async function runPyinFrames(
  samples: Float32Array,
  sampleRate: number,
  modifiers: VoiceAlgorithmModifierState,
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getAudioPitchModule();
  const pyin = module.pyin ?? module.default?.pyin;
  if (typeof pyin !== 'function') throw new Error('@audio/pitch pYIN export is unavailable.');
  const { frameSize, hopSize, clarityThreshold, maxTransitionSemitonesPerSecond } = modifiers.pyin;
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - frameSize) / hopSize) + 1);
  const frames: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += hopSize) {
    const frame = frameAt(samples, offset, frameSize);
    const result = pyin(frame, { fs: sampleRate, minFreq: modifiers.minHz, maxFreq: modifiers.maxHz }) as null | { freq?: number; clarity?: number };
    const frequency = Number(result?.freq);
    const clarity = clamp(Number(result?.clarity) || 0, 0, 1);
    frames.push({
      timeSeconds: offset / sampleRate,
      frequencyHz: Number.isFinite(frequency) && clarity >= clarityThreshold ? frequency : null,
      confidence: clarity,
      rms: rms(frame),
    });
    if (index % 6 === 0) {
      onProgress?.(Math.min(0.9, index / frameCount), 'pYIN frame likelihoods');
      await Promise.resolve();
    }
  }
  onProgress?.(0.93, 'pYIN temporal decode');
  return decodeOctaveTrajectory(frames, modifiers, maxTransitionSemitonesPerSecond);
}

async function runCrepeFrames(
  samples: Float32Array,
  sampleRate: number,
  modifiers: VoiceAlgorithmModifierState,
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getCrepeModule();
  const Detector = module.PitchDetector;
  if (typeof Detector !== 'function') throw new Error('CREPE browser detector export is unavailable.');
  const { frameSize, hopSize, confidenceThreshold, trajectorySmoothing } = modifiers.crepe;
  const detector = new Detector({
    sampleRate,
    frameSize,
    hopSize,
    maxPolyphony: 1,
    confidenceThreshold,
    useNMF: false,
    useCrepe: true,
    useWorklet: false,
  });
  await detector.initialize();
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - frameSize) / hopSize) + 1);
  const frames: PitchFrame[] = [];
  try {
    for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += hopSize) {
      const frame = frameAt(samples, offset, frameSize);
      const detections = await detector.processFrame(frame) as Array<{ frequency?: number; confidence?: number; clarity?: number }>;
      const best = [...(detections ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      const frequency = Number(best?.frequency);
      const confidence = clamp(Number(best?.confidence ?? best?.clarity) || 0, 0, 1);
      const inRange = Number.isFinite(frequency) && frequency >= modifiers.minHz && frequency <= modifiers.maxHz;
      frames.push({
        timeSeconds: offset / sampleRate,
        frequencyHz: inRange && confidence >= confidenceThreshold ? frequency : null,
        confidence,
        rms: rms(frame),
      });
      onProgress?.(Math.min(0.96, index / frameCount), 'CREPE');
    }
  } finally {
    detector.dispose?.();
  }
  return trajectorySmoothing
    ? decodeOctaveTrajectory(frames, modifiers, 30)
    : frames;
}

export class VoiceAlgorithmSession {
  private readonly samples: Float32Array;
  private readonly sampleRate: number;
  private basicPitchModelPromise: Promise<BasicPitchModelOutput> | null = null;

  constructor(samples: Float32Array, sampleRate: number) {
    this.samples = samples;
    this.sampleRate = sampleRate;
  }

  private async basicPitchModel(onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<BasicPitchModelOutput> {
    if (!this.basicPitchModelPromise) {
      this.basicPitchModelPromise = (async () => {
        onProgress?.(0.02, 'Loading Basic Pitch');
        const module = await getBasicPitchModule();
        const BasicPitch = module.BasicPitch;
        if (!BasicPitch) throw new Error('Basic Pitch inference export is unavailable.');
        const prepared = resampleLinear(this.samples, this.sampleRate, 22050);
        const frames: number[][] = [];
        const onsets: number[][] = [];
        const contours: number[][] = [];
        const basicPitch = new BasicPitch(BASIC_PITCH_MODEL_URL);
        await basicPitch.evaluateModel(
          prepared,
          (f: number[][], o: number[][], c: number[][]) => {
            frames.push(...f);
            onsets.push(...o);
            contours.push(...c);
          },
          (progress: number) => onProgress?.(clamp(progress, 0.05, 0.88), 'Basic Pitch inference'),
        );
        return { frames, onsets, contours };
      })();
    }
    return this.basicPitchModelPromise;
  }

  private async basicPitchRaw(
    modifiers: VoiceAlgorithmModifierState,
    onProgress?: VoiceAlgorithmOptions['onProgress'],
  ): Promise<RawNote[]> {
    const module = await getBasicPitchModule();
    const outputToNotesPoly = module.outputToNotesPoly;
    const addPitchBendsToNoteEvents = module.addPitchBendsToNoteEvents;
    const noteFramesToTime = module.noteFramesToTime;
    if (!outputToNotesPoly || !noteFramesToTime) throw new Error('Basic Pitch note decoder exports are unavailable.');
    const model = await this.basicPitchModel(onProgress);
    onProgress?.(0.9, 'Basic Pitch note decode');
    const frames = model.frames.map((row) => row.slice());
    const onsets = model.onsets.map((row) => row.slice());
    const b = modifiers.basicPitch;
    const noteFrames = outputToNotesPoly(
      frames,
      onsets,
      b.onsetThreshold,
      b.frameThreshold,
      b.minNoteFrames,
      b.inferOnsets,
      modifiers.maxHz,
      modifiers.minHz,
      b.melodiaTrick,
      b.energyTolerance,
    );
    const withBends = typeof addPitchBendsToNoteEvents === 'function'
      ? addPitchBendsToNoteEvents(model.contours, noteFrames)
      : noteFrames;
    const timed = noteFramesToTime(withBends) as Array<{
      startTimeSeconds: number;
      durationSeconds: number;
      pitchMidi: number;
      amplitude: number;
    }>;
    return timed
      .map((note) => ({
        startSeconds: Math.max(0, note.startTimeSeconds),
        durationSeconds: Math.max(0.01, note.durationSeconds),
        pitchMidi: note.pitchMidi,
        amplitude: clamp(note.amplitude, 0.02, 1),
        confidence: clamp(note.amplitude * 0.45 + 0.55, 0, 1),
      }))
      .filter((note) => note.durationSeconds * 1000 >= modifiers.minNoteMs);
  }

  private async hybridRaw(
    modifiers: VoiceAlgorithmModifierState,
    onProgress?: VoiceAlgorithmOptions['onProgress'],
  ): Promise<RawNote[]> {
    const boundaries = await this.basicPitchRaw(modifiers, (progress, label) => onProgress?.(progress * 0.62, label));
    const module = await getPitchyModule();
    const PitchDetector = module.PitchDetector;
    if (!PitchDetector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
    const detector = PitchDetector.forFloat32Array(modifiers.pitchy.frameSize);
    const hybrid = modifiers.hybrid;
    return boundaries.map((note, index) => {
      const start = clamp(note.startSeconds, 0, this.samples.length / this.sampleRate);
      const end = clamp(note.startSeconds + note.durationSeconds, start, this.samples.length / this.sampleRate);
      const bodyStart = start + (end - start) * hybrid.bodyStartFraction;
      const bodyEnd = start + (end - start) * hybrid.bodyEndFraction;
      const startSample = Math.floor(bodyStart * this.sampleRate);
      const endSample = Math.max(startSample + modifiers.pitchy.frameSize, Math.ceil(bodyEnd * this.sampleRate));
      const pitches: number[] = [];
      const weights: number[] = [];
      for (let offset = startSample; offset < Math.min(this.samples.length, endSample); offset += modifiers.pitchy.hopSize) {
        const frame = frameAt(this.samples, offset, modifiers.pitchy.frameSize);
        const [frequency, clarity] = detector.findPitch(frame, this.sampleRate) as [number, number];
        if (
          Number.isFinite(frequency)
          && frequency >= modifiers.minHz
          && frequency <= modifiers.maxHz
          && clarity >= hybrid.clarityThreshold
        ) {
          pitches.push(frequencyToMidi(frequency));
          weights.push(clarity);
        }
      }
      onProgress?.(0.62 + 0.36 * ((index + 1) / Math.max(1, boundaries.length)), 'Pitchy middle-body refinement');
      if (pitches.length === 0) return note;
      const weighted: number[] = [];
      for (let i = 0; i < pitches.length; i += 1) {
        const repeats = Math.max(1, Math.round((weights[i] ?? 0.5) * 5));
        for (let j = 0; j < repeats; j += 1) weighted.push(pitches[i]!);
      }
      const pitchMidi = median(weighted);
      return Number.isFinite(pitchMidi) ? { ...note, pitchMidi, confidence: Math.max(note.confidence, median(weights)) } : note;
    });
  }

  async run(algorithm: VoiceAlgorithmId, options: VoiceAlgorithmOptions): Promise<VoiceAlgorithmResult> {
    const started = performance.now();
    const modifiers = sanitizeModifierState(options.modifiers ?? globalModifierState);
    options.onProgress?.(0, `Loading ${algorithm}`);
    let raw: RawNote[];
    let detail: string;

    switch (algorithm) {
      case 'basic-pitch':
        raw = await this.basicPitchRaw(modifiers, options.onProgress);
        detail = `Spotify Basic Pitch · onset ${modifiers.basicPitch.onsetThreshold.toFixed(2)} · frame ${modifiers.basicPitch.frameThreshold.toFixed(2)} · inferred onsets ${modifiers.basicPitch.inferOnsets ? 'on' : 'off'}`;
        break;
      case 'basic-pitch-pitchy':
        raw = await this.hybridRaw(modifiers, options.onProgress);
        detail = `Basic Pitch boundaries · Pitchy body ${(modifiers.hybrid.bodyStartFraction * 100).toFixed(0)}–${(modifiers.hybrid.bodyEndFraction * 100).toFixed(0)}% · clarity ${modifiers.hybrid.clarityThreshold.toFixed(2)}`;
        break;
      case 'crepe': {
        const frames = await runCrepeFrames(this.samples, this.sampleRate, modifiers, options.onProgress);
        raw = framesToRawNotes(frames, modifiers.crepe.hopSize / this.sampleRate, modifiers);
        detail = `CREPE neural F0 · conf ${modifiers.crepe.confidenceThreshold.toFixed(2)} · ${modifiers.crepe.frameSize}/${modifiers.crepe.hopSize} · trajectory ${modifiers.crepe.trajectorySmoothing ? 'on' : 'off'}`;
        break;
      }
      case 'pyin': {
        const frames = await runPyinFrames(this.samples, this.sampleRate, modifiers, options.onProgress);
        raw = framesToRawNotes(frames, modifiers.pyin.hopSize / this.sampleRate, modifiers);
        detail = `pYIN · clarity ${modifiers.pyin.clarityThreshold.toFixed(2)} · temporal octave decode · max ${modifiers.pyin.maxTransitionSemitonesPerSecond.toFixed(0)} st/s`;
        break;
      }
      case 'pitchy': {
        const frames = await runPitchyFrames(this.samples, this.sampleRate, modifiers, options.onProgress);
        raw = framesToRawNotes(frames, modifiers.pitchy.hopSize / this.sampleRate, modifiers);
        detail = `Pitchy MPM · clarity ${modifiers.pitchy.clarityThreshold.toFixed(2)} · ${modifiers.pitchy.frameSize}/${modifiers.pitchy.hopSize}`;
        break;
      }
    }

    options.onProgress?.(1, 'Done');
    return {
      algorithm,
      notes: rawNotesToPhraseNotes(raw, { ...options, modifiers }),
      elapsedMs: performance.now() - started,
      detail: `${detail} · ${modifiers.preset}`,
    };
  }
}

export const VOICE_ALGORITHM_LABELS: Record<VoiceAlgorithmId, string> = {
  'basic-pitch': 'Basic Pitch',
  'basic-pitch-pitchy': 'Basic + Pitchy',
  crepe: 'CREPE',
  pyin: 'pYIN',
  pitchy: 'Pitchy / MPM',
};
