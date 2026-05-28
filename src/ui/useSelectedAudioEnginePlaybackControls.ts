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

type UseSelectedAudioEnginePlaybackControlsOptions = {
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
  startSelectedAudioEngine: (stateToStart: SliderState) => Promise<void>;
  stopSelectedAudioEngine: () => void;
  setupSelectedIOSMediaSession: () => void;
  connectSelectedMediaSessionToAudio: () => void;
  stopSelectedIOSMediaSession: () => void;
};

type StartSelectedPlaybackOptions = {
  state: SliderState;
  dualRanges: NativeDualRanges;
  title: string;
};

type SelectedAudioEnginePlaybackControls = {
  startSelectedPlayback: (options: StartSelectedPlaybackOptions) => Promise<void>;
  stopSelectedPlayback: () => void;
};

export function useSelectedAudioEnginePlaybackControls({
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
  startSelectedAudioEngine,
  stopSelectedAudioEngine,
  setupSelectedIOSMediaSession,
  connectSelectedMediaSessionToAudio,
  stopSelectedIOSMediaSession,
}: UseSelectedAudioEnginePlaybackControlsOptions): SelectedAudioEnginePlaybackControls {
  const startSelectedPlayback = useCallback(async ({
    state,
    dualRanges,
    title,
  }: StartSelectedPlaybackOptions): Promise<void> => {
    const audioSessionDiagnosticEnabled =
      capacitorAudioSessionDiagnosticActive ||
      (
        shouldUseCapacitorAudioSessionDiagnostics() &&
        isCapacitorNativeShell() &&
        isCapacitorAudioSessionAvailable()
      );
    if (!capacitorAudioSessionDiagnosticActive && audioSessionDiagnosticEnabled) {
      setCapacitorAudioSessionDiagnosticActive(true);
    }

    // iOS media-session setup must stay synchronous with the user gesture.
    setupSelectedIOSMediaSession();
    await startSelectedAudioEngine(state);
    connectSelectedMediaSessionToAudio();

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
    connectSelectedMediaSessionToAudio,
    setCapacitorAudioSessionDiagnosticActive,
    setupSelectedIOSMediaSession,
    startSelectedAudioEngine,
  ]);

  const stopSelectedPlayback = useCallback((): void => {
    if (capacitorAudioSessionDiagnosticActive) {
      void stopCapacitorAudioSessionPlayback();
    }
    stopSelectedIOSMediaSession();
    stopSelectedAudioEngine();
  }, [
    capacitorAudioSessionDiagnosticActive,
    stopSelectedAudioEngine,
    stopSelectedIOSMediaSession,
  ]);

  return {
    startSelectedPlayback,
    stopSelectedPlayback,
  };
}
