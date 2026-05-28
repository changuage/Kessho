import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface';
import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface';
import { useSelectedAudioEngineSequencerCallbacks } from './useSelectedAudioEngineSequencerCallbacks';

export function useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const sequencerCallbacks = useSelectedAudioEngineSequencerCallbacks(audioEngineRuntimeMode);
  const liveTriggerSurface = useSelectedAudioEngineLiveTriggerSurface(audioEngineRuntimeMode);
  const evolveOverrideSurface = useSelectedAudioEngineEvolveOverrideSurface(audioEngineRuntimeMode);

  return {
    ...sequencerCallbacks,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  };
}
