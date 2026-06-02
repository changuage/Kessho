import { useCallback, useEffect } from 'react';
import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';

type UiMode = 'snowflake' | 'advanced' | 'journey';

type SelectedAudioEngineRuntimeCapabilitiesOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  setSelectedVisualTelemetryActive: (active: boolean) => void;
  uiMode: UiMode;
};

type SelectedAudioEngineRuntimeCapabilities = {
  selectedRuntimeSupportsRangeKey: (key: string) => boolean;
};

export function useSelectedAudioEngineRuntimeCapabilities({
  audioEngineRuntimeMode,
  setSelectedVisualTelemetryActive,
  uiMode,
}: SelectedAudioEngineRuntimeCapabilitiesOptions): SelectedAudioEngineRuntimeCapabilities {
  const documentVisible = useDocumentVisibility();
  const selectedRuntimeSupportsRangeKey = useCallback((key: string): boolean => (
    audioEngineRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key)
  ), [audioEngineRuntimeMode]);

  useEffect(() => {
    const active = audioEngineRuntimeMode === 'core-product' && uiMode === 'advanced' && documentVisible;
    setSelectedVisualTelemetryActive(active);
    return () => {
      setSelectedVisualTelemetryActive(false);
    };
  }, [audioEngineRuntimeMode, documentVisible, setSelectedVisualTelemetryActive, uiMode]);

  return {
    selectedRuntimeSupportsRangeKey,
  };
}
