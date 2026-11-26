import { midiToFrequency, snapMidiToScale, type VoiceScaleMode } from './voiceStepEntry';
import type { VoicePhraseNote } from './voicePhraseInterpreter';

export type VoiceAlgorithmId = 'basic-pitch' | 'basic-pitch-pitchy' | 'crepe' | 'pyin' | 'pitchy';
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

type RawNote = { startSeconds: number; durationSeconds: number; pitchMidi: number; amplitude: number; confidence: number };
type PitchFrame = { timeSeconds: number; frequencyHz: number | null; confidence: number; rms: number };
type ExternalModule = Record<string, any>;
type BasicPitchOutput = { frames: number[][]; onsets: number[][]; contours: number[][] };

const BASIC_PITCH_MODULE_URL = 'https://esm.sh/@spotify/basic-pitch@1.0.1?bundle';
const BASIC_PITCH_MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';
const PITCHY_MODULE_URL = 'https://esm.sh/pitchy@4.1.0';
const AUDIO_PITCH_MODULE_URL = 'https://esm.sh/@audio/pitch@2.0.3?bundle';
const CREPE_MODULE_URL = 'https://esm.sh/@playground-sessions/pitch-detection-analysis@0.1.1?bundle';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const hzToMidi = (frequencyHz: number): number => 69 + 12 * Math.log2(frequencyHz / 440);

const PRESETS = {
  neutral: {
    minHz: 55, maxHz: 1200, minNoteMs: 60, gapBridgeMs: 35, octavePersistenceFrames: 3, centerTrimFraction: 0.2,
    basicPitch: { onsetThreshold: 0.34, frameThreshold: 0.24, minNoteFrames: 5, inferOnsets: true, melodiaTrick: true, energyTolerance: 11 },
    hybrid: { bodyStartFraction: 0.25, bodyEndFraction: 0.75, clarityThreshold: 0.66 },
    crepe: { confidenceThreshold: 0.48, frameSize: 2048, hopSize: 512, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.30, frameSize: 4096, hopSize: 512, maxTransitionSemitonesPerSecond: 36 },
    pitchy: { clarityThreshold: 0.35, frameSize: 2048, hopSize: 512 },
  },
  'sung-held': {
    minHz: 65, maxHz: 900, minNoteMs: 100, gapBridgeMs: 90, octavePersistenceFrames: 4, centerTrimFraction: 0.25,
    basicPitch: { onsetThreshold: 0.40, frameThreshold: 0.20, minNoteFrames: 7, inferOnsets: false, melodiaTrick: true, energyTolerance: 18 },
    hybrid: { bodyStartFraction: 0.28, bodyEndFraction: 0.72, clarityThreshold: 0.72 },
    crepe: { confidenceThreshold: 0.58, frameSize: 4096, hopSize: 256, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.42, frameSize: 4096, hopSize: 256, maxTransitionSemitonesPerSecond: 14 },
    pitchy: { clarityThreshold: 0.55, frameSize: 4096, hopSize: 256 },
  },
  'vocal-percussive': {
    minHz: 65, maxHz: 900, minNoteMs: 70, gapBridgeMs: 65, octavePersistenceFrames: 3, centerTrimFraction: 0.28,
    basicPitch: { onsetThreshold: 0.45, frameThreshold: 0.22, minNoteFrames: 5, inferOnsets: false, melodiaTrick: true, energyTolerance: 13 },
    hybrid: { bodyStartFraction: 0.30, bodyEndFraction: 0.70, clarityThreshold: 0.70 },
    crepe: { confidenceThreshold: 0.60, frameSize: 2048, hopSize: 256, trajectorySmoothing: true },
    pyin: { clarityThreshold: 0.42, frameSize: 4096, hopSize: 256, maxTransitionSemitonesPerSecond: 20 },
    pitchy: { clarityThreshold: 0.55, frameSize: 4096, hopSize: 256 },
  },
} as const;

