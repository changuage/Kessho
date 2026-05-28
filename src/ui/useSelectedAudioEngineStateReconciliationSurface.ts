import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';

type SelectedAudioEngineStateReconciliationSurface = {
  setSelectedEngineStateChangeCallback: (callback: ((state: ProductEngineState) => void) | null) => void;
};

export function useSelectedAudioEngineStateReconciliationSurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineStateReconciliationSurface {
  const setSelectedEngineStateChangeCallback = useCallback((callback: ((state: ProductEngineState) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setStateChangeCallback(callback);
      return;
    }
    selectedProductRuntime.setStateChangeCallback(callback ?? (null as unknown as (state: ProductEngineState) => void));
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedEngineStateChangeCallback,
  };
}
