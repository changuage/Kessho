import { useCallback, useEffect, useRef, useState } from 'react';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type UseSelectedAudioEnginePlaybackTimerOptions = {
  playbackIsRunning: boolean;
  stopSelectedPlayback: () => void;
};

type SelectedAudioEnginePlaybackTimer = {
  playbackTimerEnabled: boolean;
  playbackTimerMinutes: number;
  playbackTimerRemaining: number | null;
  setPlaybackTimerEnabled: (enabled: boolean) => void;
  setPlaybackTimerMinutes: (minutes: number) => void;
  setPlaybackTimerRemaining: (remaining: number | null) => void;
  resetPlaybackTimer: () => void;
};

export function useSelectedAudioEnginePlaybackTimer({
  playbackIsRunning,
  stopSelectedPlayback,
}: UseSelectedAudioEnginePlaybackTimerOptions): SelectedAudioEnginePlaybackTimer {
  const [playbackTimerEnabled, setPlaybackTimerEnabled] = useState(false);
  const [playbackTimerMinutes, setPlaybackTimerMinutes] = useState(30);
  const [playbackTimerRemaining, setPlaybackTimerRemaining] = useState<number | null>(null);
  const playbackTimerTargetTimeRef = useRef<number | null>(null);

  const resetPlaybackTimer = useCallback((): void => {
    playbackTimerTargetTimeRef.current = null;
    setPlaybackTimerRemaining(null);
  }, []);

  const updatePlaybackTimerCountdown = useCallback(() => {
    if (!playbackIsRunning || !playbackTimerEnabled) return;

    const targetTime = playbackTimerTargetTimeRef.current;
    if (targetTime === null) return;

    const remainingMs = targetTime - Date.now();
    if (remainingMs <= 0) {
      resetPlaybackTimer();

      window.setTimeout(() => {
        stopSelectedPlayback();
      }, 0);
      return;
    }

    const nextRemaining = Math.ceil(remainingMs / 1000);
    setPlaybackTimerRemaining(prev => (prev === nextRemaining ? prev : nextRemaining));
  }, [
    playbackIsRunning,
    playbackTimerEnabled,
    resetPlaybackTimer,
    stopSelectedPlayback,
  ]);

  useEffect(() => {
    if (playbackIsRunning && playbackTimerEnabled) {
      if (playbackTimerTargetTimeRef.current === null) {
        const initialRemaining = playbackTimerRemaining ?? playbackTimerMinutes * 60;
        playbackTimerTargetTimeRef.current = Date.now() + initialRemaining * 1000;
        if (playbackTimerRemaining === null) {
          setPlaybackTimerRemaining(initialRemaining);
        }
      }
      updatePlaybackTimerCountdown();
      return;
    }

    if (!playbackIsRunning) {
      resetPlaybackTimer();
      return;
    }

    playbackTimerTargetTimeRef.current = null;
  }, [
    playbackIsRunning,
    playbackTimerEnabled,
    playbackTimerMinutes,
    playbackTimerRemaining,
    resetPlaybackTimer,
    updatePlaybackTimerCountdown,
  ]);

  useVisibleInterval(updatePlaybackTimerCountdown, 1000, {
    enabled: playbackIsRunning && playbackTimerEnabled,
    immediate: false,
  });

  return {
    playbackTimerEnabled,
    playbackTimerMinutes,
    playbackTimerRemaining,
    setPlaybackTimerEnabled,
    setPlaybackTimerMinutes,
    setPlaybackTimerRemaining,
    resetPlaybackTimer,
  };
}
