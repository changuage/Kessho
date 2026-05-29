import type { Dispatch, SetStateAction } from 'react';

import { useSelectedAudioEngineStopAction } from './useSelectedAudioEngineStopAction';
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
  ...options
}: ProductRuntimeStopActionOptions) {
  // TODO(product-runtime-compat-10C): selected-audio-engine stop action remains the temporary
  // compatibility implementation behind this product runtime facade.
  return useSelectedAudioEngineStopAction({
    ...options,
    stopSelectedPlayback: stopProductPlayback,
  });
}
