import { useMemo } from 'react';
import type { GlobalPageProps } from './global/GlobalPage';

type GlobalRuntimeProps = Pick<
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

type GlobalRecordingProps = Pick<
  GlobalRuntimeProps,
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

type GlobalPlaybackTimerProps = Pick<
  GlobalRuntimeProps,
  | 'playbackTimerEnabled'
  | 'playbackTimerMinutes'
  | 'playbackTimerRemaining'
  | 'onTimerEnabledChange'
  | 'onTimerMinutesChange'
  | 'onTimerRemainingChange'
>;

type SelectedAudioEngineGlobalRuntimePropsOptions = {
  runtimeComparison: GlobalRuntimeProps['runtimeComparison'];
  onResetCofDrift: GlobalRuntimeProps['onResetCofDrift'];
  recordingProps: GlobalRecordingProps;
  playbackTimerProps: GlobalPlaybackTimerProps;
};

export function useSelectedAudioEngineGlobalRuntimeProps({
  runtimeComparison,
  onResetCofDrift,
  recordingProps,
  playbackTimerProps,
}: SelectedAudioEngineGlobalRuntimePropsOptions): GlobalRuntimeProps {
  return useMemo(() => ({
    runtimeComparison,
    onResetCofDrift,
    ...recordingProps,
    ...playbackTimerProps,
  }), [
    onResetCofDrift,
    playbackTimerProps,
    recordingProps,
    runtimeComparison,
  ]);
}
