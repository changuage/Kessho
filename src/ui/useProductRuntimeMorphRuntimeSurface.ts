import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface';

type SelectedRuntimeMorphSurface = ReturnType<typeof useSelectedAudioEngineMorphRuntimeSurface>;

type ProductRuntimeMorphRuntimeSurface = {
  resetProductCofDrift: SelectedRuntimeMorphSurface['resetSelectedCofDrift'];
  setProductJourneyMorphClockCallback: SelectedRuntimeMorphSurface['setSelectedJourneyMorphClockCallback'];
  startProductJourneyMorphClock: SelectedRuntimeMorphSurface['startSelectedJourneyMorphClock'];
  stopProductJourneyMorphClock: SelectedRuntimeMorphSurface['stopSelectedJourneyMorphClock'];
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
