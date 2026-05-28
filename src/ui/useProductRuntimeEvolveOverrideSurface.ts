import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface';

type ProductRuntimeEvolveOverrideSurfaceMode = Parameters<typeof useSelectedAudioEngineEvolveOverrideSurface>[0];

export function useProductRuntimeEvolveOverrideSurface(audioEngineRuntimeMode: ProductRuntimeEvolveOverrideSurfaceMode) {
  return useSelectedAudioEngineEvolveOverrideSurface(audioEngineRuntimeMode);
}
