import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort';
import type { ProductRuntimeCapabilityReport } from './ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { ProductEnginePort } from './ProductEnginePort';
import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductSequencerUiPatch,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';

/**
 * Temporary web adapter over the Product Core host.
 *
 * TODO(product-core-burn-down): keep reducing this compatibility layer until
 * production code talks to generated ProductEvents, dirty Product patches,
 * telemetry, stems, and product-shaped asset APIs only. Do not reintroduce
 * legacy updateParams(), legacy-adapter-update patch reasons, ignored patch
 * reasons, raw Web Audio getters, or broad unsupported methods here to paper
 * over missing Product Core coverage. unregisterAsset is intentionally routed
 * through the product host and should remain product-shaped.
 */
export class WebProductEngine implements ProductEnginePort {
  readonly mode = 'core-product' as const;
  private lifecycleState: ProductEngineLifecycleState = 'cold';
  private diagnosticsCallback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null = null;

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

  resetCofDrift(): void {
    coreProductRuntimeHostPort.resetCofDrift();
  }

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    // TODO(product-core-burn-down): keep this on explicit Product patch reasons;
    // common controls should move to generated ProductEvents or dirty-diff paths.
    coreProductRuntimeHostPort.updateSnapshotPatch(reason, patch);
    this.publishDiagnostics();
  }

  enqueueEvent(event: ProductEvent): void {
    // TODO(product-core-burn-down): this is the preferred compatibility path;
    // do not replace generated events with legacy parameter-update snapshots.
    coreProductRuntimeHostPort.postEvent(event);
    this.publishDiagnostics();
  }

  enqueueEvents(events: readonly ProductEvent[]): void {
    for (const event of events) {
      this.enqueueEvent(event);
    }
  }

  pushMidiMessage(message: unknown): void {
    coreProductRuntimeHostPort.pushMidiMessage(message);
  }

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle> {
    const handle = coreProductRuntimeHostPort.registerAsset(asset);
    this.publishDiagnostics();
    return Promise.resolve(handle);
  }

  unregisterAsset(assetId: number): void {
    // TODO(product-core-burn-down): asset lifecycle stays product-shaped here;
    // do not paper over missing host support with broad unsupported-method throws.
    coreProductRuntimeHostPort.unregisterAsset(assetId);
    this.publishDiagnostics();
  }

  auditionSynthNote(note: unknown, externalState?: unknown): Promise<void> {
    return coreProductRuntimeHostPort.auditionSynthNote(note, externalState);
  }

  triggerDrumVoice(voice: unknown, velocity: number = 0.8, externalState?: unknown): Promise<void> {
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

  getDynamicsVisualTelemetry(): unknown {
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
    coreProductRuntimeHostPort.setTelemetryCallback(callback, () => this.publishDiagnostics());
  }

  setDrumTriggerCallback(callback: ((voice: unknown, velocity: number) => void) | null): void {
    coreProductRuntimeHostPort.setDrumTriggerCallback(callback);
  }

  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    coreProductRuntimeHostPort.setDrumStepPositionCallback(callback);
  }

  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    coreProductRuntimeHostPort.setSynthStepPositionCallback(callback);
  }

  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void {
    coreProductRuntimeHostPort.setDrumEuclidEvolveTriggerCallback(callback);
  }

  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void {
    coreProductRuntimeHostPort.setSynthEuclidEvolveTriggerCallback(callback);
  }

  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    coreProductRuntimeHostPort.setRuntimeWalkPositionsCallback(callback);
  }

  setDrumMorphRange(voice: unknown, range: { min: number; max: number } | null): void {
    coreProductRuntimeHostPort.setDrumMorphRange(voice, range);
  }

  setDrumParamSHRange(key: string, range: { min: number; max: number } | null): void {
    coreProductRuntimeHostPort.setDrumParamSHRange(key, range);
  }

  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    coreProductRuntimeHostPort.setDualRanges(ranges);
  }

  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    coreProductRuntimeHostPort.setRuntimeWalkRanges(ranges);
  }

  setLeadExpressionCallback(callback: ((expression: Record<string, number>) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('leadExpression', callback);
  }

  setLeadMorphCallback(callback: ((morph: { lead1: number; lead2: number }) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('leadMorph', callback);
  }

  setPadMorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('padMorph', callback);
  }

  setPad2MorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('pad2Morph', callback);
  }

  setLeadDistanceCallback(callback: ((distance: { lead1: number; lead2: number }) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('leadDistance', callback);
  }

  setPadDistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('padDistance', callback);
  }

  setPad2DistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('pad2Distance', callback);
  }

  setPianoDistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('pianoDistance', callback);
  }

  setLeadDelayCallback(callback: ((delay: Record<string, number | string>) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('leadDelay', callback);
  }

  setDrumMorphTriggerCallback(callback: ((voice: unknown, morphPosition: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('drumMorph', callback);
  }

  setDrumParamSHTriggerCallback(callback: ((voice: unknown, key: string, position: number) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('drumParamSH', callback);
  }

  setGranularSHTriggerCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    coreProductRuntimeHostPort.setLiveTriggerCallback('granularSH', callback);
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

  setDrumEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void {
    coreProductRuntimeHostPort.setDrumEvolveOverridesChangedCallback(callback);
  }

  setSynthEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void {
    coreProductRuntimeHostPort.setSynthEvolveOverridesChangedCallback(callback);
  }

  setSynthNoteRangeEvolvedCallback(callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null): void {
    coreProductRuntimeHostPort.setSynthNoteRangeEvolvedCallback(callback);
  }

  applySequencerUiPatch(patch: ProductSequencerUiPatch): void {
    // TODO(product-core-burn-down): sequencer UI edits should continue through
    // Product patch/event bridges, not full snapshot reloads or legacy setters.
    coreProductRuntimeHostPort.applySequencerUiPatch(patch);
    this.publishDiagnostics();
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

  private publishDiagnostics(): void {
    this.diagnosticsCallback?.(this.getDiagnostics());
  }
}
