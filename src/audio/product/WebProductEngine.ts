import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort';
import {
  ProductRuntimeLifecycleController,
  type ProductLifecycleOperation,
} from './lifecycle/ProductRuntimeLifecycleController';
import type { DawOutputRoutingConfig } from '../dawOutputRouting';
import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { ProductEnginePort } from './ProductEnginePort';
import type { ProductLiveNoteEvent } from './liveNoteEvents';
import { ProductDiagnosticsPublisher } from './ProductDiagnosticsPublisher';
import { ProductRuntimeScheduler } from './scheduling/ProductRuntimeScheduler';
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
  ProductPerfSnapshot,
  ProductRange,
  ProductRangeMap,
  ProductResolvedStateCommit,
  ProductResolvedStateCommitReceipt,
  ProductRuntimeWalkPositionsCallback,
  ProductScalarCallback,
  ProductSequencerEvolveTriggerCallback,
  ProductSequencerStepPositionCallback,
  ProductSimpleSequencerVisualPlanActive,
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductSynthNoteRangeEvolvedCallback,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';

const PRODUCT_EVENT_BATCH_SIZE = 24;
const PRODUCT_EVENT_BATCH_RETRY_MS = 40;

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
  private readonly pendingProductEvents: ProductEvent[] = [];
  private productEventFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly runtimeScheduler = new ProductRuntimeScheduler();
  private readonly lifecycleController = new ProductRuntimeLifecycleController({
    preloadRuntime: () => this.preloadRuntime(),
    startRuntime: () => this.startRuntime(),
    stopRuntime: () => this.stopRuntime(),
    suspendRuntime: () => this.suspendRuntime(),
    resumeRuntime: () => this.resumeRuntime(),
    publishState: (state, operation, error) => this.publishLifecycleState(state, operation, error),
  });
  private readonly diagnosticsPublisher = new ProductDiagnosticsPublisher(() => this.getDiagnostics(), this.runtimeScheduler);

  preload(): Promise<void> {
    return this.lifecycleController.preload();
  }

  start(options?: ProductEngineStartOptions): Promise<void> {
    this.pendingStartOptions = options;
    return this.lifecycleController.start();
  }

  stop(): Promise<void> {
    return this.lifecycleController.stop();
  }

  suspend(): Promise<void> {
    return this.lifecycleController.suspend();
  }

  resume(): Promise<void> {
    return this.lifecycleController.resume();
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

  async commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt> {
    const receipt = await coreProductRuntimeHostPort.commitResolvedState(commit);
    this.scheduleDiagnosticsPublish();
    return receipt;
  }

  getCommittedStateRevision(): number {
    return coreProductRuntimeHostPort.getCommittedStateRevision();
  }

  enqueueEvent(event: ProductEvent): void {
    // Generated events are the preferred compatibility path; do not replace generated events with legacy parameter-update snapshots.
    if (this.lifecycleState === 'running' && this.pendingProductEvents.length === 0) {
      coreProductRuntimeHostPort.postEvent(event);
    } else {
      this.pendingProductEvents.push(event);
      this.flushPendingProductEvents();
    }
    this.scheduleDiagnosticsPublish();
  }

  enqueueEvents(events: readonly ProductEvent[]): void {
    if (events.length === 0) return;
    if (
      events.length <= PRODUCT_EVENT_BATCH_SIZE &&
      this.lifecycleState === 'running' &&
      this.pendingProductEvents.length === 0
    ) {
      coreProductRuntimeHostPort.postEvents(events);
    } else {
      this.pendingProductEvents.push(...events);
      this.flushPendingProductEvents();
    }
    this.scheduleDiagnosticsPublish();
  }

  private canFlushPendingProductEvents(): boolean {
    return this.lifecycleState === 'running';
  }

  private schedulePendingProductEventFlush(): void {
    if (this.productEventFlushTimer !== null) return;
    this.productEventFlushTimer = setTimeout(() => {
      this.productEventFlushTimer = null;
      if (this.flushPendingProductEvents()) this.scheduleDiagnosticsPublish();
    }, PRODUCT_EVENT_BATCH_RETRY_MS);
  }

  private flushPendingProductEvents(): boolean {
    if (this.pendingProductEvents.length === 0 || !this.canFlushPendingProductEvents()) return false;
    const batch = this.pendingProductEvents.splice(0, PRODUCT_EVENT_BATCH_SIZE);
    if (batch.length === 1) {
      coreProductRuntimeHostPort.postEvent(batch[0]!);
    } else {
      coreProductRuntimeHostPort.postEvents(batch);
    }
    if (this.pendingProductEvents.length > 0) this.schedulePendingProductEventFlush();
    return true;
  }

  private clearPendingProductEventFlushTimer(): void {
    if (this.productEventFlushTimer === null) return;
    clearTimeout(this.productEventFlushTimer);
    this.productEventFlushTimer = null;
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

  requestTelemetryOnce(): void {
    coreProductRuntimeHostPort.requestTelemetryOnce();
  }

  getSequencerUiState(): ProductSequencerUiState | null {
    return this.getTelemetry()?.sequencerUiState ?? null;
  }

  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry {
    return coreProductRuntimeHostPort.readDynamicsVisualTelemetry();
  }

  getDiagnostics(): ProductRuntimeDiagnostics {
    return {
      ...coreProductRuntimeHostPort.readDiagnostics(),
      lastRejectedLifecycleTransitionReason: this.lifecycleController.lastRejectedTransitionReason,
    };
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

  setSynthOrbitVisualStateCallback(callback: ProductSynthOrbitVisualStateCallback | null): void {
    coreProductRuntimeHostPort.setSynthOrbitVisualStateCallback(callback);
  }

  setSynthAnchorWalkerVisualStateCallback(callback: ProductSynthAnchorWalkerVisualStateCallback | null): void {
    coreProductRuntimeHostPort.setSynthAnchorWalkerVisualStateCallback(callback);
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

  setSample1DistanceTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('sample1Distance', callback);
  }

  setSample2DistanceTriggerCallback(callback: ProductScalarCallback | null): void {
    this.setLiveTriggerCallback('sample2Distance', callback);
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

  setPerfMonitorEnabled(enabled: boolean): void {
    coreProductRuntimeHostPort.setPerfMonitorEnabled(enabled);
  }

  setPerfUpdateCallback(callback: ((data: ProductPerfSnapshot) => void) | null): void {
    coreProductRuntimeHostPort.setPerfUpdateCallback(callback);
  }

  setVisualTelemetryActive(active: boolean): void {
    coreProductRuntimeHostPort.setVisualTelemetryActive(active);
  }

  setSimpleSequencerVisualPlanActive(active: ProductSimpleSequencerVisualPlanActive): void {
    coreProductRuntimeHostPort.setSimpleSequencerVisualPlanActive(active);
  }

  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void {
    this.diagnosticsPublisher.setCallback(callback);
  }

  private setLiveTriggerCallback(
    name: Parameters<typeof coreProductRuntimeHostPort.setLiveTriggerCallback>[0],
    callback: Parameters<typeof coreProductRuntimeHostPort.setLiveTriggerCallback>[1],
  ): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback(name, callback);
  }

  private scheduleDiagnosticsPublish(): void {
    this.diagnosticsPublisher.schedule();
  }

  private publishDiagnostics(): void {
    this.diagnosticsPublisher.publish();
  }

  private pendingStartOptions: ProductEngineStartOptions | undefined;

  private async preloadRuntime(): Promise<void> {
    return Promise.resolve();
  }

  private async startRuntime(): Promise<void> {
    const options = this.pendingStartOptions;
    this.pendingStartOptions = undefined;
    await coreProductRuntimeHostPort.start(options?.initialState);
  }

  private async stopRuntime(): Promise<void> {
    await coreProductRuntimeHostPort.stop();
  }

  private async suspendRuntime(): Promise<void> {
    await coreProductRuntimeHostPort.suspend();
  }

  private async resumeRuntime(): Promise<void> {
    await coreProductRuntimeHostPort.resume();
  }

  private publishLifecycleState(
    state: ProductEngineLifecycleState,
    _operation: ProductLifecycleOperation,
    _error?: unknown,
  ): void {
    this.lifecycleState = state;
    if (state === 'running') {
      if (this.flushPendingProductEvents()) this.scheduleDiagnosticsPublish();
    } else if (state === 'disposed') {
      this.clearPendingProductEventFlushTimer();
      this.pendingProductEvents.length = 0;
    }
    this.publishDiagnostics();
  }
}
