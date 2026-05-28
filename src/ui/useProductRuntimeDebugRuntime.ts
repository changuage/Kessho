import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime';

type ProductRuntimeDebugRuntimeMode = Parameters<typeof useSelectedAudioEngineDebugRuntime>[0];

export function useProductRuntimeDebugRuntime(audioEngineRuntimeMode: ProductRuntimeDebugRuntimeMode) {
  const {
    selectedAudioEngineDebugAnalysers,
    ...debugRuntime
  } = useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode);

  return {
    ...debugRuntime,
    productRuntimeDebugAnalysers: selectedAudioEngineDebugAnalysers,
  };
}
