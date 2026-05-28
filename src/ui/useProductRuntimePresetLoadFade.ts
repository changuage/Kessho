import { useSelectedAudioEnginePresetLoadFade } from './useSelectedAudioEnginePresetLoadFade';

type ProductRuntimePresetLoadFadeOptions = Parameters<typeof useSelectedAudioEnginePresetLoadFade>[0];

export function useProductRuntimePresetLoadFade(options: ProductRuntimePresetLoadFadeOptions) {
  return useSelectedAudioEnginePresetLoadFade(options);
}
