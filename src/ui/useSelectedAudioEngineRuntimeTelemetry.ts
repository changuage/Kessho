import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { useSelectedAudioEngineRuntimeCapabilities } from './useSelectedAudioEngineRuntimeCapabilities';
import { useSelectedAudioEngineTelemetrySurface } from './useSelectedAudioEngineTelemetrySurface';

type UiMode = 'snowflake' | 'advanced' | 'journey';

type UseSelectedAudioEngineRuntimeTelemetryOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  uiMode: UiMode;
};

export function useSelectedAudioEngineRuntimeTelemetry({
  audioEngineRuntimeMode,
  uiMode,
}: UseSelectedAudioEngineRuntimeTelemetryOptions) {
  const telemetrySurface = useSelectedAudioEngineTelemetrySurface(audioEngineRuntimeMode);
  const { selectedRuntimeSupportsRangeKey } = useSelectedAudioEngineRuntimeCapabilities({
    audioEngineRuntimeMode,
    setSelectedVisualTelemetryActive: telemetrySurface.setSelectedVisualTelemetryActive,
    uiMode,
  });

  return {
    ...telemetrySurface,
    selectedRuntimeSupportsRangeKey,
  };
}
