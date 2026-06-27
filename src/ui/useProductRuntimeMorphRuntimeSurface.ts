import { useCallback } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';

type ProductJourneyMorphClockCallback = (now: number) => void;

type ProductRuntimeMorphRuntimeSurface = {
  resetProductCofDrift: () => void;
  setProductJourneyMorphClockCallback: (callback: ProductJourneyMorphClockCallback | null) => void;
  startProductJourneyMorphClock: () => void;
  stopProductJourneyMorphClock: () => void;
};

export function useProductRuntimeMorphRuntimeSurface(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeMorphRuntimeSurface {
  const productRuntimeActive = productRuntimeMode === 'core-product';

  const setProductJourneyMorphClockCallback = useCallback((callback: ProductJourneyMorphClockCallback | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setJourneyMorphClockCallback(callback);
  }, [productRuntimeActive]);

  const startProductJourneyMorphClock = useCallback((): void => {
    if (!productRuntimeActive) return;
    productEngine.startJourneyMorphClock();
  }, [productRuntimeActive]);

  const stopProductJourneyMorphClock = useCallback((): void => {
    if (!productRuntimeActive) return;
    productEngine.stopJourneyMorphClock();
  }, [productRuntimeActive]);

  const resetProductCofDrift = useCallback((): void => {
    if (!productRuntimeActive) return;
    productEngine.resetCofDrift();
  }, [productRuntimeActive]);

  return {
    resetProductCofDrift,
    setProductJourneyMorphClockCallback,
    startProductJourneyMorphClock,
    stopProductJourneyMorphClock,
  };
}