type BuiltinPresetId = keyof typeof PRESETS;

function cloneState(state: VoiceAlgorithmModifierState): VoiceAlgorithmModifierState {
  return { ...state, basicPitch: { ...state.basicPitch }, hybrid: { ...state.hybrid }, crepe: { ...state.crepe }, pyin: { ...state.pyin }, pitchy: { ...state.pitchy } };
}

function presetState(id: BuiltinPresetId): VoiceAlgorithmModifierState {
  const state = PRESETS[id];
  return cloneState({ preset: id, ...state });
}

export const VOICE_ALGORITHM_PRESETS: Readonly<Record<BuiltinPresetId, VoiceAlgorithmModifierState>> = {
  neutral: presetState('neutral'),
  'sung-held': presetState('sung-held'),
  'vocal-percussive': presetState('vocal-percussive'),
};

let globalModifierState = cloneState(VOICE_ALGORITHM_PRESETS.neutral);

function nearest(value: number, allowed: readonly number[], fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return allowed.reduce((best, candidate) => Math.abs(candidate - numeric) < Math.abs(best - numeric) ? candidate : best, fallback);
}

function sanitize(state: VoiceAlgorithmModifierState): VoiceAlgorithmModifierState {
  const minHz = clamp(Number(state.minHz) || 55, 35, 1000);
  const maxHz = clamp(Number(state.maxHz) || 1200, minHz + 20, 3000);
  return {
    preset: state.preset,
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
      frameSize: nearest(state.crepe.frameSize, [1024, 2048, 4096, 8192], 2048),
      hopSize: nearest(state.crepe.hopSize, [128, 256, 512, 1024], 512),
      trajectorySmoothing: Boolean(state.crepe.trajectorySmoothing),
    },
    pyin: {
      clarityThreshold: clamp(Number(state.pyin.clarityThreshold) || 0.3, 0.1, 0.99),
      frameSize: nearest(state.pyin.frameSize, [1024, 2048, 4096, 8192], 4096),
      hopSize: nearest(state.pyin.hopSize, [128, 256, 512, 1024], 512),
      maxTransitionSemitonesPerSecond: clamp(Number(state.pyin.maxTransitionSemitonesPerSecond) || 36, 2, 120),
    },
    pitchy: {
      clarityThreshold: clamp(Number(state.pitchy.clarityThreshold) || 0.35, 0.1, 0.99),
      frameSize: nearest(state.pitchy.frameSize, [1024, 2048, 4096, 8192], 2048),
      hopSize: nearest(state.pitchy.hopSize, [128, 256, 512, 1024], 512),
    },
  };
}

export function getVoiceAlgorithmModifierState(): VoiceAlgorithmModifierState { return cloneState(globalModifierState); }
export function setVoiceAlgorithmModifierState(state: VoiceAlgorithmModifierState): void { globalModifierState = sanitize(state); }
export function applyVoiceAlgorithmPreset(id: BuiltinPresetId): VoiceAlgorithmModifierState {
  globalModifierState = presetState(id);
  return getVoiceAlgorithmModifierState();
}

let pitchyModulePromise: Promise<ExternalModule> | null = null;
let pyinModulePromise: Promise<ExternalModule> | null = null;
let crepeModulePromise: Promise<ExternalModule> | null = null;
let basicPitchModulePromise: Promise<ExternalModule> | null = null;
const loadExternal = (url: string): Promise<ExternalModule> => import(/* @vite-ignore */ url) as Promise<ExternalModule>;
const loadPitchy = (): Promise<ExternalModule> => pitchyModulePromise ??= loadExternal(PITCHY_MODULE_URL);
const loadPyin = (): Promise<ExternalModule> => pyinModulePromise ??= loadExternal(AUDIO_PITCH_MODULE_URL);
const loadCrepe = (): Promise<ExternalModule> => crepeModulePromise ??= loadExternal(CREPE_MODULE_URL);
const loadBasicPitch = (): Promise<ExternalModule> => basicPitchModulePromise ??= loadExternal(BASIC_PITCH_MODULE_URL);

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

