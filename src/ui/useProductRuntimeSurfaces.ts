import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useProductRuntimeCallbackSurfaces } from './useProductRuntimeCallbackSurfaces';
import { useProductRuntimeControlSurfaces } from './useProductRuntimeControlSurfaces';
import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime';
import { useProductRuntimeAutoCycleSurface } from './useProductRuntimeAutoCycleSurface';

type ProductRuntimeSurfacesOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeSurfaces({
  productRuntimeMode,
  stateRef,
}: ProductRuntimeSurfacesOptions) {
  const callbackSurfaces = useProductRuntimeCallbackSurfaces(productRuntimeMode);
  const controlSurfaces = useProductRuntimeControlSurfaces({ productRuntimeMode, stateRef });
  const debugRuntime = useProductRuntimeDebugRuntime(productRuntimeMode);
  const productAutoCycleRuntime = useProductRuntimeAutoCycleSurface();

  return useMemo(() => ({
    ...callbackSurfaces,
    ...controlSurfaces,
    ...debugRuntime,
    productAutoCycleRuntime,
  }), [
    callbackSurfaces,
    controlSurfaces,
    debugRuntime,
    productAutoCycleRuntime,
  ]);
}
