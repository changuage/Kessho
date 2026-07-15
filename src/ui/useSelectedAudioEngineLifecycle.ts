import { useCallback } from 'react';
import {
  preloadSelectedProductRuntime,
  selectedProductRuntime,
} from '../audio/product/SelectedProductRuntime';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { SliderState } from './state';

type SelectedAudioEngineLifecycle = {
  primeSelectedAudioEngine: () => void;
  startSelectedAudioEngine: (stateToStart: SliderState) => Promise<void>;
  resumeSelectedAudioEngine: () => Promise<void>;
  suspendSelectedAudioEngine: () => Promise<void>;
  preloadSelectedAudioEngine: () => Promise<unknown>;
  stopSelectedAudioEngine: () => void;
  fadeSelectedAudioEngineOutput: (target: number, durationMs: number) => Promise<void>;
};

export function useSelectedAudioEngineLifecycle(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineLifecycle {
  const primeSelectedAudioEngine = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.primeAudioContext();
    }
  }, [audioEngineRuntimeMode]);

  const startSelectedAudioEngine = useCallback((stateToStart: SliderState): Promise<void> => (
    audioEngineRuntimeMode === 'core-product'
      ? productEngine.start({ initialState: { ...stateToStart } })
      : selectedProductRuntime.start(stateToStart)
  ), [audioEngineRuntimeMode]);

  const resumeSelectedAudioEngine = useCallback((): Promise<void> => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.resume();
    }
    return Promise.resolve(selectedProductRuntime.resume());
  }, [audioEngineRuntimeMode]);

  const suspendSelectedAudioEngine = useCallback((): Promise<void> => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.suspend();
    }
    return Promise.resolve(selectedProductRuntime.suspend());
  }, [audioEngineRuntimeMode]);

  const preloadSelectedAudioEngine = useCallback((): Promise<unknown> => (
    audioEngineRuntimeMode === 'core-product'
      ? productEngine.preload()
      : preloadSelectedProductRuntime()
  ), [audioEngineRuntimeMode]);

  const stopSelectedAudioEngine = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      void productEngine.stop();
      return;
    }
    selectedProductRuntime.stop();
  }, [audioEngineRuntimeMode]);

  const setSelectedOutputGain = useCallback((target: number, durationSeconds?: number): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setOutputGain(target, durationSeconds);
      return;
    }
    selectedProductRuntime.setOutputGain(target, durationSeconds);
  }, [audioEngineRuntimeMode]);

  const fadeSelectedAudioEngineOutput = useCallback(async (target: number, durationMs: number): Promise<void> => {
    setSelectedOutputGain(target, durationMs / 1000);
    await new Promise((resolve) => window.setTimeout(resolve, durationMs));
  }, [setSelectedOutputGain]);

  return {
    primeSelectedAudioEngine,
    startSelectedAudioEngine,
    resumeSelectedAudioEngine,
    suspendSelectedAudioEngine,
    preloadSelectedAudioEngine,
    stopSelectedAudioEngine,
    fadeSelectedAudioEngineOutput,
  };
}
