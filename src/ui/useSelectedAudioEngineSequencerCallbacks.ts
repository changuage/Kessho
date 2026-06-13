import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';

type SelectedAudioEngineSequencerCallbacks = {
  setSelectedDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setSelectedDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setSelectedDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setSelectedSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setSelectedSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setSelectedSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
  setSelectedSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
};

export function useSelectedAudioEngineSequencerCallbacks(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineSequencerCallbacks {
  const setSelectedDrumStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumStepPositionCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumStepPositionCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumEuclidEvolveTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumEuclidEvolveTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumTriggerCallback = useCallback((callback: ((voice: string, velocity: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumTriggerCallback(callback ? (voice, velocity) => {
        callback(String(voice), velocity);
      } : null);
      return;
    }
    selectedProductRuntime.setDrumTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthStepPositionCallback = useCallback((callback: ((steps: number[], hitCounts: number[]) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthStepPositionCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthStepPositionCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthOrbitVisualStateCallback = useCallback((callback: ProductSynthOrbitVisualStateCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthOrbitVisualStateCallback(callback);
      return;
    }
    callback?.([null, null, null, null]);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthAnchorWalkerVisualStateCallback = useCallback((callback: ProductSynthAnchorWalkerVisualStateCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthAnchorWalkerVisualStateCallback(callback);
      return;
    }
    callback?.([null, null, null, null]);
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthEvolveTriggerCallback = useCallback((callback: ((laneIndex: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthEuclidEvolveTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthEuclidEvolveTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedDrumStepPositionCallback,
    setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumTriggerCallback,
    setSelectedSynthStepPositionCallback,
    setSelectedSynthOrbitVisualStateCallback,
    setSelectedSynthAnchorWalkerVisualStateCallback,
    setSelectedSynthEvolveTriggerCallback,
  };
}
