import { useMemo } from 'react';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineCallbackSurfaces } from './useSelectedAudioEngineCallbackSurfaces';
import { useSelectedAudioEngineControlSurfaces } from './useSelectedAudioEngineControlSurfaces';
import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime';

export function useSelectedAudioEngineRuntimeSurfaces(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const callbackSurfaces = useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode);
  const controlSurfaces = useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode);
  const debugRuntime = useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode);

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
