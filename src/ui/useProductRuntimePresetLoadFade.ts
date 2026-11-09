import { useCallback } from 'react';

const PRESET_LOAD_FADE_MS = 2000;
const PRESET_LOAD_RESTORE_FADE_MS = 10;
const PRESET_LOAD_STOP_SETTLE_MS = 50;

export type ProductRuntimePresetLoadFadeOptions = {
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  fadeProductRuntimeOutput: (target: number, durationMs: number) => Promise<void>;
  stopProductPlayback: () => void;
  stopAudioForJourneyPresetLoad?: () => void;
};

export function useProductRuntimePresetLoadFade({
  playbackIsRunning,
  isJourneyPlaying,
  fadeProductRuntimeOutput,
  stopProductPlayback,
  stopAudioForJourneyPresetLoad,
}: ProductRuntimePresetLoadFadeOptions) {
  return useCallback(async (preserveJourney = false, isCurrent?: () => boolean) => {
    if (isCurrent && !isCurrent()) return;
    if (!(playbackIsRunning || isJourneyPlaying)) return;
    await fadeProductRuntimeOutput(0, PRESET_LOAD_FADE_MS);
    if (isCurrent && !isCurrent()) return;
    (preserveJourney && stopAudioForJourneyPresetLoad ? stopAudioForJourneyPresetLoad : stopProductPlayback)();
    await new Promise((resolve) => window.setTimeout(resolve, PRESET_LOAD_STOP_SETTLE_MS));
    if (isCurrent && !isCurrent()) return;
    void fadeProductRuntimeOutput(1, PRESET_LOAD_RESTORE_FADE_MS);
  }, [stopAudioForJourneyPresetLoad, fadeProductRuntimeOutput, isJourneyPlaying, playbackIsRunning, stopProductPlayback]);
}
