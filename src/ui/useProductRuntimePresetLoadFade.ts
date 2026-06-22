import { useSelectedAudioEnginePresetLoadFade } from './useSelectedAudioEnginePresetLoadFade';

export type ProductRuntimePresetLoadFadeOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
  stopProductPlayback: () => void;
};

export function useProductRuntimePresetLoadFade({
  fadeProductRuntimeOutput,
  stopProductPlayback,
  ...options
}: ProductRuntimePresetLoadFadeOptions) {
  // TODO(product-fallback-retire:runtime-preset-load-fade): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // Preset-load fade still delegates to the selected-audio-engine
  // helper until playback fade orchestration is product-owned end to end.
  return useSelectedAudioEnginePresetLoadFade({
    ...options,
    fadeSelectedAudioEngineOutput: fadeProductRuntimeOutput,
    stopPlayback: stopProductPlayback,
  });
}
