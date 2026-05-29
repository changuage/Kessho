import {
  useProductRuntimePageBridgeOptions,
  type ProductRuntimePageBridgeOptionGroups,
} from './useProductRuntimePageBridgeOptions';
import { useProductRuntimePageRuntimeBridges } from './useProductRuntimePageRuntimeBridges';

type ProductRuntimePageSurfaceOptions = ProductRuntimePageBridgeOptionGroups;

export function useProductRuntimePageSurface(options: ProductRuntimePageSurfaceOptions) {
  const pageRuntimeBridgeOptions = useProductRuntimePageBridgeOptions(options);
  return useProductRuntimePageRuntimeBridges(pageRuntimeBridgeOptions);
}