function median(values: readonly number[]): number {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return Number.NaN;
  const lower = sorted[mid - 1];
  return sorted.length % 2 === 0 && lower !== undefined ? (lower + upper) / 2 : upper;
}

function frameAt(samples: Float32Array, offset: number, size: number): Float32Array {
  const out = new Float32Array(size);
  out.set(samples.subarray(offset, Math.min(samples.length, offset + size)));
  return out;
}

function resampleLinear(samples: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return samples.slice();
  const output = new Float32Array(Math.max(1, Math.round(samples.length * outputRate / inputRate)));
  const ratio = inputRate / outputRate;
  for (let i = 0; i < output.length; i += 1) {
    const position = i * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const mix = position - leftIndex;
    output[i] = (samples[leftIndex] ?? 0) * (1 - mix) + (samples[rightIndex] ?? 0) * mix;
  }
  return output;
}

function centralPitch(frames: readonly PitchFrame[], state: VoiceAlgorithmModifierState): number {
  const voiced = frames.filter((frame) => frame.frequencyHz !== null && frame.confidence >= 0.4);
  if (voiced.length === 0) return Number.NaN;
  const trim = voiced.length >= 5 ? Math.min(Math.floor((voiced.length - 1) / 2), Math.floor(voiced.length * state.centerTrimFraction)) : 0;
  const middle = trim > 0 ? voiced.slice(trim, voiced.length - trim) : voiced;
  const weighted: number[] = [];
  for (const frame of middle) {
    if (frame.frequencyHz === null) continue;
    const repeats = Math.max(1, Math.round(frame.confidence * 4));
    for (let i = 0; i < repeats; i += 1) weighted.push(hzToMidi(frame.frequencyHz));
  }
  return median(weighted);
}

function stabilizeOctaves(frames: readonly PitchFrame[], persistence: number): PitchFrame[] {
  const out = frames.map((frame) => ({ ...frame }));
  let reference: number | null = null;
  for (let index = 0; index < out.length; index += 1) {
    const frame = out[index];
    if (!frame || frame.frequencyHz === null) continue;
    const midi = hzToMidi(frame.frequencyHz);
    if (reference === null) { reference = midi; continue; }
    const delta = midi - reference;
    const octaveLike = Math.abs(delta) >= 8 && Math.abs(Math.abs(delta) - 12) <= 2.5;
    if (!octaveLike) {
      if (Math.abs(delta) < 3) reference = reference * 0.82 + midi * 0.18;
      continue;
    }
    let run = 1;
    for (let j = index + 1; j < Math.min(out.length, index + persistence); j += 1) {
      const next = out[j];
      if (!next || next.frequencyHz === null || Math.abs(hzToMidi(next.frequencyHz) - midi) > 1.5) break;
      run += 1;
    }
    if (run < persistence) {
      frame.frequencyHz = midiToFrequency(reference);
      frame.confidence *= 0.8;
    } else reference = midi;
  }
  return out;
}

function limitTrajectory(frames: readonly PitchFrame[], maxSemitonesPerSecond: number): PitchFrame[] {
  const out = frames.map((frame) => ({ ...frame }));
  let previous: PitchFrame | null = null;
  for (const frame of out) {
    if (frame.frequencyHz === null) continue;
    if (!previous || previous.frequencyHz === null) { previous = frame; continue; }
    const dt = Math.max(0.001, frame.timeSeconds - previous.timeSeconds);
    const maxMove = Math.max(0.7, maxSemitonesPerSecond * dt);
    const previousMidi = hzToMidi(previous.frequencyHz);
    let midi = hzToMidi(frame.frequencyHz);
    const octaveCandidates = [midi - 12, midi, midi + 12];
    midi = octaveCandidates.reduce((best, candidate) => Math.abs(candidate - previousMidi) < Math.abs(best - previousMidi) ? candidate : best, midi);
    const delta = midi - previousMidi;
    if (Math.abs(delta) > maxMove && frame.confidence < 0.8) midi = previousMidi + Math.sign(delta) * maxMove;
    frame.frequencyHz = midiToFrequency(midi);
    previous = frame;
  }
  return out;
}

