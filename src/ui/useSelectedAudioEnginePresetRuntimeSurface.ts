import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useAudioEngineParamSync } from './useAudioEngineParamSync';
import { usePresetEngineSync } from './usePresetEngineSync';
import type { SliderState } from './state';

type UseSelectedAudioEnginePresetRuntimeSurfaceOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  resetSelectedCofDrift: () => void;
  updateSelectedReferenceParams: (
    nextState: SliderState,
    metadata: { presetId: string; presetName: string },
  ) => void;
};

export function useSelectedAudioEnginePresetRuntimeSurface({
  audioEngineRuntimeMode,
  resetSelectedCofDrift,
  updateSelectedReferenceParams,
}: UseSelectedAudioEnginePresetRuntimeSurfaceOptions) {
  const scheduleAudioEngineParamUpdate = useAudioEngineParamSync(audioEngineRuntimeMode);
  const presetEngineSync = usePresetEngineSync({
    audioEngineRuntimeMode,
    scheduleAudioEngineParamUpdate,
    resetSelectedCofDrift,
    updateSelectedReferenceParams,
  });

  return {
    scheduleAudioEngineParamUpdate,
    ...presetEngineSync,
  };
}
