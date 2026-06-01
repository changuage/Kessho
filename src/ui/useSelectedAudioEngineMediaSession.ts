import { useCallback } from 'react';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import {
  connectMediaSessionToWebAudio,
  setupIOSMediaSession,
  stopIOSMediaSession,
} from './audioEngineMediaSession';

type UseSelectedAudioEngineMediaSessionOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  resumeSelectedAudioEngine: () => void | Promise<void>;
  suspendSelectedAudioEngine: () => void | Promise<void>;
  stopSelectedAudioEngine: () => void | Promise<void>;
};

type SelectedAudioEngineMediaSession = {
  setupSelectedIOSMediaSession: () => void;
  connectSelectedMediaSessionToAudio: () => void;
  stopSelectedIOSMediaSession: () => void;
};

export function useSelectedAudioEngineMediaSession({
  audioEngineRuntimeMode,
  resumeSelectedAudioEngine,
  suspendSelectedAudioEngine,
  stopSelectedAudioEngine,
}: UseSelectedAudioEngineMediaSessionOptions): SelectedAudioEngineMediaSession {
  const setupSelectedIOSMediaSession = useCallback((): void => {
    setupIOSMediaSession({
      audioEngineRuntimeMode,
      resumeSelectedAudioEngine,
      suspendSelectedAudioEngine,
      stopSelectedAudioEngine,
    });
  }, [audioEngineRuntimeMode, resumeSelectedAudioEngine, stopSelectedAudioEngine, suspendSelectedAudioEngine]);

  const connectSelectedMediaSessionToAudio = useCallback((): void => {
    connectMediaSessionToWebAudio(audioEngineRuntimeMode);
  }, [audioEngineRuntimeMode]);

  const stopSelectedIOSMediaSession = useCallback((): void => {
    stopIOSMediaSession(audioEngineRuntimeMode);
  }, [audioEngineRuntimeMode]);

  return {
    setupSelectedIOSMediaSession,
    connectSelectedMediaSessionToAudio,
    stopSelectedIOSMediaSession,
  };
}
