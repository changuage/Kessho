import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry';

type SelectedRuntimeTelemetryOptions = Parameters<typeof useSelectedAudioEngineRuntimeTelemetry>[0];
type ProductRuntimeTelemetryOptions = Omit<SelectedRuntimeTelemetryOptions, 'audioEngineRuntimeMode'> & {
  productRuntimeMode: SelectedRuntimeTelemetryOptions['audioEngineRuntimeMode'];
};

export function useProductRuntimeTelemetry({
  productRuntimeMode,
  ...options
}: ProductRuntimeTelemetryOptions) {
  return useSelectedAudioEngineRuntimeTelemetry({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
