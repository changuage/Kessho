import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useProductRuntimeModulationRanges } from './useProductRuntimeModulationRanges';
import { useProductRuntimeMorphRuntimeSurface } from './useProductRuntimeMorphRuntimeSurface';
import { useProductRuntimeSequencerControls } from './useProductRuntimeSequencerControls';

export function useProductRuntimeControlSurfaces(productRuntimeMode: ProductRuntimeSelectionMode) {
  const modulationRanges = useProductRuntimeModulationRanges(productRuntimeMode);
  const morphRuntimeSurface = useProductRuntimeMorphRuntimeSurface(productRuntimeMode);
  const sequencerControls = useProductRuntimeSequencerControls(productRuntimeMode);

  return {
    ...modulationRanges,
    ...morphRuntimeSurface,
    ...sequencerControls,
  };
}
