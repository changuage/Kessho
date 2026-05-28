import { useSelectedAudioEngineLiveTriggerCallbacks } from './useSelectedAudioEngineLiveTriggerCallbacks';

type ProductRuntimeLiveTriggerCallbacksOptions = Parameters<typeof useSelectedAudioEngineLiveTriggerCallbacks>[0];

export function useProductRuntimeLiveTriggerCallbacks(options: ProductRuntimeLiveTriggerCallbacksOptions): void {
  useSelectedAudioEngineLiveTriggerCallbacks(options);
}
