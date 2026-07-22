import { useProductRuntimeEvolveOverrideSurface } from './useProductRuntimeEvolveOverrideSurface';
import { useProductRuntimeLiveTriggerSurface } from './useProductRuntimeLiveTriggerSurface';
import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks';
import { useMemo } from 'react';

export function useProductRuntimeCallbackSurfaces() {
  const projectionCallbacks = useRuntimeSequencerProjectionCallbacks();
  const liveTriggerSurface = useProductRuntimeLiveTriggerSurface();
  const evolveOverrideSurface = useProductRuntimeEvolveOverrideSurface();

  return useMemo(() => ({
    setProductDrumStepPositionCallback: projectionCallbacks.setDrumStepPositionCallback,
    setProductDrumEvolveTriggerCallback: projectionCallbacks.setDrumEvolveTriggerCallback,
    setProductDrumTriggerCallback: projectionCallbacks.setDrumTriggerCallback,
    setProductSynthStepPositionCallback: projectionCallbacks.setSynthStepPositionCallback,
    setProductSynthOrbitVisualStateCallback: projectionCallbacks.setSynthOrbitVisualStateCallback,
    setProductSynthAnchorWalkerVisualStateCallback: projectionCallbacks.setSynthAnchorWalkerVisualStateCallback,
    setProductSynthEvolveTriggerCallback: projectionCallbacks.setSynthEvolveTriggerCallback,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  }), [evolveOverrideSurface, liveTriggerSurface, projectionCallbacks]);
}
