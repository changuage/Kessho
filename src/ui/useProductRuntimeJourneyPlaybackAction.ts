import { useSelectedAudioEngineJourneyPlaybackAction } from './useSelectedAudioEngineJourneyPlaybackAction';
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
  ...options
}: ProductRuntimeJourneyPlaybackActionOptions) {
  // TODO(product-runtime-compat-10C): journey playback still delegates through the selected-audio-engine
  // action while Batch 10 isolates compatibility names behind product runtime facades.
  return useSelectedAudioEngineJourneyPlaybackAction({
    ...options,
    startSelectedPlayback: startProductPlayback,
  });
}
