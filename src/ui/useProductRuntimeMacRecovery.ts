import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery';

type ProductRuntimeMacRecoveryOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeMacRecovery({
  productRuntimeMode,
  ...options
}: ProductRuntimeMacRecoveryOptions): void {
  // TODO(product-runtime-compat-10C): Mac recovery still delegates to the selected-runtime
  // recovery implementation while the product lifecycle surface owns product naming.
  useSelectedAudioEngineMacRecovery({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
