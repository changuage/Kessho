import { useMemo } from 'react';
import type { GlobalRuntimeComparisonPanelProps } from './global/GlobalRuntimeComparisonPanel';
import { useProductRuntimeNavigation } from './useProductRuntimeNavigation';
import { useProductRuntimePerf } from './useProductRuntimePerf';

type ProductRuntimeUiOptions = Parameters<typeof useProductRuntimeNavigation>[0];

export function useProductRuntimeUi({
  productRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeUiOptions) {
  const runtimeNavigation = useProductRuntimeNavigation({
    productRuntimeMode,
    preloadProductRuntime,
    stateRef,
    stopProductRuntime,
  });
  const perf = useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showAudioEngineSwitcher);
  const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({
    currentMode: productRuntimeMode,
    modes: runtimeNavigation.productRuntimeModes,
    cpuSummaries: perf.audioEngineCpuSummaries,
    visible: runtimeNavigation.showAudioEngineSwitcher,
    onModeChange: runtimeNavigation.handleProductRuntimeModeChange,
  }), [
    perf.audioEngineCpuSummaries,
    productRuntimeMode,
    runtimeNavigation.handleProductRuntimeModeChange,
    runtimeNavigation.productRuntimeModes,
    runtimeNavigation.showAudioEngineSwitcher,
  ]);

  return {
    ...runtimeNavigation,
    ...perf,
    globalRuntimeComparison,
  };
}
