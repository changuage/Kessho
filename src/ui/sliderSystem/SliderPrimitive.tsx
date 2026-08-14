import React from 'react';
import { recordSliderSystemCounter } from '../../diagnostics/sliderSystemInstrumentation';
import type { SliderMode } from '../state';
import { tapeHeroBoldVars } from './tapeHeroBold';
import type {
  SliderDensity,
  SliderPrimitiveRange,
  SliderStylingModel,
  SliderVariant,
} from './types';
import type { ModulationSlot } from './dualConfigReducer';
import { SliderContextControl } from './SliderContextControl';
import { SliderModeButton } from './SliderModeButton';
import {
  LONG_PRESS_MS,
  axisToNormalized,
  getTouchGestureIntent,
  releasePointerCaptureSafely,
  setSliderTouchSelectionLock,
  shiftRangePreservingWidth,
} from './matrixMath';
import './sliderPrimitive.css';
import { useElementWidth } from './useElementWidth';
import { useRafCoalescedEmitter } from './useRafCoalescedEmitter';

export type SliderPresentationMode = SliderMode;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function indicatorPercent(
  mode: SliderPresentationMode,
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
  mode: SliderPresentationMode;
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
  keyboardStep?: number; fineKeyboardStep?: number; dragStep?: number; fineDragStep?: number; onDoubleClick?: () => void;
  onValueChange?: (value: number) => void;
  updatePolicy?: SliderUpdatePolicy;
  commitValueOnRelease?: boolean;
  minRangeGap?: number;
  onRangeChange?: (range: SliderPrimitiveRange) => void;
  onModeCycle?: () => void;
  onAnnounce?: () => void;
  onValueGestureStart?: () => void;
  headAdornment?: React.ReactNode;
  /** Optional per-slider modulation configuration affordance. */
  contextConfig?: React.ReactNode; contextConfigLabel?: string; modulationSlot?: ModulationSlot;
}

