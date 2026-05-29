import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges';

export function useProductRuntimeModulationRanges(productRuntimeMode: ProductRuntimeSelectionMode) {
  return useSelectedAudioEngineModulationRanges(productRuntimeMode);
}
