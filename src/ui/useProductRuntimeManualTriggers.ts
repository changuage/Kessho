import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineManualTriggers } from './useSelectedAudioEngineManualTriggers';
import type { SliderState } from './state';

type ProductRuntimeManualTriggersOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: unknown) => void;
  triggerDrumVoice: (voice: unknown) => void;
};

export function useProductRuntimeManualTriggers(
  { productRuntimeMode, ...options }: ProductRuntimeManualTriggersOptions,
): ProductRuntimeManualTriggers {
  return useSelectedAudioEngineManualTriggers({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
