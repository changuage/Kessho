import {
  KESSHO_PRODUCT_PAD_PARAM_SPECS,
} from '../../audio/generated/kesshoProductSchema';
import {
  PAD_SYNTH_PREVIEW_Q15_SCALE,
  padSynthPreviewFoldTables,
  padSynthPreviewOscillatorTables,
} from './generated/padSynthPreviewTables.generated';

type PadWaveEnum = NonNullable<typeof KESSHO_PRODUCT_PAD_PARAM_SPECS[0]['enumMap']>;
const PAD_WAVE_ENUM = KESSHO_PRODUCT_PAD_PARAM_SPECS[0].enumMap as PadWaveEnum;
export const PAD_WAVE_SOURCES = Object.freeze(Object.keys(PAD_WAVE_ENUM)) as readonly (keyof PadWaveEnum)[];

export type PadWaveSource = typeof PAD_WAVE_SOURCES[number];
export type PadFoldMode = 0 | 1 | 2;

export const PAD_PREVIEW_SAMPLE_COUNT = 192;
export const PAD_PREVIEW_CYCLES = 2;
export const PAD_REFERENCE_PITCH_HZ = 110;
const PAD_MIN_PREVIEW_HZ = 20;
const PAD_MAX_PREVIEW_CYCLES = 8;

const CLASSIC_WAVES = new Set<PadWaveSource>(['sine', 'triangle', 'sawtooth', 'square']);
const TRAJECTORY_BY_WAVE: Partial<Record<PadWaveSource, number>> = {
  harmonic: 0,
  complexSine: 1,
  complexTriangle: 2,
};

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

export function wrap01(value: number): number {
  const safe = finite(value);
  return safe - Math.floor(safe);
}

export function sampleBasicWave(wave: PadWaveSource, phase: number): number {
  const t = wrap01(phase);
  switch (wave) {
    case 'triangle': return 2 * Math.abs(2 * t - 1) - 1;
    case 'sawtooth': return 2 * t - 1;
    case 'square': return t < 0.5 ? 1 : -1;
    case 'sine': return Math.sin(2 * Math.PI * t);
    default: return 0;
  }
}

export function applyPreviewPhaseDistortion(phase: number, phaseDistortion: number): number {
  const pd = clamp(phaseDistortion, -1, 1);
  const midpoint = clamp(0.5 + pd * 0.45, 0.05, 0.95);
  const p = wrap01(phase);
  return p < midpoint
    ? 0.5 * p / midpoint
    : 0.5 + 0.5 * (p - midpoint) / (1 - midpoint);
}

function readPreviewSample(frame: readonly number[], sample: number, periodic = true): number {
  if (frame.length === 0) return 0;
  const normalized = periodic ? wrap01(sample) : clamp(sample, 0, 1);
  const wrapped = normalized * (frame.length - 1);
  const leftIndex = Math.min(frame.length - 1, Math.floor(wrapped));
  const rightIndex = Math.min(frame.length - 1, leftIndex + 1);
  const amount = wrapped - leftIndex;
  const left = finite(frame[leftIndex] ?? 0);
  const right = finite(frame[rightIndex] ?? left);
  return (left + (right - left) * amount) * PAD_SYNTH_PREVIEW_Q15_SCALE;
}

/** Samples one generated trajectory with linear position/frame and phase interpolation. */
export function sampleGeneratedPreview(trajectory: number, position: number, phase: number): number {
  const frames = padSynthPreviewOscillatorTables[trajectory] ?? [];
  if (frames.length === 0) return 0;
  const framePosition = clamp(position, 0, 1) * (frames.length - 1);
  const first = Math.min(frames.length - 1, Math.floor(framePosition));
  const second = Math.min(frames.length - 1, first + 1);
  const amount = framePosition - first;
  return readPreviewSample(frames[first] ?? [], phase) * (1 - amount)
    + readPreviewSample(frames[second] ?? frames[first] ?? [], phase) * amount;
}

export function samplePadWave(wave: PadWaveSource, position: number, phase: number): number {
  if (CLASSIC_WAVES.has(wave)) return sampleBasicWave(wave, phase);
  const trajectory = TRAJECTORY_BY_WAVE[wave];
  return trajectory === undefined ? sampleBasicWave('sine', phase) : sampleGeneratedPreview(trajectory, position, phase);
}

export function resolvePreviewFrequency(referenceHz: number, pitchSemitones: number, hzOffset: number): number {
  const base = Math.max(PAD_MIN_PREVIEW_HZ, finite(referenceHz, PAD_REFERENCE_PITCH_HZ));
  const trackedHz = base * 2 ** (clamp(pitchSemitones, -24, 24) / 12);
  return Math.max(PAD_MIN_PREVIEW_HZ, finite(trackedHz + finite(hzOffset), PAD_MIN_PREVIEW_HZ));
}

/** Maps relative oscillator speed to a readable static horizontal density. */
export function resolveVisualizerCycleCount(frequencyHz: number, referenceHz = PAD_REFERENCE_PITCH_HZ): number {
  const reference = Math.max(PAD_MIN_PREVIEW_HZ, finite(referenceHz, PAD_REFERENCE_PITCH_HZ));
  return clamp(PAD_PREVIEW_CYCLES * finite(frequencyHz, reference) / reference, 1, PAD_MAX_PREVIEW_CYCLES);
}

export interface MixProminence {
  aGain: number;
  bGain: number;
  aOpacity: number;
  bOpacity: number;
  first: 'a' | 'b';
}

export function resolveMixProminence(mix: number, oscALevel: number, oscBLevel: number): MixProminence {
  const safeMix = clamp(mix, 0, 1);
  const aGain = Math.min(1, 2 * (1 - safeMix)) * clamp(oscALevel, 0, 1);
  const bGain = Math.min(1, 2 * safeMix) * clamp(oscBLevel, 0, 1);
  const maxGain = Math.max(aGain, bGain, 0.0001);
  return {
    aGain,
    bGain,
    aOpacity: 0.1 + 0.9 * (aGain / maxGain),
    bOpacity: 0.1 + 0.9 * (bGain / maxGain),
    first: aGain <= bGain ? 'a' : 'b',
  };
}

export function sampleGeneratedFoldTransfer(mode: PadFoldMode, amount: number, input: number): number {
  const modeFrames = padSynthPreviewFoldTables[clamp(mode, 0, 2) | 0] ?? [];
  if (modeFrames.length === 0) return clamp(input, -1, 1);
  const amountPosition = clamp(amount, 0, 1) * (modeFrames.length - 1);
  const amountA = Math.min(modeFrames.length - 1, Math.floor(amountPosition));
  const amountB = Math.min(modeFrames.length - 1, amountA + 1);
  const amountT = amountPosition - amountA;
  const sample = (frame: readonly number[]): number => readPreviewSample(frame, (clamp(input, -1, 1) + 1) * 0.5, false);
  return sample(modeFrames[amountA] ?? []) * (1 - amountT) + sample(modeFrames[amountB] ?? modeFrames[amountA] ?? []) * amountT;
}

export function isClassicPadWave(wave: PadWaveSource): boolean {
  return CLASSIC_WAVES.has(wave);
}

export function trajectoryForPadWave(wave: PadWaveSource): number | null {
  return TRAJECTORY_BY_WAVE[wave] ?? null;
}
