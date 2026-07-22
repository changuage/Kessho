import { useCallback, useMemo } from 'react';

type DrumPageRuntimeBridgeOptions = {
  preloadProductRuntime: () => Promise<unknown>;
};

type DrumPageRuntimeBridge = {
  preloadAudioEngine: () => Promise<unknown>;
};

export function useDrumPageRuntimeBridge({
  preloadProductRuntime,
}: DrumPageRuntimeBridgeOptions): DrumPageRuntimeBridge {
  const preloadAudioEngine = useCallback((): Promise<unknown> => (
    preloadProductRuntime()
  ), [preloadProductRuntime]);

  return useMemo(() => ({
    preloadAudioEngine,
  }), [preloadAudioEngine]);
}
