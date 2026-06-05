import { useCallback, type MutableRefObject } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import {
  commitThenTrigger,
  createInitialProductControlState,
  reduceProductControlState,
  resolvePerformanceState,
} from '../product-control';
import type { SliderState } from './state';

type UseSelectedAudioEngineManualTriggersOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  stateRef: MutableRefObject<SliderState>;
};

type SelectedAudioEngineManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice) => void;
};

export function useSelectedAudioEngineManualTriggers({
  audioEngineRuntimeMode,
  stateRef,
}: UseSelectedAudioEngineManualTriggersOptions): SelectedAudioEngineManualTriggers {
  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const controlState = reduceProductControlState(
        createInitialProductControlState(externalState),
        { type: 'manual-trigger/request', source: note.source },
      );
      const resolved = resolvePerformanceState(controlState);
      void commitThenTrigger(productEngine, resolved, () => productEngine.auditionSynthNote(note));
      return;
    }
    void selectedProductRuntime.auditionSynthNote(note, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const controlState = reduceProductControlState(
        createInitialProductControlState(externalState),
        { type: 'manual-trigger/request', source: `drum:${String(voice)}` },
      );
      const resolved = resolvePerformanceState(controlState);
      void commitThenTrigger(productEngine, resolved, () => productEngine.triggerDrumVoice(voice, 0.8));
      return;
    }
    void selectedProductRuntime.triggerDrumVoice(voice, 0.8, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
