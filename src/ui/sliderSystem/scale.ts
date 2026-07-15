export type SliderScale = 'linear' | 'log';

export interface SliderScaleSpec {
  min: number;
  max: number;
  step?: number;
  scale?: SliderScale;
}

function orderedBounds(min: number, max: number): readonly [number, number] {
  return min <= max ? [min, max] : [max, min];
}

export function clampValue(value: number, min: number, max: number): number {
  const [lower, upper] = orderedBounds(min, max);
  if (!Number.isFinite(value)) return lower;
  return Math.min(Math.max(value, lower), upper);
}

export function normalizeSliderRange(start: number, end: number): readonly [number, number] {
  return start <= end ? [start, end] : [end, start];
}

export function quantizeToStep(value: number, spec: SliderScaleSpec): number {
  const [min, max] = orderedBounds(spec.min, spec.max);
  const clamped = clampValue(value, min, max);
  if (!spec.step || spec.step <= 0 || !Number.isFinite(spec.step)) return clamped;

  const steps = Math.round((clamped - min) / spec.step);
  return clampValue(min + steps * spec.step, min, max);
}

function effectiveLogMin(spec: SliderScaleSpec): number | null {
  const [min, max] = orderedBounds(spec.min, spec.max);
  if (max <= 0) return null;
  if (min > 0) return min;
  const stepFloor = spec.step && spec.step > 0 ? spec.step : max * 0.001;
  return Math.max(1e-9, Math.min(max, stepFloor));
}

function usesLogScale(spec: SliderScaleSpec): boolean {
  return spec.scale === 'log' && effectiveLogMin(spec) != null;
}

export function valueToNorm(value: number, spec: SliderScaleSpec): number {
  const [min, max] = orderedBounds(spec.min, spec.max);
  if (max - min <= Number.EPSILON) return 0;
  const clamped = clampValue(value, min, max);
  const logMin = effectiveLogMin(spec);
  if (usesLogScale(spec) && logMin != null) {
    if (clamped <= min) return 0;
    const denominator = Math.log(max) - Math.log(logMin);
    if (Math.abs(denominator) <= Number.EPSILON) return 0;
    const normalized = clampValue(
      (Math.log(Math.max(logMin, clamped)) - Math.log(logMin)) / denominator,
      0,
      1,
    );
    // Keep zero reserved for an actual zero/minimum while preserving the old
    // visually-zero position for the first positive logarithmic step.
    return normalized === 0 ? Number.EPSILON : normalized;
  }
  return clampValue((clamped - min) / (max - min), 0, 1);
}

export function normToValue(norm: number, spec: SliderScaleSpec): number {
  const [min, max] = orderedBounds(spec.min, spec.max);
  if (max - min <= Number.EPSILON) return min;
  const clampedNorm = clampValue(norm, 0, 1);
  const logMin = effectiveLogMin(spec);
  if (usesLogScale(spec) && logMin != null) {
    const raw = clampedNorm <= 0 && min <= 0
      ? min
      : Math.exp(Math.log(logMin) + clampedNorm * (Math.log(max) - Math.log(logMin)));
    return quantizeToStep(raw, spec);
  }
  return quantizeToStep(min + clampedNorm * (max - min), spec);
}
