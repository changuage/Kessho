import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useProductRuntimeLifecycle } from './useProductRuntimeLifecycle';
import { useProductRuntimeMediaSession } from './useProductRuntimeMediaSession';
import { useProductRuntimePlaybackControls } from './useProductRuntimePlaybackControls';

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
    startProductRuntime,
    resumeProductRuntime,
    suspendProductRuntime,
    preloadProductRuntime,
    stopProductRuntime,
    fadeProductRuntimeOutput,
  } = useProductRuntimeLifecycle(productRuntimeMode);

  const {
    connectProductMediaSessionToAudio,
    setupProductIOSMediaSession,
    stopProductIOSMediaSession,
  } = useProductRuntimeMediaSession({
    productRuntimeMode,
    resumeProductRuntime,
    suspendProductRuntime,
  });

  const {
    startProductPlayback,
    stopProductPlayback,
  } = useProductRuntimePlaybackControls({
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
    startProductRuntime,
    stopProductRuntime,
    setupProductIOSMediaSession,
    connectProductMediaSessionToAudio,
    stopProductIOSMediaSession,
  });

  return {
    startProductPlayback,
    stopProductPlayback,
    preloadProductRuntime,
    stopProductRuntime,
    fadeProductRuntimeOutput,
  };
}
