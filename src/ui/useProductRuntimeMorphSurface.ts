import { useSelectedAudioEngineMorphRuntime } from './useSelectedAudioEngineMorphRuntime';

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
  // TODO(product-fallback-retire:runtime-morph-surface): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // CoF drift and journey morph clock ownership still
  // delegates through the selected-runtime compatibility hook until morph runtime is product-owned.
  return useSelectedAudioEngineMorphRuntime({
    resetSelectedCofDrift: resetProductCofDrift,
    setSelectedJourneyMorphClockCallback: setProductJourneyMorphClockCallback,
    startSelectedJourneyMorphClock: startProductJourneyMorphClock,
    stopSelectedJourneyMorphClock: stopProductJourneyMorphClock,
  });
}
