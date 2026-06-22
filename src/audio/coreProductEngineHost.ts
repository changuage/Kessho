import type { DynamicsVisualTelemetrySnapshot, ManualSynthNoteOptions } from './engineSharedTypes';
import type { LaneDirection } from './sequencerLaneDirection';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { ProductLiveNoteEvent } from './product/liveNoteEvents';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import type { CoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SEQUENCER_IDS, type CoreProductEvent, type CoreProductStepValueField, createCoreProductJourneyEvent, createCoreProductJourneyStateEvent, createCoreProductSequencerDiceEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSequencerPitchSettingEvents, createCoreProductSequencerResetHomeEvent, createCoreProductStartEvent, createCoreProductStopEvent } from './coreProductEvents';
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
import { shouldRejoinCoreProductSequencerClocks } from './CoreProductHostSequencerClock';
import { CoreProductHostSequencerChain } from './CoreProductHostSequencerChain';
import { currentCoreProductSynthAnchorWalkerVisualState, currentCoreProductSynthOrbitVisualState, publishCoreProductSequencerVisuals, publishCoreProductSynthAnchorWalkerVisualState, publishCoreProductSynthOrbitVisualState } from './CoreProductHostSequencerVisuals';
import { createCoreProductSequencerHomeStore } from './CoreProductHostSequencerHome';
import { createCoreProductHostMidiEvent, createCoreProductLiveNoteEvent } from './CoreProductHostMidi';
import { CoreProductAssetRegistrar } from './product/host/CoreProductAssetRegistrar';
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
import { applyCoreProductSnapshotUpdate, loadCoreProductSnapshot } from './product/host/CoreProductSnapshotCoordinator';
import { createCoreProductHostSnapshot } from './product/host/CoreProductHostSnapshotFactory';
import { createCoreProductPerfSnapshot, enrichCoreProductHostTelemetry, mergeCoreProductVisualTelemetry } from './product/host/CoreProductTelemetryAdapter';
import { createCoreProductEarthTextureDebugState } from './product/host/CoreProductEarthTextureDebug';
import { logCoreProductDebugTelemetry } from './CoreProductHostDebugTelemetry';
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
import { CoreProductSequencerMorphFeedbackBridge } from './product/host/CoreProductSequencerMorphFeedbackBridge';
import { auditionCoreProductSynthNote, auditionCoreProductSynthNotes, triggerCoreProductDrumVoice, triggerCoreProductSynthVoice, type CoreProductManualAuditionContext } from './product/host/CoreProductManualAuditionBridge';
import { applyCoreProductSequencerPitchSettingEvent } from './product/host/CoreProductSequencerPitchSettingEventBridge';
import { applyCoreProductSynthStepOverrides } from './product/host/CoreProductSequencerStepOverrideBridge';
import { applyCoreProductDrumSequencerStepOverrideEvent } from './product/host/CoreProductSequencerStepOverrideEventBridge';
import { applyCoreProductSequencerStepEventToCache } from './product/host/CoreProductSequencerStepEventBridge';
import { applyCoreProductSequencerSubLaneEnabledEvent } from './product/host/CoreProductSequencerSubLaneEnabledEventBridge';
import { coreProductStepValueFieldEnabled, syncCoreProductSequencerStepState } from './product/host/CoreProductSequencerStepPostingBridge';
import { DRUM_EUCLIDEAN_LANE_COUNT, SYNTH_EUCLIDEAN_LANE_COUNT } from './sequencerLaneCounts';
import type { ProductEngineState, ProductResolvedStateCommit, ProductResolvedStateCommitReceipt, ProductSnapshotPatchReason } from './product/ProductEngineTypes';
import { createWebProductRuntimeCapabilityReport, type ProductRuntimeCapabilityReport } from './product/ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './product/ProductRuntimeDiagnostics';
import { CoreProductArrangementBridge } from './product/host/CoreProductArrangementBridge';
const PRODUCT_VISIBLE_SYNTH_LANE_COUNT = SYNTH_EUCLIDEAN_LANE_COUNT;
const PRODUCT_VISIBLE_DRUM_LANE_COUNT = DRUM_EUCLIDEAN_LANE_COUNT;
const POST_SNAPSHOT_EVENT_FLUSH_BATCH_SIZE = 48;
const POST_SNAPSHOT_EVENT_FLUSH_RETRY_MS = 40;
type SequencerLanePitchState = { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean };
class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private readonly graphTapBridge = new CoreProductGraphTapBridge(this.runtime);
  private readonly arrangementBridge = new CoreProductArrangementBridge((event) => this.runtime.postEvent(event), () => this.runtime.audioContext, (name, ...payload) => this.invokeDisplayCallback(name, ...payload));
  private readonly sequencerChain = new CoreProductHostSequencerChain({ post: (event) => this.runtime.postEvent(event), nowMs: () => this.nowMs() });
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetRegistrar = new CoreProductAssetRegistrar(this.runtime, () => this.latestSliderState);
  private readonly displayCallbacks = new CoreProductDisplayCallbackRegistry();
  private stateChangeCallback: ((state: ProductEngineState) => void) | null = null;
  private productTelemetryCallback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
  private perfMonitorEnabled = false;
  private perfUpdateCallback: ((data: Record<string, unknown>) => void) | null = null;
  private latestProductSnapshot: CoreProductSnapshot | null = null;
  private adapterState: Record<string, unknown> = {};
  private readonly leadPresetDataLoader = new CoreProductLeadPresetDataLoader();
  private readonly modulationRangeBridge = new CoreProductModulationRangeBridge({
    isRuntimeReady: () => this.runtimeReady,
    latestProductSnapshot: () => this.latestProductSnapshot,
    latestSliderState: () => this.latestSliderState,
    post: (event) => this.runtime.postEvent(event),
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
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null;
  private runtimeReady = false;
  private running = false;
  private readonly journeyMorphClock = new CoreProductJourneyMorphClock({ hasCallback: () => this.displayCallbacks.has('journeyMorphClock'), invoke: (now) => this.invokeDisplayCallback('journeyMorphClock', now), isDocumentVisible: () => this.isDocumentVisible(), nowMs: () => this.nowMs() });
  private readonly diagnostics = new CoreProductHostDiagnostics();
  private readonly statePatchQueue = new CoreProductStatePatchQueue({ latestSliderState: () => this.latestSliderState, applyProductState: (sliderState, reason, options) => this.applyProductState(sliderState, reason, options) });
  private readonly resolvedStateCommitService = new CoreProductResolvedStateCommitService({ diagnostics: this.diagnostics, applyProductStatePatch: (patch, reason, options) => this.applyProductStatePatch(patch, reason, options), postProductEvent: (event) => this.postProductEvent(event) });
  private midiTimestampOriginSeconds: number | null = null;
  private sequencerTransportStartInFlight = false;
  private pendingSnapshotReloadReason: SnapshotReloadReason | null = null;
  private lastSequencerUiStateRevision = 0;
  private readonly sequencerCache: CoreProductSequencerCacheState = createCoreProductSequencerCacheState();
  private readonly sequencerMorphFeedback = new CoreProductSequencerMorphFeedbackBridge();
  private synthNoteRangeOverrides: ({ min: number; max: number } | null)[] = [null, null, null, null];
  private readonly sequencerHome = createCoreProductSequencerHomeStore();
  private readonly manualSynthDiceState = createCoreProductManualSynthDiceState();
  private readonly postSnapshotEventQueue: CoreProductEvent[] = [];
  private postSnapshotEventFlushTimer: number | null = null;
  private readonly sequencerEvolveBridge = new CoreProductSequencerEvolveRuntimeBridge({ adapterState: () => this.adapterState, latestSliderState: () => this.latestSliderState, latestProductSnapshot: () => this.latestProductSnapshot, runtimeReady: () => this.runtimeReady, captureLaneHome: (sequencer, laneIndex) => { if (sequencer === 'synth') this.captureSequencerHomeLane('synth', laneIndex); else this.captureSequencerHomeLane('drum', laneIndex); }, getEnabledSubLanes: (sequencer, laneIndex) => this.enabledSequencerSubLanes(sequencer, laneIndex), postWithHomeCapture: (event) => { this.captureSequencerHomeForEvent(event); this.runtime.postEvent(event); }, publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload) });
  private readonly harmonyStateBridge = new CoreProductHarmonyStateBridge();
  readonly engineMode = 'core-product';
  constructor() {
    this.runtime.setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));
    this.runtime.setVisualTelemetryCallback((telemetry) => this.handleVisualTelemetry(telemetry));
  }
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
  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void { this.stateChangeCallback = callback; }
  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
    this.runtime.setPerfMonitorEnabled(enabled);
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

  setPerfUpdateCallback(callback: ((data: Record<string, unknown>) => void) | null): void {
    this.perfUpdateCallback = callback;
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
  setProductTelemetryCallback(callback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null): void {
    this.productTelemetryCallback = callback;
    if (callback && this.latestTelemetry) {
      callback(this.latestTelemetry);
    }
  }

  getProductTelemetry(): CoreProductTelemetrySnapshot | null {
    return this.latestTelemetry;
  }

  getProductRuntimeDiagnostics(): ProductRuntimeDiagnostics {
    return this.diagnostics.snapshot();
  }

  getCapabilityReport(): ProductRuntimeCapabilityReport {
    return createWebProductRuntimeCapabilityReport(this.diagnostics.snapshot());
  }

  postProductEvent(event: CoreProductEvent): void {
    if (this.handleSequencerUiProductEvent(event)) return;
    if (!this.runtimeReady) {
      throw new Error('Core Product runtime cannot enqueue product events before the product worklet is initialized');
    }
    this.runtime.postEvent(event);
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
    const forceSequencerClockRejoin = shouldRejoinCoreProductSequencerClocks(previousSliderState, sliderState);
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
    if (this.runtimeReady && this.assetRegistrar.hasMissingDefaultAssetsForState()) {
      void this.assetRegistrar.ensureDefaultAssetsForState().then(() => {
        void this.applyLatestSnapshotUpdate('asset-reference-change', forceSequencerClockRejoin, options);
        if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
        if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState); this.publishStateIfHarmonyChanged();
      });
      return { applied: false, mode: 'deferred' };
    }
    const receipt = await this.applyLatestSnapshotUpdate(fallbackReloadReason, forceSequencerClockRejoin, options);
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
    if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState); this.publishStateIfHarmonyChanged();
    return receipt;
  }

  private sequencerTransportRequested(sliderState: Record<string, unknown>): boolean {
    return sliderState.drumEuclidMasterEnabled === true || sliderState.synthEuclideanMasterEnabled === true;
  }

  private setSequencerLaneParamSet(sequencer: SequencerKind, suffix: 'ClockDivision' | 'Swing', values: unknown[], paramId: number, mapValue: (value: unknown) => number): void { this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer, suffix, values, paramId, mapValue, runtimeReady: this.runtimeReady, post: (event) => this.runtime.postEvent(event) }); }
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
    if (sliderState) {
      this.latestSliderState = { ...sliderState };
    }
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.assetRegistrar.ensureDefaultAssetsForState(); this.resetSequencerEvolveState();
    await this.loadLatestSnapshot('runtime-start');
    await this.runtime.resume();
    this.running = true; this.sequencerChain.start(this.latestSliderState, this.adapterState);
    this.runtime.postEvent(createCoreProductStartEvent());
    this.modulationRangeBridge.flushModulationRanges();
    this.arrangementBridge.start(this.latestSliderState, this.adapterState);
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async resume(): Promise<void> {
    await this.runtime.resume(); this.resetSequencerEvolveState();
    await this.loadLatestSnapshot('runtime-start', true);
    this.running = true; this.sequencerChain.start(this.latestSliderState, this.adapterState);
    this.runtime.postEvent(createCoreProductStartEvent());
    this.arrangementBridge.start(this.latestSliderState, this.adapterState);
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async suspend(): Promise<void> {
    this.sequencerChain.stop(); this.arrangementBridge.stop();
    this.runtime.postEvent(createCoreProductStopEvent());
    await this.runtime.suspend(); this.resetSequencerEvolveState();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  stop(): void {
    this.sequencerChain.stop(); this.arrangementBridge.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
    void this.runtime.suspend(); this.resetSequencerEvolveState();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  dispose(): void {
    this.sequencerChain.stop(); this.arrangementBridge.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
    this.clearPostSnapshotEventQueue();
    this.runtime.dispose();
    this.runtimeReady = false; this.resetSequencerEvolveState();
    this.midiTimestampOriginSeconds = null;
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.latestProductSnapshot = null;
    this.assetRegistrar.clear();
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  private isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
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

  async loadLeadPreset(slot: unknown, presetId: unknown): Promise<void> {
    await this.leadPresetDataLoader.loadLeadPreset(slot, presetId);
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    this.assetRegistrar.registerAsset(asset);
  }

  unregisterAsset(assetId: number): void {
    this.assetRegistrar.unregisterAsset(assetId);
  }

  pushMidiMessage(message: KesshoMidiMessage): void {
    const audioContext = this.runtime.audioContext; const currentTimeSeconds = audioContext?.currentTime ?? 0;
    if (this.midiTimestampOriginSeconds === null && typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) this.midiTimestampOriginSeconds = message.timestamp - currentTimeSeconds;
    const event = createCoreProductHostMidiEvent(message, { sampleRate: audioContext?.sampleRate ?? 48000, currentTimeSeconds, timestampOriginSeconds: this.midiTimestampOriginSeconds ?? undefined });
    const post = () => { this.runtime.postEvent(event); };
    if (this.runtimeReady) { if (this.runtime.audioContext?.state === 'running') { post(); return; } void this.runtime.resume().then(post); return; }
    void this.runtime.ensureStarted().then(() => { this.runtimeReady = true; return this.loadLatestSnapshot('runtime-bootstrap').then(() => this.runtime.resume()); }).then(post);
  }
  enqueueLiveNoteEvent(event: ProductLiveNoteEvent): void { const audioContext = this.runtime.audioContext; const currentTimeSeconds = audioContext?.currentTime ?? 0; if (this.midiTimestampOriginSeconds === null && typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs)) this.midiTimestampOriginSeconds = event.timestampMs / 1000 - currentTimeSeconds; const productEvent = createCoreProductLiveNoteEvent(event, { sampleRate: audioContext?.sampleRate ?? 48000, currentTimeSeconds, timestampOriginSeconds: this.midiTimestampOriginSeconds ?? undefined }); const post = () => { this.runtime.postEvent(productEvent); }; if (this.runtimeReady) { if (this.runtime.audioContext?.state === 'running') { post(); return; } void this.runtime.resume().then(post); return; } void this.runtime.ensureStarted().then(() => { this.runtimeReady = true; return this.loadLatestSnapshot('runtime-bootstrap').then(() => this.runtime.resume()); }).then(post); }

  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    this.setDisplayCallback('runtimeWalkPositions', callback);
    callback?.(this.modulationRangeBridge.getRuntimeWalkPositions());
  }
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
  setLeadDelayCallback(callback: ((delay: { lead1: string; lead2: string }) => void) | null): void { this.setDisplayCallback('leadDelay', callback); }
  setDrumTriggerCallback(callback: ((voice: unknown, velocity: number) => void) | null): void { this.setDisplayCallback('drumTrigger', callback); }
  setDrumMorphTriggerCallback(callback: ((voice: unknown, morphPosition: number) => void) | null): void { this.setDisplayCallback('drumMorph', callback); }
  setDrumParamSHTriggerCallback(callback: ((voice: unknown, key: string, position: number) => void) | null): void { this.setDisplayCallback('drumParamSH', callback); }
  setGranularSHTriggerCallback(callback: ((positions: Record<string, number>) => void) | null): void { this.setDisplayCallback('granularSH', callback); }
  setDrumEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void { this.setDisplayCallback('drumEvolveOverrides', callback); }
  setSynthEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void { this.setDisplayCallback('synthEvolveOverrides', callback); }
  setSynthNoteRangeEvolvedCallback(callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null): void { this.setDisplayCallback('synthNoteRangeEvolved', callback); }
  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void { this.setDisplayCallback('drumStepPosition', callback); this.publishCurrentSequencerVisualsOnCallbackRegistration(callback, PRODUCT_VISIBLE_DRUM_LANE_COUNT); }
  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void { this.setDisplayCallback('synthStepPosition', callback); this.publishCurrentSequencerVisualsOnCallbackRegistration(callback, PRODUCT_VISIBLE_SYNTH_LANE_COUNT); }
  setSynthOrbitVisualStateCallback(callback: ((lanes: Array<CoreProductOrbitVisualLaneState | null>) => void) | null): void { this.setDisplayCallback('synthOrbitVisualState', callback); callback?.(currentCoreProductSynthOrbitVisualState(this.running ? this.latestTelemetry : null, PRODUCT_VISIBLE_SYNTH_LANE_COUNT)); }
  setSynthAnchorWalkerVisualStateCallback(callback: ((lanes: Array<CoreProductAnchorWalkerVisualLaneState | null>) => void) | null): void { this.setDisplayCallback('synthAnchorWalkerVisualState', callback); callback?.(currentCoreProductSynthAnchorWalkerVisualState(this.running ? this.latestTelemetry : null, PRODUCT_VISIBLE_SYNTH_LANE_COUNT)); }
  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('drumEuclidEvolve', callback); }
  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('synthEuclidEvolve', callback); }
  setGranularUiActive(active: boolean): void { this.displayCallbacks.setValue('granularUiActive', active); this.runtime.setGranularWaveformTelemetryActive(active); }

  async triggerDrumVoice(
    voice: unknown,
    velocity: number,
    externalState?: Record<string, unknown>,
  ): Promise<void> {
    await triggerCoreProductDrumVoice(this.manualAuditionContext(), voice, velocity, externalState);
  }

  resetSynthEuclidLaneHome(laneIndex: number): void {
    this.postProductEvent(createCoreProductSequencerResetHomeEvent('synth', laneIndex));
  }

  diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.postProductEvent(createCoreProductSequencerDiceEvent('synth', laneIndex, intensity));
  }

  resetDrumEuclidLaneHome(laneIndex: number): void {
    this.postProductEvent(createCoreProductSequencerResetHomeEvent('drum', laneIndex));
  }

  diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.postProductEvent(createCoreProductSequencerDiceEvent('drum', laneIndex, intensity));
  }

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

  private recordSoundTrigger(): void {
    this.resolvedStateCommitService.recordSoundTrigger();
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
      recordSoundTrigger: () => this.recordSoundTrigger(),
      publish: (name, ...args) => this.invokeDisplayCallback(name, ...args),
    };
  }

  private async loadLatestSnapshot(reason: SnapshotReloadReason = 'product-patch', includeClockStartDelay = reason === 'runtime-start'): Promise<void> {
    if (!this.runtimeReady) return;
    const result = await loadCoreProductSnapshot({
      runtime: this.runtime,
      snapshot: this.createLatestSnapshot(includeClockStartDelay),
      reason,
      nowMs: () => this.nowMs(),
      afterLoad: () => this.afterProductSnapshotLoad(),
    });
    this.latestProductSnapshot = result.snapshot;
    this.sequencerChain.update(this.latestSliderState, this.adapterState, true);
    this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs);
  }

  private applyLatestSnapshotUpdate(
    reason: SnapshotReloadReason = 'product-patch',
    forceSequencerClockRejoin = false,
    options?: CoreProductStateApplyOptions,
  ): Promise<ProductPatchApplyReceipt> {
    if (!this.runtimeReady) return Promise.resolve({ applied: false, mode: 'deferred' });
    const applyOptions = options ?? {};
    const metadata = typeof applyOptions.revision === 'number'
      ? {
        revision: applyOptions.revision,
        reason: applyOptions.commitReason ?? reason,
        triggerCritical: applyOptions.triggerCritical === true,
      }
      : undefined;
    return applyCoreProductSnapshotUpdate({
      runtime: this.runtime,
      previousSnapshot: this.latestProductSnapshot,
      nextSnapshot: this.createLatestSnapshot(forceSequencerClockRejoin),
      fallbackReloadReason: reason,
      pendingReloadReason: this.pendingSnapshotReloadReason,
      forceFullSnapshot: applyOptions.forceFullSnapshot,
      forceSequencerClockRejoin,
      forwardRngDiffs: shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry),
      metadata,
      awaitAudioThreadAck: applyOptions.triggerCritical === true,
      nowMs: () => this.nowMs(),
      afterFullSnapshotLoad: () => this.afterProductSnapshotLoad(),
    }).then((result): ProductPatchApplyReceipt => {
      this.latestProductSnapshot = result.snapshot;
      this.pendingSnapshotReloadReason = null;
      this.sequencerChain.update(this.latestSliderState, this.adapterState, result.mode === 'full-snapshot' || this.sequencerChain.active(this.latestSliderState, this.adapterState));
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
    if (events.length === 0) return;
    this.postSnapshotEventQueue.length = 0;
    this.postSnapshotEventQueue.push(...events);
    this.schedulePostSnapshotEventFlush();
  }

  private schedulePostSnapshotEventFlush(): void {
    if (this.postSnapshotEventFlushTimer !== null) return;
    const schedule = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : setTimeout;
    this.postSnapshotEventFlushTimer = schedule(() => {
      this.postSnapshotEventFlushTimer = null;
      this.flushPostSnapshotEventQueue();
    }, POST_SNAPSHOT_EVENT_FLUSH_RETRY_MS) as unknown as number;
  }

  private flushPostSnapshotEventQueue(): void {
    if (this.postSnapshotEventQueue.length === 0) return;
    if (!this.runtimeReady || this.runtime.audioContext?.state !== 'running') {
      this.schedulePostSnapshotEventFlush();
      return;
    }
    let posted = 0;
    while (
      posted < POST_SNAPSHOT_EVENT_FLUSH_BATCH_SIZE &&
      this.postSnapshotEventQueue.length > 0
    ) {
      const event = this.postSnapshotEventQueue.shift();
      if (event) this.runtime.postEvent(event);
      posted += 1;
    }
    if (this.postSnapshotEventQueue.length > 0) {
      this.schedulePostSnapshotEventFlush();
    }
  }

  private clearPostSnapshotEventQueue(): void {
    this.postSnapshotEventQueue.length = 0;
    if (this.postSnapshotEventFlushTimer === null) return;
    if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(this.postSnapshotEventFlushTimer);
    } else {
      clearTimeout(this.postSnapshotEventFlushTimer);
    }
    this.postSnapshotEventFlushTimer = null;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private createLatestSnapshot(includeClockStartDelay = false): CoreProductSnapshot {
    return createCoreProductHostSnapshot({
      latestSliderState: this.latestSliderState,
      adapterState: this.adapterState,
      journeyMorphClockRunning: this.journeyMorphClock.running,
      latestTelemetry: this.latestTelemetry,
      running: this.running,
    }, includeClockStartDelay);
  }

  private createLatestArrangementState(): Record<string, unknown> | null {
    return this.arrangementBridge.createState(this.latestSliderState, this.adapterState);
  }

  private handleTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
    const hostTelemetry = this.withHostDiagnostics(telemetry);
    logCoreProductDebugTelemetry(hostTelemetry);
    this.latestTelemetry = hostTelemetry;
    if (this.journeyMorphClock.running && typeof hostTelemetry.journeyMorphPhase === 'number') {
      this.adapterState = {
        ...this.adapterState,
        journeyEnabled: true,
        journeyMorphPhase: hostTelemetry.journeyMorphPhase,
      };
    }
    this.journeyMorphClock.syncAfterTelemetry();
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry);
    this.modulationRangeBridge.updateSampleHoldTriggerFeedback(hostTelemetry);
    this.reconcileSequencerUiState(hostTelemetry);
    if (this.isDocumentVisible()) this.updateSequencerMorphFeedback(hostTelemetry);
    hostTelemetry.sampleHoldDebug = this.modulationRangeBridge.getSampleHoldDebugState();
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.productTelemetryCallback?.(hostTelemetry);
    if (this.isDocumentVisible()) {
      this.publishSequencerVisuals(hostTelemetry);
    }
    if (this.perfMonitorEnabled && this.isDocumentVisible()) {
      this.perfUpdateCallback?.(createCoreProductPerfSnapshot(
        hostTelemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
      ));
    }
  }

  private handleVisualTelemetry(telemetry: CoreProductVisualTelemetrySnapshot): void {
    if (!this.isDocumentVisible()) return;
    const merged = mergeCoreProductVisualTelemetry(this.latestTelemetry, telemetry, this.running);
    const hostTelemetry = this.withHostDiagnostics(merged);
    this.latestTelemetry = hostTelemetry;
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry);
    this.modulationRangeBridge.updateSampleHoldTriggerFeedback(hostTelemetry);
    this.updateSequencerMorphFeedback(hostTelemetry);
    hostTelemetry.sampleHoldDebug = this.modulationRangeBridge.getSampleHoldDebugState();
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.publishSequencerVisuals(hostTelemetry);
  }
  private tickSequencerEvolveClock(hostTelemetry: CoreProductTelemetrySnapshot): void {
    this.sequencerEvolveBridge.tick(hostTelemetry);
  }

  private updateSequencerMorphFeedback(hostTelemetry: CoreProductTelemetrySnapshot): void {
    this.sequencerMorphFeedback.update({
      telemetry: hostTelemetry,
      snapshot: this.latestProductSnapshot,
      cache: this.sequencerCacheState(),
      synthSubLaneEnabled: this.synthSubLaneEnabled,
      drumSubLaneEnabled: this.drumSubLaneEnabled,
      hasCallback: (name) => this.displayCallbacks.has(name),
      publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload),
    });
  }

  private publishSequencerVisuals(telemetry: CoreProductTelemetrySnapshot | null): void {
    publishCoreProductSequencerVisuals({ telemetry, snapshot: this.latestProductSnapshot, state: this.latestSliderState ? { ...this.latestSliderState, ...this.adapterState } : this.adapterState, synthToggles: selectCoreProductSequencerCache(this.sequencerCache, 'synth').toggles, drumToggles: selectCoreProductSequencerCache(this.sequencerCache, 'drum').toggles, synthVisibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT, drumVisibleLaneCount: PRODUCT_VISIBLE_DRUM_LANE_COUNT, sampleRate: telemetry?.sampleRate ?? this.runtime.audioContext?.sampleRate ?? 48000, publish: (name, steps, hitCounts) => this.invokeDisplayCallback(name, steps, hitCounts) });
    publishCoreProductSynthOrbitVisualState({ telemetry, visibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT, hasCallback: (name) => this.displayCallbacks.has(name), publish: (name, lanes) => this.invokeDisplayCallback(name, lanes) });
    publishCoreProductSynthAnchorWalkerVisualState({ telemetry, visibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT, hasCallback: (name) => this.displayCallbacks.has(name), publish: (name, lanes) => this.invokeDisplayCallback(name, lanes) });
  }

  private publishCurrentSequencerVisualsOnCallbackRegistration(callback: ((steps: number[], hitCounts: number[]) => void) | null, laneCount: number): void { if (!callback) return; if (this.running) { if (this.latestTelemetry) this.publishSequencerVisuals(this.latestTelemetry); return; } callback(Array.from({ length: laneCount }, () => 0), Array.from({ length: laneCount }, () => 0)); }

  private resetSequencerVisuals(): void { this.publishSequencerVisuals(null); this.clearSequencerMorphFeedback(); }

  private clearSequencerMorphFeedback(): void {
    this.sequencerMorphFeedback.clear({
      hasCallback: (name) => this.displayCallbacks.has(name),
      publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload),
    });
  }

  private captureSequencerHomeForEvent(event: CoreProductEvent): void { const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null; const laneIndex = typeof event.index === 'number' ? event.index : -1; if (sequencer) this.captureSequencerHomeLane(sequencer, laneIndex); }

  private sequencerCacheState(): CoreProductSequencerCacheState { return this.sequencerCache; }

  private armSequencerManualDice(sequencer: SequencerKind, laneIndex: number): void {
    armCoreProductSequencerManualDice({ state: this.manualSynthDiceState, sequencer, laneIndex, cache: this.sequencerCacheState(), arm: (diceSequencer, diceLaneIndex) => this.sequencerHome.armManualDice(diceSequencer, diceLaneIndex) });
  }

  private markManualSynthDiceReady(laneIndex: number): void { markCoreProductManualSynthDiceReady(this.manualSynthDiceState, laneIndex, (readyLaneIndex) => this.sequencerHome.markManualDiceReady('synth', readyLaneIndex)); }

  private applyManualSynthDice(laneIndex: number, intensity: number): boolean {
    this.ensureSequencerLaneCache('synth', laneIndex);
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
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision) {
        this.adapterState = patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'ClockDivision', normalizeClockDivisionValue(event.value, 16));
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing) {
        this.adapterState = patchCoreProductSequencerLaneAdapterParam(this.adapterState, sequencer, laneIndex, 'Swing', normalizeSequencerSwing(event.value, 0));
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode) {
        if (sequencer !== 'synth') return false;
        this.adapterState = patchCoreProductSynthPitchBindingModeFromEvent(this.adapterState, laneIndex, event);
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      const pitchResult = applyCoreProductSequencerPitchSettingEvent({ adapterState: this.adapterState, event, sequencer, laneIndex, latestSliderState: this.latestSliderState, synthNoteRangeOverrides: this.synthNoteRangeOverrides, runtimeReady: this.runtimeReady, post: (pitchEvent) => this.runtime.postEvent(pitchEvent) }); if (pitchResult.handled) { this.adapterState = pitchResult.adapterState; return true; }
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

    const subLaneEnabledResult = applyCoreProductSequencerSubLaneEnabledEvent({ event, sequencer, laneIndex, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled }); if (subLaneEnabledResult.handled) { this.synthSubLaneEnabled = subLaneEnabledResult.synthSubLaneEnabled; this.drumSubLaneEnabled = subLaneEnabledResult.drumSubLaneEnabled; this.clearSequencerMorphFeedback(); this.syncSequencerStepToggles(sequencer, true); return true; }

    if (applyCoreProductSequencerStepEventToCache({ event, sequencer, laneIndex, cache: this.sequencerCacheState() })) { if (this.runtimeReady) this.runtime.postEvent(event); return true; }

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane && sequencer === 'synth') {
      return this.applyManualSynthDice(laneIndex, typeof event.value === 'number' ? event.value : 1);
    }

    return handleCoreProductSequencerControlEvent({ event, sequencer, laneIndex, restoreLaneHome: (restoreSequencer, restoreLaneIndex) => this.restoreSequencerLaneHome(restoreSequencer, restoreLaneIndex), armManualDice: (diceSequencer, diceLaneIndex) => this.armSequencerManualDice(diceSequencer, diceLaneIndex), postControlEvent: (controlEvent) => this.postSequencerControlEvent(controlEvent), publish: (name, publishLaneIndex) => this.invokeDisplayCallback(name, publishLaneIndex) });
  }

  private captureSequencerHomeLanes(sequencer: SequencerKind, requireContent = false, force = false, drumPitchSettings?: readonly (SequencerPitchSettings | null | undefined)[], pitchStates?: readonly (SequencerLanePitchState | null | undefined)[]): void { const laneCount = coreProductSequencerLaneCacheCount(this.sequencerCacheState(), sequencer); for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) this.captureSequencerHomeLane(sequencer, laneIndex, force, requireContent, sequencer === 'drum' ? drumPitchSettings?.[laneIndex] : undefined, pitchStates?.[laneIndex]); }

  private captureSequencerHomeLane(sequencer: SequencerKind, laneIndex: number, force = false, requireContent = false, drumPitchSettings?: SequencerPitchSettings | null, pitchState?: SequencerLanePitchState | null): void { captureCoreProductSequencerHomeLane({ sequencer, laneIndex, force, requireContent, cache: this.sequencerCacheState(), adapterState: this.adapterState, latestSliderState: this.latestSliderState, synthNoteRangeOverrides: this.synthNoteRangeOverrides, drumPitchSettings, pitchState, capture: (homeSequencer, homeLaneIndex, state, options) => this.sequencerHome.capture(homeSequencer, homeLaneIndex, state, options) }); }

  private restoreSequencerLaneHome(sequencer: SequencerKind, laneIndex: number): boolean { const index = Math.max(0, Math.min(15, Math.trunc(laneIndex))); const result = restoreCoreProductSequencerLaneHome({ sequencer, laneIndex: index, cache: this.sequencerCacheState(), adapterState: this.adapterState, runtimeReady: this.runtimeReady, restoreHome: (homeSequencer, homeLaneIndex) => this.sequencerHome.restore(homeSequencer, homeLaneIndex), fieldEnabled: (field) => this.stepValueFieldEnabled(sequencer, index, field), post: (event) => this.runtime.postEvent(event), publish: (name, publishLaneIndex, ...args) => this.invokeDisplayCallback(name, publishLaneIndex, ...args), setSynthNoteRangeOverride: (noteLaneIndex, value) => { this.synthNoteRangeOverrides[noteLaneIndex] = value; }, synthBaseMidi: (baseLaneIndex) => this.latestProductSnapshot?.synthLanes[baseLaneIndex]?.midiNote ?? 60, drumBaseMidi: (baseLaneIndex) => this.drumLaneBaseMidi(baseLaneIndex), synthPitchSettings: this.adapterState.synthPitchSettings }); this.adapterState = result.adapterState; return result.restored; }

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
      ensureLaneCache: (sequencer, laneIndex) => this.ensureSequencerLaneCache(sequencer, laneIndex),
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

  private ensureSequencerLaneCache(sequencer: SequencerKind, laneIndex: number): void {
    ensureCoreProductSequencerLaneCache(this.sequencerCacheState(), sequencer, laneIndex);
  }

  private withHostDiagnostics(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    const nowTime = (telemetry.absoluteSampleTime ?? 0) > 0
      ? (telemetry.absoluteSampleTime ?? 0) / Math.max(1, telemetry.sampleRate ?? 48000)
      : this.runtime.audioContext?.currentTime ?? 0;
    return {
      ...this.modulationRangeBridge.enrichModulationDebug(enrichCoreProductHostTelemetry(
        telemetry,
        this.diagnostics.snapshot(),
        this.assetRegistrar.registeredDecodedAssetByteLength(),
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
  private syncSynthPitchBindingModes(): void { if (!this.runtimeReady) return; const modes = Array.isArray(this.adapterState.synthPitchBindingModes) ? this.adapterState.synthPitchBindingModes : []; for (let laneIndex = 0; laneIndex < Math.min(16, modes.length); laneIndex += 1) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode, sequencerPitchBindingModeToProductId(modes[laneIndex]))); }
  private postSequencerControlEvent(event: CoreProductEvent): void {
    const post = () => this.runtime.postEvent(event);
    if (this.runtimeReady) {
      post();
      return;
    }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      return this.loadLatestSnapshot('runtime-bootstrap');
    }).then(post);
  }
  private postManualSynthDiceEvent(event: CoreProductEvent): void { if (this.runtimeReady) { this.runtime.postEvent(event); return; } void this.runtime.ensureStarted().then(() => { this.runtimeReady = true; return this.loadLatestSnapshot('runtime-bootstrap'); }).then(() => this.runtime.postEvent(event)); }
  private stepValueFieldEnabled(sequencer: SequencerKind, laneIndex: number, field: CoreProductStepValueField): boolean { return coreProductStepValueFieldEnabled(this.synthSubLaneEnabled, this.drumSubLaneEnabled, sequencer, laneIndex, field); }
  private syncSequencerStepToggles(sequencer: SequencerKind, forceClear: boolean): void {
    if (!this.runtimeReady) return;
    syncCoreProductSequencerStepState({ sequencer, cache: this.sequencerCacheState(), forceClear, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled, post: (event) => this.runtime.postEvent(event) });
  }
  private collectSequencerStepToggleEvents(events: CoreProductEvent[], sequencer: SequencerKind, forceClear: boolean): void {
    syncCoreProductSequencerStepState({ sequencer, cache: this.sequencerCacheState(), forceClear, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled, post: (event) => events.push(event) });
  }

  private setDisplayCallback(name: string, callback: unknown): void {
    this.displayCallbacks.setCallback(name, callback);
  }

  private invokeDisplayCallback(name: string, ...args: unknown[]): void {
    this.displayCallbacks.invoke(name, ...args);
  }
}
const host = new CoreProductEngineHost();
export const coreProductEngineHost = createCoreProductEngineHostProxy(host);
