/**
 * Shared DualSlider Component
 *
 * Generic 3-mode slider (single / walk / sampleHold) used by both
 * the main App (synth, drum, granular, ocean) and the Earth page
 * (water, ocean-WASM, insects).
 *
 * Consumers provide:
 *  - paramInfo (min/max/step) and quantizeFn instead of a global lookup
 *  - Layout via className props to match either App inline-styles or Earth CSS
 */

import React, { useState, useEffect, useRef } from 'react';
import type { SliderMode } from './state';
import { useSliderHelp } from './SliderHelpOverlay';
import type { SliderPageId } from './sliderHelpCatalog';

// ═══ Exported Types ═══

export interface DualSliderRange {
  min: number;
  max: number;
}

export interface DualSliderParamInfo {
  min: number;
  max: number;
  step: number;
}

// ═══ Inline styles (shared across all consumers) ═══

const dualStyles = {
  container: {
    position: 'relative' as const,
    width: '100%',
    flex: 1,
    minWidth: 0,
    height: '20px',
    borderRadius: '3px',
    background: 'rgba(255, 255, 255, 0.2)',
    cursor: 'pointer',
  } as React.CSSProperties,
  track: {
    position: 'absolute' as const,
    height: '100%',
    borderRadius: '3px',
  } as React.CSSProperties,
  thumb: {
    position: 'absolute' as const,
    top: '50%',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    cursor: 'grab',
    border: '2px solid rgba(255,255,255,0.8)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    zIndex: 2,
  } as React.CSSProperties,
  walkIndicator: {
    position: 'absolute' as const,
    top: '50%',
    width: '8px',
    height: '8px',
    background: '#fff',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 0 8px rgba(255,255,255,0.8)',
    pointerEvents: 'none' as const,
    zIndex: 1,
  } as React.CSSProperties,
  modeIndicator: {
    fontSize: '0.65rem',
    marginLeft: '8px',
  } as React.CSSProperties,
};

