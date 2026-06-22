import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobalPageProps } from './global/GlobalPage';
import { useVisibleInterval } from './hooks/useVisibleInterval';

type ProductRuntimeGlobalProps = Pick<
  GlobalPageProps,
  | 'runtimeComparison'
  | 'onResetCofDrift'
  | 'isRecording'
  | 'recordFormats'
  | 'recordStems'
  | 'recordingAvailable'
  | 'recordingDuration'
  | 'stemRecordingAvailable'
  | 'formatRecordingTime'
  | 'onRecordFormatsChange'
  | 'onRecordStemsChange'
  | 'playbackTimerEnabled'
  | 'playbackTimerMinutes'
  | 'playbackTimerRemaining'
  | 'onTimerEnabledChange'
  | 'onTimerMinutesChange'
  | 'onTimerRemainingChange'
>;

type ProductRuntimeGlobalRecordingProps = Pick<
  ProductRuntimeGlobalProps,
  | 'isRecording'
  | 'recordFormats'
  | 'recordStems'
  | 'recordingAvailable'
  | 'recordingDuration'
  | 'stemRecordingAvailable'
  | 'formatRecordingTime'
  | 'onRecordFormatsChange'
  | 'onRecordStemsChange'
>;

type ProductRuntimeGlobalSurfaceOptions = {
  playbackIsRunning: boolean;
  stopProductPlayback: () => void;
  runtimeComparison: ProductRuntimeGlobalProps['runtimeComparison'];
  onResetCofDrift: ProductRuntimeGlobalProps['onResetCofDrift'];
  recordingProps: ProductRuntimeGlobalRecordingProps;
};

export function useProductRuntimeGlobalSurface({
  playbackIsRunning,
  stopProductPlayback,
  runtimeComparison,
  onResetCofDrift,
  recordingProps,
}: ProductRuntimeGlobalSurfaceOptions) {
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
        stopProductPlayback();
      }, 0);
      return;
    }

    const nextRemaining = Math.ceil(remainingMs / 1000);
    setPlaybackTimerRemaining(prev => (prev === nextRemaining ? prev : nextRemaining));
  }, [
    playbackIsRunning,
    playbackTimerEnabled,
    resetPlaybackTimer,
    stopProductPlayback,
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

  const globalRuntimeProps = useMemo((): ProductRuntimeGlobalProps => ({
    runtimeComparison,
    onResetCofDrift,
    ...recordingProps,
    playbackTimerEnabled,
    playbackTimerMinutes,
    playbackTimerRemaining,
    onTimerEnabledChange: setPlaybackTimerEnabled,
    onTimerMinutesChange: setPlaybackTimerMinutes,
    onTimerRemainingChange: setPlaybackTimerRemaining,
  }), [
    onResetCofDrift,
    playbackTimerEnabled,
    playbackTimerMinutes,
    playbackTimerRemaining,
    recordingProps,
    runtimeComparison,
  ]);

  return {
    globalRuntimeProps,
    resetPlaybackTimer,
  };
}
