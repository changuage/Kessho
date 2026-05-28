import { useMemo } from 'react';
import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel';
import { useProductRuntimeNavigation } from './useProductRuntimeNavigation';
import { useProductRuntimePerf } from './useProductRuntimePerf';

type ProductRuntimeUiOptions = Parameters<typeof useProductRuntimeNavigation>[0];

export function useProductRuntimeUi({
  audioEngineRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeUiOptions) {
  const runtimeNavigation = useProductRuntimeNavigation({
    audioEngineRuntimeMode,
    preloadProductRuntime,
    stateRef,
    stopProductRuntime,
  });
  const perf = useProductRuntimePerf(audioEngineRuntimeMode, runtimeNavigation.showAudioEngineSwitcher);
  const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({
    currentMode: audioEngineRuntimeMode,
    modes: runtimeNavigation.audioEngineRuntimeModes,
    cpuSummaries: perf.audioEngineCpuSummaries,
    visible: runtimeNavigation.showAudioEngineSwitcher,
    onModeChange: runtimeNavigation.handleAudioEngineRuntimeModeChange,
  }), [
    audioEngineRuntimeMode,
    perf.audioEngineCpuSummaries,
    runtimeNavigation.audioEngineRuntimeModes,
    runtimeNavigation.handleAudioEngineRuntimeModeChange,
    runtimeNavigation.showAudioEngineSwitcher,
  ]);

  return {
    ...runtimeNavigation,
    ...perf,
    globalRuntimeComparison,
  };
}
