import React, { useCallback } from 'react';
import { appStyles as styles } from './appStyles';
import {
  type SliderMode,
  type SliderState,
  getParamInfo,
  getSliderNumericValue,
  getStateValueFromSliderNumber,
  PAD_FILTER_CUTOFF_KEY_PAIRS,
  quantize,
} from '../ui/state';
import { DualSlider, type DualSliderRange } from '../ui/DualSlider';
import { SliderPrimitive } from '../ui/sliderSystem';
import { useSliderHelp } from '../ui/SliderHelpOverlay';
import { MidiLearnSliderAdornment } from '../ui/midiLearn/MidiLearnSliderAdornment';
import { useMidiLearn } from '../ui/midiLearn/useMidiLearn';
import type { SliderPageId } from '../ui/pages/pageAliases';
import { isReleaseCommittedTransportTimingKey } from '../ui/transportTimingPolicy';

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

function getEffectiveLogMin(min: number, max: number, step: number): number | null {
  if (max <= 0) return null;
  if (min > 0) return min;
  const stepFloor = step > 0 ? step : max * 0.001;
  return Math.max(1e-9, Math.min(max, stepFloor));
}

export interface SliderProps {
  label: string;
  value: number;
  paramKey: keyof SliderState;
  ghostValue?: number;
  format?: (value: number) => string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  logarithmic?: boolean;
  helpPage?: SliderPageId;
  disabled?: boolean;
  /** Keep pointer-drag changes local until the pointer is released. */
  commitOnRelease?: boolean;
  onChange: (key: keyof SliderState, value: number) => void;
  mode?: SliderMode;
  dualRange?: DualSliderRange;
  walkPosition?: number;
  isFlashing?: boolean;
  onCycleMode?: (key: keyof SliderState) => void;
  onDualRangeChange?: (key: keyof SliderState, min: number, max: number) => void;
}

export const WALK_ONLY_DUAL_KEYS = new Set<string>([
  'waterChannelsMorph',
  'waterChannelsSpeed',
  'insectsDensity',
  'insectsTemperature',
  'insectsDistance',
  'insectsProximity',
  'insectsAntiphony',
  'insectsClickRate',
  'insectsMotion',
  'insects2Density',
  'insects2Temperature',
  'insects2Distance',
  'insects2Proximity',
  'insects2Antiphony',
  'insects2ClickRate',
  'insects2Motion',
]);

export const SINGLE_ONLY_SLIDER_KEYS = new Set<string>();

function clampQuantizedSliderValue(key: keyof SliderState, value: number): number {
  const info = getParamInfo(key);
  if (!info) return value;
  return quantize(key, Math.max(info.min, Math.min(info.max, value)));
}

export function normalizePadFilterCutoffPairs(state: SliderState, changedKey?: keyof SliderState): SliderState {
  const record = state as unknown as Record<string, SliderState[keyof SliderState] | number>;
  const changedKeyStr = changedKey as string | undefined;

  for (const pair of PAD_FILTER_CUTOFF_KEY_PAIRS) {
    const { minKey, maxKey } = pair;
    const minKeyName = String(minKey);
    const maxKeyName = String(maxKey);
    const minInfo = getParamInfo(minKey);
    const maxInfo = getParamInfo(maxKey);
    if (!minInfo || !maxInfo) continue;

    const rawMin = getSliderNumericValue(minKey, state[minKey]);
    const rawMax = getSliderNumericValue(maxKey, state[maxKey]);
    if (rawMin === null || rawMax === null) continue;

    const step = Math.max(minInfo.step, maxInfo.step, 1e-6);
    let min = clampQuantizedSliderValue(minKey, rawMin);
    let max = clampQuantizedSliderValue(maxKey, rawMax);

    if (min >= max) {
      if (changedKeyStr === minKeyName) {
        max = clampQuantizedSliderValue(maxKey, min + step);
        if (min >= max) min = clampQuantizedSliderValue(minKey, max - step);
      } else if (changedKeyStr === maxKeyName) {
        min = clampQuantizedSliderValue(minKey, max - step);
        if (min >= max) max = clampQuantizedSliderValue(maxKey, min + step);
      } else {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        min = clampQuantizedSliderValue(minKey, low);
        max = clampQuantizedSliderValue(maxKey, high);
        if (min >= max) {
          max = clampQuantizedSliderValue(maxKey, min + step);
          if (min >= max) min = clampQuantizedSliderValue(minKey, max - step);
        }
      }
    }

    record[pair.minKey] = getStateValueFromSliderNumber(minKey, min) as SliderState[keyof SliderState];
    record[pair.maxKey] = getStateValueFromSliderNumber(maxKey, max) as SliderState[keyof SliderState];
  }

  return state;
}

