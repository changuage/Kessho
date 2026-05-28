import { useCallback, useRef } from 'react';
import { useSelectedAudioEngineJourneyPlaybackAction } from './useSelectedAudioEngineJourneyPlaybackAction';
import { useSelectedAudioEnginePlaybackStartState } from './useSelectedAudioEnginePlaybackStartState';
import { useSelectedAudioEnginePlaybackUiProps } from './useSelectedAudioEnginePlaybackUiProps';
import { useSelectedAudioEnginePresetLoadFade } from './useSelectedAudioEnginePresetLoadFade';
import { useSelectedAudioEngineStartAction } from './useSelectedAudioEngineStartAction';
import { useSelectedAudioEngineStopAction } from './useSelectedAudioEngineStopAction';

type PlaybackStartStateOptions = Parameters<typeof useSelectedAudioEnginePlaybackStartState>[0];
type StartActionOptions = Parameters<typeof useSelectedAudioEngineStartAction>[0];
type JourneyPlaybackActionOptions = Parameters<typeof useSelectedAudioEngineJourneyPlaybackAction>[0];
type StopActionOptions = Parameters<typeof useSelectedAudioEngineStopAction>[0];
type PlaybackUiOptions = Parameters<typeof useSelectedAudioEnginePlaybackUiProps>[0];
type PresetLoadFadeOptions = Parameters<typeof useSelectedAudioEnginePresetLoadFade>[0];

type SelectedAudioEnginePlaybackSurfaceOptions =
  PlaybackStartStateOptions &
  Omit<StartActionOptions, 'preparePlaybackStartState'> &
  JourneyPlaybackActionOptions &
  Omit<StopActionOptions, 'stopJourneyMorphPlayback'> &
  Omit<PlaybackUiOptions, 'startPlayback' | 'stopPlayback'> &
  Omit<PresetLoadFadeOptions, 'stopPlayback'>;

export function useSelectedAudioEnginePlaybackSurface(options: SelectedAudioEnginePlaybackSurfaceOptions) {
  const prepareSelectedPlaybackStartState = useSelectedAudioEnginePlaybackStartState(options);
  const handleStart = useSelectedAudioEngineStartAction({
    preparePlaybackStartState: prepareSelectedPlaybackStartState,
    startSelectedPlayback: options.startSelectedPlayback,
    startArmedRecordingAfterPlaybackStart: options.startArmedRecordingAfterPlaybackStart,
    dualRanges: options.dualRanges,
    title: options.title,
  });
  const startJourneyPlayback = useSelectedAudioEngineJourneyPlaybackAction({
    startSelectedPlayback: options.startSelectedPlayback,
    dualRanges: options.dualRanges,
  });

  const stopJourneyMorphPlaybackRef = useRef<(resetPosition: boolean) => void>(() => {});
  const stopJourneyMorphPlaybackFromRef = useCallback((resetPosition: boolean): void => {
    stopJourneyMorphPlaybackRef.current(resetPosition);
  }, []);

  const handleStop = useSelectedAudioEngineStopAction({
    stopSelectedPlayback: options.stopSelectedPlayback,
    isJourneyPlaying: options.isJourneyPlaying,
    stopJourney: options.stopJourney,
    stopJourneyMorphPlayback: stopJourneyMorphPlaybackFromRef,
    setIsJourneyPlaying: options.setIsJourneyPlaying,
    setState: options.setState,
    resetPlaybackTimer: options.resetPlaybackTimer,
  });

  const playbackUiProps = useSelectedAudioEnginePlaybackUiProps({
    playbackIsRunning: options.playbackIsRunning,
    isJourneyPlaying: options.isJourneyPlaying,
    startPlayback: handleStart,
    stopPlayback: handleStop,
    journey: options.journey,
  });

  const fadeOutAndStopForPresetLoad = useSelectedAudioEnginePresetLoadFade({
    playbackIsRunning: options.playbackIsRunning,
    isJourneyPlaying: options.isJourneyPlaying,
    fadeSelectedAudioEngineOutput: options.fadeSelectedAudioEngineOutput,
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
