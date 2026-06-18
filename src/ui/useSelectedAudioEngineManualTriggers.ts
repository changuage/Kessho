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

function shouldWaitForManualTriggerSnapshot(): boolean {
  return productEngine.getLifecycleState() === 'running';
}

function manualTriggerCommitOptions(triggerCritical: boolean): {
  triggerCritical: boolean;
  forceFullSnapshot: boolean;
} {
  return {
    triggerCritical,
    forceFullSnapshot: triggerCritical,
  };
}

export function useSelectedAudioEngineManualTriggers({
  audioEngineRuntimeMode,
  stateRef,
}: UseSelectedAudioEngineManualTriggersOptions): SelectedAudioEngineManualTriggers {
  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const triggerCritical = shouldWaitForManualTriggerSnapshot();
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
        (_revision, resolvedSliders) => productEngine.auditionSynthNote(note, resolvedSliders),
        manualTriggerCommitOptions(triggerCritical),
      );
      return;
    }
    void selectedProductRuntime.auditionSynthNote(note, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const triggerCritical = shouldWaitForManualTriggerSnapshot();
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
        (_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, 0.8, resolvedSliders),
        manualTriggerCommitOptions(triggerCritical),
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