export function normalizeDualSliderMode(key: string, mode?: SliderMode): SliderMode | undefined {
  if (!mode) return mode;
  if (SINGLE_ONLY_SLIDER_KEYS.has(key)) return undefined;
  return WALK_ONLY_DUAL_KEYS.has(key) && mode === 'sampleHold' ? 'walk' : mode;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  paramKey,
  ghostValue,
  format,
  unit,
  min,
  max,
  step,
  logarithmic,
  helpPage,
  disabled = false,
  commitOnRelease,
  onChange,
  mode = 'single',
  dualRange,
  walkPosition,
  isFlashing,
  onCycleMode,
  onDualRangeChange,
}) => {
  const { announceSlider } = useSliderHelp();
  const midiLearn = useMidiLearn();
  const announceHelp = () => announceSlider(String(paramKey), { label, page: helpPage });
  const baseInfo = getParamInfo(paramKey);
  if (!baseInfo) return null;

  const info = {
    ...baseInfo,
    min: min ?? baseInfo.min,
    max: max ?? baseInfo.max,
    step: step ?? baseInfo.step,
  };
  const releaseCommitted = commitOnRelease ?? isReleaseCommittedTransportTimingKey(paramKey);

  const quantizeWithInfo = (_key: keyof SliderState, nextValue: number): number => {
    const clamped = Math.max(info.min, Math.min(info.max, nextValue));
    const stepSize = Math.max(info.step, 1e-9);
    const steps = Math.round((clamped - info.min) / stepSize);
    return info.min + steps * stepSize;
  };

  if (!releaseCommitted && onCycleMode && onDualRangeChange && !SINGLE_ONLY_SLIDER_KEYS.has(String(paramKey))) {
    return (
      <DualSlider<keyof SliderState>
        label={label}
        value={value}
        paramKey={paramKey}
        paramInfo={info}
        quantizeFn={quantizeWithInfo}
        unit={unit}
        logarithmic={logarithmic}
        format={format}
        ghostValue={ghostValue}
        helpPage={helpPage}
        disabled={disabled}
        mode={mode}
        dualRange={dualRange}
        walkPosition={walkPosition}
        isFlashing={isFlashing}
        onChange={onChange}
        onCycleMode={onCycleMode}
        onDualRangeChange={onDualRangeChange}
        groupStyle={styles.sliderGroup}
      />
    );
  }

  const valueToPercent = (nextValue: number) => {
    const clampedValue = Math.max(info.min, Math.min(info.max, nextValue));
    const effectiveLogMin = logarithmic ? getEffectiveLogMin(info.min, info.max, info.step) : null;
    if (effectiveLogMin != null) {
      if (clampedValue <= info.min) return 0;
      return logToLinear(Math.max(effectiveLogMin, clampedValue), effectiveLogMin, info.max) * 100;
    }
    return ((clampedValue - info.min) / Math.max(1e-9, info.max - info.min)) * 100;
  };

  const percentToValue = (percent: number) => {
    const normalized = Math.max(0, Math.min(100, percent)) / 100;
    const effectiveLogMin = logarithmic ? getEffectiveLogMin(info.min, info.max, info.step) : null;
    const raw = effectiveLogMin != null
      ? (normalized <= 0 && info.min <= 0 ? info.min : linearToLog(normalized, effectiveLogMin, info.max))
      : info.min + normalized * (info.max - info.min);
    return quantizeWithInfo(paramKey, raw);
  };

  const formatDisplayValue = (nextValue: number) => (format ? format(nextValue) : info.step < 1 ? nextValue.toFixed(2) : String(Math.round(nextValue)));
  const displayValue = formatDisplayValue(value);
  const valuePercent = valueToPercent(value);
  const ghostPercent = ghostValue == null || !Number.isFinite(ghostValue) ? null : valueToPercent(ghostValue);
  return (
    <SliderPrimitive
      className="app-slider-group"
      style={{ ...styles.sliderGroup, opacity: disabled ? 0.58 : 1 }}
      label={label}
      mode="single"
      value={valuePercent}
      unit={unit}
      hero="#a5c4d4"
      variant="full"
      density="compact"
      displayValue={releaseCommitted ? undefined : `${displayValue}${unit || ''}`}
      formatValue={(percent) => `${formatDisplayValue(percentToValue(percent))}${unit || ''}`}
      ghostValue={ghostPercent ?? undefined}
      disabled={disabled}
      onAnnounce={announceHelp}
      onValueGestureStart={() => {
        midiLearn.notifySliderDrag(paramKey, label);
      }}
      commitValueOnRelease={releaseCommitted}
      headAdornment={<MidiLearnSliderAdornment paramKey={paramKey} label={label} />}
      onValueChange={(nextPercent) => {
        if (disabled) return;
        onChange(paramKey, percentToValue(nextPercent));
      }}
    />
  );
};

export const HelpButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { helpKey: string }> = ({ helpKey, onMouseEnter, onPointerDown, onFocus, ...props }) => {
  const { announceHelp } = useSliderHelp();
  const triggerHelp = useCallback(() => {
    announceHelp(helpKey);
  }, [announceHelp, helpKey]);

  return (
    <button
      {...props}
      onMouseEnter={(e) => {
        triggerHelp();
        onMouseEnter?.(e);
      }}
      onPointerDown={(e) => {
        triggerHelp();
        onPointerDown?.(e);
      }}
      onFocus={(e) => {
        triggerHelp();
        onFocus?.(e);
      }}
    />
  );
};

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onFocus?: React.FocusEventHandler<HTMLSelectElement>;
}

export function Select<T extends string>({ label, value, options, onChange, onMouseEnter, onPointerDown, onFocus }: SelectProps<T>) {
  return (
    <div className="app-slider-group" style={styles.sliderGroup} onMouseEnter={onMouseEnter} onPointerDown={onPointerDown}>
      <div className="app-slider-label" style={styles.sliderLabel}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {label}
        </span>
      </div>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} onFocus={onFocus} className="app-select" style={{ ...styles.select, maxWidth: '100%' }}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
