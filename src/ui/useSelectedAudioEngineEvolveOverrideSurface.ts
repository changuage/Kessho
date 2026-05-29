import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';

type EvolveOverrideCallback = (laneIndex: number, overrides: unknown) => void;
type SynthNoteRangeCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

type SelectedAudioEngineEvolveOverrideSurface = {
  setSelectedDrumEvolveOverridesChangedCallback: (callback: EvolveOverrideCallback | null) => void;
  setSelectedSynthEvolveOverridesChangedCallback: (callback: EvolveOverrideCallback | null) => void;
  setSelectedSynthNoteRangeEvolvedCallback: (callback: SynthNoteRangeCallback | null) => void;
};

export function useSelectedAudioEngineEvolveOverrideSurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineEvolveOverrideSurface {
  const setSelectedDrumEvolveOverridesChangedCallback = useCallback((callback: EvolveOverrideCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumEvolveOverridesChangedCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumEvolveOverridesChangedCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthEvolveOverridesChangedCallback = useCallback((callback: EvolveOverrideCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthEvolveOverridesChangedCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthEvolveOverridesChangedCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedSynthNoteRangeEvolvedCallback = useCallback((callback: SynthNoteRangeCallback | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setSynthNoteRangeEvolvedCallback(callback);
      return;
    }
    selectedProductRuntime.setSynthNoteRangeEvolvedCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedDrumEvolveOverridesChangedCallback,
    setSelectedSynthEvolveOverridesChangedCallback,
    setSelectedSynthNoteRangeEvolvedCallback,
  };
}
