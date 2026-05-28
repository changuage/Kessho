import { useCallback, useMemo } from 'react';

type DrumPageRuntimeBridgeOptions = {
  preloadSelectedAudioEngine: () => Promise<unknown>;
};

type DrumPageRuntimeBridge = {
  preloadAudioEngine: () => Promise<unknown>;
};

export function useDrumPageRuntimeBridge({
  preloadSelectedAudioEngine,
}: DrumPageRuntimeBridgeOptions): DrumPageRuntimeBridge {
  const preloadAudioEngine = useCallback((): Promise<unknown> => (
    preloadSelectedAudioEngine()
  ), [preloadSelectedAudioEngine]);

  return useMemo(() => ({
    preloadAudioEngine,
  }), [preloadAudioEngine]);
}
