import { useCallback } from 'react';

const PRESET_LOAD_FADE_MS = 2000;
const PRESET_LOAD_RESTORE_FADE_MS = 10;
const PRESET_LOAD_STOP_SETTLE_MS = 50;

export type ProductRuntimePresetLoadFadeOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
  stopProductPlayback: () => void;
};

export function useProductRuntimePresetLoadFade({
  playbackIsRunning,
  isJourneyPlaying,
  fadeProductRuntimeOutput,
  stopProductPlayback,
}: ProductRuntimePresetLoadFadeOptions) {
  return useCallback(async () => {
    if (!(playbackIsRunning || isJourneyPlaying)) return;
    await fadeProductRuntimeOutput(0, PRESET_LOAD_FADE_MS);
    stopProductPlayback();
    await new Promise((resolve) => window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS));
    void fadeProductRuntimeOutput(1, PRESET_LOAD_RESTORE_FADE_MS);
  }, [fadeProductRuntimeOutput, isJourneyPlaying, playbackIsRunning, stopProductPlayback]);
}
