import { useCallback } from 'react';
import type { SliderState } from './state';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type StartSelectedPlayback = (options: {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
}) => Promise<void>;

type SelectedAudioEngineJourneyPlaybackActionOptions = {
  startSelectedPlayback: StartSelectedPlayback;
  dualRanges: NativeDualRanges;
};

export function useSelectedAudioEngineJourneyPlaybackAction({
  startSelectedPlayback,
  dualRanges,
}: SelectedAudioEngineJourneyPlaybackActionOptions) {
  return useCallback(async (state: SliderState, title: string): Promise<void> => {
    console.log('[Journey] Starting audio engine');
    try {
      await startSelectedPlayback({
        state,
        dualRanges,
        title,
      });
    } catch (err) {
      console.error('[Journey] Failed to start audio:', err);
    }
  }, [
    dualRanges,
    startSelectedPlayback,
  ]);
}
