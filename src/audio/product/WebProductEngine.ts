import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort';
import type { DawOutputRoutingConfig } from '../dawOutputRouting';
import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { ProductEnginePort } from './ProductEnginePort';
import type { ProductLiveNoteEvent } from './liveNoteEvents';
import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductDrumMorphCallback,
  ProductDrumParamSampleHoldCallback,
  ProductDrumTriggerCallback,
  ProductDrumVoice,
  ProductDynamicsVisualTelemetry,
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductEvolveOverridesCallback,
  ProductExternalState,
  ProductLeadDelayCallback,
  ProductLeadExpressionCallback,
  ProductLeadPairCallback,
  ProductManualSynthNote,
  ProductMidiMessage,
  ProductRange,
  ProductRangeMap,
  ProductRuntimeWalkPositionsCallback,
  ProductScalarCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSequencerUiPatch,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductSynthNoteRangeEvolvedCallback,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';

/**
 * Temporary web adapter over the Product Core host.
 *
 * TODO(product-core-web-adapter-burn-down): keep reducing this compatibility
 * layer until production code talks to generated ProductEvents, dirty Product
 * patches, telemetry, stems, and product-shaped asset APIs only. Do not
 * reintroduce legacy updateParams(), legacy-adapter-update patch reasons,
 * ignored patch reasons, raw Web Audio getters, or broad unsupported methods
 * here to paper over missing Product Core coverage. unregisterAsset is routed
 * through the product host and should remain product-shaped.
 */
export class WebProductEngine implements ProductEnginePort {
  readonly mode = 'core-product' as const;
  private lifecycleState: ProductEngineLifecycleState = 'cold';
  private diagnosticsCallback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null = null;
  private diagnosticsQueued = false;
  private diagnosticsPublishEpoch = 0;

  async preload(): Promise<void> {
    this.lifecycleState = this.lifecycleState === 'cold' ? 'ready' : this.lifecycleState;
  }

  async start(options?: ProductEngineStartOptions): Promise<void> {
    this.lifecycleState = 'loading';
    try {
      await coreProductRuntimeHostPort.start(options?.initialState);
      this.lifecycleState = 'running';
      this.publishDiagnostics();
    } catch (error) {
      this.lifecycleState = 'failed';
      throw error;
    }
  }

  stop(): Promise<void> {
    coreProductRuntimeHostPort.stop();
    this.lifecycleState = 'stopped';
    this.publishDiagnostics();
    return Promise.resolve();
  }

  suspend(): void {
    void coreProductRuntimeHostPort.suspend().then(() => {
      this.lifecycleState = 'suspended';
      this.publishDiagnostics();
    });
  }

  resume(): void {
    this.lifecycleState = 'loading';
    void coreProductRuntimeHostPort.resume().then(() => {
      this.lifecycleState = 'running';
      this.publishDiagnostics();
    }).catch((error: unknown) => {
      this.lifecycleState = 'failed';
      throw error;
    });
  }

  setOutputGain(target: number, durationSeconds: number = 0): void {
    coreProductRuntimeHostPort.setOutputGain(target, durationSeconds);
  }

  setDawOutputRouting(config: DawOutputRoutingConfig): void {
    coreProductRuntimeHostPort.setDawOutputRouting(config);
  }

  setDawOutputDeviceId(deviceId: string | null): Promise<boolean> {
    return coreProductRuntimeHostPort.setDawOutputDeviceId(deviceId);
  }

