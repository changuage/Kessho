import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface';

type ProductRuntimeEvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type ProductRuntimeSynthNoteRangeCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

type ProductRuntimeEvolveOverrideSurface = {
  setProductDrumEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthEvolveOverridesChangedCallback: (callback: ProductRuntimeEvolveOverrideCallback | null) => void;
  setProductSynthNoteRangeEvolvedCallback: (callback: ProductRuntimeSynthNoteRangeCallback | null) => void;
};

export function useProductRuntimeEvolveOverrideSurface(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeEvolveOverrideSurface {
  // TODO(product-runtime-compat-10E): selected evolve override callbacks remain the temporary
  // implementation while product surfaces expose product runtime names.
  const evolveOverrideSurface = useSelectedAudioEngineEvolveOverrideSurface(productRuntimeMode);

  return {
    setProductDrumEvolveOverridesChangedCallback: evolveOverrideSurface.setSelectedDrumEvolveOverridesChangedCallback,
    setProductSynthEvolveOverridesChangedCallback: evolveOverrideSurface.setSelectedSynthEvolveOverridesChangedCallback,
    setProductSynthNoteRangeEvolvedCallback: evolveOverrideSurface.setSelectedSynthNoteRangeEvolvedCallback,
  };
}
