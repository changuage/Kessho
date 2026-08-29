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
  const startJourneyMorphClock = useCallback((callback: ProductJourneyMorphClockCallback): void => {
    setProductJourneyMorphClockCallback(callback);
    startProductJourneyMorphClock();
  }, [setProductJourneyMorphClockCallback, startProductJourneyMorphClock]);

  const stopJourneyMorphClock = useCallback((): void => {
    stopProductJourneyMorphClock();
    setProductJourneyMorphClockCallback(null);
  }, [setProductJourneyMorphClockCallback, stopProductJourneyMorphClock]);

  return {
    resetProductCofDrift: useCallback(resetProductCofDrift, [resetProductCofDrift]),
    setProductJourneyMorphClockCallback: useCallback(setProductJourneyMorphClockCallback, [setProductJourneyMorphClockCallback]),
    startProductJourneyMorphClock: startJourneyMorphClock,
    stopProductJourneyMorphClock: stopJourneyMorphClock,
  };
}
