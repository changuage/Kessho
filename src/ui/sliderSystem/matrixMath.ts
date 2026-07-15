import type { DualSliderRange } from '../DualSlider';
import {
  normToValue as sharedNormToValue,
  quantizeToStep,
  valueToNorm as sharedValueToNorm,
} from './scale';

export type MatrixCellHandle = 'single' | 'min' | 'max' | 'both';
export type NumericRange = { min: number; max: number };
export type QuantizationRange = { min: number; max: number; step: number };

export const TRACK_PAD_PX = 6;
export const EDGE_HANDLE_PX = 8;
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
export const TOUCH_DRAG_INTENT_PX = 10;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function axisToNormalized(clientPosition: number, axisStart: number, axisLength: number): number {
  return clamp01((clientPosition - axisStart) / Math.max(1, axisLength));
}

export function shiftRangePreservingWidth(
  range: NumericRange,
  delta: number,
  lowerBound = 0,
  upperBound = 1,
): NumericRange {
  const width = Math.min(upperBound - lowerBound, Math.max(0, range.max - range.min));
  const min = Math.min(upperBound - width, Math.max(lowerBound, range.min + delta));
  return { min, max: min + width };
}

export function getNearestRangeHandle(
  value: number,
  range: NumericRange,
  threshold: number,
): 'min' | 'max' | 'both' {
  const safeThreshold = Math.max(0, threshold);
  if (range.max - range.min <= safeThreshold * 2 && value >= range.min && value <= range.max) return 'both';
  if (value <= range.min + safeThreshold) return 'min';
  if (value >= range.max - safeThreshold) return 'max';
  if (value > range.min && value < range.max) return 'both';
  return Math.abs(value - range.min) <= Math.abs(value - range.max) ? 'min' : 'max';
}

export function quantize01(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

export function normalizeUnitRange(range?: DualSliderRange): DualSliderRange | undefined {
  if (!range) return undefined;
  const min = quantize01(Math.min(range.min, range.max));
  const max = quantize01(Math.max(range.min, range.max));
  return { min, max };
}

export function pointerToTrackNorm(clientX: number, rect: DOMRect): number {
  const innerWidth = Math.max(1, rect.width - TRACK_PAD_PX * 2);
  return axisToNormalized(clientX, rect.left + TRACK_PAD_PX, innerWidth);
}

export function getDualHandle(norm: number, range: DualSliderRange, rect: DOMRect): MatrixCellHandle {
  const innerWidth = Math.max(1, rect.width - TRACK_PAD_PX * 2);
  const threshold = Math.min(0.18, EDGE_HANDLE_PX / innerWidth);
  return getNearestRangeHandle(norm, range, threshold);
}

export function trackLeftCalc(norm: number): string {
  return `calc(${TRACK_PAD_PX}px + (100% - ${TRACK_PAD_PX * 2}px) * ${clamp01(norm)})`;
}

export function trackWidthCalc(norm: number): string {
  return `calc((100% - ${TRACK_PAD_PX * 2}px) * ${clamp01(norm)})`;
}

export function releasePointerCaptureSafely(target: EventTarget & HTMLElement, pointerId: number): void {
  if (target.hasPointerCapture(pointerId)) {
    target.releasePointerCapture(pointerId);
  }
}

export function getTouchGestureIntent(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): 'pending' | 'drag' | 'scroll' {
  const dx = Math.abs(clientX - startX);
  const dy = Math.abs(clientY - startY);
  if (dx < TOUCH_DRAG_INTENT_PX && dy < LONG_PRESS_MOVE_TOLERANCE_PX) return 'pending';
  if (dy >= LONG_PRESS_MOVE_TOLERANCE_PX && dy >= dx) return 'scroll';
  if (dx >= TOUCH_DRAG_INTENT_PX && dx > dy) return 'drag';
  return 'pending';
}

export function setSliderTouchSelectionLock(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('sl-slider-touch-lock', enabled);
}

export function rangesEqual(a?: DualSliderRange, b?: DualSliderRange): boolean {
  if (!a || !b) return false;
  return a.min === b.min && a.max === b.max;
}

export function quantizeValue(value: number, info: QuantizationRange): number {
  return quantizeToStep(value, info);
}

export function valueToNorm(value: number, info: QuantizationRange, logarithmic?: boolean): number {
  return sharedValueToNorm(value, { ...info, scale: logarithmic ? 'log' : 'linear' });
}

export function normToValue(norm: number, info: QuantizationRange, logarithmic?: boolean): number {
  return sharedNormToValue(norm, { ...info, scale: logarithmic ? 'log' : 'linear' });
}

export function normalizeQuantizedRange(
  range: DualSliderRange | undefined,
  info: QuantizationRange,
  logarithmic?: boolean,
): DualSliderRange | undefined {
  if (!range) return undefined;
  const min = quantizeValue(range.min, info);
  const max = quantizeValue(range.max, info);
  const normalizedMin = Math.max(info.min, Math.min(info.max, Math.min(min, max)));
  const normalizedMax = Math.max(info.min, Math.min(info.max, Math.max(min, max)));
  if (logarithmic && info.min > 0 && info.max > 0 && normalizedMin <= 0) {
    return { min: info.min, max: normalizedMax };
  }
  return { min: normalizedMin, max: normalizedMax };
}

export function stepDecimals(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const text = String(step);
  const decimalIndex = text.indexOf('.');
  return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
}
