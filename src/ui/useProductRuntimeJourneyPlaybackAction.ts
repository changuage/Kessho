import { useSelectedAudioEngineJourneyPlaybackAction } from './useSelectedAudioEngineJourneyPlaybackAction';

type ProductRuntimeJourneyPlaybackActionOptions = Parameters<typeof useSelectedAudioEngineJourneyPlaybackAction>[0];

export function useProductRuntimeJourneyPlaybackAction(options: ProductRuntimeJourneyPlaybackActionOptions) {
  return useSelectedAudioEngineJourneyPlaybackAction(options);
}
