import { useProductRuntimeNavigationCore } from './useProductRuntimeNavigationCore';

type ProductRuntimeNavigationCoreOptions = Parameters<typeof useProductRuntimeNavigationCore>[0];
type ProductRuntimeNavigationOptions = Omit<
  ProductRuntimeNavigationCoreOptions,
  'preloadProductRuntime' | 'stopProductRuntime'
> & {
  preloadProductRuntime: () => Promise<unknown>;
  stopProductRuntime: () => void;
};

export function useProductRuntimeNavigation({
  productRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeNavigationOptions) {
  return useProductRuntimeNavigationCore({
    productRuntimeMode,
    preloadProductRuntime,
    stateRef,
    stopProductRuntime,
  });
}
