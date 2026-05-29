import type { Dispatch, SetStateAction } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import { useSelectedAudioEngineStateRuntime } from './useSelectedAudioEngineStateRuntime';

type ProductRuntimeStateRuntimeOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  enabled: boolean;
  getProductTransportDebugState: () => ProductEngineState['transportDebug'];
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
};

export function useProductRuntimeStateRuntime({
  productRuntimeMode,
  getProductTransportDebugState,
  ...options
}: ProductRuntimeStateRuntimeOptions): void {
  // TODO(product-runtime-compat-10A): selected transport debug polling remains behind this
  // product runtime facade until the state runtime hook is product-named.
  useSelectedAudioEngineStateRuntime({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
    getSelectedTransportDebugState: getProductTransportDebugState,
  });
}
