import { callCoreProductHost } from './CoreProductHostInvoker';
import { setCoreProductLiveTriggerCallback } from './CoreProductLiveTriggerCallbackBridge';
import { applyCoreProductSequencerUiPatch } from './CoreProductSequencerUiPatchBridge';
import type { DawOutputRoutingConfig } from '../../dawOutputRouting';
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
// with product-owned generated runtime APIs once the web adapter no longer binds
// Product host method names itself. Pure runtime forwarding stays inline here so
// production does not maintain duplicate one-method bridge modules.
export const coreProductRuntimeHostPort = {
  start(initialState?: ProductEngineStartOptions['initialState']): Promise<void> {
    return callCoreProductHost<Promise<void>>('start', initialState);
  },

  stop(): void {
    callCoreProductHost<void>('stop');
  },

  suspend(): Promise<void> {
    return callCoreProductHost<Promise<void>>('suspend');
  },

  resume(): Promise<void> {
    return callCoreProductHost<Promise<void>>('resume');
  },

  setOutputGain(target: number, durationSeconds: number): void {
    callCoreProductHost<void>('setOutputGain', target, durationSeconds);
  },

  setDawOutputRouting(config: DawOutputRoutingConfig): void {
    callCoreProductHost<void>('setDawOutputRouting', config);
  },

  setDawOutputDeviceId(deviceId: string | null): Promise<boolean> {
    return callCoreProductHost<Promise<boolean>>('setDawOutputDeviceId', deviceId);
  },

  resetCofDrift(): void {
    callCoreProductHost<void>('resetCofDrift');
  },

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    callCoreProductHost<void>('updateSnapshotPatch', reason, patch);
  },

  postEvent(event: ProductEvent): void {
    callCoreProductHost<void>('postProductEvent', event);
  },

  pushMidiMessage(message: ProductMidiMessage): void {
    callCoreProductHost<void>('pushMidiMessage', message);
  },

  registerAsset(asset: ProductAssetRegistration): ProductAssetHandle {
    callCoreProductHost<void>('registerAsset', asset);
    return { assetId: asset.assetId };
  },

  unregisterAsset(assetId: number): void {
    callCoreProductHost<void>('unregisterAsset', assetId);
  },

  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void> {
    return callCoreProductHost<Promise<void>>('auditionSynthNote', note, externalState);
  },

  triggerDrumVoice(voice: ProductDrumVoice, velocity: number, externalState?: ProductExternalState): Promise<void> {
    return callCoreProductHost<Promise<void>>('triggerDrumVoice', voice, velocity, externalState);
  },

  readState(): ProductEngineState {
    return callCoreProductHost<ProductEngineState>('getState');
  },

  readTelemetry(): ProductTelemetrySnapshot | null {
    return callCoreProductHost<ProductTelemetrySnapshot | null>('getProductTelemetry');
  },

  readDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry {
    return callCoreProductHost<ProductDynamicsVisualTelemetry>('getDynamicsVisualTelemetry');
  },

  readDiagnostics(): ProductRuntimeDiagnostics {
    return callCoreProductHost<ProductRuntimeDiagnostics>('getProductRuntimeDiagnostics');
  },

  readCapabilityReport(): ProductRuntimeCapabilityReport {
    return callCoreProductHost<ProductRuntimeCapabilityReport>('getCapabilityReport');
  },

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    callCoreProductHost<void>('setStateChangeCallback', callback);
  },

  setTelemetryCallback(
    callback: ((telemetry: ProductTelemetrySnapshot) => void) | null,
    publishDiagnostics: () => void,
  ): void {
    callCoreProductHost<void>('setProductTelemetryCallback', callback ? (telemetry: ProductTelemetrySnapshot) => {
      callback(telemetry);
      publishDiagnostics();
    } : null);
  },

  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void {
    callCoreProductHost<void>('setDrumTriggerCallback', callback);
  },

  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    callCoreProductHost<void>('setDrumStepPositionCallback', callback);
  },

  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    callCoreProductHost<void>('setSynthStepPositionCallback', callback);
  },

  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    callCoreProductHost<void>('setDrumEuclidEvolveTriggerCallback', callback);
  },

  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    callCoreProductHost<void>('setSynthEuclidEvolveTriggerCallback', callback);
  },

  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void {
    callCoreProductHost<void>('setRuntimeWalkPositionsCallback', callback);
  },

  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void {
    callCoreProductHost<void>('setDrumMorphRange', voice, range);
  },

  setDrumParamSHRange(key: string, range: ProductRange | null): void {
    callCoreProductHost<void>('setDrumParamSHRange', key, range);
  },

  setDualRanges(ranges: ProductRangeMap): void {
    callCoreProductHost<void>('setDualRanges', ranges);
  },

  setRuntimeWalkRanges(ranges: ProductRangeMap): void {
    callCoreProductHost<void>('setRuntimeWalkRanges', ranges);
  },

  setLiveTriggerCallback(
    name: Parameters<typeof setCoreProductLiveTriggerCallback>[1],
    callback: Parameters<typeof setCoreProductLiveTriggerCallback>[2],
  ): void {
    setCoreProductLiveTriggerCallback(callCoreProductHost, name, callback);
  },

  setGranularUiActive(active: boolean): void {
    callCoreProductHost<void>('setGranularUiActive', active);
  },

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    callCoreProductHost<void>('setJourneyMorphClockCallback', callback);
  },

  startJourneyMorphClock(): void {
    callCoreProductHost<void>('startJourneyMorphClock');
  },

  stopJourneyMorphClock(): void {
    callCoreProductHost<void>('stopJourneyMorphClock');
  },

  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    callCoreProductHost<void>('setDrumEvolveOverridesChangedCallback', callback);
  },

  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    callCoreProductHost<void>('setSynthEvolveOverridesChangedCallback', callback);
  },

  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void {
    callCoreProductHost<void>('setSynthNoteRangeEvolvedCallback', callback);
  },

  applySequencerUiPatch(patch: ProductSequencerUiPatch): void {
    applyCoreProductSequencerUiPatch(callCoreProductHost, patch);
  },

  setPerfMonitorEnabled(enabled: boolean): void {
    callCoreProductHost<void>('setPerfMonitorEnabled', enabled);
  },

  setVisualTelemetryActive(active: boolean): void {
    callCoreProductHost<void>('setVisualTelemetryActive', active);
  },
};
