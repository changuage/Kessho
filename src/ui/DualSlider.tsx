/**
 * Shared DualSlider adapter.
 *
 * This component owns app-specific value mapping, quantization, runtime walk
 * indicators, and help announcements. The actual visual/control surface is the
 * unified SliderPrimitive.
 */

import React from 'react';
import type { SliderMode } from './state';
import { useSliderHelp } from './SliderHelpOverlay';
import type { SliderPageId } from './sliderHelpCatalog';
import { useRuntimeSliderIndicator } from './runtimeSliderState';
import { SliderPrimitive, type SliderPrimitiveRange } from './sliderSystem';

export interface DualSliderRange {
  min: number;
  max: number;
}

export interface DualSliderParamInfo {
  min: number;
  max: number;
  step: number;
}

export interface DualSliderProps<K extends string = string> {
  label: string;
  value: number;
  paramKey: K;
  paramInfo: DualSliderParamInfo;
  quantizeFn: (key: K, value: number) => number;

  unit?: string;
  logarithmic?: boolean;
  helpPage?: SliderPageId;
  disabled?: boolean;
  mode: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  format?: (v: number) => string;
  ghostValue?: number;

  onChange: (key: K, value: number) => void;
  onCycleMode: (key: K) => void;
  onDualRangeChange: (key: K, min: number, max: number) => void;

