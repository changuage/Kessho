import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';
import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery';
import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime';
import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime';
import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry';

type ProductRuntimeLifecycleUiMode = 'snowflake' | 'advanced' | 'journey';

type ProductRuntimeLifecycleSurfaceOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  uiMode: ProductRuntimeLifecycleUiMode;
  playbackIsRunning: boolean;
  getProductTransportDebugState: () => ProductEngineState['transportDebug'];
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
  macShellAvailable: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeLifecycleSurface(options: ProductRuntimeLifecycleSurfaceOptions) {
  const recordingRuntime = useProductRuntimeRecordingRuntime(options.productRuntimeMode);
  const runtimeTelemetry = useProductRuntimeTelemetry({
    productRuntimeMode: options.productRuntimeMode,
  });

  useProductRuntimeStateRuntime({
    productRuntimeMode: options.productRuntimeMode,
    enabled: options.playbackIsRunning,
    getProductTransportDebugState: options.getProductTransportDebugState,
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
