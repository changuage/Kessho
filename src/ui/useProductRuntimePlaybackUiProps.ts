import { useCallback, useMemo } from 'react';

type ProductRuntimePlaybackAction = () => void | Promise<void>;

type ProductRuntimeJourneyPlaybackOptions = {
  activeJourneyPresetName: string;
  config: unknown;
  play: () => void;
  validation: {
    playable: boolean;
    issues: readonly string[];
  };
};

export type ProductRuntimePlaybackUiPropsOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  startProductPlayback: ProductRuntimePlaybackAction;
  stopProductPlayback: () => void;
  journey: ProductRuntimeJourneyPlaybackOptions;
};

export function useProductRuntimePlaybackUiProps({
  playbackIsRunning,
  isJourneyPlaying,
  startProductPlayback,
  stopProductPlayback,
  journey,
}: ProductRuntimePlaybackUiPropsOptions) {
  const anyPlaybackIsRunning = playbackIsRunning || isJourneyPlaying;
  const startProductPlaybackFromUi = useCallback((): void => {
    void startProductPlayback();
  }, [startProductPlayback]);
  const toggleSnowflakePlayback = useCallback((): void => {
    if (anyPlaybackIsRunning) {
      stopProductPlayback();
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
    void startProductPlayback();
  }, [anyPlaybackIsRunning, journey, startProductPlayback, stopProductPlayback]);

  return useMemo(() => ({
    advancedTransportButton: {
      isPlaying: anyPlaybackIsRunning,
      onStart: startProductPlaybackFromUi,
      onStop: stopProductPlayback,
    },
    journeyPlaybackProps: {
      isPlaying: playbackIsRunning,
      onStopAudio: stopProductPlayback,
    },
    snowflakePlaybackProps: {
      isPlaying: anyPlaybackIsRunning,
      onTogglePlay: toggleSnowflakePlayback,
    },
  }), [anyPlaybackIsRunning, playbackIsRunning, startProductPlaybackFromUi, stopProductPlayback, toggleSnowflakePlayback]);
}
