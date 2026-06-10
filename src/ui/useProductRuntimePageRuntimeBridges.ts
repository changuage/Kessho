import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges';
import { useSelectedAudioEngineManualTriggers } from './useSelectedAudioEngineManualTriggers';
import type { ProductRuntimePageControlProps } from './useProductRuntimePageControlProps';
import type { ProductRuntimePageSequencerProps } from './useProductRuntimePageSequencerProps';
import type { ProductRuntimePageTelemetryProps } from './useProductRuntimePageTelemetryProps';
import type { PitchSettings, SubLaneState } from './sequencer/useEuclideanSequencer';

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
  getProductGranularVisualEvents,
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
  setProductDrumPitchSettings,
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
  productRuntimeManualTriggers,
  productRuntimeMode,
  stateRef,
  setProductDrumEvolveTriggerCallback,
  setProductDrumStepPositionCallback,
  setProductDrumTriggerCallback,
  setProductSynthEvolveTriggerCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimePageRuntimeBridgeOptions) {
  // TODO(product-runtime-compat-10E): this is the explicit compatibility boundary between
  // product-named page surfaces and the selected-audio-engine page bridge implementation.
  const selectedRuntimeManualTriggers = useSelectedAudioEngineManualTriggers({
    audioEngineRuntimeMode: productRuntimeMode,
    stateRef,
  });
  const pageManualTriggers = productRuntimeMode === 'core-product'
    ? productRuntimeManualTriggers
    : selectedRuntimeManualTriggers;

  const selectedOptions = {
    ...options,
    getSelectedLeadMorphedParams: getProductLeadMorphedParams,
    getSelectedDynamicsVisualTelemetry: getProductDynamicsVisualTelemetry,
    getSelectedGranularActiveGrainCount: getProductGranularActiveGrainCount,
    getSelectedGranularBufferWaveform: getProductGranularBufferWaveform,
    getSelectedGranularVoicePositions: getProductGranularVoicePositions,
    getSelectedGranularVisualEvents: getProductGranularVisualEvents,
    getSelectedGranularWriteHeadPosition: getProductGranularWriteHeadPosition,
    getSelectedPadFilterFreq: getProductPadFilterFreq,
    getSelectedPadLfoValue: getProductPadLfoValue,
    setSelectedGranularUiActive: setProductGranularUiActive,
    captureSelectedSynthEuclidLaneHome: captureProductSynthEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome: (laneIdx: number, pitchSettings?: PitchSettings, pitchState?: SubLaneState | null) =>
      captureProductDrumEuclidLaneHome(laneIdx, pitchSettings, pitchState ?? undefined),
    diceSelectedSynthEuclidLane: diceProductSynthEuclidLane,
    diceSelectedDrumEuclidLane: diceProductDrumEuclidLane,
    resetSelectedDrumEuclidLaneHome: resetProductDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome: resetProductSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs: setProductDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs: setProductDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings: setProductDrumEuclidSwings,
    setSelectedDrumPitchSettings: setProductDrumPitchSettings,
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
    productRuntimeManualTriggers: pageManualTriggers,
    setSelectedDrumEvolveTriggerCallback: setProductDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: setProductDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: setProductDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: setProductSynthEvolveTriggerCallback,
    setSelectedSynthStepPositionCallback: setProductSynthStepPositionCallback,
  };

  return useSelectedAudioEnginePageRuntimeBridges(selectedOptions);
}
