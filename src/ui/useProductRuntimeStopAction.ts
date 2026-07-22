import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { SliderState } from './state';

export type ProductRuntimeStopActionOptions = {
  stopProductPlayback: () => void;
  isJourneyPlaying: boolean;
  stopJourney: () => void;
  stopJourneyMorphPlayback: (resetPosition: boolean) => void;
  setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  resetPlaybackTimer: () => void;
};

export function useProductRuntimeStopAction({
  stopProductPlayback,
  isJourneyPlaying,
  stopJourney,
  stopJourneyMorphPlayback,
  setIsJourneyPlaying,
  setState,
  resetPlaybackTimer,
}: ProductRuntimeStopActionOptions) {
  return useCallback(() => {
    stopProductPlayback();
    setState((prev) => ({
      ...prev,
      drumEuclidMasterEnabled: false,
      synthEuclideanMasterEnabled: false,
    }));
    if (isJourneyPlaying) {
      stopJourney();
      stopJourneyMorphPlayback(true);
      setIsJourneyPlaying(false);
    }
    resetPlaybackTimer();
  }, [
    isJourneyPlaying,
    resetPlaybackTimer,
    setIsJourneyPlaying,
    setState,
    stopJourney,
    stopJourneyMorphPlayback,
    stopProductPlayback,
  ]);
}
