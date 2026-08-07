import { useCallback, useMemo, useRef, useState } from 'react';
import type { ProductEngineState } from '../../audio/product/ProductEngineTypes';
import { createCoreProductHarmonyLiveChordGestureEvents } from '../../audio/coreProductEvents';
import { productEngine } from '../../audio/product/ProductEngineProxy';
import {
  resolveHarmonyLiveLayerChange,
  resolveHarmonyProjection,
  type HarmonyLiveLayer,
  type HarmonyLiveLayerChangeHandler,
  type HarmonyProjection,
} from '../../audio/harmony/harmonyProjection';
import type { SliderState } from '../state';

export function useHarmonyLiveProjection(state: SliderState, engineState: ProductEngineState): {
  harmonyProjection: HarmonyProjection;
  handleHarmonyLiveLayerChange: HarmonyLiveLayerChangeHandler;
} {
  const [harmonyLiveLayer, setHarmonyLiveLayer] = useState<HarmonyLiveLayer | null>(null);
  const harmonyLiveLayerRef = useRef<HarmonyLiveLayer | null>(null);
  const harmonyLiveEventRevisionRef = useRef(0);
  const handleHarmonyLiveLayerChange = useCallback<HarmonyLiveLayerChangeHandler>((layer, options) => {
    const next = resolveHarmonyLiveLayerChange(harmonyLiveLayerRef.current, layer, options);
    if (next === harmonyLiveLayerRef.current) return;
    harmonyLiveLayerRef.current = next;
    setHarmonyLiveLayer(next);
    harmonyLiveEventRevisionRef.current += 1;
    productEngine.enqueueEvents(
      createCoreProductHarmonyLiveChordGestureEvents(next, harmonyLiveEventRevisionRef.current),
    );
  }, []);
  const harmonyProjection = useMemo(() => resolveHarmonyProjection(state, {
    harmonyState: engineState.harmonyState,
    liveLayer: harmonyLiveLayer,
    barIndex: engineState.harmonyPosition?.absoluteBarIndex ?? undefined,
    phraseIndex: engineState.harmonyPosition?.phraseIndex ?? undefined,
  }), [engineState.harmonyPosition, engineState.harmonyState, harmonyLiveLayer, state]);
  return { harmonyProjection, handleHarmonyLiveLayerChange };
}
