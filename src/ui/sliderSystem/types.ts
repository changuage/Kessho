import type { SliderMode } from '../state';
import type { SliderPageId } from '../pages/pageAliases';
import type { DualSliderConfig, DualSliderShapeConfig } from './dualConfigReducer';

export type SliderPrimitiveMode = SliderMode;
export type SliderVariant = 'full' | 'matrix';
export type SliderDensity = 'compact' | 'comfortable';
export type SliderViewport = 'desktop' | 'mobile';
export type SliderMatrixPresentation = 'grid' | 'cards';
export type SliderStylingModel = 'tapeHeroBold';

export interface SliderPrimitiveRange {
  min: number;
  max: number;
}

export interface SliderPrimitiveSurface {
  viewport: SliderViewport;
  variant: SliderVariant;
  density: SliderDensity;
  matrixPresentation: SliderMatrixPresentation | null;
}

export interface SliderPrimitiveSpec {
  label: string;
  mode: SliderPrimitiveMode;
  value: number;
  range?: SliderPrimitiveRange;
  unit?: string;
  hero?: string;
}

export interface SliderRendererProps<Key extends PropertyKey = string> {
  label: string;
  value: number;
  paramKey: Key;
  ghostValue?: number;
  format?: (value: number) => string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  logarithmic?: boolean;
  helpPage?: SliderPageId;
  title?: string;
  /** Optional app-unit snapping for pointer and keyboard interaction. */
  keyboardStep?: number;
  fineKeyboardStep?: number;
  dragStep?: number;
  fineDragStep?: number;
  resetValue?: number;
  disabled?: boolean;
  commitOnRelease?: boolean;
  mode?: SliderMode;
  dualRange?: SliderPrimitiveRange;
  walkPosition?: number;
  isFlashing?: boolean;
  modulationConfig?: DualSliderConfig;
  shapeConfig?: DualSliderShapeConfig;
  onModulationConfigChange?: (key: Key, config: DualSliderConfig) => void;
  onChange: (key: Key, value: number) => void;
  onCycleMode?: (key: Key) => void;
  onDualRangeChange?: (key: Key, min: number, max: number) => void;
}

export type SliderRuntimeRendererProps<Key extends PropertyKey = string> = Omit<Pick<
  SliderRendererProps<Key>,
  'mode' | 'dualRange' | 'walkPosition' | 'isFlashing' | 'modulationConfig' | 'shapeConfig' | 'onModulationConfigChange' | 'onCycleMode' | 'onDualRangeChange'
>, 'mode'> & { mode: SliderMode };
