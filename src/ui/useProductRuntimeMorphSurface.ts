import { useSelectedAudioEngineMorphRuntime } from './useSelectedAudioEngineMorphRuntime';

type SelectedRuntimeMorphOptions = Parameters<typeof useSelectedAudioEngineMorphRuntime>[0];
type ProductRuntimeMorphSurfaceOptions = {
  resetProductCofDrift: SelectedRuntimeMorphOptions['resetSelectedCofDrift'];
  setProductJourneyMorphClockCallback: SelectedRuntimeMorphOptions['setSelectedJourneyMorphClockCallback'];
  startProductJourneyMorphClock: SelectedRuntimeMorphOptions['startSelectedJourneyMorphClock'];
  stopProductJourneyMorphClock: SelectedRuntimeMorphOptions['stopSelectedJourneyMorphClock'];
};

export function useProductRuntimeMorphSurface({
  resetProductCofDrift,
  setProductJourneyMorphClockCallback,
  startProductJourneyMorphClock,
  stopProductJourneyMorphClock,
}: ProductRuntimeMorphSurfaceOptions) {
  return useSelectedAudioEngineMorphRuntime({
    resetSelectedCofDrift: resetProductCofDrift,
    setSelectedJourneyMorphClockCallback: setProductJourneyMorphClockCallback,
    startSelectedJourneyMorphClock: startProductJourneyMorphClock,
    stopSelectedJourneyMorphClock: stopProductJourneyMorphClock,
  });
}
