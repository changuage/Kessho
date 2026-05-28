import { useSelectedAudioEngineRuntimeValueCleanup } from './useSelectedAudioEngineRuntimeValueCleanup';

type ProductRuntimeValueCleanupPlaybackState = Parameters<typeof useSelectedAudioEngineRuntimeValueCleanup>[0];

export function useProductRuntimeValueCleanup(playbackIsRunning: ProductRuntimeValueCleanupPlaybackState): void {
  useSelectedAudioEngineRuntimeValueCleanup(playbackIsRunning);
}
