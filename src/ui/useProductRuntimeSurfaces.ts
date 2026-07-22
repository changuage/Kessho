import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { SliderState } from './state';
import type { ProductRuntimeReferenceAdapterSurface, ProductRuntimeStateSurface, ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';
import type { ReferenceRuntimeCallbackSurfaces } from './referenceRuntime/useReferenceRuntimeCallbackSurfaces';
import { useProductRuntimeControlSurfaces } from './useProductRuntimeControlSurfaces';
import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime';
import { useProductRuntimeAutoCycleSurface } from './useProductRuntimeAutoCycleSurface';

type ProductRuntimeSurfacesOptions = {
  productRuntimeCore: boolean;
  productRuntimeCallbackSurfaces: RuntimeCallbackSurfaces;
  productRuntimeReferenceAdapter: ProductRuntimeReferenceAdapterSurface;
  productRuntimeState: ProductRuntimeStateSurface;
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
  stateRef: MutableRefObject<SliderState>;
};

type RuntimeCallbackSurfaces = ReferenceRuntimeCallbackSurfaces;

export function useProductRuntimeSurfaces({
  productRuntimeCore,
  productRuntimeCallbackSurfaces,
  productRuntimeReferenceAdapter,
  productRuntimeState,
  productRuntimeTelemetry,
  stateRef,
}: ProductRuntimeSurfacesOptions) {
  const controlSurfaces = useProductRuntimeControlSurfaces({
    productRuntimeCore,
    productRuntimeReferenceAdapter,
    stateRef,
  });
  const debugRuntime = useProductRuntimeDebugRuntime({
    productRuntimeState,
    productRuntimeTelemetry,
  });
  const productAutoCycleRuntime = useProductRuntimeAutoCycleSurface();

  return useMemo(() => ({
    ...productRuntimeCallbackSurfaces,
    ...controlSurfaces,
    ...debugRuntime,
    productAutoCycleRuntime,
  }), [
    productRuntimeCallbackSurfaces,
    controlSurfaces,
    debugRuntime,
    productAutoCycleRuntime,
  ]);
}
