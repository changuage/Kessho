import { useMemo } from 'react';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useProductRuntimeCallbackSurfaces } from './useProductRuntimeCallbackSurfaces';
import { useProductRuntimeControlSurfaces } from './useProductRuntimeControlSurfaces';
import { useProductRuntimeDebugRuntime } from './useProductRuntimeDebugRuntime';

export function useProductRuntimeSurfaces(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const callbackSurfaces = useProductRuntimeCallbackSurfaces(audioEngineRuntimeMode);
  const controlSurfaces = useProductRuntimeControlSurfaces(audioEngineRuntimeMode);
  const debugRuntime = useProductRuntimeDebugRuntime(audioEngineRuntimeMode);

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
