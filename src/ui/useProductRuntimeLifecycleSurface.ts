import { useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ProductEngineState } from '../audio/product/ProductEngineTypes';
import type { ProductRuntimeLifecycle } from './useProductRuntimeLifecycle';
import type { ProductRuntimeStateSurface, ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';
import type { SliderState } from './state';
import { useProductRuntimeMacRecovery } from './useProductRuntimeMacRecovery';
import { useProductRuntimeRecordingRuntime } from './useProductRuntimeRecordingRuntime';
import { useProductRuntimeStateRuntime } from './useProductRuntimeStateRuntime';
import { useProductRuntimeTelemetry } from './useProductRuntimeTelemetry';

type ProductRuntimeLifecycleUiMode = 'snowflake' | 'advanced' | 'journey';

type ProductRuntimeLifecycleSurfaceOptions = {
  productRuntimeLifecycle: ProductRuntimeLifecycle;
  uiMode: ProductRuntimeLifecycleUiMode;
  playbackIsRunning: boolean;
  productRuntimeState: ProductRuntimeStateSurface;
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
  setEngineState: Dispatch<SetStateAction<ProductEngineState>>;
  macShellAvailable: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useProductRuntimeLifecycleSurface(options: ProductRuntimeLifecycleSurfaceOptions) {
  const recordingRuntime = useProductRuntimeRecordingRuntime();
  const runtimeTelemetry = useProductRuntimeTelemetry({
    productRuntimeTelemetry: options.productRuntimeTelemetry,
  });

  useProductRuntimeStateRuntime({
    productRuntimeState: options.productRuntimeState,
    enabled: options.playbackIsRunning,
    setEngineState: options.setEngineState,
  });
  useProductRuntimeMacRecovery({
    productRuntimeLifecycle: options.productRuntimeLifecycle,
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