function framesToRawNotes(frames: readonly PitchFrame[], hopSeconds: number, state: VoiceAlgorithmModifierState): RawNote[] {
  const stable = stabilizeOctaves(frames, state.octavePersistenceFrames);
  const positiveRms = stable.map((frame) => frame.rms).filter((value) => value > 0.0005);
  const energyFloor = Math.max(0.0035, (median(positiveRms) || 0.006) * 0.22);
  const voiced = stable.map((frame) => frame.frequencyHz !== null && frame.rms >= energyFloor && frame.frequencyHz >= state.minHz && frame.frequencyHz <= state.maxHz);
  const bridgeFrames = Math.max(0, Math.round(state.gapBridgeMs / 1000 / Math.max(0.001, hopSeconds)));
  const spans: Array<{ start: number; end: number }> = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < voiced.length; i += 1) {
    if (voiced[i] === true) { if (start < 0) start = i; gap = 0; continue; }
    if (start < 0) continue;
    gap += 1;
    if (gap <= bridgeFrames) continue;
    spans.push({ start, end: Math.max(start, i - gap) });
    start = -1; gap = 0;
  }
  if (start >= 0) spans.push({ start, end: Math.max(start, voiced.length - 1 - gap) });

  const notes: RawNote[] = [];
  for (const span of spans) {
    const spanFrames = stable.slice(span.start, span.end + 1);
    const durationSeconds = Math.max(hopSeconds, (span.end - span.start + 1) * hopSeconds);
    if (durationSeconds * 1000 < state.minNoteMs) continue;
    const pitchMidi = centralPitch(spanFrames, state);
    if (!Number.isFinite(pitchMidi)) continue;
    const startFrame = stable[span.start];
    if (!startFrame) continue;
    notes.push({
      startSeconds: startFrame.timeSeconds,
      durationSeconds,
      pitchMidi,
      amplitude: clamp(Math.max(...spanFrames.map((frame) => frame.rms)) * 7.5, 0.04, 1),
      confidence: clamp(median(spanFrames.map((frame) => frame.confidence)), 0, 1),
    });
  }
  return notes;
}

function monophonize(notes: readonly RawNote[]): RawNote[] {
  return [...notes].filter((note) => Number.isFinite(note.pitchMidi) && note.durationSeconds > 0).sort((a, b) => a.startSeconds - b.startSeconds || b.confidence - a.confidence);
}

