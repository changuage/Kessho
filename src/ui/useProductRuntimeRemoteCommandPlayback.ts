import { useCallback } from 'react';
import type { CapacitorAudioSessionRemoteCommand } from './useCapacitorAudioSessionDiagnostics';

type ProductRuntimeRemoteCommandPlaybackOptions = {
  playbackIsRunning: boolean;
  startPlayback: () => void | Promise<void>;
  stopPlayback: () => void;
};

export function useProductRuntimeRemoteCommandPlayback({
  playbackIsRunning,
  startPlayback,
  stopPlayback,
}: ProductRuntimeRemoteCommandPlaybackOptions): (command: CapacitorAudioSessionRemoteCommand) => void {
  return useCallback((command: CapacitorAudioSessionRemoteCommand) => {
    if (command === 'play') {
      if (!playbackIsRunning) void startPlayback();
      return;
    }
    if (command === 'pause') {
      if (playbackIsRunning) stopPlayback();
      return;
    }
    if (playbackIsRunning) {
      stopPlayback();
    } else {
      void startPlayback();
    }
  }, [
    playbackIsRunning,
    startPlayback,
    stopPlayback,
  ]);
}
