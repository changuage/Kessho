import { useSelectedAudioEngineRangeSync } from './useSelectedAudioEngineRangeSync';

type ProductRuntimeRangeSyncOptions = Parameters<typeof useSelectedAudioEngineRangeSync>[0];

export function useProductRuntimeRangeSync(options: ProductRuntimeRangeSyncOptions): void {
  useSelectedAudioEngineRangeSync(options);
}
