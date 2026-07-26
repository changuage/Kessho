import { useMemo, type MutableRefObject } from 'react';
import { useProductRuntimePageBridgesCore, type ProductRuntimePageBridgeOptions } from './useProductRuntimePageBridgesCore';
import { useProductRuntimeSynthPageEvents } from './useProductRuntimeSynthPageEvents';
import type { ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';
import type { SliderState } from './state';

export type ProductRuntimePageRuntimeBridgeOptions = ProductRuntimePageBridgeOptions & {
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimePageRuntimeBridges({
  productRuntimeTelemetry,
  stateRef,
  ...options
}: ProductRuntimePageRuntimeBridgeOptions) {
  const productSynthPageEvents = useProductRuntimeSynthPageEvents(
    productRuntimeTelemetry,
    stateRef,
  );
  const productPageRuntimeBridges = useProductRuntimePageBridgesCore(options);

  return useMemo(() => ({
    ...productPageRuntimeBridges,
    synthPageRuntimeProps: {
      ...productPageRuntimeBridges.synthPageRuntimeProps,
      ...productSynthPageEvents,
    },
  }), [productPageRuntimeBridges, productSynthPageEvents]);
}
