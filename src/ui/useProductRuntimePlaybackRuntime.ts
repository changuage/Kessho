import { useProductRuntimePlaybackAdapter } from './useProductRuntimePlaybackAdapter';

type ProductRuntimePlaybackRuntimeOptions = Parameters<typeof useProductRuntimePlaybackAdapter>[0];

export function useProductRuntimePlaybackRuntime(options: ProductRuntimePlaybackRuntimeOptions) {
  return useProductRuntimePlaybackAdapter(options);
}
