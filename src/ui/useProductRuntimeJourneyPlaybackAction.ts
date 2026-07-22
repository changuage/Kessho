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
};

export function useProductRuntimeJourneyPlaybackAction({
  startProductPlayback,
  dualRanges,
}: ProductRuntimeJourneyPlaybackActionOptions) {
  return useCallback(async (state: SliderState, title: string): Promise<void> => {
    console.log('[Journey] Starting audio engine');
    try {
      await startProductPlayback({ state, dualRanges, title });
    } catch (err) {
      console.error('[Journey] Failed to start audio:', err);
    }
  }, [dualRanges, startProductPlayback]);
}
