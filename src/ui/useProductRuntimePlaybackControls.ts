import { useCallback } from 'react';
import {
  isCapacitorAudioSessionAvailable,
  isCapacitorNativeShell,
  shouldUseCapacitorAudioSessionDiagnostics,
  startCapacitorAudioSessionPlayback,
  stopCapacitorAudioSessionPlayback,
} from '../native/capacitorAudioSession';
import type { SliderState } from './state';

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
  const startProductPlayback = useCallback(async ({ state, dualRanges, title }: StartProductPlaybackOptions): Promise<void> => {
    const audioSessionDiagnosticEnabled = capacitorAudioSessionDiagnosticActive || (
      shouldUseCapacitorAudioSessionDiagnostics() &&
      isCapacitorNativeShell() &&
      isCapacitorAudioSessionAvailable()
    );
    if (!capacitorAudioSessionDiagnosticActive && audioSessionDiagnosticEnabled) {
      setCapacitorAudioSessionDiagnosticActive(true);
    }

    // iOS media-session setup must stay synchronous with the initiating gesture.
    setupProductIOSMediaSession();
    await startProductRuntime(state);
    connectProductMediaSessionToAudio();

    if (audioSessionDiagnosticEnabled) {
      await startCapacitorAudioSessionPlayback(
        { state, dualRanges },
        {
          title,
          artist: 'Kessho',
          album: 'Kessho Capacitor',
          isLiveStream: true,
          isPlaying: true,
        },
      );
    }
  }, [
    capacitorAudioSessionDiagnosticActive,
    connectProductMediaSessionToAudio,
    setCapacitorAudioSessionDiagnosticActive,
    setupProductIOSMediaSession,
    startProductRuntime,
  ]);

  const stopProductPlayback = useCallback((): void => {
    if (capacitorAudioSessionDiagnosticActive) void stopCapacitorAudioSessionPlayback();
    stopProductIOSMediaSession();
    stopProductRuntime();
  }, [capacitorAudioSessionDiagnosticActive, stopProductIOSMediaSession, stopProductRuntime]);

  return {
    startProductPlayback,
    stopProductPlayback,
  };
}
