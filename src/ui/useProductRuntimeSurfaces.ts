import { useMemo } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useProductRuntimeCallbackSurfaces } from './useProductRuntimeCallbackSurfaces';
import { useProductRuntimeControlSurfaces } from './useProductRuntimeControlSurfaces';
import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime';

export function useProductRuntimeSurfaces(productRuntimeMode: ProductRuntimeSelectionMode) {
  const callbackSurfaces = useProductRuntimeCallbackSurfaces(productRuntimeMode);
  const controlSurfaces = useProductRuntimeControlSurfaces(productRuntimeMode);
  const debugRuntime = useProductRuntimeDebugRuntime(productRuntimeMode);

  return useMemo(() => ({
    ...callbackSurfaces,
    ...controlSurfaces,
    ...debugRuntime,
  }), [
    callbackSurfaces,
    controlSurfaces,
    debugRuntime,
  ]);
}
