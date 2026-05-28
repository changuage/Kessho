import { useCallback, useMemo } from 'react';

type PlaybackAction = () => void | Promise<void>;

type JourneyPlaybackOptions = {
  activeJourneyPresetName: string;
  config: unknown;
  play: () => void;
  validation: {
    playable: boolean;
    issues: readonly string[];
  };
};

type SelectedAudioEnginePlaybackUiPropsOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  startPlayback: PlaybackAction;
  stopPlayback: () => void;
  journey: JourneyPlaybackOptions;
};

export function useSelectedAudioEnginePlaybackUiProps({
  playbackIsRunning,
  isJourneyPlaying,
  startPlayback,
  stopPlayback,
  journey,
}: SelectedAudioEnginePlaybackUiPropsOptions) {
  const anyPlaybackIsRunning = playbackIsRunning || isJourneyPlaying;

  const startSelectedPlaybackFromUi = useCallback((): void => {
    void startPlayback();
  }, [startPlayback]);

  const togglePrototypePlayback = useCallback((): void => {
    if (anyPlaybackIsRunning) {
      stopPlayback();
      return;
    }
    void startPlayback();
  }, [anyPlaybackIsRunning, startPlayback, stopPlayback]);

  const toggleSnowflakePlayback = useCallback((): void => {
    if (anyPlaybackIsRunning) {
      stopPlayback();
      return;
    }
    if (journey.activeJourneyPresetName && journey.config) {
      if (!journey.validation.playable) {
        alert(`Journey cannot play yet:\n\n${journey.validation.issues.join('\n')}`);
        return;
      }
      journey.play();
      return;
    }
    void startPlayback();
  }, [
    anyPlaybackIsRunning,
    journey,
    startPlayback,
    stopPlayback,
  ]);

  return useMemo(() => ({
    advancedTransportButton: {
      isPlaying: anyPlaybackIsRunning,
      onStart: startSelectedPlaybackFromUi,
      onStop: stopPlayback,
    },
    journeyPlaybackProps: {
      isPlaying: playbackIsRunning,
      onStopAudio: stopPlayback,
    },
    snowflakePlaybackProps: {
      isPlaying: anyPlaybackIsRunning,
      onTogglePlay: toggleSnowflakePlayback,
    },
    snowflakePrototypePlaybackProps: {
      isPlaying: anyPlaybackIsRunning,
      onTogglePlay: togglePrototypePlayback,
    },
  }), [
    anyPlaybackIsRunning,
    playbackIsRunning,
    startSelectedPlaybackFromUi,
    stopPlayback,
    togglePrototypePlayback,
    toggleSnowflakePlayback,
  ]);
}
