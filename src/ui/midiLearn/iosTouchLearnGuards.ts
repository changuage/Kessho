export type IOSTouchLearnGestureSample = {
  pointerType?: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startValue: number;
  currentValue: number;
};

export type IOSTouchLearnAssignmentDecision =
  | { assign: true; reason: 'value-change-drag' }
  | { assign: false; reason: 'no-captured-source' | 'scroll-gesture' | 'tap-only' | 'no-value-change' };

const MIN_DRAG_DISTANCE_PX = 4;
const MAX_SCROLL_BIAS = 1.8;
const MIN_VALUE_DELTA = 0.000_001;

export function shouldAssignIOSMidiLearnFromSliderGesture(
  sample: IOSTouchLearnGestureSample,
  hasCapturedMidiSource: boolean,
): IOSTouchLearnAssignmentDecision {
  if (!hasCapturedMidiSource) return { assign: false, reason: 'no-captured-source' };

  const dx = sample.currentX - sample.startX;
  const dy = sample.currentY - sample.startY;
  const dragDistance = Math.hypot(dx, dy);
  if (dragDistance < MIN_DRAG_DISTANCE_PX) return { assign: false, reason: 'tap-only' };

  const horizontalMovement = Math.abs(dx);
  const verticalMovement = Math.abs(dy);
  if (verticalMovement > horizontalMovement * MAX_SCROLL_BIAS) {
    return { assign: false, reason: 'scroll-gesture' };
  }

  if (Math.abs(sample.currentValue - sample.startValue) < MIN_VALUE_DELTA) {
    return { assign: false, reason: 'no-value-change' };
  }

  return { assign: true, reason: 'value-change-drag' };
}

export function isIOSLongPressDuration(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs >= 450;
}

export function iosMidiLearnSafeAreaStyle(): CSSProperties {
  return {
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    paddingLeft: 'max(12px, env(safe-area-inset-left))',
    paddingRight: 'max(12px, env(safe-area-inset-right))',
  };
}
import type { CSSProperties } from 'react';
