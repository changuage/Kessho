import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';

type ProductJourneyMorphClockCallback = (now: number) => void;

type ProductRuntimeMorphRuntimeSurface = {
  resetProductCofDrift: () => void;
  setProductJourneyMorphClockCallback: (callback: ProductJourneyMorphClockCallback | null) => void;
  startProductJourneyMorphClock: () => void;
  stopProductJourneyMorphClock: () => void;
};

export function useProductRuntimeMorphRuntimeSurface(
  productRuntimeCore: boolean,
): ProductRuntimeMorphRuntimeSurface {
  const productRuntimeActive = productRuntimeCore;

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
