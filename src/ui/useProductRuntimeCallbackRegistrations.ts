import {
  useLiveTriggerUiCallbacks,
  type LiveTriggerUiCallbacksOptions,
} from './useLiveTriggerUiCallbacks';
import { useSelectedAudioEngineVisualizerCallbacks } from './useSelectedAudioEngineVisualizerCallbacks';

type ProductRuntimeCallbackRegistrationsOptions = {
  setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductDrumMorphTriggerCallback: LiveTriggerUiCallbacksOptions['setDrumMorphTriggerCallback'];
  setProductDrumParamSHTriggerCallback: LiveTriggerUiCallbacksOptions['setDrumParamSHTriggerCallback'];
  setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
  setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
  setProductGranularSHTriggerCallback: LiveTriggerUiCallbacksOptions['setGranularSHTriggerCallback'];
  setProductLeadDelayCallback: LiveTriggerUiCallbacksOptions['setLeadDelayCallback'];
  setProductLeadDistanceCallback: LiveTriggerUiCallbacksOptions['setLeadDistanceCallback'];
  setProductLeadExpressionCallback: LiveTriggerUiCallbacksOptions['setLeadExpressionCallback'];
  setProductLeadMorphCallback: LiveTriggerUiCallbacksOptions['setLeadMorphCallback'];
  setProductPad2DistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPad2DistanceTriggerCallback'];
  setProductPad2MorphTriggerCallback: LiveTriggerUiCallbacksOptions['setPad2MorphTriggerCallback'];
  setProductPadDistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPadDistanceTriggerCallback'];
  setProductPadMorphTriggerCallback: LiveTriggerUiCallbacksOptions['setPadMorphTriggerCallback'];
  setProductPianoDistanceTriggerCallback: LiveTriggerUiCallbacksOptions['setPianoDistanceTriggerCallback'];
  setProductSample1DistanceTriggerCallback?: LiveTriggerUiCallbacksOptions['setSample1DistanceTriggerCallback'];
  setProductSample2DistanceTriggerCallback?: LiveTriggerUiCallbacksOptions['setSample2DistanceTriggerCallback'];
  setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
} & Pick<LiveTriggerUiCallbacksOptions, 'activeTab' | 'stateRef' | 'uiMode'>;

export function useProductRuntimeCallbackRegistrations({
  setProductDrumEvolveTriggerCallback,
  setProductDrumMorphTriggerCallback,
  setProductDrumParamSHTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
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
  setProductSample1DistanceTriggerCallback,
  setProductSample2DistanceTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimeCallbackRegistrationsOptions): void {
  useSelectedAudioEngineVisualizerCallbacks({
    ...options,
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
  });
  useLiveTriggerUiCallbacks({
    ...options,
    setDrumMorphTriggerCallback: setProductDrumMorphTriggerCallback,
    setDrumParamSHTriggerCallback: setProductDrumParamSHTriggerCallback,
    setGranularSHTriggerCallback: setProductGranularSHTriggerCallback,
    setLeadDelayCallback: setProductLeadDelayCallback,
    setLeadDistanceCallback: setProductLeadDistanceCallback,
    setLeadExpressionCallback: setProductLeadExpressionCallback,
    setLeadMorphCallback: setProductLeadMorphCallback,
    setPad2DistanceTriggerCallback: setProductPad2DistanceTriggerCallback,
    setPad2MorphTriggerCallback: setProductPad2MorphTriggerCallback,
    setPadDistanceTriggerCallback: setProductPadDistanceTriggerCallback,
    setPadMorphTriggerCallback: setProductPadMorphTriggerCallback,
    setPianoDistanceTriggerCallback: setProductPianoDistanceTriggerCallback,
    setSample1DistanceTriggerCallback: setProductSample1DistanceTriggerCallback,
    setSample2DistanceTriggerCallback: setProductSample2DistanceTriggerCallback,
  });
}
