import React, { useCallback } from 'react';
import { appStyles as styles } from './appStyles';
import {
  type SliderMode,
  type SliderState,
  getParamInfo,
} from '../ui/state';
import { DualSlider } from '../ui/DualSlider';
import { SliderPrimitive } from '../ui/sliderSystem';
import type { SliderRendererProps } from '../ui/sliderSystem';
import { normToValue, quantizeToStep, valueToNorm } from '../ui/sliderSystem/scale';
import { useSliderHelp } from '../ui/SliderHelpOverlay';
import { MidiLearnSliderAdornment } from '../ui/midiLearn/MidiLearnSliderAdornment';
import { useMidiLearn } from '../ui/midiLearn/useMidiLearn';
import {
  getSliderCapability,
  normalizeSliderMode,
} from '../ui/sliderSystem/sliderCapabilities';

export interface SliderProps extends SliderRendererProps<keyof SliderState> {
}

export function normalizeDualSliderMode(key: string, mode?: SliderMode): SliderMode | undefined {
  return normalizeSliderMode(key, mode);
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
  const releaseCommitted = commitOnRelease ?? false;

  const quantizeWithInfo = (_key: keyof SliderState, nextValue: number): number => {
    return quantizeToStep(nextValue, info);
  };

  const capability = getSliderCapability(String(paramKey));
  if (!releaseCommitted && onCycleMode && onDualRangeChange && capability !== undefined && capability !== 'single') {
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
    return valueToNorm(nextValue, {
      ...info,
      scale: logarithmic ? 'log' : 'linear',
    }) * 100;
  };

  const percentToValue = (percent: number) => {
    const raw = normToValue(percent / 100, {
      ...info,
      scale: logarithmic ? 'log' : 'linear',
    });
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

export interface SelectProps<T extends string | number = string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onFocus?: React.FocusEventHandler<HTMLSelectElement>;
}

export type SelectRenderer = <T extends string | number>(props: SelectProps<T>) => React.ReactNode;

export function Select<T extends string | number>({ label, value, options, onChange, onMouseEnter, onPointerDown, onFocus }: SelectProps<T>) {
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
      <select
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value);
          if (selected) onChange(selected.value);
        }}
        onFocus={onFocus}
        className="app-select"
        style={{ ...styles.select, maxWidth: '100%' }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
