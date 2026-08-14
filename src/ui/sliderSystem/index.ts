export { resolveSliderPrimitiveSurface, resolveSliderViewport } from './layout';
export { SliderFamilyNote } from './SliderFamilyNote';
export {
  EDGE_HANDLE_PX,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  TRACK_PAD_PX,
  TOUCH_DRAG_INTENT_PX,
  clamp01,
  axisToNormalized,
  getNearestRangeHandle,
  getTouchGestureIntent,
  getDualHandle,
  normToValue,
  normalizeQuantizedRange,
  normalizeUnitRange,
  pointerToTrackNorm,
  quantize01,
  quantizeValue,
  rangesEqual,
  releasePointerCaptureSafely,
  setSliderTouchSelectionLock,
  shiftRangePreservingWidth,
  stepDecimals,
  trackLeftCalc,
  trackWidthCalc,
  valueToNorm,
} from './matrixMath';
export { SliderPrimitive } from './SliderPrimitive';
export { ModulationModeIcon } from './SliderModeIcon';
export { useRafCoalescedEmitter } from './useRafCoalescedEmitter';
export type { RafCoalescedEmitter } from './useRafCoalescedEmitter';
export {
  getSliderCapability,
  isSliderModeAllowed,
  isSliderRangeCapable,
  normalizeSliderMode,
  SINGLE_ONLY_SLIDER_KEYS,
  SLIDER_CAPABILITIES,
  WALK_ONLY_DUAL_KEYS,
} from './sliderCapabilities';
export type { SliderCapability } from './sliderCapabilities';
export { tapeHeroBoldVars } from './tapeHeroBold';
export type {
  SliderDensity,
  SliderMatrixPresentation,
  SliderPrimitiveMode,
  SliderPrimitiveRange,
  SliderPrimitiveSpec,
  SliderRendererProps,
  SliderRuntimeRendererProps,
  SliderPrimitiveSurface,
  SliderStylingModel,
  SliderVariant,
  SliderViewport,
} from './types';
export type { MatrixCellHandle, NumericRange, QuantizationRange } from './matrixMath';
