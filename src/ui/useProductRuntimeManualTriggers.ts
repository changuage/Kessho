import { useSelectedAudioEngineManualTriggers } from './useSelectedAudioEngineManualTriggers';

type ProductRuntimeManualTriggersOptions = Parameters<typeof useSelectedAudioEngineManualTriggers>[0];

export function useProductRuntimeManualTriggers(options: ProductRuntimeManualTriggersOptions) {
  return useSelectedAudioEngineManualTriggers(options);
}
