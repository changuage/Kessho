import { useSelectedAudioEnginePresetRuntimeSurface } from './useSelectedAudioEnginePresetRuntimeSurface';

type SelectedPresetRuntimeSurfaceOptions = Parameters<typeof useSelectedAudioEnginePresetRuntimeSurface>[0];

type ProductRuntimePresetSurfaceOptions = Omit<
  SelectedPresetRuntimeSurfaceOptions,
  'audioEngineRuntimeMode' | 'resetSelectedCofDrift'
> & {
  productRuntimeMode: SelectedPresetRuntimeSurfaceOptions['audioEngineRuntimeMode'];
  resetProductCofDrift: SelectedPresetRuntimeSurfaceOptions['resetSelectedCofDrift'];
};

export function useProductRuntimePresetSurface({
  productRuntimeMode,
  resetProductCofDrift,
  ...options
}: ProductRuntimePresetSurfaceOptions) {
  return useSelectedAudioEnginePresetRuntimeSurface({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
    resetSelectedCofDrift: resetProductCofDrift,
  });
}
