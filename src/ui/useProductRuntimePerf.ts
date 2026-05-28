import { useProductRuntimePerfAdapter } from './useProductRuntimePerfAdapter';

type ProductRuntimePerfMode = Parameters<typeof useProductRuntimePerfAdapter>[0];
type ProductRuntimePerfVisible = Parameters<typeof useProductRuntimePerfAdapter>[1];

export function useProductRuntimePerf(
  audioEngineRuntimeMode: ProductRuntimePerfMode,
  showAudioEngineSwitcher: ProductRuntimePerfVisible,
) {
  return useProductRuntimePerfAdapter(audioEngineRuntimeMode, showAudioEngineSwitcher);
}
