import React from 'react';
import type { SliderMode } from '../state';
import { tapeHeroBoldVars } from './tapeHeroBold';
import type {
  SliderDensity,
  SliderPrimitiveRange,
  SliderStylingModel,
  SliderVariant,
} from './types';
import {
  LONG_PRESS_MS,
  getTouchGestureIntent,
  releasePointerCaptureSafely,
  setSliderTouchSelectionLock,
} from './matrixMath';
import './sliderPrimitive.css';

const MODE_LABEL: Record<SliderMode, string> = {
  single: 'Single',
  walk: 'Walk',
  sampleHold: 'Sample and hold',
};

const MODE_GLYPH: Record<SliderMode, string> = {
  single: '',
  walk: '~',
  sampleHold: '‖',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function indicatorPercent(
  mode: SliderMode,
  range: SliderPrimitiveRange,
  value: number,
  position = 0.55,
): number {
  if (mode === 'single') return value;
  return range.min + (range.max - range.min) * position;
}

function defaultFormatValue(value: number, unit = '%'): string {
  return `${Math.round(value)}${unit}`;
}

export interface SliderPrimitiveProps {
  label: string;
  mode: SliderMode;
  value: number;
  range?: SliderPrimitiveRange;
  unit?: string;
  hero?: string;
  variant: SliderVariant;
  density: SliderDensity;
  stylingModel?: SliderStylingModel;
  formatValue?: (value: number, unit?: string) => string;
  displayValue?: string;
  indicatorValue?: number;
  isFlashing?: boolean;
  ghostValue?: number;
  ghostRange?: SliderPrimitiveRange;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  onValueChange?: (value: number) => void;
  onRangeChange?: (range: SliderPrimitiveRange) => void;
  onModeCycle?: () => void;
  onAnnounce?: () => void;
}

export function SliderPrimitive({
  label,
  mode,
  value,
  range,
  unit,
  hero,
  variant,
  density,
  stylingModel = 'tapeHeroBold',
  formatValue = defaultFormatValue,
  displayValue,
  indicatorValue,
  isFlashing = false,
  ghostValue,
  ghostRange,
  disabled = false,
  className,
  style,
  title,
  onValueChange,
  onRangeChange,
  onModeCycle,
  onAnnounce,
}: SliderPrimitiveProps) {
  const [liveValue, setLiveValue] = React.useState(value);
  const [liveRange, setLiveRange] = React.useState<SliderPrimitiveRange>(() => range ?? { min: 0, max: value });
  const [dragging, setDragging] = React.useState(false);
  const [activeHandle, setActiveHandle] = React.useState<'min' | 'max' | 'band' | null>(null);
  const railRef = React.useRef<HTMLDivElement>(null);
  const thumbRef = React.useRef<HTMLSpanElement>(null);
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const edgeMinRef = React.useRef<HTMLSpanElement>(null);
  const edgeMaxRef = React.useRef<HTMLSpanElement>(null);
  const dragValueRef = React.useRef<number | null>(null);
  const dragRangeRef = React.useRef<SliderPrimitiveRange | null>(null);
  const dragIndicatorRef = React.useRef<number | null>(null);
  const dragThumbPxRef = React.useRef<number | null>(null);
  const lastEmittedValueRef = React.useRef<number | null>(null);
  const lastEmittedRangeRef = React.useRef<SliderPrimitiveRange | null>(null);
  const pendingTouchCleanupRef = React.useRef<(() => void) | null>(null);
  const usesControlledValue = typeof onValueChange === 'function';
  const usesControlledRange = typeof onRangeChange === 'function' && !!range;

  React.useEffect(() => {
    if (usesControlledValue) {
      setLiveValue(value);
    }
  }, [usesControlledValue, value]);

  React.useEffect(() => {
    if (usesControlledRange && range) {
      setLiveRange(range);
    }
  }, [range, usesControlledRange]);

  React.useEffect(() => () => {
    pendingTouchCleanupRef.current?.();
    setSliderTouchSelectionLock(false);
  }, []);

  const currentValue = usesControlledValue ? value : liveValue;
  const currentRange = usesControlledRange && range ? range : liveRange;
  const visualValue = dragging && dragValueRef.current != null ? dragValueRef.current : currentValue;
  const visualRange = dragging && dragRangeRef.current ? dragRangeRef.current : currentRange;
  const minPct = clamp(visualRange.min, 0, 100);
  const maxPct = clamp(visualRange.max, 0, 100);
  const indicatorPct = clamp(indicatorValue ?? indicatorPercent(mode, currentRange, currentValue), 0, 100);
  const visualIndicatorPct = clamp(dragging && dragIndicatorRef.current != null ? dragIndicatorRef.current : indicatorPct, 0, 100);
  const isDirect = stylingModel === 'tapeHeroBold';
  const showsModeControl = typeof onModeCycle === 'function';
  const emitValueChange = React.useCallback((nextValue: number) => {
    if (!onValueChange) return;
    if (lastEmittedValueRef.current === nextValue) return;
    lastEmittedValueRef.current = nextValue;
    onValueChange(nextValue);
  }, [onValueChange]);
  const emitRangeChange = React.useCallback((nextRange: SliderPrimitiveRange) => {
    if (!onRangeChange) return;
    const last = lastEmittedRangeRef.current;
    if (last && last.min === nextRange.min && last.max === nextRange.max) return;
    lastEmittedRangeRef.current = nextRange;
    onRangeChange(nextRange);
  }, [onRangeChange]);

  const percentFromClientX = (clientX: number, rect: DOMRect) => (
    clamp(((clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100)
  );

  const getRangeTarget = (clientX: number, rect: DOMRect): 'min' | 'max' | 'band' => {
    const startX = clientX - rect.left;
    const minX = (currentRange.min / 100) * rect.width;
    const maxX = (currentRange.max / 100) * rect.width;
    const grab = density === 'comfortable' ? 22 : 14;
    return Math.abs(startX - minX) <= grab ? 'min'
      : Math.abs(startX - maxX) <= grab ? 'max'
        : startX > minX && startX < maxX ? 'band'
          : startX < minX ? 'min' : 'max';
  };

  const commitTapValue = (clientX: number, rect: DOMRect) => {
    lastEmittedValueRef.current = null;
    lastEmittedRangeRef.current = null;

    if (mode === 'single') {
      const nextValue = percentFromClientX(clientX, rect);
      setLiveValue(nextValue);
      emitValueChange(nextValue);
      lastEmittedValueRef.current = null;
      return;
    }

    const target = getRangeTarget(clientX, rect);
    if (target === 'band') return;

    const pointerValue = percentFromClientX(clientX, rect);
    const nextRange = target === 'min'
      ? { min: Math.min(pointerValue, currentRange.max - 4), max: currentRange.max }
      : { min: currentRange.min, max: Math.max(pointerValue, currentRange.min + 4) };
    setLiveRange(nextRange);
    emitRangeChange(nextRange);
    lastEmittedRangeRef.current = null;
  };

  const beginCommittedDrag = ({
    currentTarget,
    pointerId,
    pointerType,
    startClientX,
    initialClientX,
    rect,
  }: {
    currentTarget: HTMLDivElement;
    pointerId: number;
    pointerType: string;
    startClientX: number;
    initialClientX: number;
    rect: DOMRect;
  }) => {
    const isTouch = pointerType === 'touch';
    if (isTouch) setSliderTouchSelectionLock(true);
    try {
      currentTarget.setPointerCapture(pointerId);
    } catch {
      // Some browsers decline capture if the pointer is already cancelled.
    }

    const cleanupCommittedDrag = (
      onMove: (moveEvent: PointerEvent) => void,
      onEnd: (endEvent: PointerEvent) => void,
    ) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      releasePointerCaptureSafely(currentTarget, pointerId);
      if (isTouch) setSliderTouchSelectionLock(false);
    };

    if (mode === 'single') {
      let lastValue = percentFromClientX(initialClientX, rect);

      const applySingleValue = (clientX: number) => {
        const nextValue = percentFromClientX(clientX, rect);
        dragValueRef.current = nextValue;
        dragIndicatorRef.current = nextValue;
        dragThumbPxRef.current = (nextValue / 100) * rect.width;
        lastValue = nextValue;

        if (isDirect) {
          if (thumbRef.current) {
            thumbRef.current.style.transform = `translateX(${dragThumbPxRef.current}px) translateY(-50%)`;
            thumbRef.current.style.left = '0';
          }
          if (fillRef.current) {
            fillRef.current.style.width = `${nextValue}%`;
            fillRef.current.style.opacity = String(0.15 + (nextValue / 100) * 0.85);
          }
        } else {
          setLiveValue(nextValue);
        }

        emitValueChange(nextValue);
      };

      setLiveValue(lastValue);
      setDragging(true);
      applySingleValue(initialClientX);

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        if (isTouch) moveEvent.preventDefault();
        applySingleValue(moveEvent.clientX);
      };

      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        setLiveValue(lastValue);
        dragValueRef.current = null;
        dragIndicatorRef.current = null;
        dragThumbPxRef.current = null;
        if (thumbRef.current) {
          thumbRef.current.style.transform = '';
          thumbRef.current.style.left = '';
        }
        emitValueChange(lastValue);
        lastEmittedValueRef.current = null;
        setDragging(false);
        cleanupCommittedDrag(onMove, onEnd);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      return;
    }

    const startX = startClientX - rect.left;
    const target = getRangeTarget(startClientX, rect);
    const currentSpan = Math.max(1e-6, currentRange.max - currentRange.min);
    const indicatorRatio = clamp((indicatorPct - currentRange.min) / currentSpan, 0, 1);
    const startRange = { ...currentRange };
    let lastRange = startRange;

    setDragging(true);
    setActiveHandle(target);
    setLiveRange(startRange);
    dragRangeRef.current = startRange;
    dragIndicatorRef.current = clamp(
      startRange.min + indicatorRatio * (startRange.max - startRange.min),
      startRange.min,
      startRange.max,
    );
    dragThumbPxRef.current = (dragIndicatorRef.current / 100) * rect.width;
    emitRangeChange(startRange);

    const getNextRange = (clientX: number) => {
      const delta = ((clientX - rect.left - startX) / Math.max(1, rect.width)) * 100;
      if (target === 'band') {
        const span = startRange.max - startRange.min;
        let nextMin = startRange.min + delta;
        let nextMax = nextMin + span;
        if (nextMin < 0) {
          nextMax += -nextMin;
          nextMin = 0;
        }
        if (nextMax > 100) {
          nextMin -= nextMax - 100;
          nextMax = 100;
        }
        return {
          min: clamp(nextMin, 0, 100),
          max: clamp(nextMax, 0, 100),
        };
      }

      const raw = clamp(target === 'min' ? startRange.min + delta : startRange.max + delta, 0, 100);
      return target === 'min'
        ? { min: Math.min(raw, startRange.max - 4), max: startRange.max }
        : { min: startRange.min, max: Math.max(raw, startRange.min + 4) };
    };

    const getNextIndicator = (nextRange: SliderPrimitiveRange) => clamp(
      nextRange.min + indicatorRatio * (nextRange.max - nextRange.min),
      nextRange.min,
      nextRange.max,
    );

    const applyRange = (clientX: number) => {
      const nextRange = getNextRange(clientX);
      const nextIndicatorPct = getNextIndicator(nextRange);
      dragRangeRef.current = nextRange;
      dragIndicatorRef.current = nextIndicatorPct;
      dragThumbPxRef.current = (nextIndicatorPct / 100) * rect.width;
      lastRange = nextRange;

      if (isDirect) {
        if (fillRef.current) {
          fillRef.current.style.left = `${nextRange.min}%`;
          fillRef.current.style.width = `${nextRange.max - nextRange.min}%`;
          fillRef.current.style.opacity = String(0.15 + (nextRange.max / 100) * 0.85);
        }
        if (thumbRef.current) {
          thumbRef.current.style.transform = `translateX(${dragThumbPxRef.current}px) translateY(-50%)`;
          thumbRef.current.style.left = '0';
        }
        if (edgeMinRef.current) edgeMinRef.current.style.left = `${nextRange.min}%`;
        if (edgeMaxRef.current) edgeMaxRef.current.style.left = `${nextRange.max}%`;
      } else {
        setLiveRange(nextRange);
      }

      emitRangeChange(nextRange);
    };

    if (initialClientX !== startClientX) {
      applyRange(initialClientX);
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (isTouch) moveEvent.preventDefault();
      applyRange(moveEvent.clientX);
    };

    const onEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      setLiveRange(lastRange);
      dragRangeRef.current = null;
      dragIndicatorRef.current = null;
      dragThumbPxRef.current = null;
      if (thumbRef.current) {
        thumbRef.current.style.transform = '';
        thumbRef.current.style.left = '';
      }
      emitRangeChange(lastRange);
      lastEmittedRangeRef.current = null;
      setDragging(false);
      setActiveHandle(null);
      cleanupCommittedDrag(onMove, onEnd);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!railRef.current || disabled) return;
    onAnnounce?.();
    pendingTouchCleanupRef.current?.();
    lastEmittedValueRef.current = null;
    lastEmittedRangeRef.current = null;

    const currentTarget = event.currentTarget;
    const rect = railRef.current.getBoundingClientRect();

    if (event.pointerType !== 'touch') {
      event.preventDefault();
      beginCommittedDrag({
        currentTarget,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientX: event.clientX,
        initialClientX: event.clientX,
        rect,
      });
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressConsumed = false;
    let cancelledForScroll = false;

    setSliderTouchSelectionLock(true);

    const clearLongPressTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const cleanupPendingTouch = () => {
      clearLongPressTimer();
      window.removeEventListener('pointermove', onPendingMove);
      window.removeEventListener('pointerup', onPendingEnd);
      window.removeEventListener('pointercancel', onPendingEnd);
      releasePointerCaptureSafely(currentTarget, event.pointerId);
      setSliderTouchSelectionLock(false);
      if (pendingTouchCleanupRef.current === cleanupPendingTouch) {
        pendingTouchCleanupRef.current = null;
      }
    };

    const onPendingMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId || longPressConsumed) return;
      const intent = getTouchGestureIntent(startX, startY, moveEvent.clientX, moveEvent.clientY);
      if (intent === 'pending') return;

      clearLongPressTimer();
      if (intent === 'scroll') {
        cancelledForScroll = true;
        cleanupPendingTouch();
        return;
      }

      moveEvent.preventDefault();
      cleanupPendingTouch();
      beginCommittedDrag({
        currentTarget,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startClientX: startX,
        initialClientX: moveEvent.clientX,
        rect,
      });
    };

    const onPendingEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;
      const shouldTap = !longPressConsumed && !cancelledForScroll;
      cleanupPendingTouch();
      if (shouldTap) {
        commitTapValue(startX, rect);
      }
      longPressConsumed = false;
    };

    if (onModeCycle) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressConsumed = true;
        if (!disabled) onModeCycle();
        if (navigator.vibrate) navigator.vibrate(50);
      }, LONG_PRESS_MS);
    }

    pendingTouchCleanupRef.current = cleanupPendingTouch;
    try {
      currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if the browser has already handed the touch to scroll.
    }
    window.addEventListener('pointermove', onPendingMove, { passive: false });
    window.addEventListener('pointerup', onPendingEnd);
    window.addEventListener('pointercancel', onPendingEnd);
  };

  const valueText = displayValue ?? (mode === 'single'
    ? formatValue(visualValue, unit)
    : `${formatValue(visualRange.min, unit)}-${formatValue(visualRange.max, unit)}`);
  const thumbStyle: React.CSSProperties = dragging && dragThumbPxRef.current != null
    ? {
        left: '0',
        transform: `translateX(${dragThumbPxRef.current}px) translateY(-50%)`,
      }
    : { left: `${visualIndicatorPct}%` };

  const rootStyle: React.CSSProperties = {
    ...(hero ? { ['--hero' as string]: hero } : {}),
    ...(hero ? tapeHeroBoldVars(hero) : {}),
    ...style,
  };

  return (
    <div
      className={[
        'sl-slider',
        'sl-slider--tapeHeroBold',
        `sl-slider--${variant}`,
        `sl-slider--${density}`,
        `sl-slider--mode-${mode}`,
        disabled ? 'sl-slider--disabled' : '',
        isFlashing ? 'sl-slider--flashing' : '',
        dragging ? 'sl-slider--dragging' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={rootStyle}
      title={title}
      aria-disabled={disabled}
      onMouseEnter={onAnnounce}
      onFocus={onAnnounce}
    >
      <div
        className="sl-slider-head"
        onDoubleClick={() => {
          if (!disabled) onModeCycle?.();
        }}
      >
        {showsModeControl ? (
          <span
            className={`sl-slider-mode sl-slider-mode--${mode}${disabled ? '' : ' interactive'}`}
            aria-label={MODE_LABEL[mode]}
            role={disabled ? undefined : 'button'}
            tabIndex={disabled ? -1 : 0}
            title={disabled ? MODE_LABEL[mode] : `Mode: ${MODE_LABEL[mode]}. Click to cycle.`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!disabled) onModeCycle?.();
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onModeCycle?.();
              }
            }}
          >
            <span className="sl-slider-mode-glyph">{MODE_GLYPH[mode]}</span>
            <span className="sl-slider-mode-text">{MODE_LABEL[mode]}</span>
          </span>
        ) : (
          hero && <span className="sl-slider-hero-dot" aria-hidden="true" />
        )}
        <span className="sl-slider-label">{label}</span>
        <span className="sl-slider-value app-slider-value">{valueText}</span>
      </div>

      <div
        ref={railRef}
        className="sl-slider-rail"
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) onModeCycle?.();
        }}
        onPointerDown={beginDrag}
      >
        <span className="sl-slider-track" />

        {mode === 'single' ? (
          <span
            ref={fillRef}
            className="sl-slider-fill"
            style={{
              width: `${clamp(visualValue, 0, 100)}%`,
              opacity: 0.15 + (visualValue / 100) * 0.85,
            }}
          />
        ) : (
          <span
            ref={fillRef}
            className="sl-slider-band"
            style={{
              left: `${minPct}%`,
              width: `${maxPct - minPct}%`,
              opacity: 0.15 + (maxPct / 100) * 0.85,
            }}
          />
        )}

        {mode !== 'single' && (
          <>
            <span
              ref={edgeMinRef}
              className={`sl-slider-edge sl-slider-edge--min${activeHandle === 'min' || activeHandle === 'band' ? ' active' : ''}`}
              style={{ left: `${minPct}%` }}
            />
            <span
              ref={edgeMaxRef}
              className={`sl-slider-edge sl-slider-edge--max${activeHandle === 'max' || activeHandle === 'band' ? ' active' : ''}`}
              style={{ left: `${maxPct}%` }}
            />
          </>
        )}

        {ghostRange && (
          <span
            className="sl-slider-ghost-band"
            style={{
              left: `${clamp(ghostRange.min, 0, 100)}%`,
              width: `${clamp(ghostRange.max, 0, 100) - clamp(ghostRange.min, 0, 100)}%`,
            }}
          />
        )}
        {typeof ghostValue === 'number' && Number.isFinite(ghostValue) && (
          <span className="sl-slider-ghost" style={{ left: `${clamp(ghostValue, 0, 100)}%` }} />
        )}
        <span ref={thumbRef} className="sl-slider-thumb" style={thumbStyle} />
      </div>
    </div>
  );
}
