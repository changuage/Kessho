import { useCallback } from 'react';
import type { SliderState } from './state';

type ProductRuntimeDualRanges = Record<string, { min: number; max: number }>;

type StartProductPlayback = (options: {
  state: SliderState;
  dualRanges: ProductRuntimeDualRanges;
  title: string;
}) => Promise<void>;

export type ProductRuntimeJourneyPlaybackActionOptions = {
  startProductPlayback: StartProductPlayback;
  dualRanges: ProductRuntimeDualRanges;
  preparePlaybackStartState: (state: SliderState) => Promise<SliderState>;
};

export function useProductRuntimeJourneyPlaybackAction({
  startProductPlayback,
  dualRanges,
  preparePlaybackStartState,
}: ProductRuntimeJourneyPlaybackActionOptions) {
  return useCallback(async (state: SliderState, title: string, isCurrent: () => boolean = () => true): Promise<void> => {
    const preparedState = await preparePlaybackStartState(state);
    if (!isCurrent()) return;
    await startProductPlayback({ state: preparedState, dualRanges, title });
  }, [dualRanges, preparePlaybackStartState, startProductPlayback]);
}
