import { useSelectedAudioEngineStartAction } from './useSelectedAudioEngineStartAction';

type ProductRuntimeStartActionOptions = Parameters<typeof useSelectedAudioEngineStartAction>[0];

export function useProductRuntimeStartAction(options: ProductRuntimeStartActionOptions) {
  return useSelectedAudioEngineStartAction(options);
}
