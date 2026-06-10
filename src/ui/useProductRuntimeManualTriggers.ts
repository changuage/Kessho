import { useCallback, type MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductDrumVoice, ProductManualSynthNote } from '../audio/product/ProductEngineTypes';
import { commitProductControlActionThenTrigger } from '../product-control';
import type { SliderState } from './state';

type ProductRuntimeManualTriggersOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice) => void;
};

const DEFAULT_MANUAL_DRUM_VELOCITY = 0.8;

export function useProductRuntimeManualTriggers({
  stateRef,
}: ProductRuntimeManualTriggersOptions): ProductRuntimeManualTriggers {
  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
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
  }, [stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice): void => {
    const externalState = stateRef.current;
    void commitProductControlActionThenTrigger(
      productEngine,
      externalState,
      {
        type: 'manual-trigger/request',
        source: `drum:${String(voice)}`,
        kind: 'drum-voice',
        voice,
        velocity: DEFAULT_MANUAL_DRUM_VELOCITY,
      },
      () => productEngine.triggerDrumVoice(voice, DEFAULT_MANUAL_DRUM_VELOCITY),
    );
  }, [stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
