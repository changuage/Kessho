import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup';

export function useProductRuntimeValueCleanup(playbackIsRunning: boolean): void {
  // TODO(product-fallback-retire:runtime-value-cleanup): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // Stopped-value cleanup remains a compatibility
  // delegation until runtime value state is fully product-owned.
  useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);
}
