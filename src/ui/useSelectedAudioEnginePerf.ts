import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { CpuOverlayPerfCallback } from './CpuOverlay';
import type { AudioEngineCpuSummaries } from './audioEngineRuntimeUi';
import { useProductRuntimePerfAdapter } from './useProductRuntimePerfAdapter';

type SelectedAudioEnginePerf = {
  audioEngineCpuSummaries: AudioEngineCpuSummaries;
  setSelectedPerfMonitorEnabled: (enabled: boolean) => void;
  setSelectedPerfUpdateCallback: (callback: CpuOverlayPerfCallback | null) => void;
};

export function useSelectedAudioEnginePerf(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
  showAudioEngineSwitcher: boolean,
): SelectedAudioEnginePerf {
  const perfAdapter = useProductRuntimePerfAdapter(audioEngineRuntimeMode, showAudioEngineSwitcher);

  return {
    audioEngineCpuSummaries: perfAdapter.audioEngineCpuSummaries,
    setSelectedPerfMonitorEnabled: perfAdapter.setProductPerfMonitorEnabled,
    setSelectedPerfUpdateCallback: perfAdapter.setProductPerfUpdateCallback,
  };
}
