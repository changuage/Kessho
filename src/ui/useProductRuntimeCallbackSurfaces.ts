import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useProductRuntimeEvolveOverrideSurface } from './useProductRuntimeEvolveOverrideSurface';
import { useProductRuntimeLiveTriggerSurface } from './useProductRuntimeLiveTriggerSurface';
import { useProductRuntimeSequencerCallbacks } from './useProductRuntimeSequencerCallbacks';

export function useProductRuntimeCallbackSurfaces(productRuntimeMode: ProductRuntimeSelectionMode) {
  const sequencerCallbacks = useProductRuntimeSequencerCallbacks(productRuntimeMode);
  const liveTriggerSurface = useProductRuntimeLiveTriggerSurface(productRuntimeMode);
  const evolveOverrideSurface = useProductRuntimeEvolveOverrideSurface(productRuntimeMode);

  return {
    ...sequencerCallbacks,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  };
}
