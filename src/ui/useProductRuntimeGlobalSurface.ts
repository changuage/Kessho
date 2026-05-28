import { useSelectedAudioEngineGlobalRuntimeSurface } from './useSelectedAudioEngineGlobalRuntimeSurface';

type SelectedAudioEngineGlobalRuntimeSurfaceOptions = Parameters<typeof useSelectedAudioEngineGlobalRuntimeSurface>[0];
type ProductRuntimeGlobalSurfaceOptions = Omit<
  SelectedAudioEngineGlobalRuntimeSurfaceOptions,
  'stopSelectedPlayback'
> & {
  stopProductPlayback: SelectedAudioEngineGlobalRuntimeSurfaceOptions['stopSelectedPlayback'];
};

export function useProductRuntimeGlobalSurface({
  stopProductPlayback,
  ...options
}: ProductRuntimeGlobalSurfaceOptions) {
  return useSelectedAudioEngineGlobalRuntimeSurface({
    ...options,
    stopSelectedPlayback: stopProductPlayback,
  });
}
