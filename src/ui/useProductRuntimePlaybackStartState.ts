import { useSelectedAudioEnginePlaybackStartState } from './useSelectedAudioEnginePlaybackStartState';

type ProductRuntimePlaybackStartStateOptions = Parameters<typeof useSelectedAudioEnginePlaybackStartState>[0];

export function useProductRuntimePlaybackStartState(options: ProductRuntimePlaybackStartStateOptions) {
  return useSelectedAudioEnginePlaybackStartState(options);
}
