export { resolveSliderPrimitiveSurface, resolveSliderViewport } from './layout';
export { SliderFamilyNote } from './SliderFamilyNote';
export {
  EDGE_HANDLE_PX,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  TRACK_PAD_PX,
  clamp01,
  getDualHandle,
  normToValue,
  normalizeQuantizedRange,
  normalizeUnitRange,
  pointerToTrackNorm,
  quantize01,
  quantizeValue,
  rangesEqual,
  releasePointerCaptureSafely,
  stepDecimals,
  trackLeftCalc,
  trackWidthCalc,
  valueToNorm,
} from './matrixMath';
export { SliderPrimitive } from './SliderPrimitive';
export { tapeHeroBoldVars } from './tapeHeroBold';
export type {
  SliderDensity,
  SliderMatrixPresentation,
  SliderPrimitiveMode,
  SliderPrimitiveRange,
  SliderPrimitiveSpec,
  SliderPrimitiveSurface,
  SliderStylingModel,
  SliderVariant,
  SliderViewport,
} from './types';
export type { MatrixCellHandle, QuantizationRange } from './matrixMath';
