import { callCoreProductHost } from './CoreProductHostInvoker';
import { setCoreProductLiveTriggerCallback } from './CoreProductLiveTriggerCallbackBridge';
import type { DawOutputRoutingConfig } from '../../dawOutputRouting';
import type { ProductRuntimeCapabilityReport } from '../ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';
import type { ProductLiveNoteEvent } from '../liveNoteEvents';
import type { ProductAssetHandle, ProductAssetRegistration, ProductDrumTriggerCallback, ProductDrumVoice, ProductDynamicsVisualTelemetry, ProductEngineStartOptions, ProductEngineState, ProductEvent, ProductEvolveOverridesCallback, ProductExternalState, ProductManualSynthNote, ProductMidiMessage, ProductPerfSnapshot, ProductRange, ProductRangeMap, ProductResolvedStateCommit, ProductResolvedStateCommitReceipt, ProductRuntimeWalkPositionsCallback, ProductSequencerEvolveTriggerCallback, ProductSequencerStepPositionCallback, ProductSimpleSequencerVisualPlanActive, ProductSnapshotPatch, ProductSnapshotPatchReason, ProductSynthAnchorWalkerVisualStateCallback, ProductSynthNoteRangeEvolvedCallback, ProductSynthOrbitVisualStateCallback, ProductTelemetrySnapshot } from '../ProductEngineTypes';

// TODO(product-core-burn-down): replace this bound WebProductEngine host port with product-owned
// generated runtime APIs once the web adapter no longer binds Product host method names itself.
type CoreProductRuntimeCallbackName =
  | 'stateChange'
  | 'drumTrigger'
  | 'drumStepPosition'
  | 'synthStepPosition'
  | 'synthOrbitVisualState'
  | 'synthAnchorWalkerVisualState'
  | 'drumEuclidEvolve'
  | 'synthEuclidEvolve'
  | 'runtimeWalkPositions'
  | 'journeyMorphClock'
  | 'drumEvolveOverrides'
  | 'synthEvolveOverrides'
  | 'synthNoteRangeEvolved';

const CORE_PRODUCT_RUNTIME_CALLBACK_METHODS: Record<CoreProductRuntimeCallbackName, string> = {
  stateChange: 'setStateChangeCallback',
  drumTrigger: 'setDrumTriggerCallback',
  drumStepPosition: 'setDrumStepPositionCallback',
  synthStepPosition: 'setSynthStepPositionCallback',
  synthOrbitVisualState: 'setSynthOrbitVisualStateCallback',
  synthAnchorWalkerVisualState: 'setSynthAnchorWalkerVisualStateCallback',
  drumEuclidEvolve: 'setDrumEuclidEvolveTriggerCallback',
  synthEuclidEvolve: 'setSynthEuclidEvolveTriggerCallback',
  runtimeWalkPositions: 'setRuntimeWalkPositionsCallback',
  journeyMorphClock: 'setJourneyMorphClockCallback',
  drumEvolveOverrides: 'setDrumEvolveOverridesChangedCallback',
  synthEvolveOverrides: 'setSynthEvolveOverridesChangedCallback',
  synthNoteRangeEvolved: 'setSynthNoteRangeEvolvedCallback',
};

function setCoreProductRuntimeCallback(name: CoreProductRuntimeCallbackName, callback: unknown): void {
  callCoreProductHost<void>(CORE_PRODUCT_RUNTIME_CALLBACK_METHODS[name], callback);
}

export const coreProductRuntimeHostPort = {
  start(initialState?: ProductEngineStartOptions['initialState']): Promise<void> {
    return callCoreProductHost<Promise<void>>('start', initialState);
  },

  primeAudioContext(): void {
    callCoreProductHost<void>('primeAudioContext');
  },

  stop(): Promise<void> { return Promise.resolve(callCoreProductHost<void>('stop')); },

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

  resetCofDrift(): void { callCoreProductHost<void>('resetCofDrift'); },

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    callCoreProductHost<void>('updateSnapshotPatch', reason, patch);
  },

  commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt> {
    return callCoreProductHost<Promise<ProductResolvedStateCommitReceipt>>('commitResolvedState', commit);
  },

  getCommittedStateRevision(): number {
    return callCoreProductHost<number>('getCommittedStateRevision');
  },

  postEvent(event: ProductEvent): void { callCoreProductHost<void>('postProductEvent', event); },

  postEvents(events: readonly ProductEvent[]): void {
    if (events.length === 0) return;
    callCoreProductHost<void>('postProductEvents', events);
  },

  pushMidiMessage(message: ProductMidiMessage): void {
    callCoreProductHost<void>('pushMidiMessage', message);
  },

  enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void {
    callCoreProductHost<void>('enqueueLiveNoteEvent', event);
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

  requestTelemetryOnce(): void {
    callCoreProductHost<void>('requestProductTelemetryOnce');
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
    setCoreProductRuntimeCallback('stateChange', callback);
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
    setCoreProductRuntimeCallback('drumTrigger', callback);
  },

  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    setCoreProductRuntimeCallback('drumStepPosition', callback);
  },

  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    setCoreProductRuntimeCallback('synthStepPosition', callback);
  },

  setSynthOrbitVisualStateCallback(callback: ProductSynthOrbitVisualStateCallback | null): void {
    setCoreProductRuntimeCallback('synthOrbitVisualState', callback);
  },

  setSynthAnchorWalkerVisualStateCallback(callback: ProductSynthAnchorWalkerVisualStateCallback | null): void {
    setCoreProductRuntimeCallback('synthAnchorWalkerVisualState', callback);
  },

  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    setCoreProductRuntimeCallback('drumEuclidEvolve', callback);
  },

  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    setCoreProductRuntimeCallback('synthEuclidEvolve', callback);
  },

  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void {
    setCoreProductRuntimeCallback('runtimeWalkPositions', callback);
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
    setCoreProductRuntimeCallback('journeyMorphClock', callback);
  },

  startJourneyMorphClock(): void {
    callCoreProductHost<void>('startJourneyMorphClock');
  },

  stopJourneyMorphClock(): void {
    callCoreProductHost<void>('stopJourneyMorphClock');
  },

  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    setCoreProductRuntimeCallback('drumEvolveOverrides', callback);
  },

  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    setCoreProductRuntimeCallback('synthEvolveOverrides', callback);
  },

  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void {
    setCoreProductRuntimeCallback('synthNoteRangeEvolved', callback);
  },

  setPerfMonitorEnabled(enabled: boolean): void {
    callCoreProductHost<void>('setPerfMonitorEnabled', enabled);
  },

  setPerfUpdateCallback(callback: ((data: ProductPerfSnapshot) => void) | null): void {
    callCoreProductHost<void>('setPerfUpdateCallback', callback);
  },

  setVisualTelemetryActive(active: boolean): void {
    callCoreProductHost<void>('setVisualTelemetryActive', active);
  },

  setSimpleSequencerVisualPlanActive(active: ProductSimpleSequencerVisualPlanActive): void {
    callCoreProductHost<void>('setSimpleSequencerVisualPlanActive', active);
  },
};
