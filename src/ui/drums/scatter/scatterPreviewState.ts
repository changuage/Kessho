import type { DrumVoiceType } from '../../../audio/drumSynth';
import { getParamInfo, quantize, type SliderState } from '../../state';
import { getDrumVoiceRoute } from '../drumVoiceParamRouting';
import { DRUM_PITCH_OFFSET_LIMIT } from '../../sequencer/drumPitchSequencer';
import type { GeneratedDrumPhrase } from './scatterTypes';

const DRUM_VOICE_DISTANCE_KEYS: Record<DrumVoiceType, keyof SliderState> = {
  sub: 'drumSubDistance',
  kick: 'drumKickDistance',
  click: 'drumClickDistance',
  beepHi: 'drumBeepHiDistance',
  beepLo: 'drumBeepLoDistance',
  noise: 'drumNoiseDistance',
  membrane: 'drumMembraneDistance',
};

const DRUM_VOICE_PITCH_KEYS: Record<DrumVoiceType, readonly (keyof SliderState)[]> = {
  sub: ['drumSubFreq'],
  kick: ['drumKickFreq'],
  click: ['drumClickPitch', 'drumClickFilter'],
  beepHi: ['drumBeepHiFreq'],
  beepLo: ['drumBeepLoFreq'],
  noise: ['drumNoiseFilterFreq'],
  membrane: ['drumMembraneSize'],
};

function clampUnit(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function clampSemitones(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-DRUM_PITCH_OFFSET_LIMIT, Math.min(DRUM_PITCH_OFFSET_LIMIT, value));
}

function stepValue(values: readonly number[], index: number, fallback: number): number {
  return clampUnit(values[index] ?? fallback, fallback);
}

function pitchPatchForScatterStep(
  phrase: GeneratedDrumPhrase,
  stepIndex: number,
  sliderState: SliderState | undefined,
): Partial<SliderState> {
  if (!sliderState) return {};
  const semitones = clampSemitones(phrase.pitch[stepIndex] ?? 0);
  if (Math.abs(semitones) < 0.001) return {};

  const ratio = Math.pow(2, semitones / 12);
  const patch: Partial<SliderState> = {};

  for (const key of DRUM_VOICE_PITCH_KEYS[phrase.engine]) {
    const currentValue = sliderState[key];
    if (typeof currentValue !== 'number' || !Number.isFinite(currentValue)) continue;

    const info = getParamInfo(key);
    const rawValue = currentValue * ratio;
    const clampedValue = info
      ? Math.max(info.min, Math.min(info.max, rawValue))
      : rawValue;
    (patch as Record<string, unknown>)[key] = quantize(key, clampedValue);
  }

  return patch;
}

export function velocityForScatterStep(phrase: GeneratedDrumPhrase, stepIndex: number): number {
  const expression = stepValue(phrase.expression, stepIndex, 0.8);
  return Math.max(0.12, Math.min(1, expression));
}

export function statePatchForScatterStep(
  phrase: GeneratedDrumPhrase,
  stepIndex: number,
  sliderState?: SliderState,
): Partial<SliderState> {
  const route = getDrumVoiceRoute(phrase.engine);
  const distanceKey = DRUM_VOICE_DISTANCE_KEYS[phrase.engine];
  const morphValue = stepValue(phrase.morph, stepIndex, 0.5);
  const distanceValue = stepValue(phrase.distance, stepIndex, 0.5);
  return {
    [route.morphKey]: morphValue,
    [distanceKey]: distanceValue,
    ...pitchPatchForScatterStep(phrase, stepIndex, sliderState),
  } as Partial<SliderState>;
}
