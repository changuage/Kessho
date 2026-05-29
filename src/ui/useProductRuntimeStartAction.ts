import { useSelectedAudioEngineStartAction } from './useSelectedAudioEngineStartAction';
import type { SliderState } from './state';

type ProductRuntimeDualRanges = Record<string, { min: number; max: number }>;

type StartProductPlayback = (options: {
  state: SliderState;
  dualRanges: ProductRuntimeDualRanges;
  title: string;
}) => Promise<void>;

export type ProductRuntimeStartActionOptions = {
  preparePlaybackStartState: (requestedState?: SliderState) => Promise<SliderState>;
  startProductPlayback: StartProductPlayback;
  startArmedRecordingAfterPlaybackStart: () => void;
  dualRanges: ProductRuntimeDualRanges;
  title: string;
};

export function useProductRuntimeStartAction({
  startProductPlayback,
  ...options
}: ProductRuntimeStartActionOptions) {
  // TODO(product-runtime-compat-10C): selected-audio-engine start action remains the temporary
  // compatibility implementation behind this product runtime facade.
  return useSelectedAudioEngineStartAction({
    ...options,
    startSelectedPlayback: startProductPlayback,
  });
}