function toPhraseNotes(rawNotes: readonly RawNote[], options: VoiceAlgorithmOptions, state: VoiceAlgorithmModifierState): VoicePhraseNote[] {
  const byStep = new Map<number, VoicePhraseNote>();
  for (const raw of monophonize(rawNotes)) {
    if (raw.durationSeconds * 1000 < state.minNoteMs) continue;
    const frequency = midiToFrequency(raw.pitchMidi);
    if (frequency < state.minHz || frequency > state.maxHz) continue;
    const startStep = Math.round(clamp(raw.startSeconds / options.stepDurationSeconds, 0, options.stepCount - 1));
    const endExclusive = Math.round(clamp(Math.ceil((raw.startSeconds + raw.durationSeconds) / options.stepDurationSeconds), startStep + 1, options.stepCount));
    const durationSteps = Math.max(1, endExclusive - startStep);
    const calibrated = raw.pitchMidi + options.calibrationSemitones;
    const rounded = Math.round(clamp(calibrated, 0, 127));
    const pitch = snapMidiToScale(rounded, options.rootPitchClass, options.scaleMode);
    const note: VoicePhraseNote = {
      step: startStep,
      endStep: Math.min(options.stepCount - 1, startStep + durationSteps - 1),
      durationSteps,
      articulation: durationSteps > 1 ? 'hold' : 'transient',
      onsetStrength: raw.confidence,
      pitch,
      velocity: Math.round(clamp(28 + Math.sqrt(clamp(raw.amplitude, 0, 1)) * 99, 1, 127)),
      gate: 1,
      confidence: clamp(raw.confidence, 0, 1),
      cents: (calibrated - Math.round(calibrated)) * 100,
      frequencyHz: midiToFrequency(calibrated),
    };
    const existing = byStep.get(startStep);
    if (!existing || note.confidence * note.velocity > existing.confidence * existing.velocity) byStep.set(startStep, note);
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

async function pitchyFrames(samples: Float32Array, sampleRate: number, state: VoiceAlgorithmModifierState, onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<PitchFrame[]> {
  const module = await loadPitchy();
  const Detector = module.PitchDetector;
  if (!Detector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
  const settings = state.pitchy;
  const detector = Detector.forFloat32Array(settings.frameSize);
  const total = Math.max(1, Math.ceil(samples.length / settings.hopSize));
  const out: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += settings.hopSize) {
    const frame = frameAt(samples, offset, settings.frameSize);
    const [frequency, clarity] = detector.findPitch(frame, sampleRate) as [number, number];
    const valid = Number.isFinite(frequency) && frequency >= state.minHz && frequency <= state.maxHz && clarity >= settings.clarityThreshold;
    out.push({ timeSeconds: offset / sampleRate, frequencyHz: valid ? frequency : null, confidence: clamp(Number(clarity) || 0, 0, 1), rms: rms(frame) });
    if (index % 12 === 0) { onProgress?.(Math.min(0.98, index / total), 'Pitchy / McLeod'); await Promise.resolve(); }
  }
  return out;
}

async function pyinFrames(samples: Float32Array, sampleRate: number, state: VoiceAlgorithmModifierState, onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<PitchFrame[]> {
  const module = await loadPyin();
  const pyin = module.pyin ?? module.default?.pyin;
  if (typeof pyin !== 'function') throw new Error('@audio/pitch pYIN export is unavailable.');
  const settings = state.pyin;
  const total = Math.max(1, Math.ceil(samples.length / settings.hopSize));
  const out: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += settings.hopSize) {
    const frame = frameAt(samples, offset, settings.frameSize);
    const result = pyin(frame, { fs: sampleRate, minFreq: state.minHz, maxFreq: state.maxHz }) as { freq?: number; clarity?: number } | null;
    const frequency = Number(result?.freq);
    const clarity = clamp(Number(result?.clarity) || 0, 0, 1);
    out.push({ timeSeconds: offset / sampleRate, frequencyHz: Number.isFinite(frequency) && clarity >= settings.clarityThreshold ? frequency : null, confidence: clarity, rms: rms(frame) });
    if (index % 6 === 0) { onProgress?.(Math.min(0.9, index / total), 'pYIN'); await Promise.resolve(); }
  }
  onProgress?.(0.94, 'pYIN trajectory');
  return limitTrajectory(out, settings.maxTransitionSemitonesPerSecond);
}

async function crepeFrames(samples: Float32Array, sampleRate: number, state: VoiceAlgorithmModifierState, onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<PitchFrame[]> {
  const module = await loadCrepe();
  const Detector = module.PitchDetector;
  if (typeof Detector !== 'function') throw new Error('CREPE browser detector export is unavailable.');
  const settings = state.crepe;
  const detector = new Detector({ sampleRate, frameSize: settings.frameSize, hopSize: settings.hopSize, maxPolyphony: 1, confidenceThreshold: settings.confidenceThreshold, useNMF: false, useCrepe: true, useWorklet: false });
  await detector.initialize();
  const total = Math.max(1, Math.ceil(samples.length / settings.hopSize));
  const out: PitchFrame[] = [];
  try {
    for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += settings.hopSize) {
      const frame = frameAt(samples, offset, settings.frameSize);
      const detections = await detector.processFrame(frame) as Array<{ frequency?: number; confidence?: number; clarity?: number }>;
      const best = [...(detections ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      const frequency = Number(best?.frequency);
      const confidence = clamp(Number(best?.confidence ?? best?.clarity) || 0, 0, 1);
      const valid = Number.isFinite(frequency) && frequency >= state.minHz && frequency <= state.maxHz && confidence >= settings.confidenceThreshold;
      out.push({ timeSeconds: offset / sampleRate, frequencyHz: valid ? frequency : null, confidence, rms: rms(frame) });
      onProgress?.(Math.min(0.96, index / total), 'CREPE');
    }
  } finally { detector.dispose?.(); }
  return settings.trajectorySmoothing ? limitTrajectory(out, 30) : out;
}

export class VoiceAlgorithmSession {
  private readonly samples: Float32Array;
  private readonly sampleRate: number;
  private basicPitchOutputPromise: Promise<BasicPitchOutput> | null = null;

  constructor(samples: Float32Array, sampleRate: number) { this.samples = samples; this.sampleRate = sampleRate; }

  private async basicPitchOutput(onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<BasicPitchOutput> {
    if (!this.basicPitchOutputPromise) {
      this.basicPitchOutputPromise = (async () => {
        const module = await loadBasicPitch();
        const BasicPitch = module.BasicPitch;
        if (!BasicPitch) throw new Error('Basic Pitch inference export is unavailable.');
        const prepared = resampleLinear(this.samples, this.sampleRate, 22050);
        const frames: number[][] = [];
        const onsets: number[][] = [];
        const contours: number[][] = [];
        const engine = new BasicPitch(BASIC_PITCH_MODEL_URL);
        await engine.evaluateModel(prepared, (f: number[][], o: number[][], c: number[][]) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, (progress: number) => onProgress?.(clamp(progress, 0.03, 0.88), 'Basic Pitch inference'));
        return { frames, onsets, contours };
      })();
    }
    return this.basicPitchOutputPromise;
  }

  private async basicPitchNotes(state: VoiceAlgorithmModifierState, onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<RawNote[]> {
    const module = await loadBasicPitch();
    const outputToNotesPoly = module.outputToNotesPoly;
    const noteFramesToTime = module.noteFramesToTime;
    const addPitchBendsToNoteEvents = module.addPitchBendsToNoteEvents;
    if (typeof outputToNotesPoly !== 'function' || typeof noteFramesToTime !== 'function') throw new Error('Basic Pitch note decoder exports are unavailable.');
    const output = await this.basicPitchOutput(onProgress);
    const b = state.basicPitch;
    const noteFrames = outputToNotesPoly(output.frames.map((row) => row.slice()), output.onsets.map((row) => row.slice()), b.onsetThreshold, b.frameThreshold, b.minNoteFrames, b.inferOnsets, state.maxHz, state.minHz, b.melodiaTrick, b.energyTolerance);
    const withBends = typeof addPitchBendsToNoteEvents === 'function' ? addPitchBendsToNoteEvents(output.contours, noteFrames) : noteFrames;
    const timed = noteFramesToTime(withBends) as Array<{ startTimeSeconds: number; durationSeconds: number; pitchMidi: number; amplitude: number }>;
    return timed.map((note) => ({ startSeconds: Math.max(0, note.startTimeSeconds), durationSeconds: Math.max(0.01, note.durationSeconds), pitchMidi: note.pitchMidi, amplitude: clamp(note.amplitude, 0.02, 1), confidence: clamp(0.55 + note.amplitude * 0.45, 0, 1) })).filter((note) => note.durationSeconds * 1000 >= state.minNoteMs);
  }

  private async hybridNotes(state: VoiceAlgorithmModifierState, onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<RawNote[]> {
    const boundaries = await this.basicPitchNotes(state, (progress, label) => onProgress?.(progress * 0.62, label));
    const module = await loadPitchy();
    const Detector = module.PitchDetector;
    if (!Detector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
    const detector = Detector.forFloat32Array(state.pitchy.frameSize);
    return boundaries.map((note, index) => {
      const duration = note.durationSeconds;
      const from = Math.floor((note.startSeconds + duration * state.hybrid.bodyStartFraction) * this.sampleRate);
      const to = Math.ceil((note.startSeconds + duration * state.hybrid.bodyEndFraction) * this.sampleRate);
      const candidates: number[] = [];
      for (let offset = from; offset < Math.min(this.samples.length, to); offset += state.pitchy.hopSize) {
        const frame = frameAt(this.samples, offset, state.pitchy.frameSize);
        const [frequency, clarity] = detector.findPitch(frame, this.sampleRate) as [number, number];
        if (Number.isFinite(frequency) && frequency >= state.minHz && frequency <= state.maxHz && clarity >= state.hybrid.clarityThreshold) candidates.push(hzToMidi(frequency));
      }
      onProgress?.(0.62 + 0.36 * ((index + 1) / Math.max(1, boundaries.length)), 'Pitchy middle-body');
      const pitchMidi = median(candidates);
      return Number.isFinite(pitchMidi) ? { ...note, pitchMidi, confidence: Math.max(note.confidence, 0.72) } : note;
    });
  }

  async run(algorithm: VoiceAlgorithmId, options: VoiceAlgorithmOptions): Promise<VoiceAlgorithmResult> {
    const started = performance.now();
    const state = sanitize(options.modifiers ?? globalModifierState);
    let raw: RawNote[];
    let detail: string;
    switch (algorithm) {
      case 'basic-pitch': raw = await this.basicPitchNotes(state, options.onProgress); detail = `Basic Pitch · onset ${state.basicPitch.onsetThreshold.toFixed(2)} · frame ${state.basicPitch.frameThreshold.toFixed(2)}`; break;
      case 'basic-pitch-pitchy': raw = await this.hybridNotes(state, options.onProgress); detail = `Basic boundaries · Pitchy body ${(state.hybrid.bodyStartFraction * 100).toFixed(0)}–${(state.hybrid.bodyEndFraction * 100).toFixed(0)}%`; break;
      case 'crepe': { const frames = await crepeFrames(this.samples, this.sampleRate, state, options.onProgress); raw = framesToRawNotes(frames, state.crepe.hopSize / this.sampleRate, state); detail = `CREPE · conf ${state.crepe.confidenceThreshold.toFixed(2)} · ${state.crepe.frameSize}/${state.crepe.hopSize}`; break; }
      case 'pyin': { const frames = await pyinFrames(this.samples, this.sampleRate, state, options.onProgress); raw = framesToRawNotes(frames, state.pyin.hopSize / this.sampleRate, state); detail = `pYIN · clarity ${state.pyin.clarityThreshold.toFixed(2)} · max ${state.pyin.maxTransitionSemitonesPerSecond.toFixed(0)} st/s`; break; }
      case 'pitchy': { const frames = await pitchyFrames(this.samples, this.sampleRate, state, options.onProgress); raw = framesToRawNotes(frames, state.pitchy.hopSize / this.sampleRate, state); detail = `Pitchy MPM · clarity ${state.pitchy.clarityThreshold.toFixed(2)} · ${state.pitchy.frameSize}/${state.pitchy.hopSize}`; break; }
    }
    options.onProgress?.(1, 'Done');
    return { algorithm, notes: toPhraseNotes(raw, options, state), elapsedMs: performance.now() - started, detail: `${detail} · ${state.preset}` };
  }
}

export const VOICE_ALGORITHM_LABELS: Record<VoiceAlgorithmId, string> = {
  'basic-pitch': 'Basic Pitch', 'basic-pitch-pitchy': 'Basic + Pitchy', crepe: 'CREPE', pyin: 'pYIN', pitchy: 'Pitchy / MPM',
};
