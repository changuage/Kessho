import { useCallback, useMemo, useState } from 'react';
import { unavailableProductRecordingBridge } from '../audio/product/ProductRecordingBridge';
import {
  STEM_RECORD_DEFAULTS,
  type StemRecordTrackId,
} from '../audio/recordingTracks';

type RecordingFormats = {
  webm: boolean;
  wav: boolean;
};

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function useProductRuntimeRecordingRuntime() {
  const [recordFormats, setRecordFormats] = useState<RecordingFormats>({ webm: true, wav: false });
  const [recordStems, setRecordStems] = useState<Record<StemRecordTrackId, boolean>>(STEM_RECORD_DEFAULTS);
  const recordingDuration = 0;
  const recordingAvailable = unavailableProductRecordingBridge.available;
  const isRecording = false;
  const isRecordingArmed = false;

  const handleRecordStemsToggle = useCallback((key: string): void => {
    setRecordStems(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  }, []);

  const startArmedRecordingAfterPlaybackStart = useCallback((): void => {
    // Recording is explicitly unavailable until Product Core exposes a real bridge.
  }, []);

  const startUnsupportedRecording = useCallback(async (): Promise<void> => {
    await unavailableProductRecordingBridge.startMixRecording();
  }, []);

  const stopUnsupportedRecording = useCallback(async (): Promise<void> => {
    await unavailableProductRecordingBridge.stopMixRecording();
  }, []);

  const handleAdvancedRecordingButtonPress = useCallback((_playbackIsRunning: boolean): void => {
    void startUnsupportedRecording();
  }, [startUnsupportedRecording]);

  const getAdvancedRecordingButtonTitle = useCallback((_playbackIsRunning: boolean): string => {
    return 'Recording unavailable in Product Core';
  }, []);

  const advancedRecordingButton = useMemo(() => ({
    getTitle: getAdvancedRecordingButtonTitle,
    handlePress: handleAdvancedRecordingButtonPress,
    isRecording,
    isRecordingArmed,
    recordingDurationLabel: formatRecordingTime(recordingDuration),
    visible: recordingAvailable,
  }), [
    getAdvancedRecordingButtonTitle,
    handleAdvancedRecordingButtonPress,
    isRecording,
    isRecordingArmed,
    recordingAvailable,
    recordingDuration,
  ]);

  const snowflakeRecordingProps = useMemo(() => ({
    isRecording,
    recordingDuration,
    onStopRecording: stopUnsupportedRecording,
  }), [
    isRecording,
    recordingDuration,
    stopUnsupportedRecording,
  ]);

  const globalRecordingProps = useMemo(() => ({
    isRecording,
    recordFormats,
    recordStems,
    recordingAvailable,
    recordingDuration,
    stemRecordingAvailable: recordingAvailable,
    formatRecordingTime,
    onRecordFormatsChange: setRecordFormats,
    onRecordStemsChange: handleRecordStemsToggle,
  }), [
    handleRecordStemsToggle,
    isRecording,
    recordFormats,
    recordStems,
    recordingAvailable,
    recordingDuration,
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
