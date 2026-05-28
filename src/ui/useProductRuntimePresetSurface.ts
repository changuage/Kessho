import { useSelectedAudioEnginePresetRuntimeSurface } from './useSelectedAudioEnginePresetRuntimeSurface';

type ProductRuntimePresetSurfaceOptions = Parameters<typeof useSelectedAudioEnginePresetRuntimeSurface>[0];

export function useProductRuntimePresetSurface(options: ProductRuntimePresetSurfaceOptions) {
  return useSelectedAudioEnginePresetRuntimeSurface(options);
}
