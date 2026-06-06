import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { MutableRefObject } from 'react';
import type { SliderState } from './state';
import { useProductRuntimeModulationRanges } from './useProductRuntimeModulationRanges';
import { useProductRuntimeMorphRuntimeSurface } from './useProductRuntimeMorphRuntimeSurface';
import { useProductRuntimeSequencerControls } from './useProductRuntimeSequencerControls';

type ProductRuntimeControlSurfacesOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeControlSurfaces({
  productRuntimeMode,
  stateRef,
}: ProductRuntimeControlSurfacesOptions) {
  const modulationRanges = useProductRuntimeModulationRanges(productRuntimeMode);
  const morphRuntimeSurface = useProductRuntimeMorphRuntimeSurface(productRuntimeMode);
  const sequencerControls = useProductRuntimeSequencerControls({ productRuntimeMode, stateRef });

  return {
    ...modulationRanges,
    ...morphRuntimeSurface,
    ...sequencerControls,
  };
}
