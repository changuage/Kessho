import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineSequencerCallbacks } from './useSelectedAudioEngineSequencerCallbacks';

type SelectedRuntimeSequencerCallbacks = ReturnType<typeof useSelectedAudioEngineSequencerCallbacks>;

type ProductRuntimeSequencerCallbacks = {
  setProductDrumStepPositionCallback: SelectedRuntimeSequencerCallbacks['setSelectedDrumStepPositionCallback'];
  setProductDrumEvolveTriggerCallback: SelectedRuntimeSequencerCallbacks['setSelectedDrumEvolveTriggerCallback'];
  setProductDrumTriggerCallback: SelectedRuntimeSequencerCallbacks['setSelectedDrumTriggerCallback'];
  setProductSynthStepPositionCallback: SelectedRuntimeSequencerCallbacks['setSelectedSynthStepPositionCallback'];
  setProductSynthEvolveTriggerCallback: SelectedRuntimeSequencerCallbacks['setSelectedSynthEvolveTriggerCallback'];
};

export function useProductRuntimeSequencerCallbacks(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeSequencerCallbacks {
  const sequencerCallbacks = useSelectedAudioEngineSequencerCallbacks(productRuntimeMode);

  return {
    setProductDrumStepPositionCallback: sequencerCallbacks.setSelectedDrumStepPositionCallback,
    setProductDrumEvolveTriggerCallback: sequencerCallbacks.setSelectedDrumEvolveTriggerCallback,
    setProductDrumTriggerCallback: sequencerCallbacks.setSelectedDrumTriggerCallback,
    setProductSynthStepPositionCallback: sequencerCallbacks.setSelectedSynthStepPositionCallback,
    setProductSynthEvolveTriggerCallback: sequencerCallbacks.setSelectedSynthEvolveTriggerCallback,
  };
}
