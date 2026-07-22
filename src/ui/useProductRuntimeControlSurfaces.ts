import type { MutableRefObject } from 'react';
import type { SliderState } from './state';
import type { ProductRuntimeReferenceAdapterSurface } from './productRuntimeConstruction';
import { useProductRuntimeModulationRanges } from './useProductRuntimeModulationRanges';
import { useProductRuntimeMorphRuntimeSurface } from './useProductRuntimeMorphRuntimeSurface';
import { useProductRuntimeSequencerControls } from './useProductRuntimeSequencerControls';

type ProductRuntimeControlSurfacesOptions = {
  productRuntimeCore: boolean;
  productRuntimeReferenceAdapter: ProductRuntimeReferenceAdapterSurface;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeControlSurfaces({
  productRuntimeCore,
  productRuntimeReferenceAdapter,
  stateRef,
}: ProductRuntimeControlSurfacesOptions) {
  const modulationRanges = useProductRuntimeModulationRanges(productRuntimeCore);
  const morphRuntimeSurface = useProductRuntimeMorphRuntimeSurface(productRuntimeCore);
  const sequencerControls = useProductRuntimeSequencerControls({
    productRuntimeCore,
    productRuntimeReferenceAdapter,
    stateRef,
  });

  return {
    ...modulationRanges,
    ...morphRuntimeSurface,
    ...sequencerControls,
  };
}
