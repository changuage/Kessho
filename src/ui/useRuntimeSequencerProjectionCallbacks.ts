import { useCallback, useMemo } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';

export function useRuntimeSequencerProjectionCallbacks() {
  const setDrumStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    productEngine.setDrumStepPositionCallback(callback);
  }, []);

  const setDrumEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    productEngine.setDrumEuclidEvolveTriggerCallback(callback);
  }, []);

  const setDrumTriggerCallback = useCallback((callback: ((voice: string, velocity: number) => void) | null): void => {
    productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => callback(String(voice), velocity) : null);
  }, []);

  const setSynthStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null): void => {
    productEngine.setSynthStepPositionCallback(callback);
  }, []);

  const setSynthOrbitVisualStateCallback = useCallback((callback: ProductSynthOrbitVisualStateCallback | null): void => {
    productEngine.setSynthOrbitVisualStateCallback(callback);
  }, []);

  const setSynthAnchorWalkerVisualStateCallback = useCallback((callback: ProductSynthAnchorWalkerVisualStateCallback | null): void => {
    productEngine.setSynthAnchorWalkerVisualStateCallback(callback);
  }, []);

  const setSynthEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    productEngine.setSynthEuclidEvolveTriggerCallback(callback);
  }, []);

  return useMemo(() => ({
    setDrumStepPositionCallback,
    setDrumEvolveTriggerCallback,
    setDrumTriggerCallback,
    setSynthStepPositionCallback,
    setSynthOrbitVisualStateCallback,
    setSynthAnchorWalkerVisualStateCallback,
    setSynthEvolveTriggerCallback,
  }), [
    setDrumStepPositionCallback,
    setDrumEvolveTriggerCallback,
    setDrumTriggerCallback,
    setSynthStepPositionCallback,
    setSynthOrbitVisualStateCallback,
    setSynthAnchorWalkerVisualStateCallback,
    setSynthEvolveTriggerCallback,
  ]);
}
