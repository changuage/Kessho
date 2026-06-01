import type { DynamicsVisualTelemetrySnapshot, ManualSynthNoteOptions } from './engineSharedTypes';
import type { LaneDirection } from './sequencerLaneDirection';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import type { CoreProductSnapshot } from './coreProductSnapshot';
import { CORE_PRODUCT_SEQUENCER_IDS, CORE_PRODUCT_SOURCE_IDS, type CoreProductEvent, type CoreProductStepValueField, createCoreProductDrumTriggerEvent, createCoreProductJourneyEvent, createCoreProductJourneyStateEvent, createCoreProductManualNoteEvent, createCoreProductSequencerDiceEvent, createCoreProductSequencerLaneParamEvent, createCoreProductSequencerPitchSettingEvents, createCoreProductSequencerResetHomeEvent, createCoreProductStartEvent, createCoreProductStopEvent } from './coreProductEvents';
import { type CoreProductTelemetrySnapshot, type CoreProductVisualTelemetrySnapshot } from './coreProductTelemetry';
import type { RuntimeFallbackClassification } from './CoreProductFallbackDiagnostics';
import { shouldForwardCoreProductRngDiffs, type SnapshotReloadReason } from './CoreProductRuntimeAdapter';
import { normalizeClockDivisionValue, normalizeSubLaneEnabledStates, type SequencerKind } from './CoreProductHostSequencerAdapter';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeToProductId } from './sequencerPitchBinding';
import { normalizeSequencerPitchSettingsArray, type SequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import { coreProductSynthNoteRangeHome } from './CoreProductHostSynthNoteRangeEvolve';
import { patchCoreProductSequencerLaneSwing } from './CoreProductHostSequencerSwing';
import { normalizeEvolveConfigs } from './CoreProductHostSequencerEvolveConfig';
import { drumVoiceIndex, manualAuditionState, midiFromFrequency, requireFiniteRange, requireManualNote, requirePositive, runtimeWalkConfigChanged, runtimeWalkConfigFromState, sourceId } from './CoreProductHostRuntimeGuards';
import { CoreProductRuntime, type CoreProductGraphTapCaptureChunk } from './coreProductRuntime';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { createCoreProductDynamicsVisualTelemetry, createCoreProductSonicParityDebugState, createCoreProductTransportDebugState } from './CoreProductHostDebugTelemetry';
import { shouldRejoinCoreProductSequencerClocks } from './CoreProductHostSequencerClock';
import { publishCoreProductSequencerVisuals } from './CoreProductHostSequencerVisuals';
import { createCoreProductSequencerHomeStore } from './CoreProductHostSequencerHome';
import { createCoreProductHostMidiEvent } from './CoreProductHostMidi';
import { CoreProductAssetRegistrar } from './product/host/CoreProductAssetRegistrar';
import { CoreProductDisplayCallbackRegistry } from './product/host/CoreProductDisplayCallbackRegistry';
import { CoreProductGraphTapBridge } from './product/host/CoreProductGraphTapBridge';
import { CoreProductHarmonyStateBridge } from './product/host/CoreProductHarmonyStateBridge';
import { CoreProductHostDiagnostics } from './product/host/CoreProductHostDiagnostics';
import { createCoreProductEngineHostProxy } from './product/host/CoreProductHostProxy';
import { CoreProductJourneyMorphClock } from './product/host/CoreProductJourneyMorphClock';
import { CoreProductLeadPresetDataLoader } from './product/host/CoreProductLeadPresetDataLoader';
import { CoreProductModulationRangeBridge } from './product/host/CoreProductModulationRangeBridge';
import { snapshotReloadReasonForProductPatch } from './product/host/CoreProductPatchClassifier';
import { applyCoreProductSnapshotUpdate, createCoreProductHostSnapshot, loadCoreProductSnapshot } from './product/host/CoreProductSnapshotCoordinator';
import { createCoreProductPerfSnapshot, enrichCoreProductHostTelemetry, mergeCoreProductVisualTelemetry } from './product/host/CoreProductTelemetryAdapter';
import { createCoreProductEarthTextureDebugState } from './product/host/CoreProductEarthTextureDebug';
import { reconcileCoreProductSequencerUiState } from './product/host/CoreProductSequencerUiAdapter';
import { coreProductSequencerLaneCacheCount, createCoreProductSequencerCacheState, enabledCoreProductSequencerSubLanes, ensureCoreProductSequencerLaneCache, selectCoreProductSequencerCache, type CoreProductSequencerCacheState } from './product/host/CoreProductSequencerCacheBridge';
import { handleCoreProductSequencerControlEvent } from './product/host/CoreProductSequencerControlEventBridge';
import { CoreProductSequencerEvolveRuntimeBridge } from './product/host/CoreProductSequencerEvolveRuntimeBridge';
import { applyCoreProductManualSynthDice, armCoreProductSequencerManualDice, coreProductManualSynthDiceChanged, createCoreProductManualSynthDiceState, markCoreProductManualSynthDiceReady } from './product/host/CoreProductManualSynthDiceBridge';
import { captureCoreProductSequencerHomeLane } from './product/host/CoreProductSequencerHomeCaptureBridge';
import { restoreCoreProductSequencerLaneHome } from './product/host/CoreProductSequencerHomeRestoreBridge';
import { applyCoreProductSequencerLaneParamSet, patchCoreProductSequencerLaneAdapterParam, patchCoreProductSynthPitchBindingModeFromEvent } from './product/host/CoreProductSequencerLaneParamBridge';
import { CoreProductSequencerMorphFeedbackBridge } from './product/host/CoreProductSequencerMorphFeedbackBridge';
import { applyCoreProductDrumStepOverrides, applyCoreProductSynthStepOverrides } from './product/host/CoreProductSequencerStepOverrideBridge';
import { coreProductStepValueFieldEnabled, syncCoreProductSequencerStepState } from './product/host/CoreProductSequencerStepPostingBridge';
import type { ProductEngineState, ProductSnapshotPatchReason } from './product/ProductEngineTypes';
import { createWebProductRuntimeCapabilityReport, type ProductRuntimeCapabilityReport } from './product/ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './product/ProductRuntimeDiagnostics';
import { CoreProductArrangementBridge } from './product/host/CoreProductArrangementBridge';
const PRODUCT_VISIBLE_SYNTH_LANE_COUNT = 4;
const PRODUCT_VISIBLE_DRUM_LANE_COUNT = 4;
type SequencerLanePitchState = { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean };

class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private readonly graphTapBridge = new CoreProductGraphTapBridge(this.runtime);
  private readonly arrangementBridge = new CoreProductArrangementBridge((event) => this.runtime.postEvent(event), () => this.runtime.audioContext, (name, ...payload) => this.invokeDisplayCallback(name, ...payload));
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetRegistrar = new CoreProductAssetRegistrar(this.runtime, () => this.latestSliderState);
  private readonly displayCallbacks = new CoreProductDisplayCallbackRegistry();
  private stateChangeCallback: ((state: ProductEngineState) => void) | null = null;
  private productTelemetryCallback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
  private perfMonitorEnabled = false;
  private perfUpdateCallback: ((data: Record<string, unknown>) => void) | null = null;
  private latestProductSnapshot: CoreProductSnapshot | null = null;
  private adapterState: Record<string, unknown> = {};
  private readonly leadPresetDataLoader = new CoreProductLeadPresetDataLoader((patch) => this.patchAdapterState(patch));
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
  private synthSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private drumSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null;
  private runtimeReady = false;
  private running = false;
  private readonly journeyMorphClock = new CoreProductJourneyMorphClock({ hasCallback: () => this.displayCallbacks.has('journeyMorphClock'), invoke: (now) => this.invokeDisplayCallback('journeyMorphClock', now), isDocumentVisible: () => this.isDocumentVisible(), nowMs: () => this.nowMs() });
  private readonly diagnostics = new CoreProductHostDiagnostics();
  private midiTimestampOriginSeconds: number | null = null;
  private sequencerTransportStartInFlight = false;
  private pendingSnapshotReloadReason: SnapshotReloadReason | null = null;
  private lastSequencerUiStateRevision = 0;
  private readonly sequencerCache: CoreProductSequencerCacheState = createCoreProductSequencerCacheState();
  private readonly sequencerMorphFeedback = new CoreProductSequencerMorphFeedbackBridge();
  private synthNoteRangeOverrides: ({ min: number; max: number } | null)[] = [null, null, null, null];
  private readonly sequencerHome = createCoreProductSequencerHomeStore();
  private readonly manualSynthDiceState = createCoreProductManualSynthDiceState();
  private readonly sequencerEvolveBridge = new CoreProductSequencerEvolveRuntimeBridge({ adapterState: () => this.adapterState, latestSliderState: () => this.latestSliderState, latestProductSnapshot: () => this.latestProductSnapshot, runtimeReady: () => this.runtimeReady, captureLaneHome: (sequencer, laneIndex) => { if (sequencer === 'synth') this.captureSequencerHomeLane('synth', laneIndex); else this.captureSequencerHomeLane('drum', laneIndex); }, getEnabledSubLanes: (sequencer, laneIndex) => this.enabledSequencerSubLanes(sequencer, laneIndex), postWithHomeCapture: (event) => { this.captureSequencerHomeForEvent(event); this.runtime.postEvent(event); }, publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload) });
  private readonly harmonyStateBridge = new CoreProductHarmonyStateBridge();
  readonly engineMode = 'core-product';
  constructor() {
    this.runtime.setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));
    this.runtime.setVisualTelemetryCallback((telemetry) => this.handleVisualTelemetry(telemetry));
  }
  getAudioContext(): AudioContext | null {
    return this.runtime.audioContext;
  }
  setOutputGain(target: number, durationSeconds = 0): void {
    this.runtime.setOutputGain(target, durationSeconds);
  }
  setDawOutputRouting(config: Parameters<CoreProductRuntime['setDawOutputRouting']>[0]): void {
    this.runtime.setDawOutputRouting(config);
  }
  setDawOutputDeviceId(deviceId: string | null): Promise<boolean> { return this.runtime.setDawOutputDeviceId(deviceId); }
  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    return createCoreProductDynamicsVisualTelemetry(this.latestTelemetry, this.runtime.audioContext?.currentTime ?? 0);
  }
  getGranularActiveGrainCount(): number {
    return this.latestTelemetry?.activeGrains ?? 0;
  }
  getGranularVoicePositions(): [number, number, number, number] {
    const positions = this.latestTelemetry?.granularVoicePositions;
    if (!positions) return [0, 0, 0, 0];
    return [
      this.normalizedPosition(positions[0]),
      this.normalizedPosition(positions[1]),
      this.normalizedPosition(positions[2]),
      this.normalizedPosition(positions[3]),
    ];
  }
  getGranularWriteHeadPosition(): number {
    return this.normalizedPosition(this.latestTelemetry?.granularWriteHeadPosition);
  }
  getCurrentPadFilterFreq(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2FilterFreq ?? 0 : this.latestTelemetry?.pad1FilterFreq ?? 0; }
  getCurrentPadLfoValue(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2Lfo1Value ?? 0 : this.latestTelemetry?.pad1Lfo1Value ?? 0; }
  getSonicParityGraphTapId(trackId: string): number | null { return this.graphTapBridge.getTapId(trackId); }
  startSonicParityGraphCapture(trackId: string, chunkFrames: number): number { return this.graphTapBridge.startCapture(trackId, chunkFrames); }
  flushSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.graphTapBridge.flushCapture(tapId); }
  stopSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.graphTapBridge.stopCapture(tapId); }
  getSonicParityDebugState(): Record<string, unknown> {
    return createCoreProductSonicParityDebugState({
      engineMode: this.engineMode,
      running: this.running,
      runtimeReady: this.runtimeReady,
      runtimeError: this.runtime.error,
      hasOutputNode: Boolean(this.runtime.outputNode),
      latestProductSnapshot: this.latestProductSnapshot,
      latestSliderState: this.latestSliderState,
      latestTelemetry: this.latestTelemetry,
      runtimeWalkDebug: this.modulationRangeBridge.getRuntimeWalkDebugState(),
    });
  }
  getTransportDebugState(): TransportDebugSnapshot | null { return createCoreProductTransportDebugState(this.latestTelemetry, this.latestProductSnapshot?.transport); }
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
  private normalizedPosition(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric <= 0) return 0;
    if (numeric >= 1) return 1;
    return numeric;
  }
  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    this.stateChangeCallback = callback;
  }

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
    this.applyProductStatePatch(patch, snapshotReloadReasonForProductPatch(reason));
  }

  private applyProductStatePatch(patch: Record<string, unknown>, fallbackReloadReason: SnapshotReloadReason): void {
    this.applyProductState({ ...(this.latestSliderState ?? {}), ...patch }, fallbackReloadReason);
  }

  private applyProductState(sliderState: Record<string, unknown>, fallbackReloadReason: SnapshotReloadReason): void {
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
      return;
    }
    if (this.runtimeReady && this.assetRegistrar.hasMissingDefaultAssetsForState()) {
      void this.assetRegistrar.ensureDefaultAssetsForState().then(() => {
        this.applyLatestSnapshotUpdate('asset-reference-change', forceSequencerClockRejoin);
        if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
        if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState); this.publishStateIfHarmonyChanged();
      });
      return;
    }
    this.applyLatestSnapshotUpdate(fallbackReloadReason, forceSequencerClockRejoin);
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
    if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState); this.publishStateIfHarmonyChanged();
  }

  private sequencerTransportRequested(sliderState: Record<string, unknown>): boolean {
    return sliderState.drumEuclidMasterEnabled === true || sliderState.synthEuclideanMasterEnabled === true;
  }

  setSynthEuclidClockDivs(divs: unknown[]): void { this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer: 'synth', suffix: 'ClockDivision', values: divs, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, mapValue: (value) => normalizeClockDivisionValue(value, 16), runtimeReady: this.runtimeReady, post: (event) => this.runtime.postEvent(event) }); }

  setDrumEuclidClockDivs(divs: unknown[]): void { this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer: 'drum', suffix: 'ClockDivision', values: divs, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision, mapValue: (value) => normalizeClockDivisionValue(value, 16), runtimeReady: this.runtimeReady, post: (event) => this.runtime.postEvent(event) }); }

  setSynthEuclidSwings(swings: unknown[]): void { this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer: 'synth', suffix: 'Swing', values: swings, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, mapValue: (value) => normalizeSequencerSwing(value, 0), runtimeReady: this.runtimeReady, post: (event) => this.runtime.postEvent(event) }); }

  setDrumEuclidSwings(swings: unknown[]): void { this.adapterState = applyCoreProductSequencerLaneParamSet({ adapterState: this.adapterState, sequencer: 'drum', suffix: 'Swing', values: swings, paramId: KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, mapValue: (value) => normalizeSequencerSwing(value, 0), runtimeReady: this.runtimeReady, post: (event) => this.runtime.postEvent(event) }); }

  setSynthEuclidEvolveConfigs(configs: unknown[]): void { this.patchAdapterState({ synthEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'synth') }); }

  setDrumEuclidEvolveConfigs(configs: unknown[]): void { this.patchAdapterState({ drumEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'drum') }); }

  setSynthSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.synthSubLaneEnabled = normalizeSubLaneEnabledStates(states);
    this.clearSequencerMorphFeedback();
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.drumSubLaneEnabled = normalizeSubLaneEnabledStates(states);
    this.clearSequencerMorphFeedback();
    this.syncSequencerStepToggles('drum', true);
  }
  setDrumPitchSettings(settings: unknown[]): void { const source = Array.isArray(settings) ? settings : []; const normalized = normalizeSequencerPitchSettingsArray(source, Math.max(4, Math.min(16, source.length || 4))); this.adapterState = { ...this.adapterState, drumPitchSettings: normalized }; this.syncSequencerPitchSettings('drum'); }
  setSynthPitchSettings(settings: unknown[]): void { const source = Array.isArray(settings) ? settings : []; const normalized = normalizeSequencerPitchSettingsArray(source, Math.max(4, Math.min(16, source.length || 4))); this.adapterState = { ...this.adapterState, synthPitchSettings: normalized }; this.syncSequencerPitchSettings('synth'); this.syncSynthNoteRanges(); }

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
      visibleLaneCount: PRODUCT_VISIBLE_DRUM_LANE_COUNT,
      consumeManualDice: (laneIndex) => this.sequencerHome.consumeManualDiceIfReady('synth', laneIndex),
    });
    cache.toggles = next.toggles;
    cache.values = next.values;
    cache.configs = next.configs;
    for (const laneIndex of next.manualDiceCaptureLanes) this.captureSequencerHomeLane('synth', laneIndex, true);
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumStepOverrides(overrides: unknown): void {
    const cache = selectCoreProductSequencerCache(this.sequencerCache, 'drum');
    const next = applyCoreProductDrumStepOverrides({
      overrides,
      previousToggles: cache.toggles,
      previousValues: cache.values,
      previousConfigs: cache.configs,
      drumBaseMidi: (laneIndex) => this.drumLaneBaseMidi(laneIndex),
      visibleLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT,
      consumeManualDice: (laneIndex) => this.sequencerHome.consumeManualDice('drum', laneIndex),
    });
    cache.toggles = next.toggles;
    cache.values = next.values;
    cache.configs = next.configs;
    for (const laneIndex of next.manualDiceCaptureLanes) this.captureSequencerHomeLane('drum', laneIndex, true);
    this.captureSequencerHomeLanes('drum', true);
    this.syncSequencerStepToggles('drum', true);
  }

  setSequencerPresetHomeSnapshots(drumPitchSettings?: readonly (SequencerPitchSettings | null | undefined)[], drumPitchStates?: readonly (SequencerLanePitchState | null | undefined)[], synthPitchStates?: readonly (SequencerLanePitchState | null | undefined)[]): void { this.captureSequencerHomeLanes('synth', false, true, undefined, synthPitchStates); this.captureSequencerHomeLanes('drum', false, true, drumPitchSettings, drumPitchStates); }
  captureSynthEuclidLaneHome(laneIndex: number, pitchState?: SequencerLanePitchState | null): void { this.captureSequencerHomeLane('synth', laneIndex, true, false, undefined, pitchState); }
  captureDrumEuclidLaneHome(laneIndex: number, pitchSettings?: SequencerPitchSettings | null, pitchState?: SequencerLanePitchState | null): void { this.captureSequencerHomeLane('drum', laneIndex, true, false, pitchSettings, pitchState); }
  private drumLaneBaseMidi(laneIndex: number): number {
    const value = this.latestProductSnapshot?.drumLanes[laneIndex]?.midiNote;
    return typeof value === 'number' && Number.isFinite(value) ? value : 36 + laneIndex;
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
    this.loadLatestSnapshot('runtime-start');
    await this.runtime.resume();
    this.runtime.postEvent(createCoreProductStartEvent());
    this.modulationRangeBridge.flushModulationRanges();
    this.running = true;
    this.arrangementBridge.start(this.latestSliderState, this.adapterState);
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async resume(): Promise<void> {
    await this.runtime.resume(); this.resetSequencerEvolveState();
    this.loadLatestSnapshot('runtime-start', true);
    this.runtime.postEvent(createCoreProductStartEvent());
    this.running = true;
    this.arrangementBridge.start(this.latestSliderState, this.adapterState);
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async suspend(): Promise<void> {
    this.arrangementBridge.stop();
    this.runtime.postEvent(createCoreProductStopEvent());
    await this.runtime.suspend(); this.resetSequencerEvolveState();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  stop(): void {
    this.arrangementBridge.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
    void this.runtime.suspend(); this.resetSequencerEvolveState();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  dispose(): void {
    this.arrangementBridge.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
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
      this.loadLatestSnapshot('runtime-bootstrap');
    });
  }

  resetCofDrift(): void {
    this.loadLatestSnapshot('explicit-reset-request');
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
    if (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex > 5) {
      throw new Error(`Core Product synth trigger voiceIndex must be an integer in [0, 5]: ${String(voiceIndex)}`);
    }
    const midi = midiFromFrequency(frequency);
    const triggerVelocity = requireFiniteRange(velocity, 'synth trigger velocity', 0.000001, 1);
    const durationSeconds = requirePositive(noteDuration, 'synth trigger duration');
    if (padParamsOverride) this.applyProductStatePatch(padParamsOverride, snapshotReloadReasonForProductPatch('ui-control-change'));
    const pad2Assign = typeof this.latestSliderState?.pad2VoiceAssign === 'number' ? Math.round(this.latestSliderState.pad2VoiceAssign) & 0x3f : 0;
    const targetSource = this.latestSliderState?.pad2Enabled === true && (pad2Assign & (1 << voiceIndex)) !== 0
      ? CORE_PRODUCT_SOURCE_IDS.pad2
      : CORE_PRODUCT_SOURCE_IDS.pad1;
    const post = () => {
      this.runtime.postEvent(createCoreProductManualNoteEvent(targetSource, midi, triggerVelocity, durationSeconds * 1000, voiceIndex));
    };
    if (this.runtimeReady) { if (this.runtime.audioContext?.state === 'running') { post(); return; } void this.runtime.resume().then(post); return; }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      this.loadLatestSnapshot('runtime-bootstrap');
      return this.runtime.resume();
    }).then(post);
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
    void this.runtime.ensureStarted().then(() => { this.runtimeReady = true; this.loadLatestSnapshot('runtime-bootstrap'); return this.runtime.resume(); }).then(post);
  }

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
  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    this.setDisplayCallback('drumStepPosition', callback);
    callback?.([0, 0, 0, 0], [0, 0, 0, 0]);
  }
  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    this.setDisplayCallback('synthStepPosition', callback);
    callback?.([0, 0, 0, 0], [0, 0, 0, 0]);
  }
  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('drumEuclidEvolve', callback); }
  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void { this.setDisplayCallback('synthEuclidEvolve', callback); }
  setGranularUiActive(active: boolean): void {
    this.displayCallbacks.setValue('granularUiActive', active);
    this.runtime.setGranularWaveformTelemetryActive(active);
  }

  async triggerDrumVoice(
    voice: unknown,
    velocity: number,
    externalState?: Record<string, unknown>,
  ): Promise<void> {
    const voiceIndex = drumVoiceIndex(voice);
    const triggerVelocity = requireFiniteRange(velocity, 'drum trigger velocity', 0.000001, 1);
    if (externalState) {
      this.latestSliderState = { ...externalState, drumEnabled: true };
    }
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.runtime.resume();
    this.applyLatestSnapshotUpdate('runtime-bootstrap');
    this.runtime.postEvent(createCoreProductDrumTriggerEvent(voiceIndex, triggerVelocity));
    this.invokeDisplayCallback('drumTrigger', voice, triggerVelocity);
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
    const manualNote = requireManualNote(note);
    this.latestSliderState = manualAuditionState(manualNote.source, externalState ?? this.latestSliderState ?? undefined);
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.runtime.resume();
    if (manualNote.source === 'piano') {
      this.applyLatestSnapshotUpdate('manual-piano-asset');
      await this.assetRegistrar.ensurePianoAssetForNote(manualNote.midi, manualNote.velocity);
    } else {
      this.applyLatestSnapshotUpdate('runtime-bootstrap');
    }
    this.runtime.postEvent(createCoreProductManualNoteEvent(
      sourceId(manualNote.source),
      manualNote.midi,
      manualNote.velocity,
      manualNote.durationMs,
      manualNote.source === 'pad1' || manualNote.source === 'pad2' ? manualNote.voiceIndex : undefined,
    ));
  }

  async auditionSynthNotes(
    notes: ManualSynthNoteOptions[],
    externalState?: Record<string, unknown>,
  ): Promise<void> {
    const manualNotes = notes.map(requireManualNote);
    let nextState = { ...(externalState ?? this.latestSliderState ?? {}) };
    for (const note of manualNotes) {
      nextState = manualAuditionState(note.source, nextState);
    }
    this.latestSliderState = nextState;
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.runtime.resume();
    if (manualNotes.some((note) => note.source === 'piano')) {
      this.applyLatestSnapshotUpdate('manual-piano-asset');
      await Promise.all(
        manualNotes
          .filter((note) => note.source === 'piano')
          .map((note) => this.assetRegistrar.ensurePianoAssetForNote(note.midi, note.velocity)),
      );
    } else {
      this.applyLatestSnapshotUpdate('runtime-bootstrap');
    }
    for (const note of manualNotes) {
      this.runtime.postEvent(createCoreProductManualNoteEvent(
        sourceId(note.source),
        note.midi,
        note.velocity,
        note.durationMs,
        note.source === 'pad1' || note.source === 'pad2' ? note.voiceIndex : undefined,
      ));
    }
  }

  private loadLatestSnapshot(reason: SnapshotReloadReason = 'product-patch', includeClockStartDelay = reason === 'runtime-start'): void {
    if (!this.runtimeReady) return;
    const result = loadCoreProductSnapshot({
      runtime: this.runtime,
      snapshot: this.createLatestSnapshot(includeClockStartDelay),
      reason,
      nowMs: () => this.nowMs(),
      afterLoad: () => this.afterProductSnapshotLoad(),
    });
    this.latestProductSnapshot = result.snapshot;
    this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs);
  }

  private applyLatestSnapshotUpdate(reason: SnapshotReloadReason = 'product-patch', forceSequencerClockRejoin = false): void {
    if (!this.runtimeReady) return;
    const result = applyCoreProductSnapshotUpdate({
      runtime: this.runtime,
      previousSnapshot: this.latestProductSnapshot,
      nextSnapshot: this.createLatestSnapshot(forceSequencerClockRejoin),
      fallbackReloadReason: reason,
      pendingReloadReason: this.pendingSnapshotReloadReason,
      forceSequencerClockRejoin,
      forwardRngDiffs: shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry),
      nowMs: () => this.nowMs(),
      afterFullSnapshotLoad: () => this.afterProductSnapshotLoad(),
    });
    this.latestProductSnapshot = result.snapshot;
    this.pendingSnapshotReloadReason = null;
    if (result.mode === 'dirty-diff') {
      this.diagnostics.recordDirtyDiff();
      return;
    }
    this.diagnostics.recordFullSnapshotReload(result.reason, result.cpuMs);
  }

  private afterProductSnapshotLoad(): void {
    this.flushSequencerStepToggles();
    this.syncSynthPitchBindingModes();
    this.syncSequencerPitchSettings();
    this.syncSynthNoteRanges();
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
    publishCoreProductSequencerVisuals({ telemetry, snapshot: this.latestProductSnapshot, state: this.latestSliderState ? { ...this.latestSliderState, ...this.adapterState } : this.adapterState, synthToggles: selectCoreProductSequencerCache(this.sequencerCache, 'synth').toggles, drumToggles: selectCoreProductSequencerCache(this.sequencerCache, 'drum').toggles, sampleRate: telemetry?.sampleRate ?? this.runtime.audioContext?.sampleRate ?? 48000, publish: (name, steps, hitCounts) => this.invokeDisplayCallback(name, steps, hitCounts) });
  }

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
    return applyCoreProductManualSynthDice({ state: this.manualSynthDiceState, laneIndex, intensity, cache: this.sequencerCacheState(), adapterState: this.adapterState, latestSliderState: this.latestSliderState, latestProductSnapshot: this.latestProductSnapshot, latestTelemetry: this.latestTelemetry, runtimeReady: this.runtimeReady, armManualDice: () => this.sequencerHome.armManualDice('synth', laneIndex), post: (event) => this.runtime.postEvent(event), publish: (name, ...payload) => this.invokeDisplayCallback(name, ...payload), captureHome: (force = false) => this.captureSequencerHomeLane('synth', laneIndex, force) });
  }

  private handleSequencerUiProductEvent(event: CoreProductEvent): boolean {
    const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null;
    const laneIndex = typeof event.index === 'number' ? event.index : -1;
    if (!sequencer || !Number.isInteger(laneIndex)) return false;

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane) {
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
      return false;
    }

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

  private patchAdapterState(patch: Record<string, unknown>, loadSnapshot = true): void {
    this.adapterState = { ...this.adapterState, ...patch };
    if (loadSnapshot) {
      this.applyLatestSnapshotUpdate();
      if (this.running) this.arrangementBridge.update(this.latestSliderState, this.adapterState);
    }
  }

  private flushSequencerStepToggles(): void {
    this.syncSequencerStepToggles('synth', false);
    this.syncSequencerStepToggles('drum', false);
  }

  private syncSynthPitchBindingModes(): void { if (!this.runtimeReady) return; const modes = Array.isArray(this.adapterState.synthPitchBindingModes) ? this.adapterState.synthPitchBindingModes : []; for (let laneIndex = 0; laneIndex < Math.min(16, modes.length); laneIndex += 1) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode, sequencerPitchBindingModeToProductId(modes[laneIndex]))); }

  private syncSequencerPitchSettings(sequencer?: SequencerKind): void { if (!this.runtimeReady) return; const targets: SequencerKind[] = sequencer ? [sequencer] : ['synth', 'drum']; for (const target of targets) { const key = target === 'synth' ? 'synthPitchSettings' : 'drumPitchSettings'; const settings = Array.isArray(this.adapterState[key]) ? this.adapterState[key] as SequencerPitchSettings[] : []; for (const event of createCoreProductSequencerPitchSettingEvents(target, settings)) this.runtime.postEvent(event); } }

  private syncSynthNoteRanges(): void { if (!this.runtimeReady) return; const pitchSettings = Array.isArray(this.adapterState.synthPitchSettings) ? this.adapterState.synthPitchSettings as SequencerPitchSettings[] : []; const laneCount = Math.max(4, Math.min(16, pitchSettings.length || 4)); for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) { const range = coreProductSynthNoteRangeHome({ laneIndex, state: this.latestSliderState, pitchSettings, current: this.synthNoteRangeOverrides[laneIndex] }); if (!range) continue; this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneNoteRangeMin, range.min)); this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneNoteRangeMax, range.max)); this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, (range.min + range.max) * 0.5)); } }

  private postSequencerControlEvent(event: CoreProductEvent): void {
    const post = () => this.runtime.postEvent(event);
    if (this.runtimeReady) {
      post();
      return;
    }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      this.loadLatestSnapshot('runtime-bootstrap');
      post();
    });
  }

  private stepValueFieldEnabled(sequencer: SequencerKind, laneIndex: number, field: CoreProductStepValueField): boolean { return coreProductStepValueFieldEnabled(this.synthSubLaneEnabled, this.drumSubLaneEnabled, sequencer, laneIndex, field); }

  private syncSequencerStepToggles(sequencer: SequencerKind, forceClear: boolean): void {
    if (!this.runtimeReady) return;
    syncCoreProductSequencerStepState({ sequencer, cache: this.sequencerCacheState(), forceClear, synthSubLaneEnabled: this.synthSubLaneEnabled, drumSubLaneEnabled: this.drumSubLaneEnabled, post: (event) => this.runtime.postEvent(event) });
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
