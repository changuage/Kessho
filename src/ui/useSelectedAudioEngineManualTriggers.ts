import { useCallback, type MutableRefObject } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { SliderState } from './state';

type UseSelectedAudioEngineManualTriggersOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  stateRef: MutableRefObject<SliderState>;
};

type SelectedAudioEngineManualTriggers = {
  auditionSynthNote: (note: unknown) => void;
  triggerDrumVoice: (voice: unknown) => void;
};

export function useSelectedAudioEngineManualTriggers({
  audioEngineRuntimeMode,
  stateRef,
}: UseSelectedAudioEngineManualTriggersOptions): SelectedAudioEngineManualTriggers {
  const auditionSynthNote = useCallback((note: unknown): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      void productEngine.auditionSynthNote(note, externalState);
      return;
    }
    void selectedProductRuntime.auditionSynthNote(note, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  const triggerDrumVoice = useCallback((voice: unknown): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      void productEngine.triggerDrumVoice(voice, 0.8, externalState);
      return;
    }
    void selectedProductRuntime.triggerDrumVoice(voice, 0.8, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
