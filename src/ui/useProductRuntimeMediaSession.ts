import { useCallback } from 'react';
import {
  connectProductMediaSessionToAudio,
  setupProductIOSMediaSession,
  stopProductIOSMediaSession,
} from './productAudioMediaSession';

type UseProductRuntimeMediaSessionOptions = {
  resumeProductRuntime: () => void | Promise<void>;
  suspendProductRuntime: () => void | Promise<void>;
  stopProductRuntime: () => void | Promise<void>;
};

type ProductRuntimeMediaSession = {
  setupProductIOSMediaSession: () => void;
  connectProductMediaSessionToAudio: () => void;
  stopProductIOSMediaSession: () => void;
};

export function useProductRuntimeMediaSession({
  resumeProductRuntime,
  suspendProductRuntime,
  stopProductRuntime,
}: UseProductRuntimeMediaSessionOptions): ProductRuntimeMediaSession {
  return {
    setupProductIOSMediaSession: useCallback(() => {
      setupProductIOSMediaSession({
        resumeProductRuntime,
        suspendProductRuntime,
        stopProductRuntime,
      });
    }, [resumeProductRuntime, stopProductRuntime, suspendProductRuntime]),
    connectProductMediaSessionToAudio: useCallback(() => {
      connectProductMediaSessionToAudio();
    }, []),
    stopProductIOSMediaSession: useCallback(() => {
      stopProductIOSMediaSession();
    }, []),
  };
}
