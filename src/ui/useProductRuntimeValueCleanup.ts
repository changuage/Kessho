import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup';

export function useProductRuntimeValueCleanup(playbackIsRunning: boolean): void {
  // TODO(product-runtime-compat-10E): stopped-value cleanup remains a compatibility
  // delegation until runtime value state is fully product-owned.
  useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);
}
