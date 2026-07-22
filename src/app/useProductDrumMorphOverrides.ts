import { useCallback, useEffect, useRef } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  createInitialProductControlState,
  dispatchProductControlActionForProductEngine,
  getProductControlStateForProductEngine,
  reduceProductControlState,
  type ProductControlAction,
  type ProductControlState,
  type ProductDrumMorphOverrideState,
} from '../product-control';
import type { SliderState } from '../ui/state';

export function useProductDrumMorphOverrides(productRuntimeCore: boolean) {
  const productRuntimeActive = productRuntimeCore;
  const fallbackControlStateRef = useRef<ProductControlState | null>(null);

  useEffect(() => {
    if (productRuntimeActive) {
      fallbackControlStateRef.current = null;
    }
  }, [productRuntimeActive]);

  const getFallbackControlState = useCallback((sourceState: SliderState): ProductControlState => {
    const current = fallbackControlStateRef.current;
    if (current) return current;
    const initial = createInitialProductControlState(sourceState);
    fallbackControlStateRef.current = initial;
    return initial;
  }, []);

  const getCurrentDrumMorphOverrideState = useCallback(
    (sourceState: SliderState): ProductDrumMorphOverrideState => {
      if (!productRuntimeActive) {
        return getFallbackControlState(sourceState).drumMorphOverrides;
      }
      return getProductControlStateForProductEngine(productEngine, sourceState).drumMorphOverrides;
    },
    [getFallbackControlState, productRuntimeActive],
  );

  const dispatchDrumMorphProductControlAction = useCallback(
    (sourceState: SliderState, action: ProductControlAction): ProductDrumMorphOverrideState => {
      if (!productRuntimeActive) {
        const previous = getFallbackControlState(sourceState);
        const next = reduceProductControlState(previous, action);
        fallbackControlStateRef.current = next;
        return next.drumMorphOverrides;
      }
      return dispatchProductControlActionForProductEngine(productEngine, sourceState, action).drumMorphOverrides;
    },
    [getFallbackControlState, productRuntimeActive],
  );

  return {
    getCurrentDrumMorphOverrideState,
    dispatchDrumMorphProductControlAction,
  };
}
