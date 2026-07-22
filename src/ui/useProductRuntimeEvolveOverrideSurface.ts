import { useCallback, useMemo } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';

type ProductRuntimeEvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type ProductRuntimeSynthNoteRangeCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

type ProductRuntimeEvolveOverrideSurface = {
  setProductDrumEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthNoteRangeEvolvedCallback: (callback: ProductRuntimeSynthNoteRangeCallback | null) => void;
};

export function useProductRuntimeEvolveOverrideSurface(
): ProductRuntimeEvolveOverrideSurface {
  const setProductDrumEvolveOverridesChangedCallback = useCallback((callback: ProductRuntimeEvolveOverrideCallback | null) => {
    productEngine.setDrumEvolveOverridesChangedCallback(callback);
  }, []);
  const setProductSynthEvolveOverridesChangedCallback = useCallback((callback: ProductRuntimeEvolveOverrideCallback | null) => {
    productEngine.setSynthEvolveOverridesChangedCallback(callback);
  }, []);
  const setProductSynthNoteRangeEvolvedCallback = useCallback((callback: ProductRuntimeSynthNoteRangeCallback | null) => {
    productEngine.setSynthNoteRangeEvolvedCallback(callback);
  }, []);

  return useMemo(() => ({
    setProductDrumEvolveOverridesChangedCallback,
    setProductSynthEvolveOverridesChangedCallback,
    setProductSynthNoteRangeEvolvedCallback,
  }), [
    setProductDrumEvolveOverridesChangedCallback,
    setProductSynthEvolveOverridesChangedCallback,
    setProductSynthNoteRangeEvolvedCallback,
  ]);
}
