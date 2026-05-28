import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry';

type ProductRuntimeTelemetryOptions = Parameters<typeof useSelectedAudioEngineRuntimeTelemetry>[0];

export function useProductRuntimeTelemetry(options: ProductRuntimeTelemetryOptions) {
  return useSelectedAudioEngineRuntimeTelemetry(options);
}
