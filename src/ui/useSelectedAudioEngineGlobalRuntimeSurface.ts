import { useSelectedAudioEngineGlobalRuntimeProps } from './useSelectedAudioEngineGlobalRuntimeProps';
import { useSelectedAudioEnginePlaybackTimer } from './useSelectedAudioEnginePlaybackTimer';

type PlaybackTimerOptions = Parameters<typeof useSelectedAudioEnginePlaybackTimer>[0];
type GlobalRuntimePropsOptions = Parameters<typeof useSelectedAudioEngineGlobalRuntimeProps>[0];

type SelectedAudioEngineGlobalRuntimeSurfaceOptions =
  PlaybackTimerOptions &
  Omit<GlobalRuntimePropsOptions, 'playbackTimerProps'>;

export function useSelectedAudioEngineGlobalRuntimeSurface(options: SelectedAudioEngineGlobalRuntimeSurfaceOptions) {
  const { playbackTimerEnabled, playbackTimerMinutes, playbackTimerRemaining, resetPlaybackTimer, setPlaybackTimerEnabled, setPlaybackTimerMinutes, setPlaybackTimerRemaining } =
    useSelectedAudioEnginePlaybackTimer({
      playbackIsRunning: options.playbackIsRunning,
      stopSelectedPlayback: options.stopSelectedPlayback,
    });

  const globalRuntimeProps = useSelectedAudioEngineGlobalRuntimeProps({
    runtimeComparison: options.runtimeComparison,
    onResetCofDrift: options.onResetCofDrift,
    recordingProps: options.recordingProps,
    playbackTimerProps: {
      playbackTimerEnabled,
      playbackTimerMinutes,
      playbackTimerRemaining,
      onTimerEnabledChange: setPlaybackTimerEnabled,
      onTimerMinutesChange: setPlaybackTimerMinutes,
      onTimerRemainingChange: setPlaybackTimerRemaining,
    },
  });

  return {
    globalRuntimeProps,
    resetPlaybackTimer,
  };
}
