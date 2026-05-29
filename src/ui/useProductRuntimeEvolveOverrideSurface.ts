import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface';

export function useProductRuntimeEvolveOverrideSurface(productRuntimeMode: ProductRuntimeSelectionMode) {
  return useSelectedAudioEngineEvolveOverrideSurface(productRuntimeMode);
}
