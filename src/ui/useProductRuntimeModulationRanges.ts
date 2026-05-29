import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';
import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges';

type ProductRuntimeRange = { min: number; max: number };

type ProductRuntimeModulationRanges = {
  setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductDrumMorphRange: (voice: ProductDrumVoice, range: ProductRuntimeRange | null) => void;
  setProductDrumParamSHRange: (key: string, range: ProductRuntimeRange | null) => void;
  setProductDualRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
  setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeRange>>) => void;
};

export function useProductRuntimeModulationRanges(productRuntimeMode: ProductRuntimeSelectionMode) {
  // TODO(product-runtime-compat-10E): selected modulation range hooks remain the temporary
  // implementation while product surfaces expose product runtime names.
  const modulationRanges = useSelectedAudioEngineModulationRanges(productRuntimeMode);

  return {
    setProductRuntimeWalkPositionsCallback: modulationRanges.setSelectedRuntimeWalkPositionsCallback,
    setProductDrumMorphRange: modulationRanges.setSelectedDrumMorphRange,
    setProductDrumParamSHRange: modulationRanges.setSelectedDrumParamSHRange,
    setProductDualRanges: modulationRanges.setSelectedDualRanges,
    setProductRuntimeWalkRanges: modulationRanges.setSelectedRuntimeWalkRanges,
  } satisfies ProductRuntimeModulationRanges;
}
