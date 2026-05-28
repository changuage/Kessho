import { useMemo, type MutableRefObject } from 'react';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { SliderState } from './state';
import { useSelectedAudioEnginePlaybackRuntime } from './useSelectedAudioEnginePlaybackRuntime';
import { useSelectedAudioEngineRuntimeUi } from './useSelectedAudioEngineRuntimeUi';

type SelectedAudioEngineRuntimeShellOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  capacitorAudioSessionDiagnosticActive: boolean;
  setCapacitorAudioSessionDiagnosticActive: (active: boolean) => void;
  stateRef: MutableRefObject<SliderState>;
};

export function useSelectedAudioEngineRuntimeShell({
  audioEngineRuntimeMode,
  capacitorAudioSessionDiagnosticActive,
  setCapacitorAudioSessionDiagnosticActive,
  stateRef,
}: SelectedAudioEngineRuntimeShellOptions) {
  const playbackRuntime = useSelectedAudioEnginePlaybackRuntime({
    audioEngineRuntimeMode,
    capacitorAudioSessionDiagnosticActive,
    setCapacitorAudioSessionDiagnosticActive,
  });

  const runtimeUi = useSelectedAudioEngineRuntimeUi({
    audioEngineRuntimeMode,
    preloadSelectedAudioEngine: playbackRuntime.preloadSelectedAudioEngine,
    stateRef,
    stopSelectedAudioEngine: playbackRuntime.stopSelectedAudioEngine,
  });

  return useMemo(() => ({
    ...playbackRuntime,
    ...runtimeUi,
  }), [
    playbackRuntime,
    runtimeUi,
  ]);
}
