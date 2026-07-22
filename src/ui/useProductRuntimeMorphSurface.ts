import { useCallback } from 'react';

type ProductJourneyMorphClockCallback = (now: number) => void;

export type ProductRuntimeMorphSurfaceOptions = {
  resetProductCofDrift: () => void;
  setProductJourneyMorphClockCallback: (callback: ProductJourneyMorphClockCallback | null) => void;
  startProductJourneyMorphClock: () => void;
  stopProductJourneyMorphClock: () => void;
};

export function useProductRuntimeMorphSurface({
  resetProductCofDrift,
  setProductJourneyMorphClockCallback,
  startProductJourneyMorphClock,
  stopProductJourneyMorphClock,
}: ProductRuntimeMorphSurfaceOptions) {
  return {
    resetProductCofDrift: useCallback(resetProductCofDrift, [resetProductCofDrift]),
    setProductJourneyMorphClockCallback: useCallback(setProductJourneyMorphClockCallback, [setProductJourneyMorphClockCallback]),
    startProductJourneyMorphClock: useCallback(startProductJourneyMorphClock, [startProductJourneyMorphClock]),
    stopProductJourneyMorphClock: useCallback(stopProductJourneyMorphClock, [stopProductJourneyMorphClock]),
  };
}
