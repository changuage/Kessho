import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';

export function useRuntimeSequencerProjectionCallbacks(runtimeMode: ProductRuntimeSelectionMode) {
  const setDrumStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setDrumStepPositionCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumStepPositionCallback(callback ?? (() => {}));
  }, [runtimeMode]);

  const setDrumEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setDrumEuclidEvolveTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumEuclidEvolveTriggerCallback(callback ?? (() => {}));
  }, [runtimeMode]);

  const setDrumTriggerCallback = useCallback((callback: ((voice: string, velocity: number) => void) | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => callback(String(voice), velocity) : null);
      return;
    }
    selectedProductRuntime.setDrumTriggerCallback(callback ?? (() => {}));
  }, [runtimeMode]);

  const setSynthStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setSynthStepPositionCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthStepPositionCallback(callback ?? (() => {}));
  }, [runtimeMode]);

  const setSynthOrbitVisualStateCallback = useCallback((callback: ProductSynthOrbitVisualStateCallback | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setSynthOrbitVisualStateCallback(callback);
      return;
    }
    callback?.([null, null, null, null]);
  }, [runtimeMode]);

  const setSynthAnchorWalkerVisualStateCallback = useCallback((callback: ProductSynthAnchorWalkerVisualStateCallback | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setSynthAnchorWalkerVisualStateCallback(callback);
      return;
    }
    callback?.([null, null, null, null]);
  }, [runtimeMode]);

  const setSynthEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (runtimeMode === 'core-product') {
      productEngine.setSynthEuclidEvolveTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthEuclidEvolveTriggerCallback(callback ?? (() => {}));
  }, [runtimeMode]);

  return {
    setDrumStepPositionCallback,
    setDrumEvolveTriggerCallback,
    setDrumTriggerCallback,
    setSynthStepPositionCallback,
    setSynthOrbitVisualStateCallback,
    setSynthAnchorWalkerVisualStateCallback,
    setSynthEvolveTriggerCallback,
  };
}
