import { useCallback } from 'react';
import type { SliderState } from './state';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type StartSelectedPlayback = (options: {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
}) => Promise<void>;

type SelectedAudioEngineStartActionOptions = {
  primeSelectedPlayback?: () => void;
  preparePlaybackStartState: (requestedState?: SliderState) => Promise<SliderState>;
  startSelectedPlayback: StartSelectedPlayback;
  startArmedRecordingAfterPlaybackStart: () => void;
  dualRanges: NativeDualRanges;
  title: string;
};

export function useSelectedAudioEngineStartAction({
  primeSelectedPlayback,
  preparePlaybackStartState,
  startSelectedPlayback,
  startArmedRecordingAfterPlaybackStart,
  dualRanges,
  title,
}: SelectedAudioEngineStartActionOptions) {
  return useCallback(async (requestedState?: SliderState): Promise<void> => {
    try {
      primeSelectedPlayback?.();
      const stateToStart = await preparePlaybackStartState(requestedState);
      await startSelectedPlayback({
        state: stateToStart,
        dualRanges,
        title,
      });
      startArmedRecordingAfterPlaybackStart();
    } catch (err) {
      console.error('Failed to start audio:', err);
      alert(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}\n\nCheck console for details.`);
    }
  }, [
    dualRanges,
    preparePlaybackStartState,
    primeSelectedPlayback,
    startArmedRecordingAfterPlaybackStart,
    startSelectedPlayback,
    title,
  ]);
}
