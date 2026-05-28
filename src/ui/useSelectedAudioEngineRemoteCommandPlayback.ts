import { useCallback } from 'react';
import type { CapacitorAudioSessionRemoteCommand } from './useCapacitorAudioSessionDiagnostics';

type SelectedAudioEngineRemoteCommandPlaybackOptions = {
  playbackIsRunning: boolean;
  startPlayback: () => void | Promise<void>;
  stopPlayback: () => void;
};

export function useSelectedAudioEngineRemoteCommandPlayback({
  playbackIsRunning,
  startPlayback,
  stopPlayback,
}: SelectedAudioEngineRemoteCommandPlaybackOptions): (command: CapacitorAudioSessionRemoteCommand) => void {
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
