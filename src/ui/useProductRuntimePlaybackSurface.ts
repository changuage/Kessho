import { useCallback, useRef } from 'react';
import { useProductRuntimeJourneyPlaybackAction } from './useProductRuntimeJourneyPlaybackAction';
import { useProductRuntimePlaybackStartState } from './useProductRuntimePlaybackStartState';
import { useProductRuntimePlaybackUiProps } from './useProductRuntimePlaybackUiProps';
import { useProductRuntimePresetLoadFade } from './useProductRuntimePresetLoadFade';
import { useProductRuntimeStartAction } from './useProductRuntimeStartAction';
import { useProductRuntimeStopAction } from './useProductRuntimeStopAction';

type PlaybackStartStateOptions = Parameters<typeof useProductRuntimePlaybackStartState>[0];
type StartActionOptions = Parameters<typeof useProductRuntimeStartAction>[0];
type JourneyPlaybackActionOptions = Parameters<typeof useProductRuntimeJourneyPlaybackAction>[0];
type StopActionOptions = Parameters<typeof useProductRuntimeStopAction>[0];
type PlaybackUiOptions = Parameters<typeof useProductRuntimePlaybackUiProps>[0];
type PresetLoadFadeOptions = Parameters<typeof useProductRuntimePresetLoadFade>[0];

type ProductRuntimePlaybackSurfaceOptions =
  PlaybackStartStateOptions &
  Omit<StartActionOptions, 'preparePlaybackStartState' | 'startProductPlayback'> &
  Omit<JourneyPlaybackActionOptions, 'startProductPlayback'> &
  Omit<StopActionOptions, 'stopJourneyMorphPlayback' | 'stopProductPlayback'> &
  Omit<PlaybackUiOptions, 'startProductPlayback' | 'stopProductPlayback'> &
  Omit<PresetLoadFadeOptions, 'stopProductPlayback' | 'fadeProductRuntimeOutput'> & {
    startProductPlayback: StartActionOptions['startProductPlayback'];
    stopProductPlayback: StopActionOptions['stopProductPlayback'];
    fadeProductRuntimeOutput: PresetLoadFadeOptions['fadeProductRuntimeOutput'];
  };

export function useProductRuntimePlaybackSurface(options: ProductRuntimePlaybackSurfaceOptions) {
  const prepareProductPlaybackStartState = useProductRuntimePlaybackStartState(options);
  const handleStart = useProductRuntimeStartAction({
    preparePlaybackStartState: prepareProductPlaybackStartState,
    startProductPlayback: options.startProductPlayback,
    startArmedRecordingAfterPlaybackStart: options.startArmedRecordingAfterPlaybackStart,
    dualRanges: options.dualRanges,
    title: options.title,
  });
  const startJourneyPlayback = useProductRuntimeJourneyPlaybackAction({
    startProductPlayback: options.startProductPlayback,
    dualRanges: options.dualRanges,
  });

  const stopJourneyMorphPlaybackRef = useRef<(resetPosition: boolean) => void>(() => {});
  const stopJourneyMorphPlaybackFromRef = useCallback((resetPosition: boolean): void => {
    stopJourneyMorphPlaybackRef.current(resetPosition);
  }, []);

  const handleStop = useProductRuntimeStopAction({
    stopProductPlayback: options.stopProductPlayback,
    isJourneyPlaying: options.isJourneyPlaying,
    stopJourney: options.stopJourney,
    stopJourneyMorphPlayback: stopJourneyMorphPlaybackFromRef,
    setIsJourneyPlaying: options.setIsJourneyPlaying,
    setState: options.setState,
    resetPlaybackTimer: options.resetPlaybackTimer,
  });

  const playbackUiProps = useProductRuntimePlaybackUiProps({
    playbackIsRunning: options.playbackIsRunning,
    isJourneyPlaying: options.isJourneyPlaying,
    startProductPlayback: handleStart,
    stopProductPlayback: handleStop,
    journey: options.journey,
  });

  const fadeOutAndStopForPresetLoad = useProductRuntimePresetLoadFade({
    playbackIsRunning: options.playbackIsRunning,
    isJourneyPlaying: options.isJourneyPlaying,
    fadeProductRuntimeOutput: options.fadeProductRuntimeOutput,
    stopProductPlayback: handleStop,
  });

  return {
    ...playbackUiProps,
    fadeOutAndStopForPresetLoad,
    handleStart,
    handleStop,
    startJourneyPlayback,
    stopJourneyMorphPlaybackRef,
  };
}
