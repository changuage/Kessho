import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';
import { useSelectedAudioEngineSequencerCallbacks } from './useSelectedAudioEngineSequencerCallbacks';

type ProductRuntimeSequencerCallbacks = {
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
  setProductSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
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
    setProductSynthOrbitVisualStateCallback: sequencerCallbacks.setSelectedSynthOrbitVisualStateCallback,
    setProductSynthAnchorWalkerVisualStateCallback: sequencerCallbacks.setSelectedSynthAnchorWalkerVisualStateCallback,
    setProductSynthEvolveTriggerCallback: sequencerCallbacks.setSelectedSynthEvolveTriggerCallback,
  };
}
