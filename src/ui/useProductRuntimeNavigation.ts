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
  audioEngineRuntimeMode,
  preloadProductRuntime,
  stateRef,
  stopProductRuntime,
}: ProductRuntimeNavigationOptions) {
  return useProductRuntimeNavigationCore({
    audioEngineRuntimeMode,
    preloadProductRuntime,
    stateRef,
    stopProductRuntime,
  });
}
