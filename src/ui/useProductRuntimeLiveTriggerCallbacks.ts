import { useSelectedAudioEngineLiveTriggerCallbacks } from './useSelectedAudioEngineLiveTriggerCallbacks';

type SelectedRuntimeLiveTriggerCallbacksOptions = Parameters<typeof useSelectedAudioEngineLiveTriggerCallbacks>[0];
type SelectedLiveTriggerCallbackKey =
  | 'setSelectedDrumMorphTriggerCallback'
  | 'setSelectedDrumParamSHTriggerCallback'
  | 'setSelectedGranularSHTriggerCallback'
  | 'setSelectedLeadDelayCallback'
  | 'setSelectedLeadDistanceCallback'
  | 'setSelectedLeadExpressionCallback'
  | 'setSelectedLeadMorphCallback'
  | 'setSelectedPad2DistanceTriggerCallback'
  | 'setSelectedPad2MorphTriggerCallback'
  | 'setSelectedPadDistanceTriggerCallback'
  | 'setSelectedPadMorphTriggerCallback'
  | 'setSelectedPianoDistanceTriggerCallback';

type ProductRuntimeLiveTriggerCallbacksOptions =
  Omit<SelectedRuntimeLiveTriggerCallbacksOptions, SelectedLiveTriggerCallbackKey> & {
    setProductDrumMorphTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedDrumMorphTriggerCallback'];
    setProductDrumParamSHTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedDrumParamSHTriggerCallback'];
    setProductGranularSHTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedGranularSHTriggerCallback'];
    setProductLeadDelayCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedLeadDelayCallback'];
    setProductLeadDistanceCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedLeadDistanceCallback'];
    setProductLeadExpressionCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedLeadExpressionCallback'];
    setProductLeadMorphCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedLeadMorphCallback'];
    setProductPad2DistanceTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedPad2DistanceTriggerCallback'];
    setProductPad2MorphTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedPad2MorphTriggerCallback'];
    setProductPadDistanceTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedPadDistanceTriggerCallback'];
    setProductPadMorphTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedPadMorphTriggerCallback'];
    setProductPianoDistanceTriggerCallback: SelectedRuntimeLiveTriggerCallbacksOptions['setSelectedPianoDistanceTriggerCallback'];
  };

export function useProductRuntimeLiveTriggerCallbacks({
  setProductDrumMorphTriggerCallback,
  setProductDrumParamSHTriggerCallback,
  setProductGranularSHTriggerCallback,
  setProductLeadDelayCallback,
  setProductLeadDistanceCallback,
  setProductLeadExpressionCallback,
  setProductLeadMorphCallback,
  setProductPad2DistanceTriggerCallback,
  setProductPad2MorphTriggerCallback,
  setProductPadDistanceTriggerCallback,
  setProductPadMorphTriggerCallback,
  setProductPianoDistanceTriggerCallback,
  ...options
}: ProductRuntimeLiveTriggerCallbacksOptions): void {
  useSelectedAudioEngineLiveTriggerCallbacks({
    ...options,
    setSelectedDrumMorphTriggerCallback: setProductDrumMorphTriggerCallback,
    setSelectedDrumParamSHTriggerCallback: setProductDrumParamSHTriggerCallback,
    setSelectedGranularSHTriggerCallback: setProductGranularSHTriggerCallback,
    setSelectedLeadDelayCallback: setProductLeadDelayCallback,
    setSelectedLeadDistanceCallback: setProductLeadDistanceCallback,
    setSelectedLeadExpressionCallback: setProductLeadExpressionCallback,
    setSelectedLeadMorphCallback: setProductLeadMorphCallback,
    setSelectedPad2DistanceTriggerCallback: setProductPad2DistanceTriggerCallback,
    setSelectedPad2MorphTriggerCallback: setProductPad2MorphTriggerCallback,
    setSelectedPadDistanceTriggerCallback: setProductPadDistanceTriggerCallback,
    setSelectedPadMorphTriggerCallback: setProductPadMorphTriggerCallback,
    setSelectedPianoDistanceTriggerCallback: setProductPianoDistanceTriggerCallback,
  });
}
