import { useMemo } from 'react';
import { useSelectedAudioEnginePageRuntimeBridges } from './useSelectedAudioEnginePageRuntimeBridges';
import { useSelectedAudioEngineCallbackSurfaces } from './useSelectedAudioEngineCallbackSurfaces';
import { useSelectedAudioEngineControlSurfaces } from './useSelectedAudioEngineControlSurfaces';
import { useSelectedAudioEngineManualTriggers } from './useSelectedAudioEngineManualTriggers';
import { useProductRuntimeSynthPageEvents } from './useProductRuntimeSynthPageEvents';
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
  setProductSynthAnchorWalkerVisualStateCallback,
  setProductSynthOrbitVisualStateCallback,
  setProductSynthStepPositionCallback,
  ...options
}: ProductRuntimePageRuntimeBridgeOptions) {
  // TODO(product-fallback-retire:runtime-page-runtime-bridges): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // This is the explicit compatibility boundary between
  // product-named page surfaces and the selected-audio-engine page bridge implementation.
  const selectedRuntimeCallbacks = useSelectedAudioEngineCallbackSurfaces(productRuntimeMode);
  const selectedRuntimeControls = useSelectedAudioEngineControlSurfaces(productRuntimeMode);
  const selectedRuntimeManualTriggers = useSelectedAudioEngineManualTriggers({
    stateRef,
  });
  const productSynthPageEvents = useProductRuntimeSynthPageEvents(productRuntimeMode, stateRef);
  const useProductRuntimePageSurfaces = productRuntimeMode === 'core-product';
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
    captureSelectedSynthEuclidLaneHome: useProductRuntimePageSurfaces
      ? captureProductSynthEuclidLaneHome
      : selectedRuntimeControls.captureSelectedSynthEuclidLaneHome,
    captureSelectedDrumEuclidLaneHome: useProductRuntimePageSurfaces
      ? (laneIdx: number, pitchSettings?: PitchSettings, pitchState?: SubLaneState | null) =>
        captureProductDrumEuclidLaneHome(laneIdx, pitchSettings, pitchState ?? undefined)
      : selectedRuntimeControls.captureSelectedDrumEuclidLaneHome,
    diceSelectedSynthEuclidLane: useProductRuntimePageSurfaces
      ? diceProductSynthEuclidLane
      : selectedRuntimeControls.diceSelectedSynthEuclidLane,
    diceSelectedDrumEuclidLane: useProductRuntimePageSurfaces
      ? diceProductDrumEuclidLane
      : selectedRuntimeControls.diceSelectedDrumEuclidLane,
    resetSelectedDrumEuclidLaneHome: useProductRuntimePageSurfaces
      ? resetProductDrumEuclidLaneHome
      : selectedRuntimeControls.resetSelectedDrumEuclidLaneHome,
    resetSelectedSynthEuclidLaneHome: useProductRuntimePageSurfaces
      ? resetProductSynthEuclidLaneHome
      : selectedRuntimeControls.resetSelectedSynthEuclidLaneHome,
    setSelectedDrumEuclidClockDivs: useProductRuntimePageSurfaces
      ? setProductDrumEuclidClockDivs
      : selectedRuntimeControls.setSelectedDrumEuclidClockDivs,
    setSelectedDrumEuclidEvolveConfigs: useProductRuntimePageSurfaces
      ? setProductDrumEuclidEvolveConfigs
      : selectedRuntimeControls.setSelectedDrumEuclidEvolveConfigs,
    setSelectedDrumEuclidSwings: useProductRuntimePageSurfaces
      ? setProductDrumEuclidSwings
      : selectedRuntimeControls.setSelectedDrumEuclidSwings,
    setSelectedDrumPitchSettings: useProductRuntimePageSurfaces
      ? setProductDrumPitchSettings
      : selectedRuntimeControls.setSelectedDrumPitchSettings,
    setSelectedDrumStepOverrides: useProductRuntimePageSurfaces
      ? setProductDrumStepOverrides
      : selectedRuntimeControls.setSelectedDrumStepOverrides,
    setSelectedDrumSubLaneEnabled: useProductRuntimePageSurfaces
      ? setProductDrumSubLaneEnabled
      : selectedRuntimeControls.setSelectedDrumSubLaneEnabled,
    setSelectedSynthEuclidClockDivs: useProductRuntimePageSurfaces
      ? setProductSynthEuclidClockDivs
      : selectedRuntimeControls.setSelectedSynthEuclidClockDivs,
    setSelectedSynthEuclidEvolveConfigs: useProductRuntimePageSurfaces
      ? setProductSynthEuclidEvolveConfigs
      : selectedRuntimeControls.setSelectedSynthEuclidEvolveConfigs,
    setSelectedSynthEuclidSwings: useProductRuntimePageSurfaces
      ? setProductSynthEuclidSwings
      : selectedRuntimeControls.setSelectedSynthEuclidSwings,
    setSelectedSynthPitchBindingModes: useProductRuntimePageSurfaces
      ? setProductSynthPitchBindingModes
      : selectedRuntimeControls.setSelectedSynthPitchBindingModes,
    setSelectedSynthPitchSettings: useProductRuntimePageSurfaces
      ? setProductSynthPitchSettings
      : selectedRuntimeControls.setSelectedSynthPitchSettings,
    setSelectedSynthStepOverrides: useProductRuntimePageSurfaces
      ? setProductSynthStepOverrides
      : selectedRuntimeControls.setSelectedSynthStepOverrides,
    setSelectedSynthSubLaneEnabled: useProductRuntimePageSurfaces
      ? setProductSynthSubLaneEnabled
      : selectedRuntimeControls.setSelectedSynthSubLaneEnabled,
    preloadSelectedAudioEngine: preloadProductRuntime,
    productRuntimeManualTriggers: pageManualTriggers,
    setSelectedDrumEvolveTriggerCallback: useProductRuntimePageSurfaces
      ? setProductDrumEvolveTriggerCallback
      : selectedRuntimeCallbacks.setSelectedDrumEvolveTriggerCallback,
    setSelectedDrumStepPositionCallback: useProductRuntimePageSurfaces
      ? setProductDrumStepPositionCallback
      : selectedRuntimeCallbacks.setSelectedDrumStepPositionCallback,
    setSelectedDrumTriggerCallback: useProductRuntimePageSurfaces
      ? setProductDrumTriggerCallback
      : selectedRuntimeCallbacks.setSelectedDrumTriggerCallback,
    setSelectedSynthEvolveTriggerCallback: useProductRuntimePageSurfaces
      ? setProductSynthEvolveTriggerCallback
      : selectedRuntimeCallbacks.setSelectedSynthEvolveTriggerCallback,
    setSelectedSynthAnchorWalkerVisualStateCallback: useProductRuntimePageSurfaces
      ? setProductSynthAnchorWalkerVisualStateCallback
      : selectedRuntimeCallbacks.setSelectedSynthAnchorWalkerVisualStateCallback,
    setSelectedSynthOrbitVisualStateCallback: useProductRuntimePageSurfaces
      ? setProductSynthOrbitVisualStateCallback
      : selectedRuntimeCallbacks.setSelectedSynthOrbitVisualStateCallback,
    setSelectedSynthStepPositionCallback: useProductRuntimePageSurfaces
      ? setProductSynthStepPositionCallback
      : selectedRuntimeCallbacks.setSelectedSynthStepPositionCallback,
  };

  const selectedPageRuntimeBridges = useSelectedAudioEnginePageRuntimeBridges(selectedOptions);

  return useMemo(() => ({
    ...selectedPageRuntimeBridges,
    synthPageRuntimeProps: {
      ...selectedPageRuntimeBridges.synthPageRuntimeProps,
      ...productSynthPageEvents,
    },
  }), [productSynthPageEvents, selectedPageRuntimeBridges]);
}
