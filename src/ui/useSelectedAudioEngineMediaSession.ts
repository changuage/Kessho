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
}: UseSelectedAudioEngineMediaSessionOptions): SelectedAudioEngineMediaSession {
  const setupSelectedIOSMediaSession = useCallback((): void => {
    setupIOSMediaSession({
      resumeSelectedAudioEngine,
      suspendSelectedAudioEngine,
    });
  }, [resumeSelectedAudioEngine, suspendSelectedAudioEngine]);

  const connectSelectedMediaSessionToAudio = useCallback((): void => {
    connectMediaSessionToWebAudio(audioEngineRuntimeMode);
  }, [audioEngineRuntimeMode]);

  const stopSelectedIOSMediaSession = useCallback((): void => {
    stopIOSMediaSession();
  }, []);

  return {
    setupSelectedIOSMediaSession,
    connectSelectedMediaSessionToAudio,
    stopSelectedIOSMediaSession,
  };
}
