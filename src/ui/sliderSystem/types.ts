import type { SliderMode } from '../state';

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
