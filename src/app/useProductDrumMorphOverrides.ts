import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import {
  dispatchProductControlActionForProductEngine,
  getProductControlStateForProductEngine,
  type ProductControlAction,
  type ProductDrumMorphOverrideState,
} from '../product-control';
import type { SliderState } from '../ui/state';

export function useProductDrumMorphOverrides() {
  const getCurrentDrumMorphOverrideState = useCallback(
    (sourceState: SliderState): ProductDrumMorphOverrideState =>
      getProductControlStateForProductEngine(productEngine, sourceState).drumMorphOverrides,
    [],
  );

  const dispatchDrumMorphProductControlAction = useCallback(
    (sourceState: SliderState, action: ProductControlAction): ProductDrumMorphOverrideState =>
      dispatchProductControlActionForProductEngine(productEngine, sourceState, action).drumMorphOverrides,
    [],
  );

  return {
    getCurrentDrumMorphOverrideState,
    dispatchDrumMorphProductControlAction,
  };
}
