import {
  useProductRuntimePageBridgeOptions,
  type ProductRuntimePageBridgeOptionGroups,
} from './useProductRuntimePageBridgeOptions';
import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges';

type ProductRuntimePageSurfaceOptions = ProductRuntimePageBridgeOptionGroups;

export function useProductRuntimePageSurface(options: ProductRuntimePageSurfaceOptions) {
  const pageRuntimeBridgeOptions = useProductRuntimePageBridgeOptions(options);
  return useSelectedAudioEnginePageRuntimeBridges(pageRuntimeBridgeOptions);
}
