import { useCallback } from 'react';

const PRESET_LOAD_FADE_MS = 2000;
const PRESET_LOAD_RESTORE_FADE_MS = 10;
const PRESET_LOAD_STOP_SETTLE_MS = 50;

type SelectedAudioEnginePresetLoadFadeOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  fadeSelectedAudioEngineOutput: (target: number, durationMs: number) => Promise<void>;
  stopPlayback: () => void;
};

export function useSelectedAudioEnginePresetLoadFade({
  playbackIsRunning,
  isJourneyPlaying,
  fadeSelectedAudioEngineOutput,
  stopPlayback,
}: SelectedAudioEnginePresetLoadFadeOptions): () => Promise<void> {
  return useCallback(async () => {
    if (!(playbackIsRunning || isJourneyPlaying)) return;
    await fadeSelectedAudioEngineOutput(0, PRESET_LOAD_FADE_MS);
    stopPlayback();
    await new Promise((resolve) => window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS));
    void fadeSelectedAudioEngineOutput(1, PRESET_LOAD_RESTORE_FADE_MS);
  }, [
    fadeSelectedAudioEngineOutput,
    isJourneyPlaying,
    playbackIsRunning,
    stopPlayback,
  ]);
}
