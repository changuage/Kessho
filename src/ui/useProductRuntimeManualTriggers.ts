import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineManualTriggers } from './useSelectedAudioEngineManualTriggers';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';

type ProductRuntimeManualTriggersOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice) => void;
};

export function useProductRuntimeManualTriggers(
  { productRuntimeMode, ...options }: ProductRuntimeManualTriggersOptions,
): ProductRuntimeManualTriggers {
  return useSelectedAudioEngineManualTriggers({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