  resetCofDrift(): void {
    coreProductRuntimeHostPort.resetCofDrift();
  }

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    // TODO(product-core-control-routing-events): common controls should move to generated ProductEvents or dirty-diff paths.
    coreProductRuntimeHostPort.updateSnapshotPatch(reason, patch);
    this.scheduleDiagnosticsPublish();
  }

  enqueueEvent(event: ProductEvent): void {
    // Generated events are the preferred compatibility path; do not replace generated events with legacy parameter-update snapshots.
    coreProductRuntimeHostPort.postEvent(event);
    this.scheduleDiagnosticsPublish();
  }

  enqueueEvents(events: readonly ProductEvent[]): void {
    for (const event of events) {
      coreProductRuntimeHostPort.postEvent(event);
    }
    this.scheduleDiagnosticsPublish();
  }

  pushMidiMessage(message: ProductMidiMessage): void {
    coreProductRuntimeHostPort.pushMidiMessage(message);
  }

  enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void {
    coreProductRuntimeHostPort.enqueueLiveNoteEvent(event);
  }

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle> {
    const handle = coreProductRuntimeHostPort.registerAsset(asset);
    this.scheduleDiagnosticsPublish();
    return Promise.resolve(handle);
  }

  unregisterAsset(assetId: number): void {
    // Asset lifecycle stays product-shaped here; keep host failures visible.
    coreProductRuntimeHostPort.unregisterAsset(assetId);
    this.scheduleDiagnosticsPublish();
  }

  auditionSynthNote(note: ProductManualSynthNote, externalState?: ProductExternalState): Promise<void> {
    return coreProductRuntimeHostPort.auditionSynthNote(note, externalState);
  }

  triggerDrumVoice(voice: ProductDrumVoice, velocity: number = 0.8, externalState?: ProductExternalState): Promise<void> {
    return coreProductRuntimeHostPort.triggerDrumVoice(voice, velocity, externalState);
  }

  getLifecycleState(): ProductEngineLifecycleState {
    return this.lifecycleState;
  }

  getProductState(): ProductEngineState {
    return coreProductRuntimeHostPort.readState();
  }

  getTelemetry(): ProductTelemetrySnapshot | null {
    return coreProductRuntimeHostPort.readTelemetry();
  }

  getSequencerUiState(): ProductSequencerUiState | null {
    return this.getTelemetry()?.sequencerUiState ?? null;
  }

  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry {
    return coreProductRuntimeHostPort.readDynamicsVisualTelemetry();
  }

  getDiagnostics(): ProductRuntimeDiagnostics {
    return coreProductRuntimeHostPort.readDiagnostics();
  }

  getCapabilityReport(): ProductRuntimeCapabilityReport {
    return coreProductRuntimeHostPort.readCapabilityReport();
  }

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    coreProductRuntimeHostPort.setStateChangeCallback(callback);
  }

  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void {
    coreProductRuntimeHostPort.setTelemetryCallback(callback, () => this.scheduleDiagnosticsPublish());
  }

  setDrumTriggerCallback(callback: ProductDrumTriggerCallback | null): void {
    coreProductRuntimeHostPort.setDrumTriggerCallback(callback);
  }

  setDrumStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    coreProductRuntimeHostPort.setDrumStepPositionCallback(callback);
  }

  setSynthStepPositionCallback(callback: ProductSequencerStepPositionCallback | null): void {
    coreProductRuntimeHostPort.setSynthStepPositionCallback(callback);
  }

  setDrumEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    coreProductRuntimeHostPort.setDrumEuclidEvolveTriggerCallback(callback);
  }

  setSynthEuclidEvolveTriggerCallback(callback: ProductSequencerEvolveTriggerCallback | null): void {
    coreProductRuntimeHostPort.setSynthEuclidEvolveTriggerCallback(callback);
  }

  setRuntimeWalkPositionsCallback(callback: ProductRuntimeWalkPositionsCallback | null): void {
    coreProductRuntimeHostPort.setRuntimeWalkPositionsCallback(callback);
  }

  setDrumMorphRange(voice: ProductDrumVoice, range: ProductRange | null): void {
    coreProductRuntimeHostPort.setDrumMorphRange(voice, range);
  }

  setDrumParamSHRange(key: string, range: ProductRange | null): void {
    coreProductRuntimeHostPort.setDrumParamSHRange(key, range);
  }

  setDualRanges(ranges: ProductRangeMap): void {
    coreProductRuntimeHostPort.setDualRanges(ranges);
  }

  setRuntimeWalkRanges(ranges: ProductRangeMap): void {
    coreProductRuntimeHostPort.setRuntimeWalkRanges(ranges);
  }

  setLeadExpressionCallback(callback: ProductLeadExpressionCallback | null): void {
    this.setLiveTriggerCallback('leadExpression', callback);
  }

  setLeadMorphCallback(callback: ProductLeadPairCallback | null): void {
    this.setLiveTriggerCallback('leadMorph', callback);
  }

  setPadMorphTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('padMorph', callback);
  }

  setPad2MorphTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('pad2Morph', callback);
  }

  setLeadDistanceCallback(callback: ProductLeadPairCallback | null): void {
    this.setLiveTriggerCallback('leadDistance', callback);
  }

  setPadDistanceTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('padDistance', callback);
  }

  setPad2DistanceTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('pad2Distance', callback);
  }

  setPianoDistanceTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('pianoDistance', callback);
  }

  setLeadDelayCallback(callback: ProductLeadDelayCallback | null): void {
    this.setLiveTriggerCallback('leadDelay', callback);
  }

  setDrumMorphTriggerCallback(callback: ProductDrumMorphCallback | null): void {
    this.setLiveTriggerCallback('drumMorph', callback);
  }

  setDrumParamSHTriggerCallback(callback: ProductDrumParamSampleHoldCallback | null): void {
    this.setLiveTriggerCallback('drumParamSH', callback);
  }

  setGranularSHTriggerCallback(callback: ProductRuntimeWalkPositionsCallback | null): void {
    this.setLiveTriggerCallback('granularSH', callback);
  }

  setGranularUiActive(active: boolean): void {
    coreProductRuntimeHostPort.setGranularUiActive(active);
  }

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    coreProductRuntimeHostPort.setJourneyMorphClockCallback(callback);
  }

  startJourneyMorphClock(): void {
    coreProductRuntimeHostPort.startJourneyMorphClock();
  }

  stopJourneyMorphClock(): void {
    coreProductRuntimeHostPort.stopJourneyMorphClock();
  }

  setDrumEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    coreProductRuntimeHostPort.setDrumEvolveOverridesChangedCallback(callback);
  }

  setSynthEvolveOverridesChangedCallback(callback: ProductEvolveOverridesCallback | null): void {
    coreProductRuntimeHostPort.setSynthEvolveOverridesChangedCallback(callback);
  }

  setSynthNoteRangeEvolvedCallback(callback: ProductSynthNoteRangeEvolvedCallback | null): void {
    coreProductRuntimeHostPort.setSynthNoteRangeEvolvedCallback(callback);
  }

  applySequencerUiPatch(patch: ProductSequencerUiPatch): void {
    // TODO(product-core-sequencer-events): sequencer UI edits should continue through
    // Product patch/event bridges, not full snapshot reloads or legacy setters.
    coreProductRuntimeHostPort.applySequencerUiPatch(patch);
    this.scheduleDiagnosticsPublish();
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    coreProductRuntimeHostPort.setPerfMonitorEnabled(enabled);
  }

  setVisualTelemetryActive(active: boolean): void {
    coreProductRuntimeHostPort.setVisualTelemetryActive(active);
  }

  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void {
    this.diagnosticsCallback = callback;
    callback?.(this.getDiagnostics());
  }

  private setLiveTriggerCallback(
    name: Parameters<typeof coreProductRuntimeHostPort.setLiveTriggerCallback>[0],
    callback: Parameters<typeof coreProductRuntimeHostPort.setLiveTriggerCallback>[1],
  ): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback(name, callback);
  }

  private scheduleDiagnosticsPublish(): void {
    if (!this.diagnosticsCallback || this.diagnosticsQueued) return;
    this.diagnosticsQueued = true;
    const queuedEpoch = this.diagnosticsPublishEpoch;
    queueMicrotask(() => {
      this.diagnosticsQueued = false;
      if (queuedEpoch !== this.diagnosticsPublishEpoch) return;
      this.publishDiagnostics();
    });
  }

  private publishDiagnostics(): void {
    this.diagnosticsPublishEpoch += 1;
    this.diagnosticsCallback?.(this.getDiagnostics());
  }
}
