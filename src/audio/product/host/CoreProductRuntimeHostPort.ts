import {
  setCoreProductDrumEvolveOverridesChangedCallback,
  setCoreProductSynthEvolveOverridesChangedCallback,
  setCoreProductSynthNoteRangeEvolvedCallback,
} from './CoreProductEvolveOverrideCallbackPortBridge';
import { callCoreProductHost } from './CoreProductHostInvoker';
import {
  resetCoreProductCofDrift,
  setCoreProductJourneyMorphClockCallback,
  startCoreProductJourneyMorphClock,
  stopCoreProductJourneyMorphClock,
} from './CoreProductJourneyMorphPortBridge';
import { setCoreProductLiveTriggerCallback } from './CoreProductLiveTriggerCallbackBridge';
import {
  setCoreProductDrumMorphRange,
  setCoreProductDrumParamSampleHoldRange,
  setCoreProductRuntimeWalkPositionsCallback,
  setCoreProductRuntimeWalkRanges,
  setCoreProductSampleHoldRanges,
} from './CoreProductModulationRangePortBridge';
import {
  auditionCoreProductSynthNote,
  postCoreProductEvent,
  pushCoreProductMidiMessage,
  registerCoreProductAsset,
  setCoreProductOutputGain,
  triggerCoreProductDrumVoice,
  unregisterCoreProductAsset,
  updateCoreProductSnapshotPatch,
} from './CoreProductRuntimeCommandPortBridge';
import {
  resumeCoreProductRuntime,
  startCoreProductRuntime,
  stopCoreProductRuntime,
  suspendCoreProductRuntime,
} from './CoreProductRuntimeLifecyclePortBridge';
import {
  readCoreProductCapabilityReport,
  readCoreProductDynamicsVisualTelemetry,
  readCoreProductRuntimeDiagnostics,
  readCoreProductState,
  readCoreProductTelemetry,
} from './CoreProductRuntimeReadPortBridge';
import {
  setCoreProductPerfMonitorEnabled,
  setCoreProductStateChangeCallback,
  setCoreProductTelemetryCallback,
  setCoreProductVisualTelemetryActive,
} from './CoreProductRuntimeTelemetryPortBridge';
import {
  setCoreProductDrumEuclidEvolveTriggerCallback,
  setCoreProductDrumStepPositionCallback,
  setCoreProductDrumTriggerCallback,
  setCoreProductSynthEuclidEvolveTriggerCallback,
  setCoreProductSynthStepPositionCallback,
} from './CoreProductSequencerCallbackPortBridge';
import { applyCoreProductSequencerUiPatch } from './CoreProductSequencerUiPatchBridge';
import type { ProductRuntimeCapabilityReport } from '../ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';
import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductDrumTriggerCallback,
  ProductDrumVoice,
  ProductDynamicsVisualTelemetry,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductEvolveOverridesCallback,
  ProductExternalState,
  ProductManualSynthNote,
  ProductMidiMessage,
  ProductRange,
  ProductRangeMap,
  ProductRuntimeWalkPositionsCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiPatch,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductSynthNoteRangeEvolvedCallback,
  ProductTelemetrySnapshot,
} from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this bound WebProductEngine host port
// with product-owned runtime APIs once the web adapter no longer binds Product
// host method bridges itself.
export const coreProductRuntimeHostPort = {
  start(initialState?: ProductEngineStartOptions['initialState']): Promise<void> {
    return startCoreProductRuntime(callCoreProductHost, initialState);
  },

  stop(): void {
    stopCoreProductRuntime(callCoreProductHost);
  },

  suspend(): Promise<void> {
    return suspendCoreProductRuntime(callCoreProductHost);
  },

  resume(): Promise<void> {
    return resumeCoreProductRuntime(callCoreProductHost);
  },

  setOutputGain(target: number, durationSeconds: number): void {
    setCoreProductOutputGain(callCoreProductHost, target, durationSeconds);
  },

  resetCofDrift(): void {
    resetCoreProductCofDrift(callCoreProductHost);
  },

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    updateCoreProductSnapshotPatch(callCoreProductHost, reason, patch);
  },

  postEvent(event: ProductEvent): void {
    postCoreProductEvent(callCoreProductHost, event);
  },

  pushMidiMessage(message: ProductMidiMessage): void {
    pushCoreProductMidiMessage(callCoreProductHost, message);
  },

  registerAsset(asset: ProductAssetRegistration): ProductAssetHandle {
    return registerCoreProductAsset(callCoreProductHost, asset);
  },

  unregisterAsset(assetId: number): void {
    unregisterCoreProductAsset(callCoreProductHost, assetId);
  },

  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void> {
    return auditionCoreProductSynthNote(callCoreProductHost, note, externalState);
  },

  triggerDrumVoice(voice: ProductDrumVoice, velocity: number, externalState?: ProductExternalState): Promise<void> {
    return triggerCoreProductDrumVoice(callCoreProductHost, voice, velocity, externalState);
  },

  readState(): ProductEngineState {
    return readCoreProductState(callCoreProductHost);
  },

  readTelemetry(): ProductTelemetrySnapshot | null {
    return readCoreProductTelemetry(callCoreProductHost);
  },

  readDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry {
    return readCoreProductDynamicsVisualTelemetry(callCoreProductHost);
  },

  readDiagnostics(): ProductRuntimeDiagnostics {
    return readCoreProductRuntimeDiagnostics(callCoreProductHost);
  },

  readCapabilityReport(): ProductRuntimeCapabilityReport {
    return readCoreProductCapabilityReport(callCoreProductHost);
  },

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    setCoreProductStateChangeCallback(callCoreProductHost, callback);
  },

  setTelemetryCallback(
    callback: ((telemetry: ProductTelemetrySnapshot) => void) | null,
    publishDiagnostics: () => void,
  ): void {
    setCoreProductTelemetryCallback(callCoreProductHost, callback, publishDiagnostics);
  },

  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void {
    setCoreProductDrumTriggerCallback(callCoreProductHost, callback);
  },

  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    setCoreProductDrumStepPositionCallback(callCoreProductHost, callback);
  },

  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    setCoreProductSynthStepPositionCallback(callCoreProductHost, callback);
  },

  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    setCoreProductDrumEuclidEvolveTriggerCallback(callCoreProductHost, callback);
  },

  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    setCoreProductSynthEuclidEvolveTriggerCallback(callCoreProductHost, callback);
  },

  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void {
    setCoreProductRuntimeWalkPositionsCallback(callCoreProductHost, callback);
  },

  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void {
    setCoreProductDrumMorphRange(callCoreProductHost, voice, range);
  },

  setDrumParamSHRange(key: string, range: ProductRange | null): void {
    setCoreProductDrumParamSampleHoldRange(callCoreProductHost, key, range);
  },

  setDualRanges(ranges: ProductRangeMap): void {
    setCoreProductSampleHoldRanges(callCoreProductHost, ranges);
  },

  setRuntimeWalkRanges(ranges: ProductRangeMap): void {
    setCoreProductRuntimeWalkRanges(callCoreProductHost, ranges);
  },

  setLiveTriggerCallback(
    name: Parameters<typeof setCoreProductLiveTriggerCallback>[1],
    callback: Parameters<typeof setCoreProductLiveTriggerCallback>[2],
  ): void {
    setCoreProductLiveTriggerCallback(callCoreProductHost, name, callback);
  },

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    setCoreProductJourneyMorphClockCallback(callCoreProductHost, callback);
  },

  startJourneyMorphClock(): void {
    startCoreProductJourneyMorphClock(callCoreProductHost);
  },

  stopJourneyMorphClock(): void {
    stopCoreProductJourneyMorphClock(callCoreProductHost);
  },

  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    setCoreProductDrumEvolveOverridesChangedCallback(callCoreProductHost, callback);
  },

  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    setCoreProductSynthEvolveOverridesChangedCallback(callCoreProductHost, callback);
  },

  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void {
    setCoreProductSynthNoteRangeEvolvedCallback(callCoreProductHost, callback);
  },

  applySequencerUiPatch(patch: ProductSequencerUiPatch): void {
    applyCoreProductSequencerUiPatch(callCoreProductHost, patch);
  },

  setPerfMonitorEnabled(enabled: boolean): void {
    setCoreProductPerfMonitorEnabled(callCoreProductHost, enabled);
  },

  setVisualTelemetryActive(active: boolean): void {
    setCoreProductVisualTelemetryActive(callCoreProductHost, active);
  },
};
