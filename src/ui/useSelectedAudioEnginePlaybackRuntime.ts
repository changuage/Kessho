import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';

type UseSelectedAudioEnginePlaybackRuntimeOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
};
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
    productRuntimeMode: audioEngineRuntimeMode,
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
