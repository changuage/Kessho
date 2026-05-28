import { useMemo } from 'react';

type SelectedAudioEngineDebugAnalyserBridgeOptions = {
  referenceDrumVoiceAnalyser: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  referenceDynamicsAnalyser: ((key: unknown) => AnalyserNode | null) | undefined;
};

type SelectedAudioEngineDebugAnalyserBridge = {
  drumVoiceAnalyser: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  dynamicsAnalyser: ((key: unknown) => AnalyserNode | null) | undefined;
};

export function useSelectedAudioEngineDebugAnalyserBridge({
  referenceDrumVoiceAnalyser,
  referenceDynamicsAnalyser,
}: SelectedAudioEngineDebugAnalyserBridgeOptions): SelectedAudioEngineDebugAnalyserBridge {
  return useMemo(() => ({
    drumVoiceAnalyser: referenceDrumVoiceAnalyser,
    dynamicsAnalyser: referenceDynamicsAnalyser,
  }), [referenceDrumVoiceAnalyser, referenceDynamicsAnalyser]);
}
