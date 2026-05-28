import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface';

type ProductRuntimeMorphRuntimeSurfaceMode = Parameters<typeof useSelectedAudioEngineMorphRuntimeSurface>[0];

export function useProductRuntimeMorphRuntimeSurface(audioEngineRuntimeMode: ProductRuntimeMorphRuntimeSurfaceMode) {
  return useSelectedAudioEngineMorphRuntimeSurface(audioEngineRuntimeMode);
}
