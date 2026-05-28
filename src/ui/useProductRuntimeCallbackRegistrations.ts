import { useProductRuntimeLiveTriggerCallbacks } from './useProductRuntimeLiveTriggerCallbacks';
import { useProductRuntimeVisualizerCallbacks } from './useProductRuntimeVisualizerCallbacks';

type ProductRuntimeCallbackRegistrationsOptions =
  Parameters<typeof useProductRuntimeVisualizerCallbacks>[0] &
  Parameters<typeof useProductRuntimeLiveTriggerCallbacks>[0];

export function useProductRuntimeCallbackRegistrations(options: ProductRuntimeCallbackRegistrationsOptions): void {
  useProductRuntimeVisualizerCallbacks(options);
  useProductRuntimeLiveTriggerCallbacks(options);
}
