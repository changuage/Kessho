import type { SliderMode } from '../state';
import { clampValue, normalizeSliderRange, quantizeToStep, type SliderScaleSpec } from './scale';

export interface EffectiveSliderValueInput {
  authoredValue: number;
  mode: SliderMode;
  range?: readonly [number, number];
  runtimePosition?: number;
  runtimeValue?: number;
  domain?: SliderScaleSpec;
}

export function resolveEffectiveSliderValue(input: EffectiveSliderValueInput): number {
  if (Number.isFinite(input.runtimeValue)) return input.runtimeValue as number;
  if (input.mode === 'single') return input.authoredValue;
  if (!input.range || !Number.isFinite(input.range[0]) || !Number.isFinite(input.range[1])) {
    return input.authoredValue;
  }

  const [start, end] = normalizeSliderRange(input.range[0], input.range[1]);
  if (Math.abs(end - start) <= Number.EPSILON) {
    return input.domain ? quantizeToStep(start, input.domain) : start;
  }

  const fallbackPosition = (input.authoredValue - start) / (end - start);
  const position = Number.isFinite(input.runtimePosition)
    ? input.runtimePosition as number
    : fallbackPosition;
  const value = start + clampValue(position, 0, 1) * (end - start);
  return input.domain ? quantizeToStep(value, input.domain) : value;
}
