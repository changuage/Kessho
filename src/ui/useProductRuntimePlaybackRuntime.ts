import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter';

type ProductRuntimePlaybackAdapterOptions = Parameters<typeof useProductRuntimePlaybackAdapter>[0];
type ProductRuntimePlaybackRuntimeOptions = ProductRuntimePlaybackAdapterOptions;

export function useProductRuntimePlaybackRuntime({
  productRuntimeMode,
  ...options
}: ProductRuntimePlaybackRuntimeOptions) {
  return useProductRuntimePlaybackAdapter({
    ...options,
    productRuntimeMode,
  });
}
