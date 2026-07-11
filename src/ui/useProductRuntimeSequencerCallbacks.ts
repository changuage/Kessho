import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';

type ProductRuntimeSequencerCallbacks = {
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
  setProductSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setProductSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
};

export function useProductRuntimeSequencerCallbacks(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeSequencerCallbacks {
  const productRuntimeActive = productRuntimeMode === 'core-product';

  const setProductDrumStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setDrumStepPositionCallback(callback);
  }, [productRuntimeActive]);

  const setProductDrumEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setDrumEuclidEvolveTriggerCallback(callback);
  }, [productRuntimeActive]);

  const setProductDrumTriggerCallback = useCallback((callback: ((voice: string, velocity: number) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => {
      callback(String(voice), velocity);
    } : null);
  }, [productRuntimeActive]);

  const setProductSynthStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setSynthStepPositionCallback(callback);
  }, [productRuntimeActive]);

  const setProductSynthOrbitVisualStateCallback = useCallback((callback: ProductSynthOrbitVisualStateCallback | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setSynthOrbitVisualStateCallback(callback);
  }, [productRuntimeActive]);

  const setProductSynthAnchorWalkerVisualStateCallback = useCallback((callback: ProductSynthAnchorWalkerVisualStateCallback | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setSynthAnchorWalkerVisualStateCallback(callback);
  }, [productRuntimeActive]);

  const setProductSynthEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (!productRuntimeActive) return;
    productEngine.setSynthEuclidEvolveTriggerCallback(callback);
  }, [productRuntimeActive]);

  return {
    setProductDrumStepPositionCallback,
    setProductDrumEvolveTriggerCallback,
    setProductDrumTriggerCallback,
    setProductSynthStepPositionCallback,
    setProductSynthOrbitVisualStateCallback,
    setProductSynthAnchorWalkerVisualStateCallback,
    setProductSynthEvolveTriggerCallback,
  };
}
