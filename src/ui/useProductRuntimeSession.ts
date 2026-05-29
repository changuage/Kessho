import { useMemo } from 'react';
import {
  resolveProductRuntimeModeInitialState,
  useProductRuntimeModeSession,
} from './useProductRuntimeModeSession';
import { useProductRuntimePlaybackRuntime } from './useProductRuntimePlaybackRuntime';
import { useProductRuntimeUi } from './useProductRuntimeUi';

type ResolveProductRuntimeInitialStateOptions = Parameters<typeof resolveProductRuntimeModeInitialState>[0];

type ProductRuntimeShellOptions =
  Parameters<typeof useProductRuntimePlaybackRuntime>[0] &
  Omit<Parameters<typeof useProductRuntimeUi>[0], 'preloadProductRuntime' | 'stopProductRuntime'>;

export function resolveProductRuntimeInitialState(options: ResolveProductRuntimeInitialStateOptions) {
  return resolveProductRuntimeModeInitialState(options);
}

export function useProductRuntimeSession() {
  return useProductRuntimeModeSession();
}

export function useProductRuntimeShell(options: ProductRuntimeShellOptions) {
  const playbackRuntime = useProductRuntimePlaybackRuntime({
    productRuntimeMode: options.productRuntimeMode,
    capacitorAudioSessionDiagnosticActive: options.capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive: options.setCapacitorAudioSessionDiagnosticActive,
  });

  const runtimeUi = useProductRuntimeUi({
    productRuntimeMode: options.productRuntimeMode,
    preloadProductRuntime: playbackRuntime.preloadProductRuntime,
    stateRef: options.stateRef,
    stopProductRuntime: playbackRuntime.stopProductRuntime,
  });

  return useMemo(() => ({
    ...playbackRuntime,
    ...runtimeUi,
  }), [
    playbackRuntime,
    runtimeUi,
  ]);
}
