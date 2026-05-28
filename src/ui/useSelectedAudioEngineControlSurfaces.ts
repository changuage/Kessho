import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineModulationRanges } from './useSelectedAudioEngineModulationRanges';
import { useSelectedAudioEngineMorphRuntimeSurface } from './useSelectedAudioEngineMorphRuntimeSurface';
import { useSelectedAudioEngineSequencerControls } from './useSelectedAudioEngineSequencerControls';

export function useSelectedAudioEngineControlSurfaces(audioEngineRuntimeMode: AudioEngineRuntimeMode) {
  const modulationRanges = useSelectedAudioEngineModulationRanges(audioEngineRuntimeMode);
  const morphRuntimeSurface = useSelectedAudioEngineMorphRuntimeSurface(audioEngineRuntimeMode);
  const sequencerControls = useSelectedAudioEngineSequencerControls(audioEngineRuntimeMode);

  return {
    ...modulationRanges,
    ...morphRuntimeSurface,
    ...sequencerControls,
  };
}
