import { useProductRuntimeLiveTriggerCallbacks } from './useProductRuntimeLiveTriggerCallbacks';
import { useProductRuntimeVisualizerCallbacks } from './useProductRuntimeVisualizerCallbacks';

type ProductRuntimeVisualizerCallbackOptions = Parameters<typeof useProductRuntimeVisualizerCallbacks>[0];
type SelectedSequencerCallbackKey =
  | 'setSelectedDrumEvolveTriggerCallback'
  | 'setSelectedDrumStepPositionCallback'
  | 'setSelectedDrumTriggerCallback'
  | 'setSelectedSynthEvolveTriggerCallback'
  | 'setSelectedSynthStepPositionCallback';
type ProductRuntimeCallbackRegistrationsOptions =
  Omit<ProductRuntimeVisualizerCallbackOptions, SelectedSequencerCallbackKey> &
  Parameters<typeof useProductRuntimeLiveTriggerCallbacks>[0] & {
    setProductDrumEvolveTriggerCallback: ProductRuntimeVisualizerCallbackOptions['setSelectedDrumEvolveTriggerCallback'];
    setProductDrumStepPositionCallback: ProductRuntimeVisualizerCallbackOptions['setSelectedDrumStepPositionCallback'];
    setProductDrumTriggerCallback: ProductRuntimeVisualizerCallbackOptions['setSelectedDrumTriggerCallback'];
    setProductSynthEvolveTriggerCallback: ProductRuntimeVisualizerCallbackOptions['setSelectedSynthEvolveTriggerCallback'];
    setProductSynthStepPositionCallback: ProductRuntimeVisualizerCallbackOptions['setSelectedSynthStepPositionCallback'];
  };

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
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
  });
  useProductRuntimeLiveTriggerCallbacks(options);
}
