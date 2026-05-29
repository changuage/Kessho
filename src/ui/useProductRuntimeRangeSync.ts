import { useSelectedAudioEngineRangeSync } from './useSelectedAudioEngineRangeSync';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import type { SliderMode, SliderState } from './state';

type ProductRuntimeRange = { min: number; max: number };

export type ProductRuntimeRangeSyncOptions = {
  drumMorphKeyToVoice: Record<string, ProductDrumVoice>;
  drumMorphKeys: Set<keyof SliderState>;
  drumSHParamKeys: Set<string>;
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRuntimeRange | undefined>>;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
  setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void;
  setProductDrumParamSHRange: (key: string, range: ProductRuntimeRange | null) => void;
  setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
  sliderModes: Record<string, SliderMode>;
};

export function useProductRuntimeRangeSync({
  productRuntimeSupportsRangeKey,
  setProductDrumMorphRange,
  setProductDrumParamSHRange,
  setProductDualRanges,
  ...options
}: ProductRuntimeRangeSyncOptions): void {
  // TODO(product-runtime-compat-10E): selected runtime range sync remains the compatibility
  // implementation while product range ownership is exposed through product-named props.
  useSelectedAudioEngineRangeSync({
    ...options,
    selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey,
    setSelectedDrumMorphRange: setProductDrumMorphRange,
    setSelectedDrumParamSHRange: setProductDrumParamSHRange,
    setSelectedDualRanges: setProductDualRanges,
  });
}
