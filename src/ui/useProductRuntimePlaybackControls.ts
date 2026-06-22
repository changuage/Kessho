import type { SliderState } from './state';
import { useSelectedAudioEnginePlaybackControls } from './useSelectedAudioEnginePlaybackControls';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type UseProductRuntimePlaybackControlsOptions = {
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
  startProductRuntime: (stateToStart: SliderState) => Promise<void>;
  stopProductRuntime: () => void;
  setupProductIOSMediaSession: () => void;
  connectProductMediaSessionToAudio: () => void;
  stopProductIOSMediaSession: () => void;
};

type StartProductPlaybackOptions = {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
};

type ProductRuntimePlaybackControls = {
  startProductPlayback: (options: StartProductPlaybackOptions) => Promise<void>;
  stopProductPlayback: () => void;
};

export function useProductRuntimePlaybackControls({
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
  startProductRuntime,
  stopProductRuntime,
  setupProductIOSMediaSession,
  connectProductMediaSessionToAudio,
  stopProductIOSMediaSession,
}: UseProductRuntimePlaybackControlsOptions): ProductRuntimePlaybackControls {
  // TODO(product-fallback-retire:runtime-playback-controls): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // This maps product playback names onto the selected-audio-engine
  // implementation while Batch 10 continues moving lifecycle/media code behind product runtime surfaces.
  const selectedPlaybackControls = useSelectedAudioEnginePlaybackControls({
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
    startSelectedAudioEngine: startProductRuntime,
    stopSelectedAudioEngine: stopProductRuntime,
    setupSelectedIOSMediaSession: setupProductIOSMediaSession,
    connectSelectedMediaSessionToAudio: connectProductMediaSessionToAudio,
    stopSelectedIOSMediaSession: stopProductIOSMediaSession,
  });

  return {
    startProductPlayback: selectedPlaybackControls.startSelectedPlayback,
    stopProductPlayback: selectedPlaybackControls.stopSelectedPlayback,
  };
}
