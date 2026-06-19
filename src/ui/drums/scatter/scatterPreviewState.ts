import type { DrumVoiceType } from '../../../audio/drumSynth';
import type { SliderState } from '../../state';
import { getDrumVoiceRoute } from '../drumVoiceParamRouting';
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

function clampUnit(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function stepValue(values: readonly number[], index: number, fallback: number): number {
  return clampUnit(values[index] ?? fallback, fallback);
}

export function velocityForScatterStep(phrase: GeneratedDrumPhrase, stepIndex: number): number {
  const expression = stepValue(phrase.expression, stepIndex, 0.8);
  return Math.max(0.12, Math.min(1, expression));
}

export function statePatchForScatterStep(
  phrase: GeneratedDrumPhrase,
  stepIndex: number,
): Partial<SliderState> {
  const route = getDrumVoiceRoute(phrase.engine);
  const distanceKey = DRUM_VOICE_DISTANCE_KEYS[phrase.engine];
  return {
    [route.morphKey]: stepValue(phrase.morph, stepIndex, 0.5),
    [distanceKey]: stepValue(phrase.distance, stepIndex, 0.5),
  } as Partial<SliderState>;
}
