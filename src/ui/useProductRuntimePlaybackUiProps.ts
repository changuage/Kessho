import { useSelectedAudioEnginePlaybackUiProps } from './useSelectedAudioEnginePlaybackUiProps';

type ProductRuntimePlaybackAction = () => void | Promise<void>;

type ProductRuntimeJourneyPlaybackOptions = {
  activeJourneyPresetName: string;
  config: unknown;
  play: () => void;
  validation: {
    playable: boolean;
    issues: readonly string[];
  };
};

export type ProductRuntimePlaybackUiPropsOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  startProductPlayback: ProductRuntimePlaybackAction;
  stopProductPlayback: () => void;
  journey: ProductRuntimeJourneyPlaybackOptions;
};

export function useProductRuntimePlaybackUiProps({
  startProductPlayback,
  stopProductPlayback,
  ...options
}: ProductRuntimePlaybackUiPropsOptions) {
  // TODO(product-runtime-compat-10C): playback UI prop assembly still delegates to the
  // selected-runtime implementation while the product surface exposes product names.
  return useSelectedAudioEnginePlaybackUiProps({
    ...options,
    startPlayback: startProductPlayback,
    stopPlayback: stopProductPlayback,
  });
}
