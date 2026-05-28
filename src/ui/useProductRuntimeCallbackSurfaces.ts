import { useProductRuntimeEvolveOverrideSurface } from './useProductRuntimeEvolveOverrideSurface';
import { useProductRuntimeLiveTriggerSurface } from './useProductRuntimeLiveTriggerSurface';
import { useProductRuntimeSequencerCallbacks } from './useProductRuntimeSequencerCallbacks';

type ProductRuntimeCallbackSurfacesMode = Parameters<typeof useProductRuntimeSequencerCallbacks>[0];

export function useProductRuntimeCallbackSurfaces(audioEngineRuntimeMode: ProductRuntimeCallbackSurfacesMode) {
  const sequencerCallbacks = useProductRuntimeSequencerCallbacks(audioEngineRuntimeMode);
  const liveTriggerSurface = useProductRuntimeLiveTriggerSurface(audioEngineRuntimeMode);
  const evolveOverrideSurface = useProductRuntimeEvolveOverrideSurface(audioEngineRuntimeMode);

  return {
    ...sequencerCallbacks,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  };
}
