import { useProductRuntimePerfAdapter } from './useProductRuntimePerfAdapter';

type ProductRuntimePerfMode = Parameters<typeof useProductRuntimePerfAdapter>[0];
type ProductRuntimePerfVisible = Parameters<typeof useProductRuntimePerfAdapter>[1];

export function useProductRuntimePerf(
  productRuntimeMode: ProductRuntimePerfMode,
  showProductRuntimeSwitcher: ProductRuntimePerfVisible,
) {
  return useProductRuntimePerfAdapter(productRuntimeMode, showProductRuntimeSwitcher);
}
