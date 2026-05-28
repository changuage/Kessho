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
    audioEngineRuntimeMode: options.audioEngineRuntimeMode,
    capacitorAudioSessionDiagnosticActive: options.capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive: options.setCapacitorAudioSessionDiagnosticActive,
  });

  const runtimeUi = useProductRuntimeUi({
    audioEngineRuntimeMode: options.audioEngineRuntimeMode,
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
