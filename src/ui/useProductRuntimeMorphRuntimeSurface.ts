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
  _productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeMorphRuntimeSurface {
  const setProductJourneyMorphClockCallback = useCallback((callback: ProductJourneyMorphClockCallback | null): void => {
    productEngine.setJourneyMorphClockCallback(callback);
  }, []);

  const startProductJourneyMorphClock = useCallback((): void => {
    productEngine.startJourneyMorphClock();
  }, []);

  const stopProductJourneyMorphClock = useCallback((): void => {
    productEngine.stopJourneyMorphClock();
  }, []);

  const resetProductCofDrift = useCallback((): void => {
    productEngine.resetCofDrift();
  }, []);

  return {
    resetProductCofDrift,
    setProductJourneyMorphClockCallback,
    startProductJourneyMorphClock,
    stopProductJourneyMorphClock,
  };
}
