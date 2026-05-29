import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineLiveTriggerSurface } from './useSelectedAudioEngineLiveTriggerSurface';

type SelectedRuntimeLiveTriggerSurface = ReturnType<typeof useSelectedAudioEngineLiveTriggerSurface>;

type ProductRuntimeLiveTriggerSurface = {
  setProductLeadExpressionCallback: SelectedRuntimeLiveTriggerSurface['setSelectedLeadExpressionCallback'];
  setProductLeadMorphCallback: SelectedRuntimeLiveTriggerSurface['setSelectedLeadMorphCallback'];
  setProductPadMorphTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedPadMorphTriggerCallback'];
  setProductPad2MorphTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedPad2MorphTriggerCallback'];
  setProductLeadDistanceCallback: SelectedRuntimeLiveTriggerSurface['setSelectedLeadDistanceCallback'];
  setProductPadDistanceTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedPadDistanceTriggerCallback'];
  setProductPad2DistanceTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedPad2DistanceTriggerCallback'];
  setProductPianoDistanceTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedPianoDistanceTriggerCallback'];
  setProductLeadDelayCallback: SelectedRuntimeLiveTriggerSurface['setSelectedLeadDelayCallback'];
  setProductDrumMorphTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedDrumMorphTriggerCallback'];
  setProductDrumParamSHTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedDrumParamSHTriggerCallback'];
  setProductGranularSHTriggerCallback: SelectedRuntimeLiveTriggerSurface['setSelectedGranularSHTriggerCallback'];
};

export function useProductRuntimeLiveTriggerSurface(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeLiveTriggerSurface {
  const liveTriggerSurface = useSelectedAudioEngineLiveTriggerSurface(productRuntimeMode);

  return {
    setProductLeadExpressionCallback: liveTriggerSurface.setSelectedLeadExpressionCallback,
    setProductLeadMorphCallback: liveTriggerSurface.setSelectedLeadMorphCallback,
    setProductPadMorphTriggerCallback: liveTriggerSurface.setSelectedPadMorphTriggerCallback,
    setProductPad2MorphTriggerCallback: liveTriggerSurface.setSelectedPad2MorphTriggerCallback,
    setProductLeadDistanceCallback: liveTriggerSurface.setSelectedLeadDistanceCallback,
    setProductPadDistanceTriggerCallback: liveTriggerSurface.setSelectedPadDistanceTriggerCallback,
    setProductPad2DistanceTriggerCallback: liveTriggerSurface.setSelectedPad2DistanceTriggerCallback,
    setProductPianoDistanceTriggerCallback: liveTriggerSurface.setSelectedPianoDistanceTriggerCallback,
    setProductLeadDelayCallback: liveTriggerSurface.setSelectedLeadDelayCallback,
    setProductDrumMorphTriggerCallback: liveTriggerSurface.setSelectedDrumMorphTriggerCallback,
    setProductDrumParamSHTriggerCallback: liveTriggerSurface.setSelectedDrumParamSHTriggerCallback,
    setProductGranularSHTriggerCallback: liveTriggerSurface.setSelectedGranularSHTriggerCallback,
  };
}
