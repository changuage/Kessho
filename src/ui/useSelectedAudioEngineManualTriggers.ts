import { useCallback, type MutableRefObject } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import { commitProductControlActionThenTrigger } from '../product-control';
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
      void commitProductControlActionThenTrigger(
        productEngine,
        externalState,
        {
          type: 'manual-trigger/request',
          source: note.source,
          kind: 'synth-note',
          note,
          velocity: note.velocity,
        },
        () => productEngine.auditionSynthNote(note),
      );
      return;
    }
    void selectedProductRuntime.auditionSynthNote(note, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      void commitProductControlActionThenTrigger(
        productEngine,
        externalState,
        {
          type: 'manual-trigger/request',
          source: `drum:${String(voice)}`,
          kind: 'drum-voice',
          voice,
          velocity: 0.8,
        },
        () => productEngine.triggerDrumVoice(voice, 0.8),
      );
      return;
    }
    void selectedProductRuntime.triggerDrumVoice(voice, 0.8, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
