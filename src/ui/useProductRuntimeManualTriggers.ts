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

export type ProductDrumVoiceTriggerOptions = {
  velocity?: number;
  statePatch?: Partial<SliderState>;
  triggerCritical?: boolean;
};

type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice, options?: ProductDrumVoiceTriggerOptions) => void;
};

const DEFAULT_MANUAL_DRUM_VELOCITY = 0.8;

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

export function useProductRuntimeManualTriggers({
  stateRef,
}: ProductRuntimeManualTriggersOptions): ProductRuntimeManualTriggers {
  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
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
  }, [stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice, options: ProductDrumVoiceTriggerOptions = {}): void => {
    const velocity = options.velocity ?? DEFAULT_MANUAL_DRUM_VELOCITY;
    const externalState = options.statePatch
      ? { ...stateRef.current, ...options.statePatch } as SliderState
      : stateRef.current;
    const triggerCritical = options.triggerCritical ?? shouldWaitForManualTriggerSnapshot();
    void commitProductControlActionThenTrigger(
      productEngine,
      externalState,
      {
        type: 'manual-trigger/request',
        source: `drum:${String(voice)}`,
        kind: 'drum-voice',
        voice,
        velocity,
      },
      (_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, velocity, resolvedSliders),
      manualTriggerCommitOptions(triggerCritical),
    );
  }, [stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
