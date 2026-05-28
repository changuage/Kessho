import { useSelectedAudioEngineEvolveOverrideCallbacks } from './useSelectedAudioEngineEvolveOverrideCallbacks';

export type ProductRuntimeEvolvedOverrideState = ReturnType<typeof useSelectedAudioEngineEvolveOverrideCallbacks>['drumEvolvedOverrides'];

type ProductRuntimeEvolveOverrideCallbacksOptions = Parameters<typeof useSelectedAudioEngineEvolveOverrideCallbacks>[0];

export function useProductRuntimeEvolveOverrideCallbacks(options: ProductRuntimeEvolveOverrideCallbacksOptions) {
  return useSelectedAudioEngineEvolveOverrideCallbacks(options);
}