  groupClassName?: string;
  groupStyle?: React.CSSProperties;
  fillColor?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function valuesNearlyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function linearToLog(value: number, min: number, max: number): number {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return Math.exp(minLog + value * (maxLog - minLog));
}

function logToLinear(value: number, min: number, max: number): number {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return (Math.log(value) - minLog) / (maxLog - minLog);
}

function canUseLog(info: DualSliderParamInfo, logarithmic?: boolean): boolean {
  return Boolean(logarithmic && info.min > 0 && info.max > 0);
}

function normalizePercent(value: number): number {
  return clamp(value, 0, 100);
}

export function DualSlider<K extends string = string>({
  label,
  value,
  paramKey,
  paramInfo: info,
  quantizeFn,
  unit,
  logarithmic,
  helpPage,
  disabled = false,
  mode,
  dualRange,
  walkPosition,
  isFlashing,
  format: formatProp,
  ghostValue,
  onChange,
  onCycleMode,
  onDualRangeChange,
  groupClassName = 'app-slider-group',
  groupStyle,
  fillColor = '#a5c4d4',
}: DualSliderProps<K>) {
  const { announceSlider } = useSliderHelp();
  const runtimeIndicator = useRuntimeSliderIndicator(String(paramKey), mode, walkPosition, isFlashing);
  const isDualMode = mode !== 'single';
  const lastSubmittedValueRef = React.useRef<number | null>(null);
  const lastSubmittedRangeRef = React.useRef<DualSliderRange | null>(null);

  React.useEffect(() => {
    lastSubmittedValueRef.current = null;
    lastSubmittedRangeRef.current = null;
  }, [dualRange, mode, paramKey, value]);

  const announceHelp = React.useCallback(() => {
    announceSlider(String(paramKey), { label, page: helpPage });
  }, [announceSlider, helpPage, label, paramKey]);

  const valueToPercent = React.useCallback((nextValue: number) => {
    const clamped = clamp(nextValue, info.min, info.max);
    if (canUseLog(info, logarithmic)) {
      return normalizePercent(logToLinear(clamped, info.min, info.max) * 100);
    }
    return normalizePercent(((clamped - info.min) / Math.max(1e-9, info.max - info.min)) * 100);
  }, [info, logarithmic]);

  const percentToValue = React.useCallback((percent: number) => {
    const normalized = normalizePercent(percent) / 100;
    const raw = canUseLog(info, logarithmic)
      ? linearToLog(normalized, info.min, info.max)
      : info.min + normalized * (info.max - info.min);
    return quantizeFn(paramKey, raw);
  }, [info, logarithmic, paramKey, quantizeFn]);

  const formatValue = React.useCallback((nextValue: number) => {
    if (formatProp) return formatProp(nextValue);
    if (nextValue == null) return '0';
    return info.step < 1 ? nextValue.toFixed(2) : String(Math.round(nextValue));
  }, [formatProp, info.step]);

  const formatPercent = React.useCallback((percent: number) => (
    formatValue(percentToValue(percent))
  ), [formatValue, percentToValue]);

  const normalizedRange: SliderPrimitiveRange | undefined = React.useMemo(() => {
    if (!isDualMode) return undefined;
    const source = dualRange ?? { min: info.min, max: info.max };
    const min = valueToPercent(Math.min(source.min, source.max));
    const max = valueToPercent(Math.max(source.min, source.max));
    return { min, max };
  }, [dualRange, info.max, info.min, isDualMode, valueToPercent]);

  const valuePercent = valueToPercent(value);
  const rangeForDisplay = dualRange ?? { min: info.min, max: info.max };
  const valuePositionInRange = dualRange
    ? clamp((value - dualRange.min) / Math.max(1e-9, dualRange.max - dualRange.min), 0, 1)
    : 0.5;
  const effectiveWalkPosition = runtimeIndicator.walkPosition ?? walkPosition ?? valuePositionInRange;
  const indicatorValue = normalizedRange
    ? normalizedRange.min + clamp(effectiveWalkPosition, 0, 1) * (normalizedRange.max - normalizedRange.min)
    : valuePercent;
  const currentValue = dualRange
    ? dualRange.min + clamp(effectiveWalkPosition, 0, 1) * (dualRange.max - dualRange.min)
    : value;

  const previewTolerance = Math.max(info.step * 0.5, (info.max - info.min) * 1e-6);
  const hasGhostShift = ghostValue != null
    && Number.isFinite(ghostValue)
    && !valuesNearlyEqual(clamp(ghostValue, info.min, info.max), clamp(value, info.min, info.max), previewTolerance);

  const translatedGhostRange = dualRange && hasGhostShift
    ? (() => {
        const clampedGhost = clamp(ghostValue as number, info.min, info.max);
        const clampedValue = clamp(value, info.min, info.max);
        let shiftedMin: number;
        let shiftedMax: number;

        if (canUseLog(info, logarithmic) && clampedValue > 0) {
          const ratio = clampedGhost / clampedValue;
          shiftedMin = dualRange.min * ratio;
          shiftedMax = dualRange.max * ratio;
        } else {
          const delta = clampedGhost - clampedValue;
          shiftedMin = dualRange.min + delta;
          shiftedMax = dualRange.max + delta;
        }

        if (shiftedMin < info.min) {
          shiftedMax += info.min - shiftedMin;
          shiftedMin = info.min;
        }
        if (shiftedMax > info.max) {
          shiftedMin -= shiftedMax - info.max;
          shiftedMax = info.max;
        }

        const quantizedMin = quantizeFn(paramKey, clamp(shiftedMin, info.min, info.max));
        const quantizedMax = quantizeFn(paramKey, clamp(shiftedMax, info.min, info.max));
        const nextRange = quantizedMin <= quantizedMax
          ? { min: quantizedMin, max: quantizedMax }
          : { min: quantizedMax, max: quantizedMin };

        return valuesNearlyEqual(nextRange.min, dualRange.min, previewTolerance)
          && valuesNearlyEqual(nextRange.max, dualRange.max, previewTolerance)
          ? null
          : {
              min: valueToPercent(nextRange.min),
              max: valueToPercent(nextRange.max),
            };
      })()
    : null;

  const displayValue = isDualMode
    ? `${formatValue(rangeForDisplay.min)}-${formatValue(rangeForDisplay.max)}${unit || ''}`
    : `${formatValue(value)}${unit || ''}`;

  return (
    <SliderPrimitive
      className={groupClassName}
      style={{ ...groupStyle, opacity: disabled ? 0.58 : groupStyle?.opacity }}
      label={label}
      mode={mode}
      value={valuePercent}
      range={normalizedRange}
      unit={unit}
      hero={mode === 'sampleHold' ? '#d4a520' : fillColor}
      variant="full"
      density="compact"
      displayValue={displayValue}
      formatValue={formatPercent}
      indicatorValue={indicatorValue}
      isFlashing={runtimeIndicator.isFlashing}
      ghostValue={!translatedGhostRange && hasGhostShift ? valueToPercent(ghostValue as number) : undefined}
      ghostRange={translatedGhostRange ?? undefined}
      disabled={disabled}
      title={isDualMode
        ? `${label}: ${displayValue} active ${formatValue(currentValue)}${unit || ''}. Click the mode symbol to cycle.`
        : `${label}: ${displayValue}. Click the mode symbol to cycle.`}
      onAnnounce={announceHelp}
      onModeCycle={() => {
        if (!disabled) onCycleMode(paramKey);
      }}
      onValueChange={(nextPercent) => {
        if (disabled) return;
        const nextValue = percentToValue(nextPercent);
        if (lastSubmittedValueRef.current === nextValue) return;
        lastSubmittedValueRef.current = nextValue;
        onChange(paramKey, nextValue);
      }}
      onRangeChange={(nextRange) => {
        if (disabled) return;
        const min = percentToValue(Math.min(nextRange.min, nextRange.max));
        const max = percentToValue(Math.max(nextRange.min, nextRange.max));
        const submittedRange = { min: Math.min(min, max), max: Math.max(min, max) };
        const lastRange = lastSubmittedRangeRef.current;
        if (lastRange?.min === submittedRange.min && lastRange.max === submittedRange.max) return;
        lastSubmittedRangeRef.current = submittedRange;
        onDualRangeChange(paramKey, submittedRange.min, submittedRange.max);
      }}
    />
  );
}

export default DualSlider;
