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
  const perf = useProductRuntimePerf(productRuntimeMode, runtimeNavigation.showProductRuntimeSwitcher);
  const globalRuntimeComparison = useMemo<GlobalRuntimeComparisonPanelProps>(() => ({
    currentMode: productRuntimeMode,
    modes: runtimeNavigation.productRuntimeModes,
    cpuSummaries: perf.productRuntimeCpuSummaries,
    visible: runtimeNavigation.showProductRuntimeSwitcher,
    onModeChange: runtimeNavigation.handleProductRuntimeModeChange,
  }), [
    perf.productRuntimeCpuSummaries,
    productRuntimeMode,
    runtimeNavigation.handleProductRuntimeModeChange,
    runtimeNavigation.productRuntimeModes,
    runtimeNavigation.showProductRuntimeSwitcher,
  ]);

  return {
    ...runtimeNavigation,
    ...perf,
    globalRuntimeComparison,
  };
}
