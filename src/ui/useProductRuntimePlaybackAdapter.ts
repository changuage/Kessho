import { useCallback, useMemo, useState } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useProductRuntimeBackgroundAudioSupport, type ProductRuntimeBackgroundAudioStatus } from './useProductRuntimeBackgroundAudioSupport';
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
  backgroundAudioStatus: ProductRuntimeBackgroundAudioStatus;
  requestVisiblePageWakeLock: () => Promise<void>;
  releaseVisiblePageWakeLock: () => Promise<void>;
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
  const [browserPlaybackActive, setBrowserPlaybackActive] = useState(false);
  const {
    backgroundAudioStatus,
    requestVisiblePageWakeLock,
    releaseVisiblePageWakeLock,
  } = useProductRuntimeBackgroundAudioSupport({
    productRuntimeMode,
    playbackActive: browserPlaybackActive,
    resumeProductRuntime,
  });

  const {
    connectProductMediaSessionToAudio,
    setupProductIOSMediaSession,
    stopProductIOSMediaSession,
  } = useProductRuntimeMediaSession({
    productRuntimeMode,
    resumeProductRuntime,
    suspendProductRuntime,
    stopProductRuntime,
  });

  const {
    startProductPlayback: startProductPlaybackBase,
    stopProductPlayback: stopProductPlaybackBase,
  } = useProductRuntimePlaybackControls({
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
    startProductRuntime,
    stopProductRuntime,
    setupProductIOSMediaSession,
    connectProductMediaSessionToAudio,
    stopProductIOSMediaSession,
  });

  const startProductPlayback = useCallback(async (options: StartProductPlaybackOptions): Promise<void> => {
    await startProductPlaybackBase(options);
    setBrowserPlaybackActive(true);
  }, [startProductPlaybackBase]);

  const stopProductPlayback = useCallback((): void => {
    stopProductPlaybackBase();
    setBrowserPlaybackActive(false);
  }, [stopProductPlaybackBase]);

  return useMemo(() => ({
    startProductPlayback,
    stopProductPlayback,
    preloadProductRuntime,
    stopProductRuntime,
    fadeProductRuntimeOutput,
    backgroundAudioStatus,
    requestVisiblePageWakeLock,
    releaseVisiblePageWakeLock,
  }), [
    backgroundAudioStatus,
    fadeProductRuntimeOutput,
    preloadProductRuntime,
    releaseVisiblePageWakeLock,
    requestVisiblePageWakeLock,
    startProductPlayback,
    stopProductPlayback,
    stopProductRuntime,
  ]);
}
