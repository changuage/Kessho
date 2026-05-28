import { useSelectedAudioEngineStopAction } from './useSelectedAudioEngineStopAction';

type ProductRuntimeStopActionOptions = Parameters<typeof useSelectedAudioEngineStopAction>[0];

export function useProductRuntimeStopAction(options: ProductRuntimeStopActionOptions) {
  return useSelectedAudioEngineStopAction(options);
}
