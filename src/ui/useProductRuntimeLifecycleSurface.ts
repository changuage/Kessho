import { useMemo } from 'react';
import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery';
import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime';
import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime';
import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry';

type ProductRuntimeLifecycleSurfaceOptions =
  Parameters<typeof useProductRuntimeTelemetry>[0] &
  Omit<Parameters<typeof useProductRuntimeStateRuntime>[0], 'enabled'> &
  Parameters<typeof useProductRuntimeMacRecovery>[0];

export function useProductRuntimeLifecycleSurface(options: ProductRuntimeLifecycleSurfaceOptions) {
  const recordingRuntime = useProductRuntimeRecordingRuntime(options.audioEngineRuntimeMode);
  const runtimeTelemetry = useProductRuntimeTelemetry({
    audioEngineRuntimeMode: options.audioEngineRuntimeMode,
    uiMode: options.uiMode,
  });

  useProductRuntimeStateRuntime({
    audioEngineRuntimeMode: options.audioEngineRuntimeMode,
    enabled: options.playbackIsRunning,
    getSelectedTransportDebugState: options.getSelectedTransportDebugState,
    setEngineState: options.setEngineState,
  });

  useProductRuntimeMacRecovery({
    audioEngineRuntimeMode: options.audioEngineRuntimeMode,
    macShellAvailable: options.macShellAvailable,
    playbackIsRunning: options.playbackIsRunning,
    stateRef: options.stateRef,
  });

  return useMemo(() => ({
    ...recordingRuntime,
    ...runtimeTelemetry,
  }), [
    recordingRuntime,
    runtimeTelemetry,
  ]);
}
