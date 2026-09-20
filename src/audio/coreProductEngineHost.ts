import type { DynamicsVisualTelemetrySnapshot, ManualSynthNoteOptions } from './engineSharedTypes';
import type { LaneDirection } from './sequencerLaneDirection';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { ProductLiveNoteEvent } from './product/liveNoteEvents';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import type { CoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SEQUENCER_IDS, type CoreProductEvent, type CoreProductStepValueField, createCoreProductJourneyEvent, createCoreProductJourneyStateEvent, createCoreProductSequencerDiceEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSequencerPitchSettingEvents, createCoreProductSequencerResetHomeEvent } from './coreProductEvents';
import { type CoreProductAnchorWalkerVisualLaneState, type CoreProductOrbitVisualLaneState, type CoreProductTelemetrySnapshot, type CoreProductVisualTelemetrySnapshot } from './coreProductTelemetry';
import type { RuntimeFallbackClassification } from './CoreProductFallbackDiagnostics';
import { shouldForwardCoreProductRngDiffs, type SnapshotReloadReason } from './CoreProductRuntimeAdapter';
import { normalizeClockDivisionValue, type SequencerKind } from './CoreProductHostSequencerAdapter';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeToProductId } from './sequencerPitchBinding';
import type { SequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import { drumVoiceBaseMidiFromIndex } from './drumVoiceMidi';
import { getCoreProductSequencerLaneSwing, patchCoreProductSequencerLaneSwing } from './CoreProductHostSequencerSwing';
import { drumVoiceIndex, runtimeWalkConfigChanged, runtimeWalkConfigFromState } from './CoreProductHostRuntimeGuards';
import { CoreProductRuntime, type CoreProductGraphTapCaptureChunk } from './coreProductRuntime';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { coreProductSequencerClockRejoinMask, EMPTY_CORE_PRODUCT_SEQUENCER_CLOCK_REJOIN_MASK, hasCoreProductSequencerClockRejoin, type CoreProductSequencerClockRejoinMask } from './CoreProductHostSequencerClock';
import { CoreProductHostSequencerChain } from './CoreProductHostSequencerChain';
import { createCoreProductSequencerHomeStore } from './CoreProductHostSequencerHome';
import { createCoreProductHostMidiEvent, createCoreProductLiveNoteEvent } from './CoreProductHostMidi';
import { CoreProductAssetNotReadyError, CoreProductAssetRegistrar } from './product/host/CoreProductAssetRegistrar';
import { CoreProductDisplayCallbackRegistry } from './product/host/CoreProductDisplayCallbackRegistry';
import { CoreProductGraphTapBridge } from './product/host/CoreProductGraphTapBridge';
import { CoreProductHarmonyStateBridge } from './product/host/CoreProductHarmonyStateBridge';
import { CoreProductHostDebugSurface } from './product/host/CoreProductHostDebugSurface';
import { CoreProductHostDiagnostics } from './product/host/CoreProductHostDiagnostics';
import { createCoreProductEngineHostProxy } from './product/host/CoreProductHostProxy';
import { CoreProductJourneyMorphClock } from './product/host/CoreProductJourneyMorphClock';
import { CoreProductLeadPresetDataLoader } from './product/host/CoreProductLeadPresetDataLoader';
import { CoreProductModulationRangeBridge } from './product/host/CoreProductModulationRangeBridge';
import { CoreProductResolvedStateCommitService } from './product/host/CoreProductResolvedStateCommitService';
import { CoreProductStatePatchQueue, type CoreProductPatchApplyReceipt as ProductPatchApplyReceipt, type CoreProductStateApplyOptions } from './product/host/CoreProductStatePatchQueue';
import { snapshotReloadReasonForProductPatch } from './product/host/CoreProductPatchClassifier';
import { CoreProductSnapshotAckMetadataFactory } from './product/host/CoreProductSnapshotAckMetadata';
import { applyCoreProductSnapshotUpdate, loadCoreProductSnapshot } from './product/host/CoreProductSnapshotCoordinator';
import { createCoreProductHostSnapshot } from './product/host/CoreProductHostSnapshotFactory';
import { CoreProductSonicAutonomyTracker, createCoreProductPerfSnapshot, enrichCoreProductHostTelemetry, mergeCoreProductVisualTelemetry } from './product/host/CoreProductTelemetryAdapter';
import { createCoreProductEarthTextureDebugState } from './product/host/CoreProductEarthTextureDebug';
import { reconcileCoreProductSequencerUiState } from './product/host/CoreProductSequencerUiAdapter';
import { coreProductSequencerLaneCacheCount, createCoreProductSequencerCacheState, enabledCoreProductSequencerSubLanes, ensureCoreProductSequencerLaneCache, selectCoreProductSequencerCache, type CoreProductSequencerCacheState } from './product/host/CoreProductSequencerCacheBridge';
import { handleCoreProductSequencerControlEvent } from './product/host/CoreProductSequencerControlEventBridge';
import { CoreProductSequencerEvolveRuntimeBridge } from './product/host/CoreProductSequencerEvolveRuntimeBridge';
import { applyCoreProductManualSynthDice, armCoreProductSequencerManualDice, coreProductManualSynthDiceChanged, createCoreProductManualSynthDiceState, markCoreProductManualSynthDiceReady } from './product/host/CoreProductManualSynthDiceBridge';
import { captureCoreProductSequencerHomeLane } from './product/host/CoreProductSequencerHomeCaptureBridge';
import { applyCoreProductSequencerHomeCaptureEvent } from './product/host/CoreProductSequencerHomeCaptureEventBridge';
import { applyCoreProductSequencerEvolveConfigEvent } from './product/host/CoreProductSequencerEvolveConfigEventBridge';
import { restoreCoreProductSequencerLaneHome } from './product/host/CoreProductSequencerHomeRestoreBridge';
import { applyCoreProductSequencerLaneParamSet, patchCoreProductSequencerLaneAdapterParam, patchCoreProductSynthPitchBindingModeFromEvent } from './product/host/CoreProductSequencerLaneParamBridge';
import { CoreProductSequencerVisualBridge } from './product/host/CoreProductSequencerVisualBridge';
import { auditionCoreProductSynthNote, auditionCoreProductSynthNotes, triggerCoreProductDrumVoice, triggerCoreProductSynthVoice, type CoreProductManualAuditionContext } from './product/host/CoreProductManualAuditionBridge';
import { applyCoreProductSequencerPitchSettingEvent } from './product/host/CoreProductSequencerPitchSettingEventBridge';
import { applyCoreProductSynthStepOverrides } from './product/host/CoreProductSequencerStepOverrideBridge';
import { applyCoreProductDrumSequencerStepOverrideEvent } from './product/host/CoreProductSequencerStepOverrideEventBridge';
import { applyCoreProductSequencerStepEventToCache } from './product/host/CoreProductSequencerStepEventBridge';
import { applyCoreProductSequencerSubLaneEnabledEvent } from './product/host/CoreProductSequencerSubLaneEnabledEventBridge';
import { coreProductStepValueFieldEnabled, syncCoreProductSequencerStepState } from './product/host/CoreProductSequencerStepPostingBridge';
import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from './sequencerLaneCounts';
import type { ProductEngineState, ProductPerfSnapshot, ProductResolvedStateCommit, ProductResolvedStateCommitReceipt, ProductRuntimeModulationRangeMap, ProductSimpleSequencerVisualPlanActive, ProductSnapshotPatchReason } from './product/ProductEngineTypes';
import { createWebProductRuntimeCapabilityReport, type ProductRuntimeCapabilityReport } from './product/ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './product/ProductRuntimeDiagnostics';
import { CoreProductArrangementBridge } from './product/host/CoreProductArrangementBridge';
import { CoreProductPostSnapshotEventQueue } from './product/host/CoreProductPostSnapshotEventQueue';
import { CoreProductRealtimeInputBootstrap } from './product/host/CoreProductRealtimeInputBootstrap';
import { CoreProductRealtimeTimestampMapper } from './product/host/CoreProductRealtimeTimestampMapper';
import { CoreProductRuntimeEventBatcher } from './product/host/CoreProductRuntimeEventBatcher';
import { CoreProductTelemetryCallbackScheduler } from './product/host/CoreProductTelemetryCallbackScheduler';
import { CoreProductHostLifecycleCoordinator } from './product/host/CoreProductHostLifecycleCoordinator';
import { CoreProductGeneratedSequencerCaptureTelemetryHistory } from './product/host/CoreProductGeneratedSequencerCaptureTelemetryHistory';
import { productSamplePlaybackTriggerCriticalChange } from './product/host/CoreProductSamplePlaybackChange';
import { publishProductInteractionSignalSnapshot } from './productInteractionSignalStore';
import { publishProductInteractionEvents } from './productInteractionEventStore';
import type { BackgroundJourneyPlan } from './product/journey/compileBackgroundJourneyPlan';
import type { ProductBackgroundJourneyReadiness } from './product/ports/ProductJourneyPort';
import { CoreProductBackgroundJourneyCoordinator } from './product/host/CoreProductBackgroundJourneyCoordinator';
const PRODUCT_VISIBLE_SYNTH_LANE_COUNT = SYNTH_EUCLIDEAN_LANE_COUNT, PRODUCT_VISIBLE_DRUM_LANE_COUNT = DRUM_EUCLIDEAN_LANE_COUNT;
type SequencerLanePitchState = { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean };
class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private readonly graphTapBridge = new CoreProductGraphTapBridge(this.runtime);
  private readonly sequencerChain = new CoreProductHostSequencerChain({ post: (event) => this.postRuntimeProductEvent(event) });
  private readonly snapshotAckMetadata = new CoreProductSnapshotAckMetadataFactory();
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetRegistrar = new CoreProductAssetRegistrar(this.runtime, () => this.latestSliderState);
  private readonly arrangementBridge = new CoreProductArrangementBridge(
    (event) => this.postRuntimeProductEvent(event),
    () => this.runtime.audioContext,
    (name, ...payload) => this.invokeDisplayCallback(name, ...payload),
    (slotId, midi, velocity) => this.assetRegistrar.ensureSampleSlotAssetForNote(slotId, midi, velocity),
  );
  private readonly displayCallbacks = new CoreProductDisplayCallbackRegistry();
  private stateChangeCallback: ((state: ProductEngineState) => void) | null = null; private perfMonitorEnabled = false;
  private perfUpdateCallback: ((data: ProductPerfSnapshot) => void) | null = null; private latestProductSnapshot: CoreProductSnapshot | null = null;
  private adapterState: Record<string, unknown> = {};
  private readonly leadPresetDataLoader = new CoreProductLeadPresetDataLoader();
  private readonly modulationRangeBridge = new CoreProductModulationRangeBridge({
    isRuntimeReady: () => this.runtimeReady,
    latestProductSnapshot: () => this.latestProductSnapshot,
    latestSliderState: () => this.latestSliderState,
    post: (event) => this.postRuntimeProductEvent(event),
    hasCallback: (name) => this.displayCallbacks.has(name),
    publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload),
    reportUnsupportedRangeKey: (key) => this.diagnostics.reportUnsupportedRangeKey(key),
    applyRuntimeWalkStatePatch: (patch) => {
      this.arrangementBridge.setRuntimeWalkStatePatch(patch);
      if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState);
    },
  });
  private readonly debugSurface = new CoreProductHostDebugSurface({ engineMode: 'core-product', runtime: this.runtime, running: () => this.running, runtimeReady: () => this.runtimeReady, latestProductSnapshot: () => this.latestProductSnapshot, latestSliderState: () => this.latestSliderState, latestTelemetry: () => this.latestTelemetry, runtimeWalkDebug: () => this.modulationRangeBridge.getRuntimeWalkDebugState() });
  private synthSubLaneEnabled: Record<string, boolean>[] = Array.from({ length: PRODUCT_VISIBLE_SYNTH_LANE_COUNT }, () => ({}));
  private drumSubLaneEnabled: Record<string, boolean>[] = Array.from({ length: PRODUCT_VISIBLE_DRUM_LANE_COUNT }, () => ({}));
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null; private readonly sonicAutonomyTracker = new CoreProductSonicAutonomyTracker();
  private runtimeReady = false; private running = false;
  private readonly journeyMorphClock = new CoreProductJourneyMorphClock({ hasCallback: () => this.displayCallbacks.has('journeyMorphClock'), invoke: (now) => this.invokeDisplayCallback('journeyMorphClock', now), isDocumentVisible: () => this.isDocumentVisible(), nowMs: () => this.nowMs() });
  private readonly backgroundJourney = new CoreProductBackgroundJourneyCoordinator({ runtime: this.runtime, assets: this.assetRegistrar, telemetry: () => this.latestTelemetry, isDocumentVisible: () => this.isDocumentVisible(), post: (event) => this.postRuntimeProductEvent(event), stopLegacyMorphClock: () => this.journeyMorphClock.stop() });
  private readonly diagnostics = new CoreProductHostDiagnostics();
  private readonly statePatchQueue = new CoreProductStatePatchQueue({ latestSliderState: () => this.latestSliderState, applyProductState: (sliderState, reason, options) => this.applyProductState(sliderState, reason, options) });
  private readonly resolvedStateCommitService = new CoreProductResolvedStateCommitService({ diagnostics: this.diagnostics, applyProductStatePatch: (patch, reason, options) => this.applyProductStatePatch(patch, reason, options), postProductEvents: (events) => this.postProductEvents(events) });
  private readonly realtimeInputBootstrap = new CoreProductRealtimeInputBootstrap({ runtime: this.runtime, runtimeReady: () => this.runtimeReady, setRuntimeReady: (ready) => { this.runtimeReady = ready; }, loadLatestSnapshot: () => this.loadLatestSnapshot('runtime-bootstrap'), post: (event) => this.postRuntimeProductEvent(event), postMany: (events) => this.postRuntimeProductEvents(events) });
  private readonly realtimeTimestampMapper = new CoreProductRealtimeTimestampMapper();
  private sequencerTransportStartInFlight = false;
  private pendingSnapshotReloadReason: SnapshotReloadReason | null = null;
  private lastSequencerUiStateRevision = 0;
  private readonly sequencerCache: CoreProductSequencerCacheState = createCoreProductSequencerCacheState();
  private synthNoteRangeOverrides: ({ min: number; max: number } | null)[] = [null, null, null, null];
  private readonly sequencerHome = createCoreProductSequencerHomeStore();
  private readonly manualSynthDiceState = createCoreProductManualSynthDiceState();
  private readonly sequencerVisuals = new CoreProductSequencerVisualBridge({
    synthVisibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT,
    drumVisibleLaneCount: PRODUCT_VISIBLE_DRUM_LANE_COUNT,
    latestProductSnapshot: () => this.latestProductSnapshot,
    latestSliderState: () => this.latestSliderState,
    adapterState: () => this.adapterState,
    sequencerCache: () => this.sequencerCache,
    synthSubLaneEnabled: () => this.synthSubLaneEnabled,
    drumSubLaneEnabled: () => this.drumSubLaneEnabled,
    hasCallback: (name) => this.displayCallbacks.has(name),
    publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload),
  });
  private readonly productEventBatcher = new CoreProductRuntimeEventBatcher(this.runtime);
  private readonly telemetryCallbackScheduler = new CoreProductTelemetryCallbackScheduler();
  private mobileWebEvidenceTelemetryObserver: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
  private readonly postSnapshotEvents = new CoreProductPostSnapshotEventQueue({ canFlush: () => this.runtimeReady && this.runtime.audioContext?.state === 'running', post: (events) => this.postRuntimeProductEvents(events) });
  private readonly generatedSequencerCaptureTelemetryHistory = new CoreProductGeneratedSequencerCaptureTelemetryHistory();
  private readonly sequencerEvolveBridge = new CoreProductSequencerEvolveRuntimeBridge({ adapterState: () => this.adapterState, latestSliderState: () => this.latestSliderState, latestProductSnapshot: () => this.latestProductSnapshot, latestTelemetry: () => this.latestTelemetry, runtimeReady: () => this.runtimeReady, postWithHomeCapture: (event) => { this.captureSequencerHomeForEvent(event); this.postRuntimeProductEvent(event); } });
  private readonly harmonyStateBridge = new CoreProductHarmonyStateBridge();
  private readonly lifecycleCoordinator = new CoreProductHostLifecycleCoordinator({
    runtime: this.runtime,
    assetRegistrar: this.assetRegistrar,
    arrangementBridge: this.arrangementBridge,
    journeyMorphClock: this.journeyMorphClock,
    modulationRangeBridge: this.modulationRangeBridge,
    postSnapshotEvents: this.postSnapshotEvents,
    realtimeTimestampMapper: this.realtimeTimestampMapper,
    sequencerChain: this.sequencerChain,
    sequencerVisuals: this.sequencerVisuals,
    latestSliderState: () => this.latestSliderState,
    setLatestSliderState: (state) => { this.latestSliderState = state; },
    adapterState: () => this.adapterState,
    setLatestProductSnapshotNull: () => { this.latestProductSnapshot = null; },
    setRuntimeReady: (ready) => { this.runtimeReady = ready; },
    setRunning: (running) => { this.running = running; },
    resetSequencerEvolveState: () => this.resetSequencerEvolveState(),
    resetSynthNoteRangeOverrides: () => { this.synthNoteRangeOverrides = [null, null, null, null]; },
    updateRuntimeTelemetryPolling: () => this.updateRuntimeTelemetryPolling(),
    loadLatestSnapshot: (reason, includeClockStartDelay, awaitAudioThreadAck) => this.loadLatestSnapshot(reason, includeClockStartDelay, awaitAudioThreadAck),
    postRuntimeProductEvent: (event) => this.postRuntimeProductEvent(event), flushRuntimeProductEvents: () => this.productEventBatcher.flushWhenRuntimeRunning(),
    publishStateChange: (isRunning) => this.stateChangeCallback?.(this.createEngineState(isRunning)),
  });
  readonly engineMode = 'core-product';
  constructor() { this.runtime.setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry)); this.runtime.setVisualTelemetryCallback((telemetry) => this.handleVisualTelemetry(telemetry)); }
  getAudioContext(): AudioContext | null { return this.runtime.audioContext; }
  setOutputGain(target: number, durationSeconds = 0): void { this.runtime.setOutputGain(target, durationSeconds); }
  setDawOutputRouting(config: Parameters<CoreProductRuntime['setDawOutputRouting']>[0]): void { this.runtime.setDawOutputRouting(config); }
  setDawOutputDeviceId(deviceId: string | null): Promise<boolean> { return this.runtime.setDawOutputDeviceId(deviceId); }
  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot { return this.debugSurface.getDynamicsVisualTelemetry(); }
  getGranularActiveGrainCount(): number { return this.debugSurface.getGranularActiveGrainCount(); }
  getGranularVoicePositions(): [number, number, number, number] { return this.debugSurface.getGranularVoicePositions(); }
  getGranularWriteHeadPosition(): number { return this.debugSurface.getGranularWriteHeadPosition(); }
  getCurrentPadFilterFreq(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2FilterFreq ?? 0 : this.latestTelemetry?.pad1FilterFreq ?? 0; }
  getCurrentPadLfoValue(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2Lfo1Value ?? 0 : this.latestTelemetry?.pad1Lfo1Value ?? 0; }
  getSonicParityGraphTapId(trackId: string): number | null { return this.graphTapBridge.getTapId(trackId); }
  startSonicParityGraphCapture(trackId: string, chunkFrames: number): number { return this.graphTapBridge.startCapture(trackId, chunkFrames); }
  flushSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.graphTapBridge.flushCapture(tapId); }
  stopSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.graphTapBridge.stopCapture(tapId); }
  getSonicParityDebugState(): Record<string, unknown> { return this.debugSurface.getSonicParityDebugState(); }
  requestSonicParityTelemetry(): void { this.runtime.requestTelemetryOnce('manual'); }
  getTransportDebugState(): TransportDebugSnapshot | null {
    const transportDebug = this.debugSurface.getTransportDebugState();
    const arrangementDebug = this.arrangementBridge.getTransportDebugState();
    if (!transportDebug) return arrangementDebug ? ({
      effectiveBpm: 0,
      effectivePhraseSeconds: arrangementDebug.padChordPhraseSeconds ?? arrangementDebug.randomTimingPhraseSeconds ?? 0,
      nextPhraseBoundaryIn: arrangementDebug.nextPadChordBoundaryIn ?? arrangementDebug.nextRandomTimingBoundaryIn ?? 0,
      nextHarmonyEventIn: null,
      nextProgressionStepIn: null,
      ...arrangementDebug,
    }) : null;
    return arrangementDebug ? { ...transportDebug, ...arrangementDebug } : transportDebug;
  }
  private refreshUiHarmonySnapshot(): boolean { return this.harmonyStateBridge.refresh(this.createLatestArrangementState(), this.latestTelemetry); }
  private createEngineState(isRunning = this.running || this.latestTelemetry?.transportRunning === true): ProductEngineState {
    return this.harmonyStateBridge.createEngineState({
      isRunning,
      arrangementState: this.createLatestArrangementState(),
      telemetry: this.latestTelemetry,
      transportDebug: this.getTransportDebugState(),
    });
  }
  private publishStateIfHarmonyChanged(): void { if (this.refreshUiHarmonySnapshot()) this.stateChangeCallback?.(this.createEngineState()); }
  getState(): ProductEngineState { return this.createEngineState(); }
  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    this.stateChangeCallback = callback;
    this.updateRuntimeTelemetryPolling();
  }
  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
    this.runtime.setPerfMonitorEnabled(enabled);
    this.updateRuntimeTelemetryPolling();
    if (!enabled) {
      this.perfUpdateCallback?.({});
      return;
    }
    if (this.latestTelemetry) {
      this.perfUpdateCallback?.(createCoreProductPerfSnapshot(
        this.latestTelemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
      ));
    }
  }

  setPerfUpdateCallback(callback: ((data: ProductPerfSnapshot) => void) | null): void {
    this.perfUpdateCallback = callback;
    this.updateRuntimeTelemetryPolling();
    if (this.perfMonitorEnabled && this.latestTelemetry) {
      callback?.(createCoreProductPerfSnapshot(
        this.latestTelemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
      ));
    }
  }

  setVisualTelemetryActive(active: boolean): void {
    this.runtime.setVisualTelemetryActive(active);
  }
  setSimpleSequencerVisualPlanActive(active: ProductSimpleSequencerVisualPlanActive): void {
    this.runtime.setSimpleSequencerVisualPlanActive(active);
    this.arrangementBridge.setRuntimePlanCaptureEnabled(active);
  }
  setProductTelemetryCallback(callback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null): void {
    this.telemetryCallbackScheduler.setCallback(callback, this.latestTelemetry);
    this.updateRuntimeTelemetryPolling();
  }
  getProductTelemetry(): CoreProductTelemetrySnapshot | null {
    return this.latestTelemetry;
  }
  requestProductTelemetryOnce(): void {
    this.runtime.requestTelemetryOnce('manual');
  }
  requestProductVisualTelemetryAfterRender(): void { this.runtime.requestVisualTelemetryAfterRender(); }

  setMobileWebEvidenceTelemetryObserver(
    observer: ((telemetry: CoreProductTelemetrySnapshot) => void) | null,
  ): void {
    this.mobileWebEvidenceTelemetryObserver = observer;
  }

  getProductRuntimeDiagnostics(): ProductRuntimeDiagnostics {
    return this.diagnostics.snapshot();
  }

  getCapabilityReport(): ProductRuntimeCapabilityReport {
    return createWebProductRuntimeCapabilityReport(this.diagnostics.snapshot());
  }

  postProductEvent(event: CoreProductEvent): void {
    this.latestTelemetry = this.generatedSequencerCaptureTelemetryHistory.clearForEvent(event, this.latestTelemetry);
    if (this.handleSequencerUiProductEvent(event)) return;
    if (!this.runtimeReady) {
      throw new Error('Core Product runtime cannot enqueue product events before the product worklet is initialized');
    }
    this.postRuntimeProductEvent(event);
  }

  postProductEvents(events: readonly CoreProductEvent[]): void {
    if (events.length === 0) return;
    this.withRuntimeProductEventBatch(() => {
      for (const event of events) {
        this.postProductEvent(event);
      }
    });
  }

  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void {
    this.diagnostics.reportRuntimeFallback(method, classification);
  }

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: Record<string, unknown>): void {
    void this.applyProductStatePatch(patch, snapshotReloadReasonForProductPatch(reason));
  }

  commitResolvedState(commit: ProductResolvedStateCommit): Promise<ProductResolvedStateCommitReceipt> {
    return this.resolvedStateCommitService.commitResolvedState(commit);
  }

  getCommittedStateRevision(): number {
    return this.resolvedStateCommitService.getCommittedStateRevision();
  }

  private applyProductStatePatch(
    patch: Record<string, unknown>,
    fallbackReloadReason: SnapshotReloadReason,
    options?: CoreProductStateApplyOptions,
  ): Promise<ProductPatchApplyReceipt> {
    return this.statePatchQueue.apply(patch, fallbackReloadReason, options);
  }

  private async applyProductState(
    sliderState: Record<string, unknown>,
    fallbackReloadReason: SnapshotReloadReason,
    options?: CoreProductStateApplyOptions,
  ): Promise<ProductPatchApplyReceipt> {
    const previousSliderState = this.latestSliderState, previousWalkConfig = runtimeWalkConfigFromState(previousSliderState);
    this.latestSliderState = sliderState;
    const nextWalkConfig = runtimeWalkConfigFromState(this.latestSliderState);
    const sequencerClockRejoinMask = coreProductSequencerClockRejoinMask(previousSliderState, sliderState);
    this.adapterState = this.leadPresetDataLoader.syncPresetData(sliderState, this.adapterState);
    if (!this.running && !this.sequencerTransportStartInFlight && this.sequencerTransportRequested(sliderState)) {
      this.sequencerTransportStartInFlight = true;
      void this.start(sliderState)
        .catch((error) => {
          console.warn('Failed to start Product Core sequencer transport:', error);
        })
        .finally(() => {
          this.sequencerTransportStartInFlight = false;
        });
      return { applied: false, mode: 'deferred' };
    }
    const samplePlaybackCritical = this.running &&
      productSamplePlaybackTriggerCriticalChange(previousSliderState, this.latestSliderState);
    this.assetRegistrar.updateRequiredAssetsForState();
    const shouldRefreshAssetsAndAck =
      this.runtimeReady &&
      (this.assetRegistrar.hasMissingDefaultAssetsForState() || samplePlaybackCritical);
    if (shouldRefreshAssetsAndAck) {
      const assetResult = await this.assetRegistrar.ensureDefaultAssetsForState();
      if (assetResult.status === 'not-ready') throw new CoreProductAssetNotReadyError(assetResult);
      const receipt = await this.applyLatestSnapshotUpdate('asset-reference-change', sequencerClockRejoinMask, {
        ...options,
        triggerCritical: true,
        forceFullSnapshot: samplePlaybackCritical,
      });
      if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
      if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState);
      this.publishStateIfHarmonyChanged();
      return receipt;
    }
    if (options?.applyMode === 'event') {
      this.latestProductSnapshot = this.createLatestSnapshot();
      this.sequencerChain.update(this.latestSliderState, this.adapterState, this.sequencerChain.active(this.latestSliderState, this.adapterState));
      if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
      if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState);
      this.publishStateIfHarmonyChanged();
      return { applied: true, mode: 'event' };
    }
    const receipt = await this.applyLatestSnapshotUpdate(fallbackReloadReason, sequencerClockRejoinMask, options);
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
    if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState);
    this.publishStateIfHarmonyChanged();
    return receipt;
  }

  private sequencerTransportRequested(sliderState: Record<string, unknown>): boolean {
    return sliderState.drumEuclidMasterEnabled === true || sliderState.synthEuclideanMasterEnabled === true;
  }

  private setSequencerLaneParamSet(sequencer: SequencerKind, suffix: 'ClockDivision' | 'Swing', values: unknown[], paramId: number, mapValue: (value: unknown) => number): void { const events: CoreProductEvent[] = []; this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer, suffix, values, paramId, mapValue, runtimeReady: this.runtimeReady, post: (event) => events.push(event) }); this.postRuntimeProductEvents(events); }
  private setSequencerEuclidClockDivs(sequencer: SequencerKind, divs: unknown[]): void { this.setSequencerLaneParamSet(sequencer, 'ClockDivision', divs, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, (value) => normalizeClockDivisionValue(value, 16)); }
  private setSequencerEuclidSwings(sequencer: SequencerKind, swings: unknown[]): void { this.setSequencerLaneParamSet(sequencer, 'Swing', swings, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, (value) => normalizeSequencerSwing(value, 0)); }
  setSynthEuclidClockDivs(divs: unknown[]): void { this.setSequencerEuclidClockDivs('synth', divs); }
  setDrumEuclidClockDivs(divs: unknown[]): void { this.setSequencerEuclidClockDivs('drum', divs); }
  setSynthEuclidSwings(swings: unknown[]): void { this.setSequencerEuclidSwings('synth', swings); }
  setDrumEuclidSwings(swings: unknown[]): void { this.setSequencerEuclidSwings('drum', swings); }
  setSynthPitchBindingModes(modes: unknown[]): void {
    const source = Array.isArray(modes) ? modes : [];
    this.adapterState = {
      ...this.adapterState,
      synthPitchBindingModes: Array.from({ length: Math.max(4, Math.min(16, source.length || 4)) }, (_, index) => normalizeSequencerPitchBindingMode(source[index])),
    };
    this.syncSynthPitchBindingModes();
  }

  setSynthStepOverrides(overrides: unknown): void {
    const cache = selectCoreProductSequencerCache(this.sequencerCache, 'synth');
    const next = applyCoreProductSynthStepOverrides({
      overrides,
      previousToggles: cache.toggles,
      previousValues: cache.values,
      previousConfigs: cache.configs,
      visibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT,
      consumeManualDice: (laneIndex) => this.sequencerHome.consumeManualDiceIfReady('synth', laneIndex),
    });
    cache.toggles = next.toggles;
    cache.values = next.values;
    cache.configs = next.configs;
    for (const laneIndex of next.manualDiceCaptureLanes) this.captureSequencerHomeLane('synth', laneIndex, true);
    this.syncSequencerStepToggles('synth', true);
  }

  private drumLaneBaseMidi(laneIndex: number): number {
    const value = this.latestProductSnapshot?.drumLanes[laneIndex]?.midiNote;
    return typeof value === 'number' && Number.isFinite(value) ? value : drumVoiceBaseMidiFromIndex(laneIndex);
  }

  private resetSequencerEvolveState(): void {
    this.sequencerEvolveBridge.reset();
  }

  async start(sliderState?: Record<string, unknown>): Promise<void> {
    await this.lifecycleCoordinator.start(sliderState);
    this.latestProductSnapshot = this.createLatestSnapshot();
  }

  async preload(): Promise<void> { await this.runtime.ensureStarted(); this.runtimeReady = true; await this.loadLatestSnapshot('runtime-bootstrap', false, false); this.latestProductSnapshot = this.createLatestSnapshot(); }

  primeAudioContext(): void {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('parity') === '1') {
      document.documentElement.dataset.coreProductAudioPrime = 'requested';
      document.documentElement.dataset.coreProductUserActivation = navigator.userActivation?.isActive ? 'active' : 'inactive';
    }
    void this.runtime.resume().then(() => {
      this.runtimeReady = true; this.productEventBatcher.flushWhenRuntimeRunning();
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('parity') === '1') {
        document.documentElement.dataset.coreProductAudioPrime = 'ready';
      }
    }).catch((error: unknown) => {
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('parity') === '1') {
        document.documentElement.dataset.coreProductAudioPrime = 'error';
      }
      console.warn('Failed to prime Product Core audio context:', error);
    });
  }

  async resume(): Promise<void> {
    await this.lifecycleCoordinator.resume();
    this.latestProductSnapshot = this.createLatestSnapshot();
  }

  async suspend(): Promise<void> {
    await this.lifecycleCoordinator.suspend();
  }

  async stop(): Promise<void> {
    await this.lifecycleCoordinator.stop(this.runtimeReady);
  }

  dispose(): void {
    this.productEventBatcher.dispose(); this.lifecycleCoordinator.dispose(this.runtimeReady);
  }

  private isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  private updateRuntimeTelemetryPolling(): void {
    const runtime = this.runtime as CoreProductRuntime & {
      setTelemetryPollingEnabled?: (enabled: boolean) => void;
      setTelemetryTransportRunning?: (running: boolean) => void;
    };
    runtime.setTelemetryPollingEnabled?.(
      this.telemetryCallbackScheduler.hasCallback() ||
      this.stateChangeCallback !== null ||
      (this.perfMonitorEnabled && this.perfUpdateCallback !== null) ||
      this.displayCallbacks.has('synthStepPosition') || this.displayCallbacks.has('drumStepPosition')
    );
    runtime.setTelemetryTransportRunning?.(this.running);
  }

  private postRuntimeProductEvent(event: CoreProductEvent): void {
    this.latestTelemetry = this.generatedSequencerCaptureTelemetryHistory.clearForEvent(event, this.latestTelemetry);
    this.productEventBatcher.post(event);
  }

  private postRuntimeProductEvents(events: readonly CoreProductEvent[]): void {
    events.forEach((event) => {
      this.latestTelemetry = this.generatedSequencerCaptureTelemetryHistory.clearForEvent(event, this.latestTelemetry);
    });
    this.productEventBatcher.postMany(events);
  }

  private withRuntimeProductEventBatch<T>(operation: () => T): T {
    return this.productEventBatcher.run(operation);
  }

  ensureDrumSynth(sliderState?: Record<string, unknown>): void {
    if (sliderState) {
      this.latestSliderState = { ...sliderState };
    }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      void this.loadLatestSnapshot('runtime-bootstrap');
    });
  }

  resetCofDrift(): void {
    void this.loadLatestSnapshot('explicit-reset-request');
    this.stateChangeCallback?.(this.createEngineState());
  }

  resetSonicParityFx(): void {
    if (!this.runtimeReady) {
      throw new Error('Core Product runtime cannot reset FX before the product worklet is initialized');
    }
    this.runtime.resetParityFx();
  }

  setSeedLocked(locked: boolean): void {
    this.adapterState = { ...this.adapterState, seedLocked: locked };
  }

  triggerSynthVoice(
    voiceIndex: number,
    frequency: number,
    velocity: number,
    noteDuration = 0.18,
    padParamsOverride?: Record<string, unknown>,
  ): void {
    triggerCoreProductSynthVoice(this.manualAuditionContext(), voiceIndex, frequency, velocity, noteDuration, padParamsOverride);
  }
  async loadLeadPreset(slot: unknown, presetId: unknown): Promise<void> { await this.leadPresetDataLoader.loadLeadPreset(slot, presetId); }
  registerAsset(asset: DecodedCoreProductAsset): void { this.assetRegistrar.registerAsset(asset); }
  unregisterAsset(assetId: number): void { this.assetRegistrar.unregisterAsset(assetId); }
  async prepareSceneAssets(states: readonly Record<string, unknown>[]): Promise<void> { const result = await this.assetRegistrar.ensureSceneAssets(states); if (result.status === 'not-ready') throw new CoreProductAssetNotReadyError(result); }
  clearSceneAssets(): void { this.assetRegistrar.clearSceneAssets(); }
  async prepareBackgroundJourney(plan: BackgroundJourneyPlan, states: readonly Record<string, unknown>[]): Promise<ProductBackgroundJourneyReadiness> { return this.backgroundJourney.prepare(plan, states); }
  startBackgroundJourney(revision: number): boolean { return this.backgroundJourney.start(revision); }
  stopBackgroundJourney(): void { this.backgroundJourney.stop(); }
  discardBackgroundJourney(): void { this.backgroundJourney.discard(); }
  getBackgroundJourneyReadiness(): ProductBackgroundJourneyReadiness { return this.backgroundJourney.getReadiness(); }
  estimateBackgroundJourneyAssets(states: readonly Record<string, unknown>[]): { complete: boolean; decodedBytes: number; sharedAssetReuse: number } { return this.backgroundJourney.estimateAssets(states); }
  pushMidiMessage(message: KesshoMidiMessage): void {
    const event = createCoreProductHostMidiEvent(message, this.realtimeTimestampMapper.midiContext(message, this.runtime.audioContext));
    this.realtimeInputBootstrap.postWhenReady(event, 'midi');
  }
  enqueueRealtimeEvent(event: CoreProductEvent): Promise<void> { return this.realtimeInputBootstrap.postWhenReadyAsync(event); }
  enqueueRealtimeEvents(events: readonly CoreProductEvent[]): Promise<void> { return this.realtimeInputBootstrap.postManyWhenReadyAsync(events); }
  async enqueueLiveNoteEvent(event: ProductLiveNoteEvent): Promise<void> { const productEvent = createCoreProductLiveNoteEvent(event, this.realtimeTimestampMapper.liveNoteContext(event, this.runtime.audioContext)); await this.realtimeInputBootstrap.postWhenReadyAsync(productEvent); }
  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void { this.setDisplayCallback('runtimeWalkPositions', callback); callback?.(this.modulationRangeBridge.getRuntimeWalkPositions()); }
  setDrumMorphRange(voice: unknown, range: { min: number; max: number } | null): void {
    const voiceIndex = drumVoiceIndex(voice);
    this.modulationRangeBridge.setDrumMorphRange(voiceIndex, range);
  }
  setDrumParamSHRange(key: string, range: { min: number; max: number } | null): void {
    this.modulationRangeBridge.setDrumParamSampleHoldRange(key, range);
  }
  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.modulationRangeBridge.setSampleHoldRanges(ranges);
  }
  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.modulationRangeBridge.setRuntimeWalkRanges(ranges);
  }
  setRuntimeModulationRanges(ranges: ProductRuntimeModulationRangeMap): void {
    this.modulationRangeBridge.setRuntimeModulationRanges(ranges);
  }
  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    this.setDisplayCallback('journeyMorphClock', callback);
    if (!callback) this.stopJourneyMorphClock();
  }
  setLeadExpressionCallback(callback: ((expression: { lead1: number; lead2: number }) => void) | null): void { this.setDisplayCallback('leadExpression', callback); }
  setLeadMorphCallback(callback: ((morph: { lead1: number; lead2: number }) => void) | null): void { this.setDisplayCallback('leadMorph', callback); }
  setPadMorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void { this.setDisplayCallback('padMorph', callback); }
  setPad2MorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void { this.setDisplayCallback('pad2Morph', callback); }
  setLeadDistanceCallback(callback: ((distance: { lead1: number; lead2: number }) => void) | null): void { this.setDisplayCallback('leadDistance', callback); }
  setPadDistanceTriggerCallback(callback: ((distance: number) => void) | null): void { this.setDisplayCallback('padDistance', callback); }
  setPad2DistanceTriggerCallback(callback: ((distance: number) => void) | null): void { this.setDisplayCallback('pad2Distance', callback); }
  setPianoDistanceTriggerCallback(callback: ((distance: number) => void) | null): void { this.setDisplayCallback('pianoDistance', callback); }
  setSample1DistanceTriggerCallback(callback: ((distance: number) => void) | null): void { this.setDisplayCallback('sample1Distance', callback); }
  setSample2DistanceTriggerCallback(callback: ((distance: number) => void) | null): void { this.setDisplayCallback('sample2Distance', callback); }
  setLeadDelayCallback(callback: ((delay: { lead1: string; lead2: string }) => void) | null): void { this.setDisplayCallback('leadDelay', callback); }
  setDrumTriggerCallback(callback: ((voice: unknown, velocity: number) => void) | null): void { this.setDisplayCallback('drumTrigger', callback); }
  setDrumMorphTriggerCallback(callback: ((voice: unknown, morphPosition: number) => void) | null): void { this.setDisplayCallback('drumMorph', callback); }
  setDrumParamSHTriggerCallback(callback: ((voice: unknown, key: string, position: number) => void) | null): void { this.setDisplayCallback('drumParamSH', callback); }
  setGranularSHTriggerCallback(callback: ((positions: Record<string, number>) => void) | null): void { this.setDisplayCallback('granularSH', callback); }
  setDrumEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void { this.setDisplayCallback('drumEvolveOverrides', callback); }
  setSynthEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void { this.setDisplayCallback('synthEvolveOverrides', callback); }
  setSynthNoteRangeEvolvedCallback(callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null): void { this.setDisplayCallback('synthNoteRangeEvolved', callback); }
  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void { this.setDisplayCallback('drumStepPosition', callback); this.sequencerVisuals.publishStepCallbackRegistration(callback, this.running, this.latestTelemetry, PRODUCT_VISIBLE_DRUM_LANE_COUNT); }
  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null): void { this.setDisplayCallback('synthStepPosition', callback); this.sequencerVisuals.publishStepCallbackRegistration(callback, this.running, this.latestTelemetry, PRODUCT_VISIBLE_SYNTH_LANE_COUNT); }
  setSynthOrbitVisualStateCallback(callback: ((lanes: Array<CoreProductOrbitVisualLaneState | null>) => void) | null): void { this.setDisplayCallback('synthOrbitVisualState', callback); callback?.(this.sequencerVisuals.currentSynthOrbitVisualState(this.running ? this.latestTelemetry : null)); }
  setSynthAnchorWalkerVisualStateCallback(callback: ((lanes: Array<CoreProductAnchorWalkerVisualLaneState | null>) => void) | null): void { this.setDisplayCallback('synthAnchorWalkerVisualState', callback); callback?.(this.sequencerVisuals.currentSynthAnchorWalkerVisualState(this.latestTelemetry)); }
  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('drumEuclidEvolve', callback); }
  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('synthEuclidEvolve', callback); }
  setGranularUiActive(active: boolean): void { this.displayCallbacks.setValue('granularUiActive', active); this.runtime.setGranularWaveformTelemetryActive(active); }
  async triggerDrumVoice(voice: unknown, velocity: number, externalState?: Record<string, unknown>): Promise<void> { await triggerCoreProductDrumVoice(this.manualAuditionContext(), voice, velocity, externalState); }
  resetSynthEuclidLaneHome(laneIndex: number): void { this.postProductEvent(createCoreProductSequencerResetHomeEvent('synth', laneIndex)); }

  diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void { this.postProductEvent(createCoreProductSequencerDiceEvent('synth', laneIndex, intensity)); }

  resetDrumEuclidLaneHome(laneIndex: number): void { this.postProductEvent(createCoreProductSequencerResetHomeEvent('drum', laneIndex)); }

  diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void { this.postProductEvent(createCoreProductSequencerDiceEvent('drum', laneIndex, intensity)); }

  startJourneyMorphClock(): void {
    if (!this.journeyMorphClock.start()) return;
    const phase = this.latestTelemetry?.journeyMorphPhase ?? 0;
    this.adapterState = {
      ...this.adapterState,
      journeyEnabled: true,
      journeyMorphPhase: phase,
    };
    this.postSequencerControlEvent(createCoreProductJourneyEvent(true));
    this.postSequencerControlEvent(createCoreProductJourneyStateEvent(true, phase));
    this.journeyMorphClock.scheduleTick();
  }

  stopJourneyMorphClock(): void {
    this.journeyMorphClock.stop();
    this.adapterState = {
      ...this.adapterState,
      journeyEnabled: false,
      journeyMorphPhase: this.latestTelemetry?.journeyMorphPhase ?? 0,
    };
    this.postSequencerControlEvent(createCoreProductJourneyEvent(false));
    this.postSequencerControlEvent(createCoreProductJourneyStateEvent(false, this.latestTelemetry?.journeyMorphPhase ?? 0));
  }

  async auditionSynthNote(
    note: ManualSynthNoteOptions,
    externalState?: Record<string, unknown>,
  ): Promise<void> {
    await auditionCoreProductSynthNote(this.manualAuditionContext(), note, externalState);
  }

  async auditionSynthNotes(
    notes: ManualSynthNoteOptions[],
    externalState?: Record<string, unknown>,
  ): Promise<void> {
    await auditionCoreProductSynthNotes(this.manualAuditionContext(), notes, externalState);
  }

  private manualAuditionContext(): CoreProductManualAuditionContext {
    return {
      runtime: this.runtime,
      assetRegistrar: this.assetRegistrar,
      latestSliderState: () => this.latestSliderState,
      setLatestSliderState: (state) => { this.latestSliderState = state; },
      latestProductSnapshot: () => this.latestProductSnapshot,
      runtimeReady: () => this.runtimeReady,
      setRuntimeReady: (ready) => { this.runtimeReady = ready; },
      applyProductStatePatch: (patch) => this.applyProductStatePatch(patch, snapshotReloadReasonForProductPatch('ui-control-change')),
      applyLatestSnapshotUpdate: (reason) => this.applyLatestSnapshotUpdate(reason),
      recordSoundTrigger: () => this.resolvedStateCommitService.recordSoundTrigger(),
      publish: (name, ...args) => this.invokeDisplayCallback(name, ...args),
    };
  }

  private async loadLatestSnapshot(reason: SnapshotReloadReason = 'product-patch', includeClockStartDelay = reason === 'runtime-start', awaitAudioThreadAck = false): Promise<void> {
    if (!this.runtimeReady) return;
    const metadata = awaitAudioThreadAck ? this.snapshotAckMetadata.create(reason, true) : undefined;
    const result = await loadCoreProductSnapshot({
      runtime: this.runtime,
      snapshot: this.createLatestSnapshot(includeClockStartDelay),
      reason,
      metadata,
      awaitAudioThreadAck,
      nowMs: () => this.nowMs(),
      afterLoad: () => this.afterProductSnapshotLoad(),
    });
    this.latestProductSnapshot = result.snapshot;
    this.sequencerChain.update(this.latestSliderState, this.adapterState, true);
    this.sequencerEvolveBridge.syncAll();
    this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs);
  }

  private applyLatestSnapshotUpdate(
    reason: SnapshotReloadReason = 'product-patch',
    sequencerClockRejoinMask: CoreProductSequencerClockRejoinMask = EMPTY_CORE_PRODUCT_SEQUENCER_CLOCK_REJOIN_MASK,
    options?: CoreProductStateApplyOptions,
  ): Promise<ProductPatchApplyReceipt> {
    if (!this.runtimeReady) return Promise.resolve({ applied: false, mode: 'deferred' });
    const applyOptions = options ?? {};
    const awaitAudioThreadAck = applyOptions.triggerCritical === true;
    const metadata = typeof applyOptions.revision === 'number'
      ? this.snapshotAckMetadata.create(applyOptions.commitReason ?? reason, awaitAudioThreadAck, applyOptions.revision)
      : awaitAudioThreadAck ? this.snapshotAckMetadata.create(reason, true) : undefined;
    return applyCoreProductSnapshotUpdate({
      runtime: this.runtime,
      previousSnapshot: this.latestProductSnapshot,
      nextSnapshot: this.createLatestSnapshot(hasCoreProductSequencerClockRejoin(sequencerClockRejoinMask)),
      fallbackReloadReason: reason,
      pendingReloadReason: this.pendingSnapshotReloadReason,
      forceFullSnapshot: applyOptions.forceFullSnapshot,
      sequencerClockRejoinMask,
      forwardRngDiffs: shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry),
      metadata,
      awaitAudioThreadAck,
      nowMs: () => this.nowMs(),
      afterFullSnapshotLoad: () => this.afterProductSnapshotLoad(),
    }).then((result): ProductPatchApplyReceipt => {
      this.latestProductSnapshot = result.snapshot;
      this.pendingSnapshotReloadReason = null;
      this.sequencerChain.update(this.latestSliderState, this.adapterState, result.mode === 'full-snapshot' || this.sequencerChain.active(this.latestSliderState, this.adapterState));
      this.sequencerEvolveBridge.syncAll();
      if (result.mode === 'dirty-diff') {
        this.diagnostics.recordDirtyDiff();
        return { applied: true, mode: 'dirty-diff' };
      }
      this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs);
      return {
        applied: true,
        mode: 'full-snapshot',
        audioThreadApplied: result.receipt?.applied === true,
        ...(result.receipt?.encodedSnapshotHash ? { encodedSnapshotHash: result.receipt.encodedSnapshotHash } : {}),
        ...(result.receipt?.workletSourceSummaryHash ? { workletSourceSummaryHash: result.receipt.workletSourceSummaryHash } : {}),
        ...(typeof result.receipt?.appliedAtFrame === 'number' ? { appliedAtFrame: result.receipt.appliedAtFrame } : {}),
      };
    });
  }

  private afterProductSnapshotLoad(): void {
    const events: CoreProductEvent[] = [];
    this.collectSequencerStepToggles(events);
    this.collectSynthPitchBindingModeEvents(events);
    this.collectSequencerPitchSettingEvents(events);
    this.queuePostSnapshotEvents(events);
  }

  private queuePostSnapshotEvents(events: readonly CoreProductEvent[]): void {
    this.postSnapshotEvents.queue(events);
  }
  flushPostSnapshotEventQueue(): void { this.postSnapshotEvents.flush(); }
  private nowMs(): number { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }

  private createLatestSnapshot(includeClockStartDelay = false): CoreProductSnapshot {
    return createCoreProductHostSnapshot({
      latestSliderState: this.latestSliderState,
      adapterState: this.adapterState,
      journeyMorphClockRunning: this.journeyMorphClock.running,
      latestTelemetry: this.latestTelemetry,
      running: this.running,
    }, includeClockStartDelay);
  }

  private createLatestArrangementState(): Record<string, unknown> | null { return this.arrangementBridge.createState(this.latestSliderState, this.adapterState); }
  private handleTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
    const hostTelemetry = this.generatedSequencerCaptureTelemetryHistory.withHistory(this.withHostDiagnostics(telemetry));
    this.latestTelemetry = hostTelemetry; this.arrangementBridge.syncTransportTelemetry(hostTelemetry);
    if (this.journeyMorphClock.running && typeof hostTelemetry.journeyMorphPhase === 'number') {
      this.adapterState = {
        ...this.adapterState,
        journeyEnabled: true,
        journeyMorphPhase: hostTelemetry.journeyMorphPhase,
      };
    }
    this.journeyMorphClock.syncAfterTelemetry();
    const documentVisible = this.isDocumentVisible();
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry, {
      publish: documentVisible,
    });
    if (documentVisible) this.modulationRangeBridge.updateSampleHoldTriggerFeedback(hostTelemetry);
    this.reconcileSequencerUiState(hostTelemetry);
    if (documentVisible) this.sequencerVisuals.updateMorphFeedback(hostTelemetry);
    hostTelemetry.sampleHoldDebug = this.modulationRangeBridge.getSampleHoldDebugState();
    this.mobileWebEvidenceTelemetryObserver?.(hostTelemetry);
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.telemetryCallbackScheduler.schedule(hostTelemetry);
    if (documentVisible) {
      this.sequencerVisuals.publish(hostTelemetry);
    }
    if (this.perfMonitorEnabled && documentVisible) {
      this.perfUpdateCallback?.(createCoreProductPerfSnapshot(
        hostTelemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
      ));
    }
  }

  private handleVisualTelemetry(telemetry: CoreProductVisualTelemetrySnapshot): void {
    if (!this.isDocumentVisible()) return;
    publishProductInteractionSignalSnapshot(telemetry.interactionSignals); publishProductInteractionEvents(telemetry.interactionEvents);
    const merged = mergeCoreProductVisualTelemetry(this.latestTelemetry, telemetry, this.running);
    const hostTelemetry = this.withHostDiagnostics(merged);
    this.latestTelemetry = hostTelemetry;
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry);
    this.modulationRangeBridge.updateSampleHoldTriggerFeedback(hostTelemetry);
    this.sequencerVisuals.updateMorphFeedback(hostTelemetry);
    hostTelemetry.sampleHoldDebug = this.modulationRangeBridge.getSampleHoldDebugState();
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.sequencerVisuals.publish(hostTelemetry);
  }
  private tickSequencerEvolveClock(hostTelemetry: CoreProductTelemetrySnapshot): void {
    this.sequencerEvolveBridge.tick(hostTelemetry);
  }

  private captureSequencerHomeForEvent(event: CoreProductEvent): void { const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null; const laneIndex = typeof event.index === 'number' ? event.index : -1; if (sequencer) this.captureSequencerHomeLane(sequencer, laneIndex); }
  private sequencerCacheState(): CoreProductSequencerCacheState { return this.sequencerCache; }
  private armSequencerManualDice(sequencer: SequencerKind, laneIndex: number): void {
    armCoreProductSequencerManualDice({ state: this.manualSynthDiceState, sequencer, laneIndex, cache: this.sequencerCacheState(), arm: (diceSequencer, diceLaneIndex) => this.sequencerHome.armManualDice(diceSequencer, diceLaneIndex) });
  }

  private markManualSynthDiceReady(laneIndex: number): void { markCoreProductManualSynthDiceReady(this.manualSynthDiceState, laneIndex, (readyLaneIndex) => this.sequencerHome.markManualDiceReady('synth', readyLaneIndex)); }
  private applyManualSynthDice(laneIndex: number, intensity: number): boolean {
    ensureCoreProductSequencerLaneCache(this.sequencerCacheState(), 'synth', laneIndex);
    return applyCoreProductManualSynthDice({ state: this.manualSynthDiceState, laneIndex, intensity, cache: this.sequencerCacheState(), adapterState: this.adapterState, latestSliderState: this.latestSliderState, latestProductSnapshot: this.latestProductSnapshot, latestTelemetry: this.latestTelemetry, enabledSubLanes: this.enabledSequencerSubLanes('synth', laneIndex), armManualDice: () => this.sequencerHome.armManualDice('synth', laneIndex), post: (event) => this.postManualSynthDiceEvent(event), publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload), captureHome: (force = false) => this.captureSequencerHomeLane('synth', laneIndex, force) });
  }

  private handleSequencerUiProductEvent(event: CoreProductEvent): boolean {
    const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null;
    const laneIndex = typeof event.index === 'number' ? event.index : -1;
    if (!sequencer || !Number.isInteger(laneIndex)) return false;

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane) {
      const evolveConfigResult = applyCoreProductSequencerEvolveConfigEvent({
        event,
        sequencer,
        laneIndex,
        adapterState: this.adapterState,
      });
      if (evolveConfigResult.handled) {
        this.adapterState = evolveConfigResult.adapterState;
        this.sequencerEvolveBridge.syncLane(sequencer, laneIndex);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision) {
        this.adapterState = patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'ClockDivision', normalizeClockDivisionValue(event.value, 16));
        if (this.runtimeReady) this.postRuntimeProductEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing) {
        this.adapterState = patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'Swing', normalizeSequencerSwing(event.value, 0));
        if (this.runtimeReady) this.postRuntimeProductEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode) {
        if (sequencer !== 'synth') return false;
        this.adapterState = patchCoreProductSynthPitchBindingModeFromEvent(this.adapterState, laneIndex, event);
        if (this.runtimeReady) this.postRuntimeProductEvent(event);
        return true;
      }
      const pitchResult = applyCoreProductSequencerPitchSettingEvent({ adapterState: this.adapterState, event, sequencer, laneIndex, latestSliderState: this.latestSliderState, synthNoteRangeOverrides: this.synthNoteRangeOverrides, runtimeReady: this.runtimeReady, post: (pitchEvent) => this.postRuntimeProductEvent(pitchEvent) }); if (pitchResult.handled) { this.adapterState = pitchResult.adapterState; return true; }
      return false;
    }

    const drumStepOverrideResult = applyCoreProductDrumSequencerStepOverrideEvent({ event, sequencer, laneIndex, cache: this.sequencerCacheState(), drumBaseMidi: (baseLaneIndex) => this.drumLaneBaseMidi(baseLaneIndex) });
    if (drumStepOverrideResult.handled) {
      if (drumStepOverrideResult.committed) {
        for (let commitLaneIndex = 0; commitLaneIndex < PRODUCT_VISIBLE_DRUM_LANE_COUNT; commitLaneIndex += 1) {
          if (this.sequencerHome.consumeManualDiceIfReady('drum', commitLaneIndex)) this.captureSequencerHomeLane('drum', commitLaneIndex, true);
        }
        this.captureSequencerHomeLanes('drum', true);
        this.syncSequencerStepToggles('drum', true);
      }
      return true;
    }

    if (applyCoreProductSequencerHomeCaptureEvent({
      event,
      sequencer,
      laneIndex,
      capture: (captureSequencer, captureLaneIndex, force, requireContent, pitchState) =>
        this.captureSequencerHomeLane(captureSequencer, captureLaneIndex, force, requireContent, undefined, pitchState),
    })) return true;

    const subLaneEnabledResult = applyCoreProductSequencerSubLaneEnabledEvent({ event, sequencer, laneIndex, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled }); if (subLaneEnabledResult.handled) { this.synthSubLaneEnabled = subLaneEnabledResult.synthSubLaneEnabled; this.drumSubLaneEnabled = subLaneEnabledResult.drumSubLaneEnabled; this.sequencerVisuals.clearMorphFeedback(); this.syncSequencerStepToggles(sequencer, true); return true; }

    if (applyCoreProductSequencerStepEventToCache({ event, sequencer, laneIndex, cache: this.sequencerCacheState() })) { if (this.runtimeReady) this.postRuntimeProductEvent(event); return true; }

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane && sequencer === 'synth') {
      return this.applyManualSynthDice(laneIndex, typeof event.value === 'number' ? event.value : 1);
    }

    return handleCoreProductSequencerControlEvent({ event, sequencer, laneIndex, restoreLaneHome: (restoreSequencer, restoreLaneIndex) => this.restoreSequencerLaneHome(restoreSequencer, restoreLaneIndex), armManualDice: (diceSequencer, diceLaneIndex) => this.armSequencerManualDice(diceSequencer, diceLaneIndex), postControlEvent: (controlEvent) => this.postSequencerControlEvent(controlEvent), publish: (name, publishLaneIndex) => this.invokeDisplayCallback(name, publishLaneIndex) });
  }

  private captureSequencerHomeLanes(sequencer: SequencerKind, requireContent = false, force = false, drumPitchSettings?: readonly (SequencerPitchSettings | null | undefined)[], pitchStates?: readonly (SequencerLanePitchState | null | undefined)[]): void { const laneCount = coreProductSequencerLaneCacheCount(this.sequencerCacheState(), sequencer); for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) this.captureSequencerHomeLane(sequencer, laneIndex, force, requireContent, sequencer === 'drum' ? drumPitchSettings?.[laneIndex] : undefined, pitchStates?.[laneIndex]); }

  private captureSequencerHomeLane(sequencer: SequencerKind, laneIndex: number, force = false, requireContent = false, drumPitchSettings?: SequencerPitchSettings | null, pitchState?: SequencerLanePitchState | null): void { captureCoreProductSequencerHomeLane({ sequencer, laneIndex, force, requireContent, cache: this.sequencerCacheState(), adapterState: this.adapterState, latestSliderState: this.latestSliderState, synthNoteRangeOverrides: this.synthNoteRangeOverrides, drumPitchSettings, pitchState, capture: (homeSequencer, homeLaneIndex, state, options) => this.sequencerHome.capture(homeSequencer, homeLaneIndex, state, options) }); }

  private restoreSequencerLaneHome(sequencer: SequencerKind, laneIndex: number): boolean { const index = Math.max(0, Math.min(15, Math.trunc(laneIndex))); const result = restoreCoreProductSequencerLaneHome({ sequencer, laneIndex: index, cache: this.sequencerCacheState(), adapterState: this.adapterState, runtimeReady: this.runtimeReady, restoreHome: (homeSequencer, homeLaneIndex) => this.sequencerHome.restore(homeSequencer, homeLaneIndex), fieldEnabled: (field) => this.stepValueFieldEnabled(sequencer, index, field), post: (event) => this.postRuntimeProductEvent(event), publish: (name, publishLaneIndex, ...args) => this.invokeDisplayCallback(name, publishLaneIndex, ...args), setSynthNoteRangeOverride: (noteLaneIndex, value) => { this.synthNoteRangeOverrides[noteLaneIndex] = value; }, synthBaseMidi: (baseLaneIndex) => this.latestProductSnapshot?.synthLanes[baseLaneIndex]?.midiNote ?? 60, drumBaseMidi: (baseLaneIndex) => this.drumLaneBaseMidi(baseLaneIndex), synthPitchSettings: this.adapterState.synthPitchSettings }); this.adapterState = result.adapterState; return result.restored; }

  private enabledSequencerSubLanes(sequencer: SequencerKind, laneIndex: number): string[] { return enabledCoreProductSequencerSubLanes(this.synthSubLaneEnabled, this.drumSubLaneEnabled, sequencer, laneIndex); }

  private reconcileSequencerUiState(telemetry: CoreProductTelemetrySnapshot): void {
    this.lastSequencerUiStateRevision = reconcileCoreProductSequencerUiState({
      telemetry,
      lastRevision: this.lastSequencerUiStateRevision,
      visibleSynthLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT,
      synthPitchSettings: this.adapterState.synthPitchSettings,
      synthBaseMidi: (laneIndex) => this.latestProductSnapshot?.synthLanes[laneIndex]?.midiNote ?? 60,
      drumBaseMidi: (laneIndex) => this.drumLaneBaseMidi(laneIndex),
      hasManualSynthDice: (laneIndex) => this.sequencerHome.hasManualDice('synth', laneIndex),
      manualSynthDiceChanged: (laneIndex, lane) => coreProductManualSynthDiceChanged(this.manualSynthDiceState, laneIndex, lane),
      completeManualSynthDice: (laneIndex) => this.markManualSynthDiceReady(laneIndex),
      consumeManualDrumDice: (laneIndex) => this.sequencerHome.consumeManualDice('drum', laneIndex),
      ensureLaneCache: (sequencer, laneIndex) => ensureCoreProductSequencerLaneCache(this.sequencerCacheState(), sequencer, laneIndex),
      getLaneState: (sequencer, laneIndex) => {
        const cache = selectCoreProductSequencerCache(this.sequencerCache, sequencer);
        return {
          toggles: cache.toggles[laneIndex] ?? [],
          values: cache.values[laneIndex] ?? [],
          configs: cache.configs[laneIndex] ?? [],
          swing: getCoreProductSequencerLaneSwing(this.adapterState, this.latestSliderState, sequencer, laneIndex),
        };
      },
      captureLaneHome: (sequencer, laneIndex) => this.captureSequencerHomeLane(sequencer, laneIndex, true),
      setSynthLaneState: (laneIndex, state) => {
        const cache = selectCoreProductSequencerCache(this.sequencerCache, 'synth');
        cache.toggles[laneIndex] = state.toggles;
        cache.values[laneIndex] = state.values;
        cache.configs[laneIndex] = state.configs;
      },
      setDrumLaneState: (laneIndex, state) => {
        const cache = selectCoreProductSequencerCache(this.sequencerCache, 'drum');
        cache.toggles[laneIndex] = state.toggles;
        cache.values[laneIndex] = state.values;
        cache.configs[laneIndex] = state.configs;
      },
      setLaneSwing: (sequencer, laneIndex, swing) => { const patched = patchCoreProductSequencerLaneSwing(this.adapterState, sequencer, laneIndex, swing); this.adapterState = patched.adapterState; },
      setSynthNoteRangeOverride: (laneIndex, range) => { this.synthNoteRangeOverrides[laneIndex] = range; },
      publishNoteRange: (laneIndex, noteMin, noteMax) => this.invokeDisplayCallback('synthNoteRangeEvolved', laneIndex, noteMin, noteMax),
      publish: (name, laneIndex, payload) => this.invokeDisplayCallback(name, laneIndex, payload),
    });
  }

  private withHostDiagnostics(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    const telemetrySampleRate = telemetry.sampleRate;
    const nowTime = (telemetry.absoluteSampleTime ?? 0) > 0 &&
      typeof telemetrySampleRate === 'number' && Number.isFinite(telemetrySampleRate) && telemetrySampleRate > 0
      ? (telemetry.absoluteSampleTime ?? 0) / telemetrySampleRate
      : this.runtime.audioContext?.currentTime ?? 0;
    return {
      ...this.modulationRangeBridge.enrichModulationDebug(enrichCoreProductHostTelemetry(
        telemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
        this.assetRegistrar.hostDecodedBytes(), this.assetRegistrar.inFlightDecodedByteLength(), this.sonicAutonomyTracker,
      )),
      earthTextureDebugState: createCoreProductEarthTextureDebugState(
        this.latestSliderState,
        nowTime,
        telemetry.earthTextureDebugState,
      ),
      runtimeWalkDebug: this.modulationRangeBridge.getRuntimeWalkDebugState(),
    };
  }

  private collectSequencerStepToggles(events: CoreProductEvent[]): void {
    this.collectSequencerStepToggleEvents(events, 'synth', false);
    this.collectSequencerStepToggleEvents(events, 'drum', false);
  }
  private collectSynthPitchBindingModeEvents(events: CoreProductEvent[]): void {
    const modes = Array.isArray(this.adapterState.synthPitchBindingModes) ? this.adapterState.synthPitchBindingModes : [];
    for (let laneIndex = 0; laneIndex < Math.min(16, modes.length); laneIndex += 1) {
      events.push(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode, sequencerPitchBindingModeToProductId(modes[laneIndex])));
    }
  }
  private collectSequencerPitchSettingEvents(events: CoreProductEvent[], sequencer?: SequencerKind): void {
    const targets: SequencerKind[] = sequencer ? [sequencer] : ['synth', 'drum'];
    for (const target of targets) {
      const key = target === 'synth' ? 'synthPitchSettings' : 'drumPitchSettings';
      const settings = Array.isArray(this.adapterState[key]) ? this.adapterState[key] as SequencerPitchSettings[] : [];
      events.push(...createCoreProductSequencerPitchSettingEvents(target, settings));
    }
  }
  private syncSynthPitchBindingModes(): void { if (!this.runtimeReady) return; const modes = Array.isArray(this.adapterState.synthPitchBindingModes) ? this.adapterState.synthPitchBindingModes : []; this.postRuntimeProductEvents(Array.from({ length: Math.min(16, modes.length) }, (_, laneIndex) => createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode, sequencerPitchBindingModeToProductId(modes[laneIndex])))); }
  private postSequencerControlEvent(event: CoreProductEvent): void {
    const post = () => this.postRuntimeProductEvent(event);
    if (this.runtimeReady) {
      post();
      return;
    }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      return this.loadLatestSnapshot('runtime-bootstrap');
    }).then(post);
  }
  private postManualSynthDiceEvent(event: CoreProductEvent): void { if (this.runtimeReady) { this.postRuntimeProductEvent(event); return; } void this.runtime.ensureStarted().then(() => { this.runtimeReady = true; return this.loadLatestSnapshot('runtime-bootstrap'); }).then(() => this.postRuntimeProductEvent(event)); }
  private stepValueFieldEnabled(sequencer: SequencerKind, laneIndex: number, field: CoreProductStepValueField): boolean { return coreProductStepValueFieldEnabled(this.synthSubLaneEnabled, this.drumSubLaneEnabled, sequencer, laneIndex, field); }
  private syncSequencerStepToggles(sequencer: SequencerKind, forceClear: boolean): void {
    if (!this.runtimeReady) return;
    const events: CoreProductEvent[] = []; syncCoreProductSequencerStepState({ sequencer, cache: this.sequencerCacheState(), forceClear, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled, post: (event) => events.push(event) }); this.postRuntimeProductEvents(events);
  }
  private collectSequencerStepToggleEvents(events: CoreProductEvent[], sequencer: SequencerKind, forceClear: boolean): void {
    syncCoreProductSequencerStepState({ sequencer, cache: this.sequencerCacheState(), forceClear, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled, post: (event) => events.push(event) });
  }
  private setDisplayCallback(name: string, callback: unknown): void { this.displayCallbacks.setCallback(name, callback); this.updateRuntimeTelemetryPolling(); }
  private invokeDisplayCallback(name: string, ...args: unknown[]): void { this.displayCallbacks.invoke(name, ...args); }
}
const host = new CoreProductEngineHost();
export const coreProductEngineHost = createCoreProductEngineHostProxy(host);
