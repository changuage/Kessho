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
  Omit<StartActionOptions, 'preparePlaybackStartState' | 'startSelectedPlayback'> &
  Omit<JourneyPlaybackActionOptions, 'startSelectedPlayback'> &
  Omit<StopActionOptions, 'stopJourneyMorphPlayback' | 'stopSelectedPlayback'> &
  Omit<PlaybackUiOptions, 'startPlayback' | 'stopPlayback'> &
  Omit<PresetLoadFadeOptions, 'stopPlayback' | 'fadeSelectedAudioEngineOutput'> & {
    startProductPlayback: StartActionOptions['startSelectedPlayback'];
    stopProductPlayback: StopActionOptions['stopSelectedPlayback'];
    fadeProductRuntimeOutput: PresetLoadFadeOptions['fadeSelectedAudioEngineOutput'];
  };

export function useProductRuntimePlaybackSurface(options: ProductRuntimePlaybackSurfaceOptions) {
  const prepareProductPlaybackStartState = useProductRuntimePlaybackStartState(options);
  const handleStart = useProductRuntimeStartAction({
    preparePlaybackStartState: prepareProductPlaybackStartState,
    startSelectedPlayback: options.startProductPlayback,
    startArmedRecordingAfterPlaybackStart: options.startArmedRecordingAfterPlaybackStart,
    dualRanges: options.dualRanges,
    title: options.title,
  });
  const startJourneyPlayback = useProductRuntimeJourneyPlaybackAction({
    startSelectedPlayback: options.startProductPlayback,
    dualRanges: options.dualRanges,
  });

  const stopJourneyMorphPlaybackRef = useRef<(resetPosition: boolean) => void>(() => {});
  const stopJourneyMorphPlaybackFromRef = useCallback((resetPosition: boolean): void => {
    stopJourneyMorphPlaybackRef.current(resetPosition);
  }, []);

  const handleStop = useProductRuntimeStopAction({
    stopSelectedPlayback: options.stopProductPlayback,
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
    startPlayback: handleStart,
    stopPlayback: handleStop,
    journey: options.journey,
  });

  const fadeOutAndStopForPresetLoad = useProductRuntimePresetLoadFade({
    playbackIsRunning: options.playbackIsRunning,
    isJourneyPlaying: options.isJourneyPlaying,
    fadeSelectedAudioEngineOutput: options.fadeProductRuntimeOutput,
    stopPlayback: handleStop,
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