// ═══ Logarithmic helpers ═══

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ═══ Component ═══

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

  /** CSS class for the outer wrapper (default: 'app-slider-group') */
  groupClassName?: string;
  /** CSS class for the label row (default: 'app-slider-label') */
  labelClassName?: string;
  /** CSS class for the range input in single mode (default: 'app-slider') */
  sliderClassName?: string;

  /** Inline style overrides for the outer wrapper */
  groupStyle?: React.CSSProperties;
  /** Inline style overrides for the label row */
  labelStyle?: React.CSSProperties;
  /** Inline style overrides for the range input track */
  sliderStyle?: React.CSSProperties;

  /** Accent color for single-mode fill gradient (default: 'rgba(160,200,220,0.5)') */
  fillColor?: string;
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
  labelClassName = 'app-slider-label',
  sliderClassName = 'app-slider',
  groupStyle,
  labelStyle,
  sliderStyle,
  fillColor = 'rgba(160,200,220,0.5)',
}: DualSliderProps<K>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  const { announceSlider } = useSliderHelp();
  const announceHelp = () => announceSlider(String(paramKey), { label, page: helpPage });

  // Long press detection for mobile (cycle slider mode)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handleLongPressStart = (_e: React.TouchEvent) => {
    if (disabled) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onCycleMode(paramKey);
    }, 400);
  };
  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const handleLongPressMove = () => handleLongPressEnd();

  // Position helpers
  const valueToPercent = (val: number) => {
    if (logarithmic) {
      return logToLinear(Math.max(info.min, Math.min(info.max, val)), info.min, info.max) * 100;
    }
    return ((val - info.min) / (info.max - info.min)) * 100;
  };

  const percentToValue = (percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent));
    if (logarithmic) {
      return linearToLog(clamped / 100, info.min, info.max);
    }
    return info.min + (clamped / 100) * (info.max - info.min);
  };

  // Format display value
  const formatValue = (val: number) => {
    if (formatProp) return formatProp(val);
    if (val == null) return '0';
    return info.step < 1 ? val.toFixed(2) : String(Math.round(val));
  };

  const handleDoubleClick = () => {
    if (disabled) return;
    onCycleMode(paramKey);
  };

  const handleDragStart = (thumb: 'min' | 'max') => (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDragging(thumb);
  };

  const isDualMode = mode !== 'single';
  const modeColor = mode === 'walk' ? '#a5c4d4' : '#D4A520';
  const modeLabel = mode === 'walk' ? '⟷ walk' : '⟷ S&H';
  const ghostPercent = ghostValue == null ? null : valueToPercent(clamp(ghostValue, info.min, info.max));

  // Drag handling
  useEffect(() => {
    if (!dragging || !isDualMode || !dualRange) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'touches' in e
        ? (e.touches.length > 0 ? e.touches[0]!.clientX : rect.left)
        : e.clientX;
      const percent = ((clientX - rect.left) / rect.width) * 100;
      const newValue = quantizeFn(paramKey, percentToValue(percent));

      if (dragging === 'min') {
        onDualRangeChange(paramKey, Math.min(newValue, dualRange.max), dualRange.max);
      } else {
        onDualRangeChange(paramKey, dualRange.min, Math.max(newValue, dualRange.min));
      }
    };

    const handleEnd = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragging, isDualMode, dualRange, paramKey, onDualRangeChange, quantizeFn]);

  // ── Single slider mode ──
  if (!isDualMode) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      announceHelp();
      if (disabled) return;
      let newValue = parseFloat(e.target.value);
      if (logarithmic) {
        newValue = linearToLog(newValue, info.min, info.max);
      }
      onChange(paramKey, quantizeFn(paramKey, newValue));
    };

    const sliderValue = logarithmic
      ? logToLinear(Math.max(info.min, Math.min(info.max, value)), info.min, info.max)
      : value;
    const sliderMin = logarithmic ? 0 : info.min;
    const sliderMax = logarithmic ? 1 : info.max;
    const sliderStep = logarithmic ? 0.001 : info.step;

    const fillPercent = sliderMax > sliderMin
      ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
      : 0;

    return (
      <div
        className={groupClassName}
        style={{ ...groupStyle, opacity: disabled ? 0.58 : 1 }}
        onMouseEnter={announceHelp}
        onPointerDown={announceHelp}
      >
        <div className={labelClassName} style={labelStyle}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
            {label}
          </span>
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatValue(value)}
            {unit || ''}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={sliderValue}
            onChange={handleChange}
            onFocus={announceHelp}
            onDoubleClick={handleDoubleClick}
            onTouchStart={handleLongPressStart}
            onTouchEnd={handleLongPressEnd}
            onTouchMove={handleLongPressMove}
            disabled={disabled}
            className={sliderClassName}
            style={{
              ...sliderStyle,
              cursor: disabled ? 'not-allowed' : undefined,
              background: `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${fillPercent}%, rgba(255,255,255,0.2) ${fillPercent}%, rgba(255,255,255,0.2) 100%)`,
            }}
            title="Double-click or long-press to cycle mode"
          />
          {ghostPercent !== null && Number.isFinite(ghostPercent) && (
            <div
              style={{
                position: 'absolute',
                left: `${ghostPercent}%`,
                top: 'calc(50% + 1px)',
                width: '2px',
                height: '16px',
                transform: 'translate(-50%, -50%)',
                borderRadius: '999px',
                background: 'rgba(255, 226, 150, 0.98)',
                boxShadow: '0 0 8px rgba(255, 214, 120, 0.7)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Dual slider mode (walk or sampleHold) ──
  const minPercent = valueToPercent(dualRange?.min ?? info.min);
  const maxPercent = valueToPercent(dualRange?.max ?? info.max);

  const walkPercent = walkPosition !== undefined
    ? minPercent + (walkPosition * (maxPercent - minPercent))
    : (minPercent + maxPercent) / 2;

  const currentValue = dualRange
    ? dualRange.min + (walkPosition ?? 0.5) * (dualRange.max - dualRange.min)
    : value;

  return (
    <div
      className={`${groupClassName} dual-active`}
      style={{ ...groupStyle, opacity: disabled ? 0.58 : 1 }}
      onMouseEnter={announceHelp}
      onPointerDown={announceHelp}
    >
      <div className={labelClassName} style={labelStyle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
          {label}
          <span style={{ ...dualStyles.modeIndicator, color: modeColor }}>{modeLabel}</span>
        </span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
          {formatValue(dualRange?.min ?? info.min)}-{formatValue(dualRange?.max ?? info.max)}
          {unit || ''}
          <span style={{ color: '#fff', marginLeft: '4px' }}>
            ({formatValue(currentValue)})
          </span>
        </span>
      </div>
      <div
        ref={containerRef}
        style={dualStyles.container}
        onMouseEnter={announceHelp}
        onPointerDown={announceHelp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleLongPressStart}
        onTouchEnd={handleLongPressEnd}
        onTouchMove={handleLongPressMove}
        aria-disabled={disabled}
        title="Double-click or long-press to cycle mode"
      >
        {/* Range track */}
        <div
          style={{
            ...dualStyles.track,
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
            background: mode === 'walk' ? 'rgba(165,196,212,0.3)' : 'rgba(212,165,32,0.3)',
          }}
        />
        {/* Min thumb */}
        <div
          style={{
            ...dualStyles.thumb,
            left: `${minPercent}%`,
            background: dragging === 'min' ? '#fff' : modeColor,
            cursor: disabled ? 'not-allowed' : 'ew-resize',
          }}
          onMouseDown={handleDragStart('min')}
          onTouchStart={handleDragStart('min')}
        />
        {/* Max thumb */}
        <div
          style={{
            ...dualStyles.thumb,
            left: `${maxPercent}%`,
            background: dragging === 'max' ? '#fff' : modeColor,
            cursor: disabled ? 'not-allowed' : 'ew-resize',
          }}
          onMouseDown={handleDragStart('max')}
          onTouchStart={handleDragStart('max')}
        />
        {/* Walk/trigger indicator */}
        <div
          style={{
            ...dualStyles.walkIndicator,
            left: `${walkPercent}%`,
            transition: isFlashing ? 'all 0.05s ease-out' : 'all 0.18s ease-in',
            ...(isFlashing ? {
              width: '14px',
              height: '14px',
              background: '#D4A520',
              boxShadow: '0 0 14px rgba(212,165,32,0.9)',
            } : {}),
          }}
        />
        {ghostPercent !== null && Number.isFinite(ghostPercent) && (
          <div
            style={{
              position: 'absolute',
              left: `${ghostPercent}%`,
              top: 'calc(50% + 1px)',
              width: '2px',
              height: '16px',
              transform: 'translate(-50%, -50%)',
              borderRadius: '999px',
              background: 'rgba(255, 226, 150, 0.98)',
              boxShadow: '0 0 8px rgba(255, 214, 120, 0.7)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default DualSlider;
