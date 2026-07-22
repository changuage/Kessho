import { useCapacitorMacAudioStatus } from './useCapacitorMacAudioStatus';

type CapacitorMacAudioStatusOptions = Parameters<typeof useCapacitorMacAudioStatus>[0];
type ProductRuntimeMacAudioStatusOptions = CapacitorMacAudioStatusOptions;

export function useProductRuntimeMacAudioStatus(options: ProductRuntimeMacAudioStatusOptions) {
  return useCapacitorMacAudioStatus(options);
}
