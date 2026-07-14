import { useCallback, type MutableRefObject } from 'react';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { SliderState } from './state';
import type { RuntimeManualTriggerSurface } from './useProductRuntimeManualTriggers';

type UseSelectedAudioEngineManualTriggersOptions = {
  stateRef: MutableRefObject<SliderState>;
};

export function useSelectedAudioEngineManualTriggers({
  stateRef,
}: UseSelectedAudioEngineManualTriggersOptions): RuntimeManualTriggerSurface {
  const auditionSynthNote: RuntimeManualTriggerSurface['auditionSynthNote'] = useCallback((note) => {
    void selectedProductRuntime.auditionSynthNote(note, stateRef.current);
  }, [stateRef]);

  const startSynthLiveNote: RuntimeManualTriggerSurface['startSynthLiveNote'] = useCallback(async (event) => {
    await selectedProductRuntime.enqueueLiveNoteEvent(event);
  }, []);

  const stopSynthLiveNote: RuntimeManualTriggerSurface['stopSynthLiveNote'] = useCallback((event) => {
    void selectedProductRuntime.enqueueLiveNoteEvent(event);
  }, []);

  const triggerDrumVoice: RuntimeManualTriggerSurface['triggerDrumVoice'] = useCallback((voice) => {
    void selectedProductRuntime.triggerDrumVoice(voice, 0.8, stateRef.current);
  }, [stateRef]);

  return {
    auditionSynthNote,
    startSynthLiveNote,
    stopSynthLiveNote,
    triggerDrumVoice,
  };
}
