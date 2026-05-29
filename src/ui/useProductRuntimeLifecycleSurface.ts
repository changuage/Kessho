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
  const recordingRuntime = useProductRuntimeRecordingRuntime(options.productRuntimeMode);
  const runtimeTelemetry = useProductRuntimeTelemetry({
    productRuntimeMode: options.productRuntimeMode,
    uiMode: options.uiMode,
  });

  useProductRuntimeStateRuntime({
    productRuntimeMode: options.productRuntimeMode,
    enabled: options.playbackIsRunning,
    getSelectedTransportDebugState: options.getSelectedTransportDebugState,
    setEngineState: options.setEngineState,
  });

  useProductRuntimeMacRecovery({
    productRuntimeMode: options.productRuntimeMode,
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
