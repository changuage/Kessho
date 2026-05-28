import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { SliderState } from './state';

type SelectedAudioEngineStopActionOptions = {
  stopSelectedPlayback: () => void;
  isJourneyPlaying: boolean;
  stopJourney: () => void;
  stopJourneyMorphPlayback: (resetPosition: boolean) => void;
  setIsJourneyPlaying: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<SliderState>>;
  resetPlaybackTimer: () => void;
};

export function useSelectedAudioEngineStopAction({
  stopSelectedPlayback,
  isJourneyPlaying,
  stopJourney,
  stopJourneyMorphPlayback,
  setIsJourneyPlaying,
  setState,
  resetPlaybackTimer,
}: SelectedAudioEngineStopActionOptions): () => void {
  return useCallback(() => {
    // Don't stop recording when stopping playback - let tails continue.
    // Recording must be stopped manually.
    stopSelectedPlayback();

    // Master stop also turns off the drum sequencer and lead Euclidean sequencer.
    setState((prev) => ({
      ...prev,
      drumEuclidMasterEnabled: false,
      synthEuclideanMasterEnabled: false,
    }));

    // Stop journey playback if running.
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
    stopSelectedPlayback,
  ]);
}
