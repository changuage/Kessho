import type {
  DynamicsVisualTelemetrySnapshot,
  ManualSynthNoteOptions,
} from './engineSharedTypes';
import type { LaneDirection } from './sequencerLaneDirection';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import { createCoreProductSnapshot, usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from './coreProductSnapshot';
import {
  CORE_PRODUCT_SEQUENCER_IDS, CORE_PRODUCT_STEP_TOGGLE_FLAGS, CORE_PRODUCT_STEP_VALUE_FIELDS, CORE_PRODUCT_SOURCE_IDS,
  type CoreProductEvent,
  type CoreProductStepValueField,
  createCoreProductDrumTriggerEvent,
  createCoreProductJourneyEvent,
  createCoreProductJourneyStateEvent,
  createCoreProductManualNoteEvent,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerDiceEvent,
  createCoreProductSequencerLaneParamEvent,
  createCoreProductSequencerResetHomeEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductStartEvent,
  createCoreProductStopEvent,
} from './coreProductEvents';
import { type CoreProductTelemetrySnapshot, type CoreProductVisualTelemetrySnapshot } from './coreProductTelemetry';
import { classifyCoreProductRuntimeFallback, type RuntimeFallbackClassification } from './CoreProductFallbackDiagnostics';
import { CoreProductArrangementScheduler } from './coreProductArrangementScheduler';
import { shouldForwardCoreProductRngDiffs, type SnapshotReloadReason } from './CoreProductRuntimeAdapter';
import { normalizeClockDivisionValue, normalizeDrumSequencerStepValueOverrides, normalizeSequencerStepToggleOverrides, normalizeSequencerStepValueConfigs, normalizeSequencerStepValueOverrides, normalizeSubLaneEnabledStates, type SequencerKind, type SequencerStepToggleOverride, type SequencerStepValueConfig, type SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeFromEventId, sequencerPitchBindingModeToProductId } from './sequencerPitchBinding';
import { normalizeSequencerPitchSettings, normalizeSequencerPitchSettingsArray, type SequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import { normalizeEvolveConfigs } from './CoreProductHostSequencerEvolveConfig';
import { createCoreProductEngineState, drumVoiceIndex, manualAuditionState, midiFromFrequency, requireFiniteRange, requireManualNote, requirePositive, runtimeWalkConfigChanged, runtimeWalkConfigFromState, sourceId } from './CoreProductHostRuntimeGuards';
import { CORE_PRODUCT_GRAPH_TAP_IDS } from './coreProductGraphTaps';
import { CoreProductRuntime, type CoreProductGraphTapCaptureChunk } from './coreProductRuntime';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { createCoreProductDynamicsVisualTelemetry, createCoreProductTransportDebugState } from './CoreProductHostDebugTelemetry';
import { shouldRejoinCoreProductSequencerClocks, withCoreProductClockStartDelayState } from './CoreProductHostSequencerClock';
import { publishCoreProductSequencerVisuals } from './CoreProductHostSequencerVisuals';
import { createCoreProductSequencerEvolveClock } from './CoreProductHostSequencerEvolve';
import { getCoreProductSequencerLaneSwing, patchCoreProductSequencerLaneSwing } from './CoreProductHostSequencerSwing';
import { coreProductSequencerHomePayload, createCoreProductSequencerHomeStore, postCoreProductSequencerLaneStepState } from './CoreProductHostSequencerHome';
import { addCoreProductRangePayload, applyCoreProductRangeSubLanePatch } from './CoreProductHostSequencerRangePayload';
import { coreProductSynthMidiToUiPitch } from './CoreProductHostSynthPitch';
import { coreProductSynthNoteRangeHome, evolveCoreProductSynthNoteRange } from './CoreProductHostSynthNoteRangeEvolve';
import { createCoreProductHostHarmonySnapshot, type CoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import { createCoreProductHostMidiEvent } from './CoreProductHostMidi';
import { CoreProductAssetRegistrar } from './product/host/CoreProductAssetRegistrar';
import { CoreProductHostDiagnostics } from './product/host/CoreProductHostDiagnostics';
import { CoreProductLeadPresetDataLoader } from './product/host/CoreProductLeadPresetDataLoader';
import { CoreProductModulationRangeBridge } from './product/host/CoreProductModulationRangeBridge';
import { snapshotReloadReasonForProductPatch } from './product/host/CoreProductPatchClassifier';
import { applyCoreProductSnapshotUpdate, loadCoreProductSnapshot } from './product/host/CoreProductSnapshotCoordinator';
import { createCoreProductPerfSnapshot, enrichCoreProductHostTelemetry } from './product/host/CoreProductTelemetryAdapter';
import { reconcileCoreProductSequencerUiState } from './product/host/CoreProductSequencerUiAdapter';
import type { CoreProductSubLaneEvolveResult } from './CoreProductHostSequencerSubLaneEvolve';
import type { ProductEngineState, ProductSnapshotPatchReason } from './product/ProductEngineTypes';
import { createWebProductRuntimeCapabilityReport, type ProductRuntimeCapabilityReport } from './product/ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from './product/ProductRuntimeDiagnostics';
const PRODUCT_VISIBLE_SYNTH_LANE_COUNT = 4;
type CoreProductEngineHostProxy = Record<string, unknown>;
class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private readonly arrangementScheduler = new CoreProductArrangementScheduler(
    (event) => this.runtime.postEvent(event),
    () => this.runtime.audioContext,
  );
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetRegistrar = new CoreProductAssetRegistrar(this.runtime, () => this.latestSliderState);
  private readonly displayCallbacks = new Map<string, unknown>();
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
    publish: (name, payload) => this.invokeDisplayCallback(name, payload),
    reportUnsupportedRangeKey: (key) => this.diagnostics.reportUnsupportedRangeKey(key),
  });
  private synthSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private drumSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null;
  private runtimeReady = false;
  private running = false;
  private journeyMorphClockRunning = false;
  private journeyMorphClockRaf: number | null = null;
  private readonly diagnostics = new CoreProductHostDiagnostics();
  private midiTimestampOriginSeconds: number | null = null;
  private sequencerTransportStartInFlight = false;
  private pendingSnapshotReloadReason: SnapshotReloadReason | null = null;
  private lastSequencerUiStateRevision = 0;
  private synthStepToggleOverrides: SequencerStepToggleOverride[][] = [[], [], [], []];
  private drumStepToggleOverrides: SequencerStepToggleOverride[][] = [[], [], [], []];
  private synthStepValueOverrides: SequencerStepValueOverride[][] = [[], [], [], []];
  private drumStepValueOverrides: SequencerStepValueOverride[][] = [[], [], [], []];
  private synthStepValueConfigs: SequencerStepValueConfig[][] = [[], [], [], []];
  private drumStepValueConfigs: SequencerStepValueConfig[][] = [[], [], [], []];
  private synthNoteRangeOverrides: ({ min: number; max: number } | null)[] = [null, null, null, null];
  private readonly sequencerHome = createCoreProductSequencerHomeStore();
  private readonly sequencerEvolveClock = createCoreProductSequencerEvolveClock();
  private uiHarmonySnapshot: CoreProductHostHarmonySnapshot = { harmonyState: null, currentBucket: '', currentSeed: 0, signature: 'none' };
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

  getSonicParityGraphTapId(trackId: string): number | null { return CORE_PRODUCT_GRAPH_TAP_IDS[trackId.startsWith('graph:') ? trackId.slice('graph:'.length) : trackId] ?? null; }
  startSonicParityGraphCapture(trackId: string, chunkFrames: number): number { const tapId = this.getSonicParityGraphTapId(trackId); if (tapId === null) throw new Error(`Unknown Core Product sonic parity graph tap: ${trackId}`); this.runtime.startGraphTapCapture(tapId, chunkFrames); return tapId; }
  flushSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.runtime.flushGraphTapCapture(tapId); }
  stopSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.runtime.stopGraphTapCapture(tapId); }

  getSonicParityDebugState(): Record<string, unknown> {
    const snapshot = createCoreProductSnapshot(this.latestSliderState ?? undefined);
    return {
      engineMode: this.engineMode,
      running: this.running,
      runtimeReady: this.runtimeReady,
      runtimeError: this.runtime.error,
      hasOutputNode: Boolean(this.runtime.outputNode),
      snapshot: {
        master: snapshot.master,
        sources: snapshot.sources.map((source) => ({
          sourceId: source.sourceId,
          enabled: source.enabled,
          level: source.level,
          dryGain: source.dryGain,
          reverbSend: source.reverbSend,
          delayASend: source.delayASend,
          delayBSend: source.delayBSend,
          granularSend: source.granularSend,
          diffuseSend: source.diffuseSend,
          distance: source.distance,
          postLpfHz: source.postLpfHz,
          stereoWidth: source.stereoWidth,
          presetId: source.presetId,
          expression: source.expression,
          soundscapes: source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape ? {
            textureParamCount: snapshot.soundscape.textureParamCount,
            routeParams: snapshot.soundscape.textureParams.slice(0, 16),
            textureParams: snapshot.soundscape.textureParams.slice(17, 37),
            waterActive: snapshot.soundscape.moduleParams[0],
            waterSeed: snapshot.soundscape.moduleParams[60],
            insectsActive: snapshot.soundscape.moduleParams[61],
            insectsSeed: snapshot.soundscape.moduleParams[77],
            insects2Active: snapshot.soundscape.moduleParams[78],
            insects2Seed: snapshot.soundscape.moduleParams[94],
          } : undefined,
        })),
      },
      latestTelemetry: this.latestTelemetry,
    };
  }

  getTransportDebugState(): TransportDebugSnapshot | null { return createCoreProductTransportDebugState(this.latestTelemetry, this.latestProductSnapshot?.transport); }
  private refreshUiHarmonySnapshot(): boolean { const next = createCoreProductHostHarmonySnapshot(this.createLatestArrangementState(), this.latestTelemetry); if (next.signature === this.uiHarmonySnapshot.signature) return false; this.uiHarmonySnapshot = next; return true; }
  private createEngineState(isRunning = this.running || this.latestTelemetry?.transportRunning === true): ProductEngineState { this.refreshUiHarmonySnapshot(); const base = createCoreProductEngineState(isRunning); return { ...base, harmonyState: this.uiHarmonySnapshot.harmonyState, currentSeed: this.uiHarmonySnapshot.currentSeed, currentBucket: this.uiHarmonySnapshot.currentBucket, cofCurrentStep: this.uiHarmonySnapshot.harmonyState?.cof.currentStep ?? base.cofCurrentStep, transportDebug: this.getTransportDebugState() }; }
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
    this.updateParamsWithReason(
      { ...(this.latestSliderState ?? {}), ...patch },
      snapshotReloadReasonForProductPatch(reason),
    );
  }

  updateParams(sliderState: Record<string, unknown>): void {
    this.updateParamsWithReason(sliderState, 'adapter-update');
  }

  private updateParamsWithReason(sliderState: Record<string, unknown>, fallbackReloadReason: SnapshotReloadReason): void {
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
        if (this.running) this.arrangementScheduler.update(this.createLatestArrangementState()); this.publishStateIfHarmonyChanged();
      });
      return;
    }
    this.applyLatestSnapshotUpdate(fallbackReloadReason, forceSequencerClockRejoin);
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.modulationRangeBridge.flushRuntimeWalkRanges();
    if (this.running) this.arrangementScheduler.update(this.createLatestArrangementState()); this.publishStateIfHarmonyChanged();
  }

  private sequencerTransportRequested(sliderState: Record<string, unknown>): boolean {
    return sliderState.drumEuclidMasterEnabled === true || sliderState.synthEuclideanMasterEnabled === true;
  }

  setSynthEuclidClockDivs(divs: unknown[]): void {
    this.patchIndexedAdapterState(
      'synthEuclid',
      'ClockDivision',
      divs,
      (value) => normalizeClockDivisionValue(value, 16),
      false,
    );
    this.syncSequencerLaneParams(
      'synth',
      divs,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
      (value) => normalizeClockDivisionValue(value, 16),
    );
  }

  setDrumEuclidClockDivs(divs: unknown[]): void {
    this.patchIndexedAdapterState(
      'drumEuclid',
      'ClockDivision',
      divs,
      (value) => normalizeClockDivisionValue(value, 16),
      false,
    );
    this.syncSequencerLaneParams(
      'drum',
      divs,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
      (value) => normalizeClockDivisionValue(value, 16),
    );
  }

  setSynthEuclidSwings(swings: unknown[]): void {
    this.patchIndexedAdapterState('synthEuclid', 'Swing', swings, (value) => normalizeSequencerSwing(value, 0), false);
    this.syncSequencerLaneParams(
      'synth',
      swings,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
      (value) => normalizeSequencerSwing(value, 0),
    );
  }

  setDrumEuclidSwings(swings: unknown[]): void {
    this.patchIndexedAdapterState('drumEuclid', 'Swing', swings, (value) => normalizeSequencerSwing(value, 0), false);
    this.syncSequencerLaneParams(
      'drum',
      swings,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
      (value) => normalizeSequencerSwing(value, 0),
    );
  }

  setSynthEuclidEvolveConfigs(configs: unknown[]): void {
    this.patchAdapterState({
      synthEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'synth'),
    });
  }

  setDrumEuclidEvolveConfigs(configs: unknown[]): void {
    this.patchAdapterState({
      drumEuclidEvolveConfigs: normalizeEvolveConfigs(configs, 'drum'),
    });
  }

  setSynthSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.synthSubLaneEnabled = normalizeSubLaneEnabledStates(states);
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.drumSubLaneEnabled = normalizeSubLaneEnabledStates(states);
    this.syncSequencerStepToggles('drum', true);
  }
  setSynthPitchSettings(settings: unknown[]): void { const source = Array.isArray(settings) ? settings : []; this.adapterState = { ...this.adapterState, synthPitchSettings: normalizeSequencerPitchSettingsArray(source, Math.max(4, Math.min(16, source.length || 4))) }; }

  setSynthPitchBindingModes(modes: unknown[]): void {
    const source = Array.isArray(modes) ? modes : [];
    this.adapterState = {
      ...this.adapterState,
      synthPitchBindingModes: Array.from({ length: Math.max(4, Math.min(16, source.length || 4)) }, (_, index) => normalizeSequencerPitchBindingMode(source[index])),
    };
    this.syncSynthPitchBindingModes();
  }

  setSynthStepOverrides(overrides: unknown): void {
    this.synthStepToggleOverrides = normalizeSequencerStepToggleOverrides(
      overrides,
      this.synthStepToggleOverrides,
    );
    this.synthStepValueOverrides = normalizeSequencerStepValueOverrides(
      overrides,
      this.synthStepValueOverrides,
      true,
    );
    this.synthStepValueConfigs = normalizeSequencerStepValueConfigs(
      overrides,
      this.synthStepValueConfigs,
      true,
    );
    for (let laneIndex = 0; laneIndex < PRODUCT_VISIBLE_SYNTH_LANE_COUNT; laneIndex += 1) if (this.sequencerHome.consumeManualDice('synth', laneIndex)) this.captureSequencerHomeLane('synth', laneIndex, true);
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumStepOverrides(overrides: unknown): void {
    this.drumStepToggleOverrides = normalizeSequencerStepToggleOverrides(
      overrides,
      this.drumStepToggleOverrides,
    );
    this.drumStepValueOverrides = normalizeDrumSequencerStepValueOverrides(
      overrides,
      this.drumStepValueOverrides,
      (laneIndex) => this.drumLaneBaseMidi(laneIndex),
    );
    this.drumStepValueConfigs = normalizeSequencerStepValueConfigs(
      overrides,
      this.drumStepValueConfigs,
      true,
    );
    this.captureSequencerHomeLanes('drum', true);
    this.syncSequencerStepToggles('drum', true);
  }

  setSequencerPresetHomeSnapshots(): void { this.captureSequencerHomeLanes('synth', false, true); this.captureSequencerHomeLanes('drum', false, true); }
  captureSynthEuclidLaneHome(laneIndex: number, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void { this.captureSequencerHomeLane('synth', laneIndex, true, false, undefined, pitchState); }
  captureDrumEuclidLaneHome(laneIndex: number, pitchSettings?: SequencerPitchSettings | null, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void { this.captureSequencerHomeLane('drum', laneIndex, true, false, pitchSettings, pitchState); }
  private drumLaneBaseMidi(laneIndex: number): number {
    const value = this.latestProductSnapshot?.drumLanes[laneIndex]?.midiNote;
    return typeof value === 'number' && Number.isFinite(value) ? value : 36 + laneIndex;
  }

  async start(sliderState?: Record<string, unknown>): Promise<void> {
    if (sliderState) {
      this.latestSliderState = { ...sliderState };
    }
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.assetRegistrar.ensureDefaultAssetsForState(); this.sequencerEvolveClock.reset();
    this.loadLatestSnapshot('runtime-start');
    await this.runtime.resume();
    this.runtime.postEvent(createCoreProductStartEvent());
    this.modulationRangeBridge.flushModulationRanges();
    this.running = true;
    this.arrangementScheduler.start(this.createLatestArrangementState());
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async resume(): Promise<void> {
    await this.runtime.resume(); this.sequencerEvolveClock.reset();
    this.loadLatestSnapshot('runtime-start', true);
    this.runtime.postEvent(createCoreProductStartEvent());
    this.running = true;
    this.arrangementScheduler.start(this.createLatestArrangementState());
    this.stateChangeCallback?.(this.createEngineState(true));
  }

  async suspend(): Promise<void> {
    this.arrangementScheduler.stop();
    this.runtime.postEvent(createCoreProductStopEvent());
    await this.runtime.suspend(); this.sequencerEvolveClock.reset();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  stop(): void {
    this.arrangementScheduler.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
    void this.runtime.suspend(); this.sequencerEvolveClock.reset();
    this.running = false; this.synthNoteRangeOverrides = [null, null, null, null];
    this.resetSequencerVisuals();
    this.stateChangeCallback?.(this.createEngineState(false));
  }

  dispose(): void {
    this.arrangementScheduler.stop();
    if (this.runtimeReady) {
      this.runtime.postEvent(createCoreProductStopEvent());
    }
    this.runtime.dispose();
    this.runtimeReady = false; this.sequencerEvolveClock.reset();
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
    if (padParamsOverride) this.updateParams(padParamsOverride);
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
  setGranularUiActive(active: boolean): void { this.displayCallbacks.set('granularUiActive', active); }

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
    if (this.journeyMorphClockRunning || !this.displayCallbacks.has('journeyMorphClock')) return;
    this.journeyMorphClockRunning = true;
    const phase = this.latestTelemetry?.journeyMorphPhase ?? 0;
    this.adapterState = {
      ...this.adapterState,
      journeyEnabled: true,
      journeyMorphPhase: phase,
    };
    this.postSequencerControlEvent(createCoreProductJourneyEvent(true));
    this.postSequencerControlEvent(createCoreProductJourneyStateEvent(true, phase));
    this.scheduleJourneyMorphClockTick();
  }

  stopJourneyMorphClock(): void {
    this.journeyMorphClockRunning = false;
    this.cancelJourneyMorphClockTick();
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
      await this.assetRegistrar.ensurePianoAssetForNote(manualNote.midi, manualNote.velocity);
      this.applyLatestSnapshotUpdate('manual-piano-asset');
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
      await Promise.all(
        manualNotes
          .filter((note) => note.source === 'piano')
          .map((note) => this.assetRegistrar.ensurePianoAssetForNote(note.midi, note.velocity)),
      );
      this.applyLatestSnapshotUpdate('manual-piano-asset');
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

  private loadLatestSnapshot(reason: SnapshotReloadReason = 'adapter-update', includeClockStartDelay = reason === 'runtime-start'): void {
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

  private applyLatestSnapshotUpdate(reason: SnapshotReloadReason = 'adapter-update', forceSequencerClockRejoin = false): void {
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
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private createLatestSnapshot(includeClockStartDelay = false): CoreProductSnapshot {
    const hasAdapterState = Object.keys(this.adapterState).length > 0;
    const baseSnapshotState = this.latestSliderState
      ? { ...this.latestSliderState, ...this.adapterState, journeyEnabled: this.journeyMorphClockRunning }
      : hasAdapterState
      ? { ...this.adapterState, journeyEnabled: this.journeyMorphClockRunning }
      : this.journeyMorphClockRunning
      ? { journeyEnabled: true }
      : undefined;
    const telemetryRngState = !usesLegacyGranularRuntimeSeed(baseSnapshotState) && (this.latestTelemetry?.rngSeed || this.latestTelemetry?.rngState)
      ? {
        rngSeed: this.latestTelemetry.rngSeed,
        rngState: this.latestTelemetry.rngState,
      }
      : {};
    const snapshotState = baseSnapshotState
      ? { ...telemetryRngState, ...baseSnapshotState }
      : Object.keys(telemetryRngState).length > 0
      ? telemetryRngState
      : undefined;
    const snapshot = createCoreProductSnapshot(includeClockStartDelay ? withCoreProductClockStartDelayState(snapshotState) : snapshotState);
    snapshot.transport.running = this.running;
    return snapshot;
  }

  private createLatestArrangementState(): Record<string, unknown> | null {
    if (!this.latestSliderState && Object.keys(this.adapterState).length === 0) return null;
    return {
      ...(this.latestSliderState ?? {}),
      ...this.adapterState,
    };
  }

  private handleTelemetry(telemetry: CoreProductTelemetrySnapshot): void {
    const hostTelemetry = this.withHostDiagnostics(telemetry);
    this.latestTelemetry = hostTelemetry;
    if (this.journeyMorphClockRunning && typeof hostTelemetry.journeyMorphPhase === 'number') {
      this.adapterState = {
        ...this.adapterState,
        journeyEnabled: true,
        journeyMorphPhase: hostTelemetry.journeyMorphPhase,
      };
    }
    if (this.journeyMorphClockRunning && this.displayCallbacks.has('journeyMorphClock')) {
      if (this.isDocumentVisible()) {
        if (this.journeyMorphClockRaf === null) this.scheduleJourneyMorphClockTick();
      } else {
        this.invokeDisplayCallback('journeyMorphClock', this.nowMs());
      }
    }
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry);
    this.tickSequencerEvolveClock(hostTelemetry); this.reconcileSequencerUiState(hostTelemetry); this.publishStateIfHarmonyChanged();
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
    const previous = this.latestTelemetry;
    const merged: CoreProductTelemetrySnapshot = {
      ...(previous ?? {}),
      ...telemetry,
      schemaHash: telemetry.schemaHash, transportRunning: telemetry.transportRunning ?? this.running,
      activeSources: previous?.activeSources ?? 0, activeVoices: previous?.activeVoices ?? 0, activeAssets: previous?.activeAssets ?? 0,
      sequencerEventCount: previous?.sequencerEventCount ?? 0, controlQueueDepth: previous?.controlQueueDepth ?? 0, assetMissingCount: previous?.assetMissingCount ?? 0, lastErrorCode: previous?.lastErrorCode ?? 0,
    };
    const hostTelemetry = this.withHostDiagnostics(merged);
    this.latestTelemetry = hostTelemetry;
    this.modulationRangeBridge.updateRuntimeWalkPositions(hostTelemetry);
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.publishSequencerVisuals(hostTelemetry);
  }
  private tickSequencerEvolveClock(hostTelemetry: CoreProductTelemetrySnapshot): void { this.sequencerEvolveClock.tick({ telemetry: hostTelemetry, synthConfigs: this.adapterState.synthEuclidEvolveConfigs, drumConfigs: this.adapterState.drumEuclidEvolveConfigs, post: (event) => { this.captureSequencerHomeForEvent(event); this.runtime.postEvent(event); }, publish: (name, laneIndex) => this.invokeDisplayCallback(name, laneIndex), getSwing: (sequencer, laneIndex) => getCoreProductSequencerLaneSwing(this.adapterState, this.latestSliderState, sequencer, laneIndex), setSwing: (sequencer, laneIndex, swing) => { this.captureSequencerHomeLane(sequencer, laneIndex); this.setEvolvedSequencerLaneSwing(sequencer, laneIndex, swing); }, getEnabledSubLanes: (sequencer, laneIndex) => this.enabledSequencerSubLanes(sequencer, laneIndex), getSubLaneConfigs: (sequencer, laneIndex) => this.getSequencerStepValueConfigs(sequencer, laneIndex), getStepValueOverrides: (sequencer, laneIndex) => this.getSequencerStepValueOverrides(sequencer, laneIndex), setSubLaneConfigs: (sequencer, laneIndex, result) => { this.captureSequencerHomeLane(sequencer, laneIndex); this.setEvolvedSequencerSubLaneConfigs(sequencer, laneIndex, result); }, evolveSynthNoteRange: (laneIndex, config, seed) => { this.captureSequencerHomeLane('synth', laneIndex); const home = this.sequencerHome.restore('synth', laneIndex)?.noteRange ?? null; const evolved = evolveCoreProductSynthNoteRange({ laneIndex, config, seed, state: this.latestSliderState, pitchSettings: this.adapterState.synthPitchSettings, current: this.synthNoteRangeOverrides[laneIndex], home }); if (evolved.range && typeof evolved.midiNote === 'number') { this.synthNoteRangeOverrides[laneIndex] = evolved.range; if (this.runtimeReady) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, evolved.midiNote)); this.invokeDisplayCallback('synthNoteRangeEvolved', laneIndex, evolved.range.min, evolved.range.max); } return { handled: evolved.handled, changed: !!evolved.range }; } }); }

  private publishSequencerVisuals(telemetry: CoreProductTelemetrySnapshot | null): void {
    publishCoreProductSequencerVisuals({ telemetry, snapshot: this.latestProductSnapshot, state: this.latestSliderState ? { ...this.latestSliderState, ...this.adapterState } : this.adapterState, synthToggles: this.synthStepToggleOverrides, drumToggles: this.drumStepToggleOverrides, sampleRate: telemetry?.sampleRate ?? this.runtime.audioContext?.sampleRate ?? 48000, publish: (name, steps, hitCounts) => this.invokeDisplayCallback(name, steps, hitCounts) });
  }

  private resetSequencerVisuals(): void { this.publishSequencerVisuals(null); }

  private captureSequencerHomeForEvent(event: CoreProductEvent): void { const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null; const laneIndex = typeof event.index === 'number' ? event.index : -1; if (sequencer) this.captureSequencerHomeLane(sequencer, laneIndex); }

  private handleSequencerUiProductEvent(event: CoreProductEvent): boolean {
    const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null;
    const laneIndex = typeof event.index === 'number' ? event.index : -1;
    if (!sequencer || !Number.isInteger(laneIndex)) return false;

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane) {
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision) {
        this.patchSequencerLaneAdapterParam(sequencer, laneIndex, 'ClockDivision', normalizeClockDivisionValue(event.value, 16));
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing) {
        this.patchSequencerLaneAdapterParam(sequencer, laneIndex, 'Swing', normalizeSequencerSwing(event.value, 0));
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      if (event.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode) {
        if (sequencer !== 'synth') return false;
        this.patchSynthPitchBindingModeFromEvent(laneIndex, event);
        if (this.runtimeReady) this.runtime.postEvent(event);
        return true;
      }
      return false;
    }

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome) {
      if (this.restoreSequencerLaneHome(sequencer, laneIndex)) return true;
      if (sequencer === 'synth') return true;
      this.postSequencerControlEvent(event);
      return true;
    }

    if (event.eventKind === KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane) {
      this.sequencerHome.armManualDice(sequencer, laneIndex);
      this.postSequencerControlEvent(event);
      this.invokeDisplayCallback(sequencer === 'synth' ? 'synthEuclidEvolve' : 'drumEuclidEvolve', laneIndex);
      return true;
    }

    return false;
  }

  private patchSequencerLaneAdapterParam(sequencer: SequencerKind, laneIndex: number, suffix: 'ClockDivision' | 'Swing', value: number): void {
    if (laneIndex < 0 || laneIndex >= 16) return;
    const prefix = sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid';
    this.adapterState = { ...this.adapterState, [`${prefix}${laneIndex + 1}${suffix}`]: value };
  }

  private patchSynthPitchBindingModeFromEvent(laneIndex: number, event: CoreProductEvent): void {
    if (laneIndex < 0 || laneIndex >= 16) return;
    const existing = Array.isArray(this.adapterState.synthPitchBindingModes)
      ? this.adapterState.synthPitchBindingModes
      : [];
    const laneCount = Math.max(4, Math.min(16, Math.max(existing.length, laneIndex + 1)));
    const modes = Array.from({ length: laneCount }, (_, index) =>
      normalizeSequencerPitchBindingMode(existing[index])
    );
    modes[laneIndex] = sequencerPitchBindingModeFromEventId(
      event.value2,
      event.value === 1 ? 'sequence' : 'polyrhythmic',
    );
    this.adapterState = { ...this.adapterState, synthPitchBindingModes: modes };
  }

  private captureSequencerHomeLanes(sequencer: SequencerKind, requireContent = false, force = false): void { const lanes = sequencer === 'synth' ? this.synthStepToggleOverrides : this.drumStepToggleOverrides; const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides; const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs; const laneCount = Math.max(lanes.length, values.length, configs.length); for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) this.captureSequencerHomeLane(sequencer, laneIndex, force, requireContent); }

  private captureSequencerHomeLane(sequencer: SequencerKind, laneIndex: number, force = false, requireContent = false, drumPitchSettings?: SequencerPitchSettings | null, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void { if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= 16) return; this.ensureSequencerLaneCache(sequencer, laneIndex); const toggles = sequencer === 'synth' ? this.synthStepToggleOverrides : this.drumStepToggleOverrides; const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides; const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs; const noteRange = sequencer === 'synth' ? coreProductSynthNoteRangeHome({ laneIndex, state: this.latestSliderState, pitchSettings: this.adapterState.synthPitchSettings, current: this.synthNoteRangeOverrides[laneIndex] }) : null; const synthPitchSettings = Array.isArray(this.adapterState.synthPitchSettings) ? this.adapterState.synthPitchSettings[laneIndex] : undefined; const pitchSettings = sequencer === 'synth' ? normalizeSequencerPitchSettings(synthPitchSettings) : drumPitchSettings ? normalizeSequencerPitchSettings(drumPitchSettings) : null; const pitchSubLaneState = pitchState ? { steps: pitchState.steps, direction: pitchState.direction, scaleQuantize: pitchState.scaleQuantize } : null; this.sequencerHome.capture(sequencer, laneIndex, { toggles: toggles[laneIndex] ?? [], values: values[laneIndex] ?? [], configs: configs[laneIndex] ?? [], swing: getCoreProductSequencerLaneSwing(this.adapterState, this.latestSliderState, sequencer, laneIndex), ...(noteRange ? { noteRange } : {}), ...(pitchSettings ? { pitchSettings } : {}), ...(pitchSubLaneState ? { pitchSubLaneState } : {}) }, { force, requireContent }); }

  private restoreSequencerLaneHome(sequencer: SequencerKind, laneIndex: number): boolean { const index = Math.max(0, Math.min(15, Math.trunc(laneIndex))); const home = this.sequencerHome.restore(sequencer, index); if (!home) return false; this.ensureSequencerLaneCache(sequencer, index); const toggles = sequencer === 'synth' ? this.synthStepToggleOverrides : this.drumStepToggleOverrides; const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides; const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs; toggles[index] = home.toggles; values[index] = home.values; configs[index] = home.configs; const swingPatch = patchCoreProductSequencerLaneSwing(this.adapterState, sequencer, index, home.swing); this.adapterState = swingPatch.adapterState; const restored = { ...home, swing: swingPatch.swing }; if (this.runtimeReady) postCoreProductSequencerLaneStepState({ sequencer, laneIndex: index, state: restored, fieldEnabled: (field) => this.stepValueFieldEnabled(sequencer, index, field), post: (event) => this.runtime.postEvent(event) }); if (sequencer === 'synth') { this.synthNoteRangeOverrides[index] = null; if (home.noteRange) { const midiNote = (home.noteRange.min + home.noteRange.max) * 0.5; if (this.runtimeReady) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', index, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, midiNote)); this.invokeDisplayCallback('synthNoteRangeEvolved', index, home.noteRange.min, home.noteRange.max); } } const baseMidi = sequencer === 'synth' ? this.latestProductSnapshot?.synthLanes[index]?.midiNote ?? 60 : this.drumLaneBaseMidi(index); this.invokeDisplayCallback(sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides', index, coreProductSequencerHomePayload(sequencer, index, restored, baseMidi, this.adapterState.synthPitchSettings)); return true; }

  private setEvolvedSequencerLaneSwing(sequencer: SequencerKind, laneIndex: number, swing: number): void {
    this.captureSequencerHomeLane(sequencer, laneIndex);
    const patched = patchCoreProductSequencerLaneSwing(this.adapterState, sequencer, laneIndex, swing); this.adapterState = patched.adapterState;
    if (this.runtimeReady) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent(sequencer, laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing, patched.swing)); this.invokeDisplayCallback(sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides', laneIndex, { swing: patched.swing });
  }

  private getSequencerStepValueConfigs(sequencer: SequencerKind, laneIndex: number): SequencerStepValueConfig[] {
    this.ensureSequencerLaneCache(sequencer, laneIndex);
    const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs;
    return (configs[laneIndex] ?? []).map((entry) => ({ ...entry }));
  }

  private enabledSequencerSubLanes(sequencer: SequencerKind, laneIndex: number): string[] { const state = (sequencer === 'synth' ? this.synthSubLaneEnabled : this.drumSubLaneEnabled)[laneIndex] ?? {}; return ['probability', 'ratchet', ...['pitch', 'expression', 'morph', 'distance'].filter((lane) => state[lane] === true)]; }

  private getSequencerStepValueOverrides(sequencer: SequencerKind, laneIndex: number): SequencerStepValueOverride[] { this.ensureSequencerLaneCache(sequencer, laneIndex); const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides; return (values[laneIndex] ?? []).map((entry) => ({ ...entry })); }

  private setEvolvedSequencerSubLaneConfigs(sequencer: SequencerKind, laneIndex: number, result: CoreProductSubLaneEvolveResult): void {
    this.ensureSequencerLaneCache(sequencer, laneIndex);
    this.captureSequencerHomeLane(sequencer, laneIndex);
    const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs;
    configs[laneIndex] = result.configs.map((entry) => ({ ...entry }));
    const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides;
    if (result.valueOverrides) values[laneIndex] = result.valueOverrides.map((entry) => ({ ...entry }));
    if (this.runtimeReady) {
      for (const config of configs[laneIndex] ?? []) this.runtime.postEvent(createCoreProductSequencerSubLaneConfigEvent(sequencer, laneIndex, config.field, config.steps, config.direction));
      if (result.changedValueFields) this.postSequencerStepValueOverrides(sequencer, laneIndex, values[laneIndex] ?? [], result.changedValueFields);
    }
    const subLaneStates = applyCoreProductRangeSubLanePatch({ ...result.subLaneStates }, values[laneIndex] ?? []);
    const payload: Record<string, unknown> = { subLaneStates };
    addCoreProductRangePayload(payload, sequencer, laneIndex, values[laneIndex] ?? []);
    for (const [key, direction] of Object.entries(result.directionPayloads)) {
      if (sequencer === 'synth') payload[key] = direction;
      else {
        const lanes: (string | null)[] = [null, null, null, null];
        lanes[laneIndex] = direction;
        payload[key] = lanes;
      }
    }
    for (const field of result.changedValueFields ?? []) {
      const key = this.stepValueFieldPayloadKey(field);
      const fieldValues = key ? this.evolvedStepValuePayload(sequencer, laneIndex, field, values[laneIndex] ?? []) : null;
      if (!key || !fieldValues) continue;
      if (sequencer === 'synth') payload[key] = fieldValues;
      else {
        const lanes: (number[] | null)[] = [null, null, null, null];
        lanes[laneIndex] = fieldValues;
        payload[key] = lanes;
      }
    }
    this.invokeDisplayCallback(sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides', laneIndex, payload);
  }

  private reconcileSequencerUiState(telemetry: CoreProductTelemetrySnapshot): void {
    this.lastSequencerUiStateRevision = reconcileCoreProductSequencerUiState({
      telemetry,
      lastRevision: this.lastSequencerUiStateRevision,
      visibleSynthLaneCount: PRODUCT_VISIBLE_SYNTH_LANE_COUNT,
      synthPitchSettings: this.adapterState.synthPitchSettings,
      synthBaseMidi: (laneIndex) => this.latestProductSnapshot?.synthLanes[laneIndex]?.midiNote ?? 60,
      drumBaseMidi: (laneIndex) => this.drumLaneBaseMidi(laneIndex),
      hasManualSynthDice: (laneIndex) => this.sequencerHome.hasManualDice('synth', laneIndex),
      consumeManualDrumDice: (laneIndex) => this.sequencerHome.consumeManualDice('drum', laneIndex),
      ensureLaneCache: (sequencer, laneIndex) => this.ensureSequencerLaneCache(sequencer, laneIndex),
      captureLaneHome: (sequencer, laneIndex) => this.captureSequencerHomeLane(sequencer, laneIndex, true),
      setSynthLaneState: (laneIndex, state) => {
        this.synthStepToggleOverrides[laneIndex] = state.toggles;
        this.synthStepValueOverrides[laneIndex] = state.values;
        this.synthStepValueConfigs[laneIndex] = state.configs;
      },
      setDrumLaneState: (laneIndex, state) => {
        this.drumStepToggleOverrides[laneIndex] = state.toggles;
        this.drumStepValueOverrides[laneIndex] = state.values;
        this.drumStepValueConfigs[laneIndex] = state.configs;
      },
      publish: (name, laneIndex, payload) => this.invokeDisplayCallback(name, laneIndex, payload),
    });
  }

  private ensureSequencerLaneCache(sequencer: SequencerKind, laneIndex: number): void {
    const toggles = sequencer === 'synth' ? this.synthStepToggleOverrides : this.drumStepToggleOverrides;
    const values = sequencer === 'synth' ? this.synthStepValueOverrides : this.drumStepValueOverrides;
    const configs = sequencer === 'synth' ? this.synthStepValueConfigs : this.drumStepValueConfigs;
    while (toggles.length <= laneIndex) toggles.push([]);
    while (values.length <= laneIndex) values.push([]);
    while (configs.length <= laneIndex) configs.push([]);
  }

  private withHostDiagnostics(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    return enrichCoreProductHostTelemetry(
      telemetry,
      this.diagnostics.snapshot(),
      this.assetRegistrar.registeredDecodedAssetByteLength(),
    );
  }

  private patchAdapterState(patch: Record<string, unknown>, loadSnapshot = true): void {
    this.adapterState = { ...this.adapterState, ...patch };
    if (loadSnapshot) {
      this.applyLatestSnapshotUpdate();
      if (this.running) this.arrangementScheduler.update(this.createLatestArrangementState());
    }
  }

  private patchIndexedAdapterState(
    prefix: string,
    suffix: string,
    values: unknown[],
    mapValue: (value: unknown) => unknown = (value) => value,
    loadSnapshot = true,
  ): void {
    const patch: Record<string, unknown> = {};
    for (let index = 0; index < Math.min(values.length, 4); index += 1) {
      patch[`${prefix}${index + 1}${suffix}`] = mapValue(values[index]);
    }
    this.patchAdapterState(patch, loadSnapshot);
  }

  private flushSequencerStepToggles(): void {
    this.syncSequencerStepToggles('synth', false);
    this.syncSequencerStepToggles('drum', false);
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
      this.loadLatestSnapshot('runtime-bootstrap');
      post();
    });
  }

  private syncSequencerLaneParams(
    sequencer: SequencerKind,
    values: unknown[],
    paramId: number,
    mapValue: (value: unknown) => number,
  ): void {
    if (!this.runtimeReady) return;
    for (let laneIndex = 0; laneIndex < Math.min(values.length, 16); laneIndex += 1) {
      this.runtime.postEvent(createCoreProductSequencerLaneParamEvent(
        sequencer,
        laneIndex,
        paramId,
        mapValue(values[laneIndex]),
      ));
    }
  }

  private stepValueFieldSubLaneKey(field: CoreProductStepValueField): string | null {
    switch (field) {
      case CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote:
        return 'pitch';
      case CORE_PRODUCT_STEP_VALUE_FIELDS.expression:
        return 'expression';
      case CORE_PRODUCT_STEP_VALUE_FIELDS.morph:
        return 'morph';
      case CORE_PRODUCT_STEP_VALUE_FIELDS.distance:
        return 'distance';
      default:
        return null;
    }
  }

  private stepValueFieldPayloadKey(field: CoreProductStepValueField): 'pitch' | 'expression' | 'morph' | 'distance' | null { const key = this.stepValueFieldSubLaneKey(field); return key === 'pitch' || key === 'expression' || key === 'morph' || key === 'distance' ? key : null; }

  private stepValueFieldEnabled(
    sequencer: SequencerKind,
    laneIndex: number,
    field: CoreProductStepValueField,
  ): boolean {
    const key = this.stepValueFieldSubLaneKey(field);
    if (!key) return true;
    const lanes = sequencer === 'synth' ? this.synthSubLaneEnabled : this.drumSubLaneEnabled;
    return lanes[laneIndex]?.[key] === true;
  }

  private evolvedStepValuePayload(sequencer: SequencerKind, laneIndex: number, field: CoreProductStepValueField, overrides: SequencerStepValueOverride[]): number[] | null {
    const entries = overrides.filter((entry) => entry.field === field).sort((left, right) => left.step - right.step);
    if (entries.length === 0) return null;
    const baseMidi = sequencer === 'synth' ? this.latestProductSnapshot?.synthLanes[laneIndex]?.midiNote ?? 60 : this.drumLaneBaseMidi(laneIndex);
    const values = entries.map((entry) => entry.value);
    return field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote ? (sequencer === 'synth' ? coreProductSynthMidiToUiPitch(values, this.adapterState.synthPitchSettings, laneIndex, baseMidi) : values.map((value) => Math.round(value - baseMidi))) : values;
  }

  private postSequencerStepValueOverrides(sequencer: SequencerKind, laneIndex: number, overrides: SequencerStepValueOverride[], fields: CoreProductStepValueField[]): void {
    const changed = new Set(fields);
    for (const stepValue of overrides) {
      if (!changed.has(stepValue.field) || !this.stepValueFieldEnabled(sequencer, laneIndex, stepValue.field)) continue;
      this.runtime.postEvent(createCoreProductSequencerStepValueEvent(sequencer, laneIndex, stepValue.step, stepValue.field, stepValue.value, stepValue.value2 ?? 0, stepValue.range ? CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0));
    }
  }

  private syncSequencerStepToggles(sequencer: SequencerKind, forceClear: boolean): void {
    if (!this.runtimeReady) return;
    const lanes = sequencer === 'synth'
      ? this.synthStepToggleOverrides
      : this.drumStepToggleOverrides;
    const values = sequencer === 'synth'
      ? this.synthStepValueOverrides
      : this.drumStepValueOverrides;
    const configs = sequencer === 'synth'
      ? this.synthStepValueConfigs
      : this.drumStepValueConfigs;
    const laneCount = Math.max(lanes.length, values.length, configs.length);
    for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      const toggles = lanes[laneIndex] ?? [];
      const stepValues = values[laneIndex] ?? [];
      const stepConfigs = configs[laneIndex] ?? [];
      const activeStepValues = stepValues.filter((stepValue) =>
        this.stepValueFieldEnabled(sequencer, laneIndex, stepValue.field),
      );
      const activeStepConfigs = stepConfigs.filter((config) =>
        this.stepValueFieldEnabled(sequencer, laneIndex, config.field),
      );
      if (forceClear || toggles.length > 0 || activeStepValues.length > 0 || activeStepConfigs.length > 0) {
        this.runtime.postEvent(createCoreProductSequencerClearStepsEvent(sequencer, laneIndex));
      }
      for (const config of activeStepConfigs) {
        this.runtime.postEvent(createCoreProductSequencerSubLaneConfigEvent(
          sequencer,
          laneIndex,
          config.field,
          config.steps,
          config.direction,
        ));
      }
      for (const toggle of toggles) {
        this.runtime.postEvent(createCoreProductSequencerStepEvent(
          sequencer,
          laneIndex,
          toggle.step,
          toggle.value,
        ));
      }
      for (const stepValue of activeStepValues) {
        this.runtime.postEvent(createCoreProductSequencerStepValueEvent(
          sequencer,
          laneIndex,
          stepValue.step,
          stepValue.field,
          stepValue.value,
          stepValue.value2 ?? 0,
          stepValue.range ? CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0,
        ));
      }
    }
  }

  private setDisplayCallback(name: string, callback: unknown): void {
    if (typeof callback === 'function') {
      this.displayCallbacks.set(name, callback);
      return;
    }
    this.displayCallbacks.delete(name);
  }

  private invokeDisplayCallback(name: string, ...args: unknown[]): void {
    const callback = this.displayCallbacks.get(name);
    if (typeof callback === 'function') {
      (callback as (...invokeArgs: unknown[]) => void)(...args);
    }
  }

  private cancelJourneyMorphClockTick(): void {
    if (this.journeyMorphClockRaf !== null) {
      window.cancelAnimationFrame(this.journeyMorphClockRaf);
      this.journeyMorphClockRaf = null;
    }
  }

  private scheduleJourneyMorphClockTick(): void {
    if (!this.journeyMorphClockRunning || !this.displayCallbacks.has('journeyMorphClock')) return;
    if (!this.isDocumentVisible()) {
      this.cancelJourneyMorphClockTick();
      return;
    }

    const tick = (now: number) => {
      this.journeyMorphClockRaf = null;
      if (!this.journeyMorphClockRunning || !this.displayCallbacks.has('journeyMorphClock')) return;
      if (!this.isDocumentVisible()) return;

      this.invokeDisplayCallback('journeyMorphClock', now);
      if (!this.journeyMorphClockRunning || !this.displayCallbacks.has('journeyMorphClock')) return;
      if (!this.isDocumentVisible()) return;

      this.journeyMorphClockRaf = window.requestAnimationFrame(tick);
    };

    this.journeyMorphClockRaf = window.requestAnimationFrame(tick);
  }

}

const host = new CoreProductEngineHost();

export const coreProductEngineHost = new Proxy(host as unknown as CoreProductEngineHostProxy, {
  get(target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;
    const value = (target as unknown as Record<string, unknown>)[property];
    if (typeof value === 'function') return value.bind(target);
    if (value !== undefined) return value;
    const classification = classifyCoreProductRuntimeFallback(property);
    if (property.startsWith('get')) {
      return () => {
        host.reportRuntimeFallback(property, classification);
        throw new Error(`AudioEngine.${property} is not implemented by core-product`);
      };
    }
    return (..._args: unknown[]) => {
      host.reportRuntimeFallback(property, classification);
      throw new Error(`AudioEngine.${property} is not implemented by core-product`);
    };
  },
}) as CoreProductEngineHostProxy;
