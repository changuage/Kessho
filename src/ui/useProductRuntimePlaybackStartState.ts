import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { useSelectedAudioEnginePlaybackStartState } from './useSelectedAudioEnginePlaybackStartState';
import type { SavedPreset, SliderMode, SliderState } from './state';

type AutoStartPresetSource = 'cloud' | 'device-local' | 'bundled';

type PlaybackStartPreset = SavedPreset;

export type ProductRuntimePlaybackStartStateOptions = {
  snowflakeActivated: boolean;
  setSnowflakeActivated: Dispatch<SetStateAction<boolean>>;
  stateRef: MutableRefObject<SliderState>;
  hasLoadedPresetRef: MutableRefObject<boolean>;
  hasUserInteractedRef: MutableRefObject<boolean>;
  resolveDefaultAutoStartPreset: () => Promise<{
    preset: PlaybackStartPreset | null;
    source: AutoStartPresetSource | null;
  }>;
  normalizePresetForWeb: (state: SliderState) => SliderState;
  setState: Dispatch<SetStateAction<SliderState>>;
  setStatePresetName: Dispatch<SetStateAction<string>>;
  setMorphPresetA: (preset: PlaybackStartPreset) => void;
  applyDualRangesFromPreset: (
    dualRanges?: Record<string, { min: number; max: number }>,
    presetSliderModes?: Record<string, SliderMode>,
  ) => void;
  restoreEvolveConfigs: (preset: PlaybackStartPreset) => void;
};

export function useProductRuntimePlaybackStartState(options: ProductRuntimePlaybackStartStateOptions) {
  // TODO(product-runtime-compat-10C): default preset start-state preparation still delegates
  // to the selected-runtime compatibility hook until preset playback ownership is product-only.
  return useSelectedAudioEnginePlaybackStartState(options);
}
