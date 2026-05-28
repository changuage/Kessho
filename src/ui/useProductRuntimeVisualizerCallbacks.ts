import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks';

type ProductRuntimeVisualizerCallbacksOptions = Parameters<typeof useSelectedAudioEngineVisualizerCallbacks>[0];

export function useProductRuntimeVisualizerCallbacks(options: ProductRuntimeVisualizerCallbacksOptions): void {
  useSelectedAudioEngineVisualizerCallbacks(options);
}
