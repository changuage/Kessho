import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface';

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
  const morphRuntimeSurface = useSelectedAudioEngineMorphRuntimeSurface(productRuntimeMode);

  return {
    resetProductCofDrift: morphRuntimeSurface.resetSelectedCofDrift,
    setProductJourneyMorphClockCallback: morphRuntimeSurface.setSelectedJourneyMorphClockCallback,
    startProductJourneyMorphClock: morphRuntimeSurface.startSelectedJourneyMorphClock,
    stopProductJourneyMorphClock: morphRuntimeSurface.stopSelectedJourneyMorphClock,
  };
}
