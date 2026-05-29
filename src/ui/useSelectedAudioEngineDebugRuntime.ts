import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { useSelectedAudioEngineDebugAnalyserBridge } from './useSelectedAudioEngineDebugAnalyserBridge';
import { useSelectedAudioEngineDebugSurface } from './useSelectedAudioEngineDebugSurface';

export function useSelectedAudioEngineDebugRuntime(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const {
    getSelectedGranularBufferWaveform,
    getSelectedTransportDebugState,
    getEarthTextureDebugState,
    getSelectedLeadMorphedParams,
    referenceDrumVoiceAnalyser,
    referenceDynamicsAnalyser,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    textureDebugAvailable,
    updateSelectedReferenceParams,
  } = useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode);

  const selectedAudioEngineDebugAnalysers = useSelectedAudioEngineDebugAnalyserBridge({
    referenceDrumVoiceAnalyser,
    referenceDynamicsAnalyser,
  });

  return {
    getSelectedGranularBufferWaveform,
    getSelectedTransportDebugState,
    getEarthTextureDebugState,
    getSelectedLeadMorphedParams,
    selectedAudioEngineDebugAnalysers,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    textureDebugAvailable,
    updateSelectedReferenceParams,
  };
}