export type SliderUpdatePolicy = 'continuous' | 'frame' | 'release';

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
  keyboardStep = 1, fineKeyboardStep, dragStep, fineDragStep, onDoubleClick,
  onValueChange,
  updatePolicy = 'frame',
  commitValueOnRelease = false,
  minRangeGap = 4,
  onRangeChange,
  onModeCycle,
  onAnnounce,
  onValueGestureStart,
  headAdornment,
  contextConfig, contextConfigLabel = 'Configure modulation', modulationSlot,
}: SliderPrimitiveProps) {
  const [liveValue, setLiveValue] = React.useState(value);
  const [liveRange, setLiveRange] = React.useState<SliderPrimitiveRange>(() => range ?? { min: 0, max: value });
  const [dragging, setDragging] = React.useState(false);
  const [activeHandle, setActiveHandle] = React.useState<'min' | 'max' | 'band' | null>(null);
  const [contextOpen, setContextOpen] = React.useState(false);
  const railRef = React.useRef<HTMLDivElement>(null);
  const railWidth = useElementWidth(railRef);
  const [motionReady, setMotionReady] = React.useState(false);
  const thumbRef = React.useRef<HTMLSpanElement>(null);
  const fillRef = React.useRef<HTMLSpanElement>(null);
  const edgeMinRef = React.useRef<HTMLSpanElement>(null);
  const edgeMaxRef = React.useRef<HTMLSpanElement>(null);
  const valueTextRef = React.useRef<HTMLSpanElement>(null);
  const dragValueRef = React.useRef<number | null>(null);
  const dragRangeRef = React.useRef<SliderPrimitiveRange | null>(null);
  const dragIndicatorRef = React.useRef<number | null>(null);
  const dragThumbPxRef = React.useRef<number | null>(null);
  const lastEmittedValueRef = React.useRef<number | null>(null);
  const lastEmittedRangeRef = React.useRef<SliderPrimitiveRange | null>(null);
  const pendingTouchCleanupRef = React.useRef<(() => void) | null>(null);
  const usesControlledValue = typeof onValueChange === 'function'; const usesControlledRange = typeof onRangeChange === 'function' && !!range; const resolvedMinRangeGap = clamp(minRangeGap, 0, 100);

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

  React.useEffect(() => {
    if (railWidth > 0) setMotionReady(true);
  }, [railWidth]);

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
  const commitValueChange = React.useCallback((nextValue: number) => {
    if (!onValueChange) return;
    if (lastEmittedValueRef.current === nextValue) return;
    lastEmittedValueRef.current = nextValue;
    recordSliderSystemCounter('sliderValueCallbacks');
    onValueChange(nextValue);
  }, [onValueChange]);
  const commitRangeChange = React.useCallback((nextRange: SliderPrimitiveRange) => {
    if (!onRangeChange) return;
    const last = lastEmittedRangeRef.current;
    if (last && last.min === nextRange.min && last.max === nextRange.max) return;
    lastEmittedRangeRef.current = nextRange;
    recordSliderSystemCounter('rangeCallbacks');
    onRangeChange(nextRange);
  }, [onRangeChange]);
  const valueEmitter = useRafCoalescedEmitter(commitValueChange);
  const rangeEmitter = useRafCoalescedEmitter(commitRangeChange);
  const resolvedUpdatePolicy: SliderUpdatePolicy = commitValueOnRelease ? 'release' : updatePolicy;
  const scheduleValueChange = (nextValue: number) => {
    if (resolvedUpdatePolicy === 'continuous') commitValueChange(nextValue);
    else if (resolvedUpdatePolicy === 'frame') valueEmitter.schedule(nextValue);
  };
  const scheduleRangeChange = (nextRange: SliderPrimitiveRange) => {
    if (resolvedUpdatePolicy === 'continuous') commitRangeChange(nextRange);
    else if (resolvedUpdatePolicy === 'frame') rangeEmitter.schedule(nextRange);
  };

  const keyboardDelta = (event: React.KeyboardEvent, direction: -1 | 1): number => {
    const fine = event.altKey || event.ctrlKey || event.metaKey;
    const step = fine ? (fineKeyboardStep ?? keyboardStep) : (event.shiftKey ? keyboardStep * 10 : keyboardStep);
    return direction * step;
  };
  const handleSingleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || mode !== 'single') return;
    let nextValue: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentValue + keyboardDelta(event, -1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentValue + keyboardDelta(event, 1);
    else if (event.key === 'Home') nextValue = 0;
    else if (event.key === 'End') nextValue = 100;
    if (nextValue === null) return;
    event.preventDefault();
    const clampedValue = clamp(nextValue, 0, 100);
    setLiveValue(clampedValue);
    valueEmitter.flush(clampedValue);
    lastEmittedValueRef.current = null;
  };
  const handleRangeKeyDown = (
    event: React.KeyboardEvent<HTMLSpanElement>,
    handle: 'min' | 'max',
  ) => {
    if (disabled || mode === 'single') return;
    let nextValue: number | null = null;
    const currentHandleValue = currentRange[handle];
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue = currentHandleValue + keyboardDelta(event, -1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue = currentHandleValue + keyboardDelta(event, 1);
    else if (event.key === 'Home') nextValue = handle === 'min' ? 0 : currentRange.min + resolvedMinRangeGap;
    else if (event.key === 'End') nextValue = handle === 'max' ? 100 : currentRange.max - resolvedMinRangeGap;
    if (nextValue === null) return;
    event.preventDefault();
    event.stopPropagation();
    const nextRange = handle === 'min'
      ? { min: clamp(nextValue, 0, currentRange.max - resolvedMinRangeGap), max: currentRange.max }
      : { min: currentRange.min, max: clamp(nextValue, currentRange.min + resolvedMinRangeGap, 100) };
    setLiveRange(nextRange);
    rangeEmitter.flush(nextRange);
    lastEmittedRangeRef.current = null;
  };

  const percentFromClientX = (clientX: number, rect: DOMRect) => (
    axisToNormalized(clientX, rect.left, rect.width) * 100
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
      valueEmitter.flush(nextValue);
      lastEmittedValueRef.current = null;
      return;
    }

    const target = getRangeTarget(clientX, rect);
    if (target === 'band') return;

    const pointerValue = percentFromClientX(clientX, rect);
    const nextRange = target === 'min'
      ? { min: Math.min(pointerValue, currentRange.max - resolvedMinRangeGap), max: currentRange.max }
      : { min: currentRange.min, max: Math.max(pointerValue, currentRange.min + resolvedMinRangeGap) };
    setLiveRange(nextRange);
    rangeEmitter.flush(nextRange);
    lastEmittedRangeRef.current = null;
  };

  const beginCommittedDrag = ({
    currentTarget,
    pointerId,
    pointerType,
    startClientX,
    initialClientX,
    rect,
    fineDrag,
  }: {
    currentTarget: HTMLDivElement;
    pointerId: number;
    pointerType: string;
    startClientX: number;
    initialClientX: number;
    rect: DOMRect;
    fineDrag?: boolean;
  }) => {
    const isTouch = pointerType === 'touch';
    if (isTouch) setSliderTouchSelectionLock(true);
    try {
      currentTarget.setPointerCapture(pointerId);
    } catch {}

    const cleanupCommittedDrag = (
      onMove: (moveEvent: PointerEvent) => void,
      onEnd: (endEvent: PointerEvent) => void,
    ) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      releasePointerCaptureSafely(currentTarget, pointerId);
      if (isTouch) setSliderTouchSelectionLock(false);
      pendingTouchCleanupRef.current = null;
    };

    if (mode === 'single') {
      onValueGestureStart?.();
      let lastValue = percentFromClientX(initialClientX, rect);

      const applySingleValue = (clientX: number) => {
        const rawValue = percentFromClientX(clientX, rect);
        const activeStep = fineDrag ? fineDragStep : dragStep;
        const nextValue = activeStep && activeStep > 0
          ? clamp(Math.round(rawValue / activeStep) * activeStep, 0, 100)
          : rawValue;
        dragValueRef.current = nextValue;
        dragIndicatorRef.current = nextValue;
        dragThumbPxRef.current = (nextValue / 100) * rect.width;
        lastValue = nextValue;

        if (isDirect) {
          if (thumbRef.current) {
            thumbRef.current.style.transform = `translate3d(${dragThumbPxRef.current}px, -50%, 0)`;
            thumbRef.current.style.left = '0';
          }
          if (fillRef.current) {
            fillRef.current.style.width = `${nextValue}%`;
            fillRef.current.style.opacity = String(0.15 + (nextValue / 100) * 0.85);
          }
          if (commitValueOnRelease && valueTextRef.current) {
            valueTextRef.current.textContent = formatValue(nextValue, unit);
          }
        } else {
          setLiveValue(nextValue);
        }

        scheduleValueChange(nextValue);
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
        const cancelled = endEvent.type === 'pointercancel';
        setLiveValue(cancelled ? value : lastValue);
        dragValueRef.current = null;
        dragIndicatorRef.current = null;
        dragThumbPxRef.current = null;
        if (cancelled && thumbRef.current) {
          thumbRef.current.style.transform = `translate3d(${(clamp(value, 0, 100) / 100) * rect.width}px, -50%, 0)`;
          thumbRef.current.style.left = '0';
        }
        if (cancelled && valueTextRef.current) {
          valueTextRef.current.textContent = displayValue ?? formatValue(value, unit);
        }
        if (cancelled) valueEmitter.cancel();
        else valueEmitter.flush(lastValue);
        lastEmittedValueRef.current = null;
        setDragging(false);
        cleanupCommittedDrag(onMove, onEnd);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      pendingTouchCleanupRef.current = () => cleanupCommittedDrag(onMove, onEnd);
      return;
    }

    const startX = startClientX - rect.left;
    onValueGestureStart?.();
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

    const getNextRange = (clientX: number) => {
      const delta = ((clientX - rect.left - startX) / Math.max(1, rect.width)) * 100;
      if (target === 'band') {
        return shiftRangePreservingWidth(startRange, delta, 0, 100);
      }

      const rawValue = clamp(target === 'min' ? startRange.min + delta : startRange.max + delta, 0, 100);
      const activeStep = fineDrag ? fineDragStep : dragStep;
      const raw = activeStep && activeStep > 0
        ? clamp(Math.round(rawValue / activeStep) * activeStep, 0, 100)
        : rawValue;
      return target === 'min'
        ? { min: Math.min(raw, startRange.max - resolvedMinRangeGap), max: startRange.max }
        : { min: startRange.min, max: Math.max(raw, startRange.min + resolvedMinRangeGap) };
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
          thumbRef.current.style.transform = `translate3d(${dragThumbPxRef.current}px, -50%, 0)`;
          thumbRef.current.style.left = '0';
        }
        if (edgeMinRef.current) edgeMinRef.current.style.left = `${nextRange.min}%`;
        if (edgeMaxRef.current) edgeMaxRef.current.style.left = `${nextRange.max}%`;
      } else {
        setLiveRange(nextRange);
      }

      scheduleRangeChange(nextRange);
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
      const cancelled = endEvent.type === 'pointercancel';
      setLiveRange(cancelled ? currentRange : lastRange);
      dragRangeRef.current = null;
      dragIndicatorRef.current = null;
      dragThumbPxRef.current = null;
      if (cancelled && thumbRef.current) {
        thumbRef.current.style.transform = `translate3d(${(indicatorPct / 100) * rect.width}px, -50%, 0)`;
        thumbRef.current.style.left = '0';
      }
      if (cancelled) rangeEmitter.cancel();
      else rangeEmitter.flush(lastRange);
      lastEmittedRangeRef.current = null;
      setDragging(false);
      setActiveHandle(null);
      cleanupCommittedDrag(onMove, onEnd);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    pendingTouchCleanupRef.current = () => cleanupCommittedDrag(onMove, onEnd);
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
        fineDrag: event.altKey || event.ctrlKey || event.metaKey,
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
        fineDrag: moveEvent.altKey || moveEvent.ctrlKey || moveEvent.metaKey,
      });
    };

    const onPendingEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;
      const shouldTap = endEvent.type === 'pointerup' && !longPressConsumed && !cancelledForScroll;
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
    } catch {}
    window.addEventListener('pointermove', onPendingMove, { passive: false });
    window.addEventListener('pointerup', onPendingEnd);
    window.addEventListener('pointercancel', onPendingEnd);
  };

  const valueText = displayValue ?? (mode === 'single'
    ? formatValue(visualValue, unit)
    : `${formatValue(visualRange.min, unit)}-${formatValue(visualRange.max, unit)}`);
  const markerStyle = (percent: number): React.CSSProperties => railWidth > 0
    ? {
        left: '0',
        transform: `translate3d(${(clamp(percent, 0, 100) / 100) * railWidth}px, -50%, 0)`,
      }
    : { left: `${clamp(percent, 0, 100)}%` };
  const thumbStyle: React.CSSProperties = dragging && dragThumbPxRef.current != null
    ? {
        left: '0',
        transform: `translate3d(${dragThumbPxRef.current}px, -50%, 0)`,
      }
    : markerStyle(visualIndicatorPct);

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
        modulationSlot ? `sl-slider--mod-${modulationSlot}` : '',
        motionReady ? 'sl-slider--motion-ready' : '',
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
          if (!disabled) {
            if (onDoubleClick) onDoubleClick();
            else onModeCycle?.();
          }
        }}
      >
        {showsModeControl ? (
          <SliderModeButton mode={mode} disabled={disabled} modulationSlot={modulationSlot} onModeCycle={onModeCycle} />
        ) : (
          hero && <span className="sl-slider-hero-dot" aria-hidden="true" />
        )}
        <span className="sl-slider-label">{label}</span>
        <span ref={valueTextRef} className="sl-slider-value app-slider-value">{valueText}</span>
        {headAdornment}
        {contextConfig && <SliderContextControl config={contextConfig} label={contextConfigLabel} open={contextOpen} onToggle={() => setContextOpen((open) => !open)} />}
      </div>

      <div
        ref={railRef}
        className="sl-slider-rail"
        role={mode === 'single' ? 'slider' : undefined}
        tabIndex={mode === 'single' && !disabled ? 0 : -1}
        aria-label={mode === 'single' ? label : undefined}
        aria-valuemin={mode === 'single' ? 0 : undefined}
        aria-valuemax={mode === 'single' ? 100 : undefined}
        aria-valuenow={mode === 'single' ? currentValue : undefined}
        aria-valuetext={mode === 'single' ? formatValue(currentValue, unit) : undefined}
        aria-disabled={mode === 'single' ? disabled : undefined}
        onKeyDown={handleSingleKeyDown}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) {
            if (onDoubleClick) onDoubleClick();
            else onModeCycle?.();
          }
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
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${label} minimum`}
              aria-valuemin={0}
              aria-valuemax={currentRange.max - resolvedMinRangeGap}
              aria-valuenow={currentRange.min}
              aria-valuetext={formatValue(currentRange.min, unit)}
              aria-disabled={disabled}
              onKeyDown={(event) => handleRangeKeyDown(event, 'min')}
            />
            <span
              ref={edgeMaxRef}
              className={`sl-slider-edge sl-slider-edge--max${activeHandle === 'max' || activeHandle === 'band' ? ' active' : ''}`}
              style={{ left: `${maxPct}%` }}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${label} maximum`}
              aria-valuemin={currentRange.min + resolvedMinRangeGap}
              aria-valuemax={100}
              aria-valuenow={currentRange.max}
              aria-valuetext={formatValue(currentRange.max, unit)}
              aria-disabled={disabled}
              onKeyDown={(event) => handleRangeKeyDown(event, 'max')}
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
          <span className="sl-slider-ghost" style={markerStyle(ghostValue)} />
        )}
        <span ref={thumbRef} className="sl-slider-thumb" style={thumbStyle} />
      </div>
    </div>
  );
}
