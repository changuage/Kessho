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
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setProductSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
};

export function useProductRuntimeSequencerCallbacks(
  _productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeSequencerCallbacks {
  const setProductDrumStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    productEngine.setDrumStepPositionCallback(callback);
  }, []);

  const setProductDrumEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    productEngine.setDrumEuclidEvolveTriggerCallback(callback);
  }, []);

  const setProductDrumTriggerCallback = useCallback((callback: ((voice: string, velocity: number) => void) | null): void => {
    productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => {
      callback(String(voice), velocity);
    } : null);
  }, []);

  const setProductSynthStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    productEngine.setSynthStepPositionCallback(callback);
  }, []);

  const setProductSynthOrbitVisualStateCallback = useCallback((callback: ProductSynthOrbitVisualStateCallback | null): void => {
    productEngine.setSynthOrbitVisualStateCallback(callback);
  }, []);

  const setProductSynthAnchorWalkerVisualStateCallback = useCallback((callback: ProductSynthAnchorWalkerVisualStateCallback | null): void => {
    productEngine.setSynthAnchorWalkerVisualStateCallback(callback);
  }, []);

  const setProductSynthEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    productEngine.setSynthEuclidEvolveTriggerCallback(callback);
  }, []);

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
