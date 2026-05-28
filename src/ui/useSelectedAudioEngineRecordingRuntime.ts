import { useCallback, useMemo } from 'react';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useAudioRecording } from './useAudioRecording';

export function useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const recording = useAudioRecording(audioEngineRuntimeMode);

  const startArmedRecordingAfterPlaybackStart = useCallback((): void => {
    if (!recording.isRecordingArmed) return;
    recording.setIsRecordingArmed(false);
    window.setTimeout(() => {
      void recording.handleStartRecording();
    }, 50);
  }, [
    recording.handleStartRecording,
    recording.isRecordingArmed,
    recording.setIsRecordingArmed,
  ]);

  const handleAdvancedRecordingButtonPress = useCallback((playbackIsRunning: boolean): void => {
    if (recording.isRecording) {
      void recording.handleStopRecording();
      return;
    }
    if (playbackIsRunning) {
      void recording.handleStartRecording();
      return;
    }
    recording.handleArmRecording();
  }, [
    recording.handleArmRecording,
    recording.handleStartRecording,
    recording.handleStopRecording,
    recording.isRecording,
  ]);

  const getAdvancedRecordingButtonTitle = useCallback((playbackIsRunning: boolean): string => {
    if (recording.isRecording) {
      return `Recording ${recording.formatRecordingTime(recording.recordingDuration)} - Click to stop`;
    }
    if (recording.isRecordingArmed) return 'Recording armed - will start with playback (click to disarm)';
    return playbackIsRunning ? 'Start Recording' : 'Arm Recording (will start with playback)';
  }, [
    recording.formatRecordingTime,
    recording.isRecording,
    recording.isRecordingArmed,
    recording.recordingDuration,
  ]);

  const advancedRecordingButton = useMemo(() => ({
    getTitle: getAdvancedRecordingButtonTitle,
    handlePress: handleAdvancedRecordingButtonPress,
    isRecording: recording.isRecording,
    isRecordingArmed: recording.isRecordingArmed,
    recordingDurationLabel: recording.formatRecordingTime(recording.recordingDuration),
    visible: recording.recordingAvailable,
  }), [
    getAdvancedRecordingButtonTitle,
    handleAdvancedRecordingButtonPress,
    recording.formatRecordingTime,
    recording.isRecording,
    recording.isRecordingArmed,
    recording.recordingAvailable,
    recording.recordingDuration,
  ]);

  const snowflakeRecordingProps = useMemo(() => ({
    isRecording: recording.isRecording,
    recordingDuration: recording.recordingDuration,
    onStopRecording: recording.handleStopRecording,
  }), [
    recording.handleStopRecording,
    recording.isRecording,
    recording.recordingDuration,
  ]);

  const globalRecordingProps = useMemo(() => ({
    isRecording: recording.isRecording,
    recordFormats: recording.recordFormats,
    recordStems: recording.recordStems,
    recordingAvailable: recording.recordingAvailable,
    recordingDuration: recording.recordingDuration,
    stemRecordingAvailable: recording.stemRecordingAvailable,
    formatRecordingTime: recording.formatRecordingTime,
    onRecordFormatsChange: recording.setRecordFormats,
    onRecordStemsChange: recording.handleRecordStemsToggle,
  }), [
    recording.formatRecordingTime,
    recording.handleRecordStemsToggle,
    recording.isRecording,
    recording.recordFormats,
    recording.recordStems,
    recording.recordingAvailable,
    recording.recordingDuration,
    recording.setRecordFormats,
    recording.stemRecordingAvailable,
  ]);

  return useMemo(() => ({
    advancedRecordingButton,
    globalRecordingProps,
    snowflakeRecordingProps,
    startArmedRecordingAfterPlaybackStart,
  }), [
    advancedRecordingButton,
    globalRecordingProps,
    snowflakeRecordingProps,
    startArmedRecordingAfterPlaybackStart,
  ]);
}
