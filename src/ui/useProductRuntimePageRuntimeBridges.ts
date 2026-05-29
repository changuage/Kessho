import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges';
import type { ProductRuntimePageControlProps } from './useProductRuntimePageControlProps';
import type { ProductRuntimePageSequencerProps } from './useProductRuntimePageSequencerProps';
import type { ProductRuntimePageTelemetryProps } from './useProductRuntimePageTelemetryProps';

export type ProductRuntimePageRuntimeBridgeOptions =
  ProductRuntimePageTelemetryProps &
  ProductRuntimePageSequencerProps &
  ProductRuntimePageControlProps;

export function useProductRuntimePageRuntimeBridges({
  getProductLeadMorphedParams,
  getProductDynamicsVisualTelemetry,
  getProductGranularActiveGrainCount,
  getProductGranularBufferWaveform,
  getProductGranularVoicePositions,
  getProductGranularWriteHeadPosition,
  getProductPadFilterFreq,
  getProductPadLfoValue,
  setProductGranularUiActive,
  captureProductSynthEuclidLaneHome,
  captureProductDrumEuclidLaneHome,
  diceProductSynthEuclidLane,
  diceProductDrumEuclidLane,
  resetProductDrumEuclidLaneHome,
  resetProductSynthEuclidLaneHome,
  setProductDrumEuclidClockDivs,
  setProductDrumEuclidEvolveConfigs,
  setProductDrumEuclidSwings,
  setProductDrumStepOverrides,
  setProductDrumSubLaneEnabled,
  setProductSynthEuclidClockDivs,
  setProductSynthEuclidEvolveConfigs,
  setProductSynthEuclidSwings,
  setProductSynthPitchBindingModes,
  setProductSynthPitchSettings,
  setProductSynthStepOverrides,
  setProductSynthSubLaneEnabled,
  preloadProductRuntime,
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimePageRuntimeBridgeOptions) {
  // TODO(product-runtime-compat-10E): this is the explicit compatibility boundary between
  // product-named page surfaces and the selected-audio-engine page bridge implementation.
  const selectedOptions = {
    ...options,
    getSelectedLeadMorphedParams: getProductLeadMorphedParams,
    getSelectedDynamicsVisualTelemetry: getProductDynamicsVisualTelemetry,
    getSelectedGranularActiveGrainCount: getProductGranularActiveGrainCount,
    getSelectedGranularBufferWaveform: getProductGranularBufferWaveform,
    getSelectedGranularVoicePositions: getProductGranularVoicePositions,
    getSelectedGranularWriteHeadPosition: getProductGranularWriteHeadPosition,
    getSelectedPadFilterFreq: getProductPadFilterFreq,
    getSelectedPadLfoValue: getProductPadLfoValue,
    setSelectedGranularUiActive: setProductGranularUiActive,
    captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome: captureProductDrumEuclidLaneHome,
    diceSelectedSynthEuclidLane: diceProductSynthEuclidLane,
    diceSelectedDrumEuclidLane: diceProductDrumEuclidLane,
    resetSelectedDrumEuclidLaneHome: resetProductDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome: resetProductSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs: setProductDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings: setProductDrumEuclidSwings,
    setSelectedDrumStepOverrides: setProductDrumStepOverrides,
    setSelectedDrumSubLaneEnabled: setProductDrumSubLaneEnabled,
    setSelectedSynthEuclidClockDivs: setProductSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs: setProductSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings: setProductSynthEuclidSwings,
    setSelectedSynthPitchBindingModes: setProductSynthPitchBindingModes,
    setSelectedSynthPitchSettings: setProductSynthPitchSettings,
    setSelectedSynthStepOverrides: setProductSynthStepOverrides,
    setSelectedSynthSubLaneEnabled: setProductSynthSubLaneEnabled,
    preloadSelectedAudioEngine: preloadProductRuntime,
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
  };

  return useSelectedAudioEnginePageRuntimeBridges(selectedOptions);
}
