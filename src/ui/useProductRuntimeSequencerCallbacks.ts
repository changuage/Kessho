import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineSequencerCallbacks } from './useSelectedAudioEngineSequencerCallbacks';

type ProductRuntimeSequencerCallbacks = {
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
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
