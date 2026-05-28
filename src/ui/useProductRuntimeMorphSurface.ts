import { useSelectedAudioEngineMorphRuntime } from './useSelectedAudioEngineMorphRuntime';

type ProductRuntimeMorphSurfaceOptions = Parameters<typeof useSelectedAudioEngineMorphRuntime>[0];

export function useProductRuntimeMorphSurface(options: ProductRuntimeMorphSurfaceOptions) {
  return useSelectedAudioEngineMorphRuntime(options);
}
