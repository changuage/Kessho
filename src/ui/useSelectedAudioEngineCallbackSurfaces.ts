import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { useSelectedAudioEngineEvolveOverrideSurface } from './useSelectedAudioEngineEvolveOverrideSurface';
import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface';
import { useRuntimeSequencerProjectionCallbacks } from './useRuntimeSequencerProjectionCallbacks';

export function useSelectedAudioEngineCallbackSurfaces(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const projectionCallbacks = useRuntimeSequencerProjectionCallbacks(audioEngineRuntimeMode);
  const liveTriggerSurface = useSelectedAudioEngineLiveTriggerSurface(audioEngineRuntimeMode);
  const evolveOverrideSurface = useSelectedAudioEngineEvolveOverrideSurface(audioEngineRuntimeMode);

  return {
    setSelectedDrumStepPositionCallback: projectionCallbacks.setDrumStepPositionCallback,
    setSelectedDrumEvolveTriggerCallback: projectionCallbacks.setDrumEvolveTriggerCallback,
    setSelectedDrumTriggerCallback: projectionCallbacks.setDrumTriggerCallback,
    setSelectedSynthStepPositionCallback: projectionCallbacks.setSynthStepPositionCallback,
    setSelectedSynthOrbitVisualStateCallback: projectionCallbacks.setSynthOrbitVisualStateCallback,
    setSelectedSynthAnchorWalkerVisualStateCallback: projectionCallbacks.setSynthAnchorWalkerVisualStateCallback,
    setSelectedSynthEvolveTriggerCallback: projectionCallbacks.setSynthEvolveTriggerCallback,
    ...liveTriggerSurface,
    ...evolveOverrideSurface,
  };
}
