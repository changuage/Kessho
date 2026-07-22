import { useCallback, useMemo, useState } from 'react';
import type { SliderState } from './state';
import { useProductRuntimeBackgroundAudioSupport, type ProductRuntimeBackgroundAudioStatus } from './useProductRuntimeBackgroundAudioSupport';
import { useProductRuntimeLifecycle } from './useProductRuntimeLifecycle';
import type { ProductRuntimeLifecycle } from './useProductRuntimeLifecycle';
import { useProductRuntimeMediaSession } from './useProductRuntimeMediaSession';
import { useProductRuntimePlaybackControls } from './useProductRuntimePlaybackControls';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type UseProductRuntimePlaybackAdapterOptions = {
  productRuntimeLifecycle: ProductRuntimeLifecycle;
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
};

type StartProductPlaybackOptions = {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
};

type ProductRuntimePlaybackAdapter = {
  primeProductRuntimeAudio: () => void;
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
  productRuntimeLifecycle,
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
}: UseProductRuntimePlaybackAdapterOptions): ProductRuntimePlaybackAdapter {
  const {
    primeProductRuntimeAudio,
    startProductRuntime,
    resumeProductRuntime,
    suspendProductRuntime,
    preloadProductRuntime,
    stopProductRuntime,
    fadeProductRuntimeOutput,
  } = useProductRuntimeLifecycle(productRuntimeLifecycle);
  const [browserPlaybackActive, setBrowserPlaybackActive] = useState(false);
  const {
    backgroundAudioStatus,
    requestVisiblePageWakeLock,
    releaseVisiblePageWakeLock,
  } = useProductRuntimeBackgroundAudioSupport({
    productRuntimeSupportsBackgroundResume: productRuntimeLifecycle.supportsBackgroundResume,
    getProductLifecycleState: productRuntimeLifecycle.getProductLifecycleState,
    playbackActive: browserPlaybackActive,
    resumeProductRuntime,
  });

  const {
    connectProductMediaSessionToAudio,
    setupProductIOSMediaSession,
    stopProductIOSMediaSession,
  } = useProductRuntimeMediaSession({
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
    primeProductRuntimeAudio,
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
    primeProductRuntimeAudio,
    releaseVisiblePageWakeLock,
    requestVisiblePageWakeLock,
    startProductPlayback,
    stopProductPlayback,
    stopProductRuntime,
  ]);
}
