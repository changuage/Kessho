import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';

type JourneyMorphClockCallback = (now: number) => void;

type SelectedAudioEngineMorphRuntimeSurface = {
  resetSelectedCofDrift: () => void;
  setSelectedJourneyMorphClockCallback: (callback: JourneyMorphClockCallback | null) => void;
  startSelectedJourneyMorphClock: () => void;
  stopSelectedJourneyMorphClock: () => void;
};

export function useSelectedAudioEngineMorphRuntimeSurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineMorphRuntimeSurface {
  const setSelectedJourneyMorphClockCallback = useCallback((callback: JourneyMorphClockCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setJourneyMorphClockCallback(callback);
      return;
    }
    selectedProductRuntime.setJourneyMorphClockCallback(callback);
  }, [audioEngineRuntimeMode]);

  const startSelectedJourneyMorphClock = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.startJourneyMorphClock();
      return;
    }
    selectedProductRuntime.startJourneyMorphClock();
  }, [audioEngineRuntimeMode]);

  const stopSelectedJourneyMorphClock = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.stopJourneyMorphClock();
      return;
    }
    selectedProductRuntime.stopJourneyMorphClock();
  }, [audioEngineRuntimeMode]);

  const resetSelectedCofDrift = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.resetCofDrift();
      return;
    }
    selectedProductRuntime.resetCofDrift();
  }, [audioEngineRuntimeMode]);

  return {
    resetSelectedCofDrift,
    setSelectedJourneyMorphClockCallback,
    startSelectedJourneyMorphClock,
    stopSelectedJourneyMorphClock,
  };
}
