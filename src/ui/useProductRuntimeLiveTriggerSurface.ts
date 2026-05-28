import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface';

type ProductRuntimeLiveTriggerSurfaceMode = Parameters<typeof useSelectedAudioEngineLiveTriggerSurface>[0];

export function useProductRuntimeLiveTriggerSurface(audioEngineRuntimeMode: ProductRuntimeLiveTriggerSurfaceMode) {
  return useSelectedAudioEngineLiveTriggerSurface(audioEngineRuntimeMode);
}
