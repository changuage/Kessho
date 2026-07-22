import { useCallback } from 'react';
import type { SliderState } from './state';

type ProductRuntimeDualRanges = Record<string, { min: number; max: number }>;

type StartProductPlayback = (options: {
  state: SliderState;
  dualRanges: ProductRuntimeDualRanges;
  title: string;
}) => Promise<void>;

export type ProductRuntimeStartActionOptions = {
  primeProductRuntimeAudio: () => void;
  preparePlaybackStartState: (requestedState?: SliderState) => Promise<SliderState>;
  startProductPlayback: StartProductPlayback;
  startArmedRecordingAfterPlaybackStart: () => void;
  dualRanges: ProductRuntimeDualRanges;
  title: string;
};

export function useProductRuntimeStartAction({
  primeProductRuntimeAudio,
  preparePlaybackStartState,
  startProductPlayback,
  startArmedRecordingAfterPlaybackStart,
  dualRanges,
  title,
}: ProductRuntimeStartActionOptions) {
  return useCallback(async (requestedState?: SliderState): Promise<void> => {
    try {
      primeProductRuntimeAudio();
      const stateToStart = await preparePlaybackStartState(requestedState);
      await startProductPlayback({ state: stateToStart, dualRanges, title });
      startArmedRecordingAfterPlaybackStart();
    } catch (err) {
      console.error('Failed to start audio:', err);
      alert(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}\n\nCheck console for details.`);
    }
  }, [
    dualRanges,
    preparePlaybackStartState,
    primeProductRuntimeAudio,
    startArmedRecordingAfterPlaybackStart,
    startProductPlayback,
    title,
  ]);
}
