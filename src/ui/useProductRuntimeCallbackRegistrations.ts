import { useProductRuntimeLiveTriggerCallbacks } from './useProductRuntimeLiveTriggerCallbacks';
import type { ProductRuntimeLiveTriggerCallbacksOptions } from './useProductRuntimeLiveTriggerCallbacks';
import {
  useProductRuntimeVisualizerCallbacks,
  type ProductRuntimeVisualizerCallbacksOptions,
} from './useProductRuntimeVisualizerCallbacks';

type ProductRuntimeCallbackRegistrationsOptions =
  ProductRuntimeLiveTriggerCallbacksOptions &
  ProductRuntimeVisualizerCallbacksOptions;

export function useProductRuntimeCallbackRegistrations({
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimeCallbackRegistrationsOptions): void {
  useProductRuntimeVisualizerCallbacks({
    ...options,
    setProductDrumEvolveTriggerCallback,
    setProductDrumStepPositionCallback,
    setProductDrumTriggerCallback,
    setProductSynthEvolveTriggerCallback,
    setProductSynthStepPositionCallback,
  });
  useProductRuntimeLiveTriggerCallbacks(options);
}
