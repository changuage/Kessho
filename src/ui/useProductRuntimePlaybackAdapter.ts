import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useSelectedAudioEngineLifecycle } from './useSelectedAudioEngineLifecycle';
import { useSelectedAudioEngineMediaSession } from './useSelectedAudioEngineMediaSession';
import { useSelectedAudioEnginePlaybackControls } from './useSelectedAudioEnginePlaybackControls';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type UseProductRuntimePlaybackAdapterOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
};

type StartProductPlaybackOptions = {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
};

type ProductRuntimePlaybackAdapter = {
  startProductPlayback: (options: StartProductPlaybackOptions) => Promise<void>;
  stopProductPlayback: () => void;
  preloadProductRuntime: () => Promise<unknown>;
  stopProductRuntime: () => void;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
};

export function useProductRuntimePlaybackAdapter({
  productRuntimeMode,
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
}: UseProductRuntimePlaybackAdapterOptions): ProductRuntimePlaybackAdapter {
  const {
    startSelectedAudioEngine: startProductRuntime,
    resumeSelectedAudioEngine: resumeProductRuntime,
    suspendSelectedAudioEngine: suspendProductRuntime,
    preloadSelectedAudioEngine: preloadProductRuntime,
    stopSelectedAudioEngine: stopProductRuntime,
    fadeSelectedAudioEngineOutput: fadeProductRuntimeOutput,
  } = useSelectedAudioEngineLifecycle(productRuntimeMode);

  const {
    connectSelectedMediaSessionToAudio,
    setupSelectedIOSMediaSession,
    stopSelectedIOSMediaSession,
  } = useSelectedAudioEngineMediaSession({
    audioEngineRuntimeMode: productRuntimeMode,
    resumeSelectedAudioEngine: resumeProductRuntime,
    suspendSelectedAudioEngine: suspendProductRuntime,
  });

  const {
    startSelectedPlayback: startProductPlayback,
    stopSelectedPlayback: stopProductPlayback,
  } = useSelectedAudioEnginePlaybackControls({
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
    startSelectedAudioEngine: startProductRuntime,
    stopSelectedAudioEngine: stopProductRuntime,
    setupSelectedIOSMediaSession,
    connectSelectedMediaSessionToAudio,
    stopSelectedIOSMediaSession,
  });

  return {
    startProductPlayback,
    stopProductPlayback,
    preloadProductRuntime,
    stopProductRuntime,
    fadeProductRuntimeOutput,
  };
}
