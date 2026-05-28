import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges';

type ProductRuntimeModulationRangesMode = Parameters<typeof useSelectedAudioEngineModulationRanges>[0];

export function useProductRuntimeModulationRanges(audioEngineRuntimeMode: ProductRuntimeModulationRangesMode) {
  return useSelectedAudioEngineModulationRanges(audioEngineRuntimeMode);
}
