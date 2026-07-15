import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useProductRuntimeEvolveOverrideSurface } from './useProductRuntimeEvolveOverrideSurface';
import { useProductRuntimeLiveTriggerSurface } from './useProductRuntimeLiveTriggerSurface';
import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks';

export function useProductRuntimeCallbackSurfaces(productRuntimeMode: ProductRuntimeSelectionMode) {
  const projectionCallbacks = useRuntimeSequencerProjectionCallbacks(productRuntimeMode);
  const liveTriggerSurface = useProductRuntimeLiveTriggerSurface(productRuntimeMode);
  const evolveOverrideSurface = useProductRuntimeEvolveOverrideSurface(productRuntimeMode);

  return {
    setProductDrumStepPositionCallback: projectionCallbacks.setDrumStepPositionCallback,
    setProductDrumEvolveTriggerCallback: projectionCallbacks.setDrumEvolveTriggerCallback,
    setProductDrumTriggerCallback: projectionCallbacks.setDrumTriggerCallback,
    setProductSynthStepPositionCallback: projectionCallbacks.setSynthStepPositionCallback,
    setProductSynthOrbitVisualStateCallback: projectionCallbacks.setSynthOrbitVisualStateCallback,
    setProductSynthAnchorWalkerVisualStateCallback: projectionCallbacks.setSynthAnchorWalkerVisualStateCallback,
    setProductSynthEvolveTriggerCallback: projectionCallbacks.setSynthEvolveTriggerCallback,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  };
}
