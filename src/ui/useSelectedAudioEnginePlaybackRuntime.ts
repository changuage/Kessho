import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter';

type UseSelectedAudioEnginePlaybackRuntimeOptions = Parameters<typeof useProductRuntimePlaybackAdapter>[0];
type ProductRuntimePlaybackAdapter = ReturnType<typeof useProductRuntimePlaybackAdapter>;
type SelectedAudioEnginePlaybackRuntime = {
  startSelectedPlayback: ProductRuntimePlaybackAdapter['startProductPlayback'];
  stopSelectedPlayback: ProductRuntimePlaybackAdapter['stopProductPlayback'];
  preloadSelectedAudioEngine: ProductRuntimePlaybackAdapter['preloadProductRuntime'];
  stopSelectedAudioEngine: ProductRuntimePlaybackAdapter['stopProductRuntime'];
  fadeSelectedAudioEngineOutput: ProductRuntimePlaybackAdapter['fadeProductRuntimeOutput'];
};

export function useSelectedAudioEnginePlaybackRuntime({
  audioEngineRuntimeMode,
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
}: UseSelectedAudioEnginePlaybackRuntimeOptions): SelectedAudioEnginePlaybackRuntime {
  const playbackAdapter = useProductRuntimePlaybackAdapter({
    audioEngineRuntimeMode,
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
  });

  return {
    startSelectedPlayback: playbackAdapter.startProductPlayback,
    stopSelectedPlayback: playbackAdapter.stopProductPlayback,
    preloadSelectedAudioEngine: playbackAdapter.preloadProductRuntime,
    stopSelectedAudioEngine: playbackAdapter.stopProductRuntime,
    fadeSelectedAudioEngineOutput: playbackAdapter.fadeProductRuntimeOutput,
  };
}
