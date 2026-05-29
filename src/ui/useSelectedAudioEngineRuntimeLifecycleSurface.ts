import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';
import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery';
import { useSelectedAudioEngineRecordingRuntime } from './useSelectedAudioEngineRecordingRuntime';
import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry';
import { useSelectedAudioEngineStateRuntime } from './useSelectedAudioEngineStateRuntime';

type UiMode = 'snowflake' | 'advanced' | 'journey';

type SelectedAudioEngineRuntimeLifecycleSurfaceOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  getSelectedTransportDebugState: () => ProductEngineState['transportDebug'];
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
  stateRef: MutableRefObject<SliderState>;
  uiMode: UiMode;
};

export function useSelectedAudioEngineRuntimeLifecycleSurface({
  audioEngineRuntimeMode,
  getSelectedTransportDebugState,
  macShellAvailable,
  playbackIsRunning,
  setEngineState,
  stateRef,
  uiMode,
}: SelectedAudioEngineRuntimeLifecycleSurfaceOptions) {
  const recordingRuntime = useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode);
  const runtimeTelemetry = useSelectedAudioEngineRuntimeTelemetry({
    audioEngineRuntimeMode,
    uiMode,
  });

  useSelectedAudioEngineStateRuntime({
    audioEngineRuntimeMode,
    enabled: playbackIsRunning,
    getSelectedTransportDebugState,
    setEngineState,
  });

  useSelectedAudioEngineMacRecovery({
    audioEngineRuntimeMode,
    macShellAvailable,
    playbackIsRunning,
    stateRef,
  });

  return useMemo(() => ({
    ...recordingRuntime,
    ...runtimeTelemetry,
  }), [
    recordingRuntime,
    runtimeTelemetry,
  ]);
}
