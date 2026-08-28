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

export type VoiceAlgorithmOptions = Readonly<{
  stepDurationSeconds: number;
  stepCount: number;
  calibrationSemitones: number;
  rootPitchClass: number;
  scaleMode: VoiceScaleMode;
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

const BASIC_PITCH_MODULE_URL = 'https://esm.sh/@spotify/basic-pitch@1.0.1?bundle';
const BASIC_PITCH_MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';
const PITCHY_MODULE_URL = 'https://esm.sh/pitchy@4.1.0';
const AUDIO_PITCH_MODULE_URL = 'https://esm.sh/@audio/pitch@2.0.3?bundle';
const CREPE_MODULE_URL = 'https://esm.sh/@playground-sessions/pitch-detection-analysis@0.1.1?bundle';

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

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

function frameAt(samples: Float32Array, offset: number, size = FRAME_SIZE): Float32Array {
  const out = new Float32Array(size);
  out.set(samples.subarray(offset, Math.min(samples.length, offset + size)));
  return out;
}

function centralPitch(frames: readonly PitchFrame[]): number {
  const voiced = frames.filter((frame) => frame.frequencyHz && frame.confidence >= 0.45);
  if (voiced.length === 0) return Number.NaN;
  const trim = voiced.length >= 6 ? Math.max(1, Math.floor(voiced.length * 0.25)) : 0;
  const middle = trim > 0 ? voiced.slice(trim, Math.max(trim + 1, voiced.length - trim)) : voiced;
  const pitches = middle
    .filter((frame) => frame.frequencyHz && frame.confidence >= 0.55)
    .map((frame) => frequencyToMidi(frame.frequencyHz!));
  return median(pitches.length > 0 ? pitches : voiced.map((frame) => frequencyToMidi(frame.frequencyHz!)));
}

function framesToRawNotes(frames: readonly PitchFrame[], hopSeconds: number): RawNote[] {
  if (frames.length === 0) return [];
  const voicedRms = frames.map((frame) => frame.rms).filter((value) => value > 0.0005);
  const energyFloor = Math.max(0.0035, (median(voicedRms) || 0.006) * 0.22);
  const usable = frames.map((frame) => ({
    ...frame,
    midi: frame.frequencyHz && frame.confidence >= 0.45 && frame.rms >= energyFloor
      ? frequencyToMidi(frame.frequencyHz)
      : null,
  }));

  // Median smoothing only removes single-frame F0 glitches. It intentionally
  // does not octave-correct the tracker so the comparison still exposes each
  // algorithm's actual octave behavior.
  const smoothed = usable.map((frame, index) => {
    const neighborhood = usable.slice(Math.max(0, index - 1), Math.min(usable.length, index + 2));
    const candidates = neighborhood.map((candidate) => candidate.midi).filter((value): value is number => value !== null);
    return { ...frame, midi: candidates.length >= 2 ? median(candidates) : frame.midi };
  });

  type Segment = { start: number; end: number };
  const segments: Segment[] = [];
  let segmentStart = -1;
  let missingFrames = 0;

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
    if (missingFrames <= 1) continue;
    segments.push({ start: segmentStart, end: Math.max(segmentStart, index - missingFrames) });
    segmentStart = -1;
    missingFrames = 0;
  }
  if (segmentStart >= 0) segments.push({ start: segmentStart, end: smoothed.length - 1 - missingFrames });

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
      // Require ~3 consecutive frames before calling a legato pitch movement
      // a new note. A single octave spike therefore stays inside the hold.
      if (changeStart >= 0 && index - changeStart + 1 >= 3) {
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
    const segmentFrames = frames.slice(segment.start, segment.end + 1);
    const pitchMidi = centralPitch(segmentFrames);
    if (!Number.isFinite(pitchMidi)) continue;
    const durationSeconds = Math.max(hopSeconds, (segment.end - segment.start + 1) * hopSeconds);
    if (durationSeconds < 0.055) continue;
    const startSeconds = Math.max(0, frames[segment.start]?.timeSeconds ?? segment.start * hopSeconds);
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
  const notes = monophonize(rawNotes);
  const byStep = new Map<number, VoicePhraseNote>();
  for (const raw of notes) {
    const startStep = clamp(Math.round(raw.startSeconds / options.stepDurationSeconds), 0, options.stepCount - 1);
    const endSeconds = raw.startSeconds + raw.durationSeconds;
    const endExclusive = clamp(Math.ceil(endSeconds / options.stepDurationSeconds), startStep + 1, options.stepCount);
    const durationSteps = Math.max(1, endExclusive - startStep);
    const rawMidi = clamp(Math.round(raw.pitchMidi + options.calibrationSemitones), 0, 127);
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
      cents: (raw.pitchMidi + options.calibrationSemitones - Math.round(raw.pitchMidi + options.calibrationSemitones)) * 100,
      frequencyHz: midiToFrequency(raw.pitchMidi + options.calibrationSemitones),
    };
    const existing = byStep.get(startStep);
    if (!existing || note.confidence * note.velocity > existing.confidence * existing.velocity) byStep.set(startStep, note);
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

async function runPitchyFrames(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getPitchyModule();
  const PitchDetector = module.PitchDetector;
  if (!PitchDetector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const frames: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += HOP_SIZE) {
    const frame = frameAt(samples, offset);
    const [frequency, clarity] = detector.findPitch(frame, sampleRate) as [number, number];
    frames.push({
      timeSeconds: offset / sampleRate,
      frequencyHz: Number.isFinite(frequency) && clarity >= 0.35 ? frequency : null,
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
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getAudioPitchModule();
  const pyin = module.pyin ?? module.default?.pyin;
  if (typeof pyin !== 'function') throw new Error('@audio/pitch pYIN export is unavailable.');
  const frameSize = 4096;
  const hopSize = HOP_SIZE;
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - frameSize) / hopSize) + 1);
  const frames: PitchFrame[] = [];
  for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += hopSize) {
    const frame = frameAt(samples, offset, frameSize);
    const result = pyin(frame, { fs: sampleRate, minFreq: 55, maxFreq: 1200 }) as null | { freq?: number; clarity?: number };
    const frequency = Number(result?.freq);
    const clarity = clamp(Number(result?.clarity) || 0, 0, 1);
    frames.push({
      timeSeconds: offset / sampleRate,
      frequencyHz: Number.isFinite(frequency) && clarity >= 0.3 ? frequency : null,
      confidence: clarity,
      rms: rms(frame),
    });
    if (index % 6 === 0) {
      onProgress?.(Math.min(0.98, index / frameCount), 'pYIN');
      await Promise.resolve();
    }
  }
  return frames;
}

async function runCrepeFrames(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: VoiceAlgorithmOptions['onProgress'],
): Promise<PitchFrame[]> {
  const module = await getCrepeModule();
  const Detector = module.PitchDetector;
  if (typeof Detector !== 'function') throw new Error('CREPE browser detector export is unavailable.');
  const detector = new Detector({
    sampleRate,
    frameSize: FRAME_SIZE,
    hopSize: HOP_SIZE,
    maxPolyphony: 1,
    confidenceThreshold: 0.48,
    useNMF: false,
    useCrepe: true,
    useWorklet: false,
  });
  await detector.initialize();
  const frameCount = Math.max(1, Math.ceil(Math.max(0, samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const frames: PitchFrame[] = [];
  try {
    for (let index = 0, offset = 0; offset < samples.length; index += 1, offset += HOP_SIZE) {
      const frame = frameAt(samples, offset);
      const detections = await detector.processFrame(frame) as Array<{ frequency?: number; confidence?: number; clarity?: number }>;
      const best = [...(detections ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      const frequency = Number(best?.frequency);
      const confidence = clamp(Number(best?.confidence ?? best?.clarity) || 0, 0, 1);
      frames.push({
        timeSeconds: offset / sampleRate,
        frequencyHz: Number.isFinite(frequency) && confidence >= 0.4 ? frequency : null,
        confidence,
        rms: rms(frame),
      });
      onProgress?.(Math.min(0.98, index / frameCount), 'CREPE');
    }
  } finally {
    detector.dispose?.();
  }
  return frames;
}

export class VoiceAlgorithmSession {
  private readonly samples: Float32Array;
  private readonly sampleRate: number;
  private basicPitchRawPromise: Promise<RawNote[]> | null = null;

  constructor(samples: Float32Array, sampleRate: number) {
    this.samples = samples;
    this.sampleRate = sampleRate;
  }

  private async basicPitchRaw(onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<RawNote[]> {
    if (!this.basicPitchRawPromise) {
      this.basicPitchRawPromise = (async () => {
        onProgress?.(0.02, 'Loading Basic Pitch');
        const module = await getBasicPitchModule();
        const BasicPitch = module.BasicPitch;
        const outputToNotesPoly = module.outputToNotesPoly;
        const addPitchBendsToNoteEvents = module.addPitchBendsToNoteEvents;
        const noteFramesToTime = module.noteFramesToTime;
        if (!BasicPitch || !outputToNotesPoly || !noteFramesToTime) throw new Error('Basic Pitch exports are unavailable.');
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
          (progress: number) => onProgress?.(clamp(progress, 0.05, 0.92), 'Basic Pitch'),
        );
        const noteFrames = outputToNotesPoly(frames, onsets, 0.34, 0.24, 5);
        const withBends = typeof addPitchBendsToNoteEvents === 'function'
          ? addPitchBendsToNoteEvents(contours, noteFrames)
          : noteFrames;
        const timed = noteFramesToTime(withBends) as Array<{
          startTimeSeconds: number;
          durationSeconds: number;
          pitchMidi: number;
          amplitude: number;
        }>;
        return timed.map((note) => ({
          startSeconds: Math.max(0, note.startTimeSeconds),
          durationSeconds: Math.max(0.04, note.durationSeconds),
          pitchMidi: note.pitchMidi,
          amplitude: clamp(note.amplitude, 0.02, 1),
          confidence: clamp(note.amplitude * 0.45 + 0.55, 0, 1),
        }));
      })();
    }
    return this.basicPitchRawPromise;
  }

  private async hybridRaw(onProgress?: VoiceAlgorithmOptions['onProgress']): Promise<RawNote[]> {
    const boundaries = await this.basicPitchRaw((progress, label) => onProgress?.(progress * 0.62, label));
    const module = await getPitchyModule();
    const PitchDetector = module.PitchDetector;
    if (!PitchDetector?.forFloat32Array) throw new Error('Pitchy PitchDetector export is unavailable.');
    const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
    return boundaries.map((note, index) => {
      const start = clamp(note.startSeconds, 0, this.samples.length / this.sampleRate);
      const end = clamp(note.startSeconds + note.durationSeconds, start, this.samples.length / this.sampleRate);
      const bodyStart = start + (end - start) * 0.25;
      const bodyEnd = start + (end - start) * 0.75;
      const startSample = Math.floor(bodyStart * this.sampleRate);
      const endSample = Math.max(startSample + FRAME_SIZE, Math.ceil(bodyEnd * this.sampleRate));
      const pitches: number[] = [];
      for (let offset = startSample; offset < Math.min(this.samples.length, endSample); offset += Math.max(256, Math.floor(FRAME_SIZE / 4))) {
        const frame = frameAt(this.samples, offset);
        const [frequency, clarity] = detector.findPitch(frame, this.sampleRate) as [number, number];
        if (Number.isFinite(frequency) && clarity >= 0.66) pitches.push(frequencyToMidi(frequency));
      }
      onProgress?.(0.62 + 0.36 * ((index + 1) / Math.max(1, boundaries.length)), 'Pitchy middle-body refinement');
      const pitchMidi = median(pitches);
      return Number.isFinite(pitchMidi) ? { ...note, pitchMidi, confidence: Math.max(note.confidence, 0.72) } : note;
    });
  }

  async run(algorithm: VoiceAlgorithmId, options: VoiceAlgorithmOptions): Promise<VoiceAlgorithmResult> {
    const started = performance.now();
    options.onProgress?.(0, `Loading ${algorithm}`);
    let raw: RawNote[];
    let detail: string;

    switch (algorithm) {
      case 'basic-pitch':
        raw = await this.basicPitchRaw(options.onProgress);
        detail = 'Spotify Basic Pitch · learned onset + frame activation + contour';
        break;
      case 'basic-pitch-pitchy':
        raw = await this.hybridRaw(options.onProgress);
        detail = 'Basic Pitch boundaries · Pitchy/MPM middle-body pitch';
        break;
      case 'crepe': {
        const frames = await runCrepeFrames(this.samples, this.sampleRate, options.onProgress);
        raw = framesToRawNotes(frames, HOP_SIZE / this.sampleRate);
        detail = 'CREPE neural F0 · shared monophonic note segmenter';
        break;
      }
      case 'pyin': {
        const frames = await runPyinFrames(this.samples, this.sampleRate, options.onProgress);
        raw = framesToRawNotes(frames, HOP_SIZE / this.sampleRate);
        detail = 'Probabilistic YIN · shared monophonic note segmenter';
        break;
      }
      case 'pitchy': {
        const frames = await runPitchyFrames(this.samples, this.sampleRate, options.onProgress);
        raw = framesToRawNotes(frames, HOP_SIZE / this.sampleRate);
        detail = 'Pitchy McLeod Pitch Method · shared monophonic note segmenter';
        break;
      }
    }

    options.onProgress?.(1, 'Done');
    return {
      algorithm,
      notes: rawNotesToPhraseNotes(raw, options),
      elapsedMs: performance.now() - started,
      detail,
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
