import type { AudioEngine, DynamicsVisualTelemetrySnapshot, EarthTextureDebugState, EngineState, ManualSynthNoteOptions, RecordableTrackSource } from './engine';
import type { LaneDirection } from './sequencerLaneDirection';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { CORE_PRODUCT_MEMORY_BUDGETS, type DecodedCoreProductAsset } from './coreProductAssets';
import { CoreProductAssetAdapter } from './CoreProductAssetAdapter';
import { midiSampleOffset } from './coreMidiEvents';
import { createCoreProductSnapshot, encodeCoreProductSnapshot, usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from './coreProductSnapshot';
import {
  CORE_PRODUCT_MODULATION_RANGE_MODE, CORE_PRODUCT_SEQUENCER_IDS, CORE_PRODUCT_STEP_TOGGLE_FLAGS, CORE_PRODUCT_STEP_VALUE_FIELDS, CORE_PRODUCT_SOURCE_IDS,
  type CoreProductEvent,
  type CoreProductModulationRangeMode,
  type CoreProductRangeTarget,
  type CoreProductStepValueField,
  createCoreProductDrumTriggerEvent,
  createCoreProductJourneyEvent,
  createCoreProductJourneyStateEvent,
  createCoreProductManualNoteEvent,
  createCoreProductMidiEvent,
  createCoreProductModulationRangeEvent,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerDiceEvent,
  createCoreProductSequencerLaneParamEvent,
  createCoreProductSequencerResetHomeEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductStartEvent,
  createCoreProductStopEvent,
  resolveCoreProductDrumMorphRangeTarget,
  resolveCoreProductRangeTargets,
} from './coreProductEvents';
import { type CoreProductSequencerLaneUiState, type CoreProductTelemetrySnapshot, type CoreProductVisualTelemetrySnapshot, initialCoreProductCapabilityReport } from './coreProductTelemetry';
import { classifyCoreProductRuntimeFallback, runtimeFallbackIsDevelopmentError, type ProductCoreGetterName, type RuntimeFallbackClassification } from './CoreProductFallbackDiagnostics';
import { CoreProductArrangementScheduler } from './coreProductArrangementScheduler';
import { buildCoreProductSnapshotDiff, shouldForwardCoreProductRngDiffs, type SnapshotReloadReason } from './CoreProductRuntimeAdapter';
import { normalizeClockDivisionValue, normalizeDrumSequencerStepValueOverrides, normalizeSequencerStepToggleOverrides, normalizeSequencerStepValueConfigs, normalizeSequencerStepValueOverrides, normalizeSubLaneEnabledStates, type SequencerKind, type SequencerStepToggleOverride, type SequencerStepValueConfig, type SequencerStepValueOverride } from './CoreProductHostSequencerAdapter';
import { normalizeSequencerPitchBindingMode, sequencerPitchBindingModeToProductId } from './sequencerPitchBinding';
import { normalizeSequencerPitchSettings, normalizeSequencerPitchSettingsArray, type SequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import { normalizeEvolveConfigs } from './CoreProductHostSequencerEvolveConfig';
import { coreProductRangeValueContext, createCoreProductEngineState, drumVoiceIndex, manualAuditionState, mappedCoreProductRange, midiFromFrequency, requireFiniteRange, requireManualNote, requirePositive, runtimeWalkConfigChanged, runtimeWalkConfigFromState, runtimeWalkPositionsFromTelemetry, sourceId } from './CoreProductHostRuntimeGuards';
import { CORE_PRODUCT_GRAPH_TAP_IDS } from './coreProductGraphTaps';
import { CoreProductRuntime, type CoreProductGraphTapCaptureChunk } from './coreProductRuntime';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { loadProductLead4opFMPreset } from './CoreProductLeadPatch';
import { createCoreProductDynamicsVisualTelemetry, createCoreProductTransportDebugState } from './CoreProductHostDebugTelemetry';
import { shouldRejoinCoreProductSequencerClocks, withCoreProductClockStartDelayState } from './CoreProductHostSequencerClock';
import { publishCoreProductSequencerVisuals } from './CoreProductHostSequencerVisuals';
import { createCoreProductSequencerEvolveClock } from './CoreProductHostSequencerEvolve';
import { getCoreProductSequencerLaneSwing, patchCoreProductSequencerLaneSwing } from './CoreProductHostSequencerSwing';
import { coreProductSequencerHomePayload, createCoreProductSequencerHomeStore, postCoreProductSequencerLaneStepState } from './CoreProductHostSequencerHome';
import { coreProductDrumEvolvePayloadFromLane, coreProductStepValueConfigsFromLane, coreProductStepValueOverridesFromLane, coreProductSynthEvolvePayloadFromLane } from './CoreProductHostSequencerUiState';
import { addCoreProductRangePayload, applyCoreProductRangeSubLanePatch } from './CoreProductHostSequencerRangePayload';
import { coreProductSynthMidiToUiPitch } from './CoreProductHostSynthPitch';
import { coreProductSynthNoteRangeHome, evolveCoreProductSynthNoteRange } from './CoreProductHostSynthNoteRangeEvolve';
import { createCoreProductHostHarmonySnapshot, type CoreProductHostHarmonySnapshot } from './CoreProductHostHarmonyState';
import type { CoreProductSubLaneEvolveResult } from './CoreProductHostSequencerSubLaneEvolve';
const CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE = 3; const CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME = 4; const PRODUCT_VISIBLE_SYNTH_LANE_COUNT = 4;
type ProductRangeState = { range: { min: number; max: number }; targets: CoreProductRangeTarget[] };
const PRODUCT_LEAD_PRESET_SLOTS = [
  { slot: 'A', stateKey: 'lead1PresetA', dataKey: 'lead1PresetAData', fallback: 'soft_rhodes' },
  { slot: 'B', stateKey: 'lead1PresetB', dataKey: 'lead1PresetBData', fallback: 'gamelan' },
  { slot: 'C', stateKey: 'lead2PresetC', dataKey: 'lead2PresetCData', fallback: 'soft_rhodes' },
  { slot: 'D', stateKey: 'lead2PresetD', dataKey: 'lead2PresetDData', fallback: 'gamelan' },
] as const;
class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private readonly arrangementScheduler = new CoreProductArrangementScheduler(
    (event) => this.runtime.postEvent(event),
    () => this.runtime.audioContext,
  );
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetAdapter = new CoreProductAssetAdapter(this.runtime, () => this.latestSliderState);
  private readonly displayCallbacks = new Map<string, unknown>();
  private stateChangeCallback: ((state: EngineState) => void) | null = null;
  private perfMonitorEnabled = false;
  private perfUpdateCallback: ((data: Record<string, unknown>) => void) | null = null;
  private latestProductSnapshot: CoreProductSnapshot | null = null;
  private adapterState: Record<string, unknown> = {};
  private readonly pendingLeadPresetLoads = new Map<string, string>();
  private synthSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private drumSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null;
  private runtimeReady = false;
  private running = false;
  private journeyMorphClockRunning = false;
  private journeyMorphClockRaf: number | null = null;
  private runtimeWalkPositions: Record<string, number> = {};
  private readonly sampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly drumSampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkControlNames = new Map<number, string>();
  private readonly runtimeWalkControlRanges = new Map<number, { min: number; max: number }>();
  private readonly reportedUnsupportedRangeKeys = new Set<string>();
  private dirtyDiffCount = 0;
  private fullSnapshotReloadCount = 0;
  private unsupportedControlCount = 0;
  private unsupportedGetterCount = 0;
  private lastUnsupportedMethod: string | null = null;
  private lastUnsupportedMethodClass: RuntimeFallbackClassification | null = null;
  private runtimeFallbackDiagnosticCount = 0;
  private audioCriticalFallbackCount = 0; private midiTimestampOriginSeconds: number | null = null;
  private sequencerTransportStartInFlight = false;
  private snapshotReloadCpuMs = 0;
  private lastSnapshotReloadReason: SnapshotReloadReason = 'none';
  private pendingSnapshotReloadReason: SnapshotReloadReason | null = null;
  private readonly reportedRuntimeFallbacks = new Set<string>();
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
  readonly engineMode = 'core-product'; readonly capabilityReport = initialCoreProductCapabilityReport;
  constructor() {
    this.runtime.setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));
    this.runtime.setVisualTelemetryCallback((telemetry) => this.handleVisualTelemetry(telemetry));
  }
  getAudioContext(): AudioContext | null {
    return this.runtime.audioContext;
  }
  getMediaStream(): MediaStream | null {
    return null;
  }
  getLimiterNode(): AudioNode | null {
    return this.runtime.outputNode;
  }
  setOutputGain(target: number, durationSeconds = 0): void {
    this.runtime.setOutputGain(target, durationSeconds);
  }
  getDynamicsAnalyser(): AnalyserNode | null {
    return this.explicitlyUnsupportedGetter('getDynamicsAnalyser');
  }

  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    return createCoreProductDynamicsVisualTelemetry(this.latestTelemetry, this.runtime.audioContext?.currentTime ?? 0);
  }
  getDrumVoiceAnalyser(): undefined {
    return this.explicitlyUnsupportedGetter('getDrumVoiceAnalyser');
  }
  getGranularActiveGrainCount(): number {
    return this.latestTelemetry?.activeGrains ?? 0;
  }

  getGranularBufferWaveform(): Float32Array | null {
    return null;
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

  getLeadMorphedParams(): null { return this.explicitlyUnsupportedGetter('getLeadMorphedParams'); }
  getCurrentFilterFreq(): number { return this.explicitlyUnsupportedGetter('getCurrentFilterFreq'); }
  getCurrentLfoValue(): number { return this.explicitlyUnsupportedGetter('getCurrentLfoValue'); }
  getCurrentLfo2Value(): number { return this.explicitlyUnsupportedGetter('getCurrentLfo2Value'); }
  getCurrentPadFilterFreq(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2FilterFreq ?? 0 : this.latestTelemetry?.pad1FilterFreq ?? 0; }
  getCurrentPadLfoValue(pad: 'pad1' | 'pad2' = 'pad1'): number { return pad === 'pad2' ? this.latestTelemetry?.pad2Lfo1Value ?? 0 : this.latestTelemetry?.pad1Lfo1Value ?? 0; }
  getRecordableBusNodes(): Record<string, RecordableTrackSource> { return this.explicitlyUnsupportedGetter('getRecordableBusNodes'); }

  getSonicParityGraphTapId(trackId: string): number | null { return CORE_PRODUCT_GRAPH_TAP_IDS[trackId.startsWith('graph:') ? trackId.slice('graph:'.length) : trackId] ?? null; }
  startSonicParityGraphCapture(trackId: string, chunkFrames: number): number { const tapId = this.getSonicParityGraphTapId(trackId); if (tapId === null) throw new Error(`Unknown Core Product sonic parity graph tap: ${trackId}`); this.runtime.startGraphTapCapture(tapId, chunkFrames); return tapId; }
  flushSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.runtime.flushGraphTapCapture(tapId); }
  stopSonicParityGraphCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> { return this.runtime.stopGraphTapCapture(tapId); }

  getEarthTextureDebugState(): EarthTextureDebugState {
    return this.explicitlyUnsupportedGetter('getEarthTextureDebugState');
  }

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
	          soundscapes: source.sourceId === 7 ? {
	            exactPadParamCount: source.exactPadParamCount,
	            routeParams: source.exactPadParams.slice(0, 16),
	            textureParams: source.exactPadParams.slice(17, 37),
	            waterActive: source.exactDrumParams[0],
	            waterSeed: source.exactDrumParams[60],
	            insectsActive: source.exactDrumParams[61],
	            insectsSeed: source.exactDrumParams[77],
	            insects2Active: source.exactDrumParams[78],
	            insects2Seed: source.exactDrumParams[94],
	          } : undefined,
	        })),
      },
      latestTelemetry: this.latestTelemetry,
    };
  }

  getTransportDebugState(): TransportDebugSnapshot | null { return createCoreProductTransportDebugState(this.latestTelemetry, this.latestProductSnapshot?.transport); }
  private refreshUiHarmonySnapshot(): boolean { const next = createCoreProductHostHarmonySnapshot(this.createLatestArrangementState(), this.latestTelemetry); if (next.signature === this.uiHarmonySnapshot.signature) return false; this.uiHarmonySnapshot = next; return true; }
  private createEngineState(isRunning = this.running || this.latestTelemetry?.transportRunning === true): EngineState { this.refreshUiHarmonySnapshot(); const base = createCoreProductEngineState(isRunning); return { ...base, harmonyState: this.uiHarmonySnapshot.harmonyState, currentSeed: this.uiHarmonySnapshot.currentSeed, currentBucket: this.uiHarmonySnapshot.currentBucket, cofCurrentStep: this.uiHarmonySnapshot.harmonyState?.cof.currentStep ?? base.cofCurrentStep, transportDebug: this.getTransportDebugState() }; }
  private publishStateIfHarmonyChanged(): void { if (this.refreshUiHarmonySnapshot()) this.stateChangeCallback?.(this.createEngineState()); }
  getState(): EngineState { return this.createEngineState(); }

  getAllStemNodes(): Record<string, RecordableTrackSource> {
    return this.explicitlyUnsupportedGetter('getAllStemNodes');
  }

  private explicitlyUnsupportedGetter<T>(method: ProductCoreGetterName): T {
    throw new Error(`AudioEngine.${method} is explicitly unavailable in core-product`);
  }

  private normalizedPosition(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric <= 0) return 0;
    if (numeric >= 1) return 1;
    return numeric;
  }

  setStateChangeCallback(callback: ((state: EngineState) => void) | null): void {
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
      this.perfUpdateCallback?.(this.createPerfSnapshot(this.latestTelemetry));
    }
  }

  setPerfUpdateCallback(callback: ((data: Record<string, unknown>) => void) | null): void {
    this.perfUpdateCallback = callback;
    if (this.perfMonitorEnabled && this.latestTelemetry) {
      callback?.(this.createPerfSnapshot(this.latestTelemetry));
    }
  }

  setVisualTelemetryActive(active: boolean): void {
    this.runtime.setVisualTelemetryActive(active);
  }

  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void {
    this.unsupportedControlCount += 1;
    if (method.startsWith('get')) {
      this.unsupportedGetterCount += 1;
    }
    this.lastUnsupportedMethod = method;
    this.lastUnsupportedMethodClass = classification;
    this.runtimeFallbackDiagnosticCount += 1;
    if (classification === 'forbidden-production-fallback') {
      this.audioCriticalFallbackCount += 1;
    }
    const dev = (import.meta.env as unknown as { DEV?: boolean }).DEV === true;
    const firstReport = !this.reportedRuntimeFallbacks.has(method);
    if (firstReport) {
      this.reportedRuntimeFallbacks.add(method);
    }
    if (dev || firstReport) {
      console.error(
        `core-product runtime fallback ${classification} for AudioEngine.${method}; add Product Core telemetry/event support before production use.`,
      );
    }
    if (dev && runtimeFallbackIsDevelopmentError(classification)) {
      throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`);
    }
  }

  updateParams(sliderState: Record<string, unknown>): void {
    const previousSliderState = this.latestSliderState, previousWalkConfig = runtimeWalkConfigFromState(previousSliderState);
    this.latestSliderState = sliderState;
    const nextWalkConfig = runtimeWalkConfigFromState(this.latestSliderState);
    const forceSequencerClockRejoin = shouldRejoinCoreProductSequencerClocks(previousSliderState, sliderState); this.syncLeadPresetData(sliderState);
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
    if (this.runtimeReady && this.assetAdapter.hasMissingDefaultAssetsForState()) {
      void this.assetAdapter.ensureDefaultAssetsForState().then(() => {
        this.applyLatestSnapshotUpdate('asset-reference-change', forceSequencerClockRejoin);
        if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.flushRuntimeWalkRanges();
        if (this.running) this.arrangementScheduler.update(this.createLatestArrangementState()); this.publishStateIfHarmonyChanged();
      });
      return;
    }
    this.applyLatestSnapshotUpdate('adapter-update', forceSequencerClockRejoin);
    if (runtimeWalkConfigChanged(previousWalkConfig, nextWalkConfig)) this.flushRuntimeWalkRanges();
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
    await this.assetAdapter.ensureDefaultAssetsForState(); this.sequencerEvolveClock.reset();
    this.loadLatestSnapshot('runtime-start');
    await this.runtime.resume();
    this.runtime.postEvent(createCoreProductStartEvent());
    this.flushModulationRanges();
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
    this.assetAdapter.clear();
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
    const requestedSlotKey = String(slot ?? '').toUpperCase();
    const stateKeyBySlot = {
      A: 'lead1PresetA',
      B: 'lead1PresetB',
      C: 'lead2PresetC',
      D: 'lead2PresetD',
    } as const;
    const dataKeyBySlot = {
      A: 'lead1PresetAData',
      B: 'lead1PresetBData',
      C: 'lead2PresetCData',
      D: 'lead2PresetDData',
    } as const;
    const slotKey = (
      requestedSlotKey === 'A' || requestedSlotKey === 'B' || requestedSlotKey === 'C' || requestedSlotKey === 'D'
        ? requestedSlotKey
        : 'A'
    ) as keyof typeof stateKeyBySlot;
    const key = stateKeyBySlot[slotKey];
    const dataKey = dataKeyBySlot[slotKey];
    const id = String(presetId ?? 'soft_rhodes');
    this.pendingLeadPresetLoads.set(slotKey, id);
    const preset = await loadProductLead4opFMPreset(id);
    if (this.pendingLeadPresetLoads.get(slotKey) !== id) return;
    this.pendingLeadPresetLoads.delete(slotKey);
    this.patchAdapterState({ [key]: id, [dataKey]: preset });
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    this.assetAdapter.registerAsset(asset);
  }

  pushMidiMessage(message: KesshoMidiMessage): void {
    const status = typeof message.status === 'number'
      ? message.status
      : Array.isArray(message.rawBytes)
      ? message.rawBytes[0] ?? 0
      : 0;
    const data1 = typeof message.data1 === 'number'
      ? message.data1
      : Array.isArray(message.rawBytes)
      ? message.rawBytes[1] ?? 0
      : 0;
    const data2 = typeof message.data2 === 'number'
      ? message.data2
      : Array.isArray(message.rawBytes)
      ? message.rawBytes[2] ?? 0
      : 0;
    const audioContext = this.runtime.audioContext; const currentTimeSeconds = audioContext?.currentTime ?? 0;
    if (this.midiTimestampOriginSeconds === null && typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) this.midiTimestampOriginSeconds = message.timestamp - currentTimeSeconds;
    const sampleOffset = midiSampleOffset(message, { sampleRate: audioContext?.sampleRate ?? 48000, currentTimeSeconds, timestampOriginSeconds: this.midiTimestampOriginSeconds ?? undefined });
    const normalizedValue = message.kind === 'noteOff'
      ? 0
      : Math.max(0, Math.min(1, (data2 || data1 || 0) / 127));
    const post = () => {
      this.runtime.postEvent(createCoreProductMidiEvent({
        sampleOffset,
        status,
        channel: message.channel,
        data1,
        data2,
        normalizedValue,
        rawSize: message.rawBytes?.length ?? 0,
      }));
    };
    if (this.runtimeReady) { if (this.runtime.audioContext?.state === 'running') { post(); return; } void this.runtime.resume().then(post); return; }
    void this.runtime.ensureStarted().then(() => {
      this.runtimeReady = true;
      this.loadLatestSnapshot('runtime-bootstrap');
      return this.runtime.resume();
    }).then(post);
  }

  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    this.setDisplayCallback('runtimeWalkPositions', callback);
    callback?.({ ...this.runtimeWalkPositions });
  }
  setDrumMorphRange(voice: unknown, range: { min: number; max: number } | null): void {
    const voiceIndex = drumVoiceIndex(voice);
    const key = `drum:${voiceIndex}:morph`;
    const target = resolveCoreProductDrumMorphRangeTarget(voiceIndex, key);
    this.syncSingleRange(this.drumSampleHoldRanges, key, target, range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
  }
  setDrumParamSHRange(key: string, range: { min: number; max: number } | null): void {
    const targets = resolveCoreProductRangeTargets(key);
    if (targets.length === 0) {
      this.reportUnsupportedRangeKey(key);
      return;
    }
    this.syncSingleRange(this.drumSampleHoldRanges, key, targets, range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
  }
  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.sampleHoldRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold);
  }
  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.runtimeWalkRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk);
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
    this.restoreSequencerLaneHome('synth', laneIndex);
  }

  diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.sequencerHome.armManualDice('synth', laneIndex);
    this.postSequencerControlEvent(createCoreProductSequencerDiceEvent('synth', laneIndex, intensity));
    this.invokeDisplayCallback('synthEuclidEvolve', laneIndex);
  }

  resetDrumEuclidLaneHome(laneIndex: number): void {
    if (!this.restoreSequencerLaneHome('drum', laneIndex)) this.postSequencerControlEvent(createCoreProductSequencerResetHomeEvent('drum', laneIndex));
  }

  diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.sequencerHome.armManualDice('drum', laneIndex);
    this.postSequencerControlEvent(createCoreProductSequencerDiceEvent('drum', laneIndex, intensity));
    this.invokeDisplayCallback('drumEuclidEvolve', laneIndex);
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
      await this.assetAdapter.ensurePianoAssetForNote(manualNote.midi, manualNote.velocity);
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
          .map((note) => this.assetAdapter.ensurePianoAssetForNote(note.midi, note.velocity)),
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
    this.loadProductSnapshot(this.createLatestSnapshot(includeClockStartDelay), reason);
  }

  private applyLatestSnapshotUpdate(reason: SnapshotReloadReason = 'adapter-update', forceSequencerClockRejoin = false): void {
    if (!this.runtimeReady) return;
    const nextSnapshot = this.createLatestSnapshot(forceSequencerClockRejoin);
    const previousSnapshot = this.latestProductSnapshot;
    if (previousSnapshot && this.applySnapshotDiff(previousSnapshot, nextSnapshot, forceSequencerClockRejoin)) {
      this.dirtyDiffCount += 1;
      this.latestProductSnapshot = nextSnapshot;
      return;
    }
    const reloadReason = previousSnapshot ? (this.pendingSnapshotReloadReason ?? reason) : 'initial-snapshot';
    this.loadProductSnapshot(nextSnapshot, reloadReason);
    this.pendingSnapshotReloadReason = null;
  }

  private loadProductSnapshot(snapshot: CoreProductSnapshot, reason: SnapshotReloadReason): void {
    const startMs = this.nowMs();
    this.runtime.loadSnapshot(encodeCoreProductSnapshot(snapshot));
    this.latestProductSnapshot = snapshot;
    this.flushSequencerStepToggles();
    this.syncSynthPitchBindingModes();
    this.fullSnapshotReloadCount += 1;
    this.snapshotReloadCpuMs += Math.max(0, this.nowMs() - startMs);
    this.lastSnapshotReloadReason = reason;
  }

  private syncLeadPresetData(sliderState: Record<string, unknown>): void {
    for (const slot of PRODUCT_LEAD_PRESET_SLOTS) {
      const id = String(sliderState[slot.stateKey] ?? slot.fallback);
      const currentId = typeof this.adapterState[slot.stateKey] === 'string'
        ? this.adapterState[slot.stateKey]
        : undefined;
      const hasCurrentData = currentId === id && !!this.adapterState[slot.dataKey];

      if (currentId !== id) {
        const nextAdapterState = { ...this.adapterState, [slot.stateKey]: id };
        delete nextAdapterState[slot.dataKey];
        this.adapterState = nextAdapterState;
      }

      if (hasCurrentData || this.pendingLeadPresetLoads.get(slot.slot) === id) {
        continue;
      }

      this.pendingLeadPresetLoads.set(slot.slot, id);
      void loadProductLead4opFMPreset(id)
        .then((preset) => {
          if (this.pendingLeadPresetLoads.get(slot.slot) !== id) return;
          this.pendingLeadPresetLoads.delete(slot.slot);
          this.patchAdapterState({ [slot.stateKey]: id, [slot.dataKey]: preset });
        })
        .catch((error) => {
          if (this.pendingLeadPresetLoads.get(slot.slot) === id) {
            this.pendingLeadPresetLoads.delete(slot.slot);
          }
          console.warn(`Failed to hydrate Product Core lead preset ${slot.slot}:`, error);
        });
    }
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

  private applySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot, forceSequencerClockRejoin = false): boolean {
    this.pendingSnapshotReloadReason = null;
    const diff = buildCoreProductSnapshotDiff(previous, next, {
      forwardRngDiffs: shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry),
      forceSequencerClockRejoin,
    });
    if (!diff.applied) {
      this.pendingSnapshotReloadReason = diff.reason;
      return false;
    }
    for (const event of diff.events) {
      this.runtime.postEvent(event);
    }
    return true;
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
    this.updateRuntimeWalkPositions(hostTelemetry);
    this.tickSequencerEvolveClock(hostTelemetry); this.reconcileSequencerUiState(hostTelemetry); this.publishStateIfHarmonyChanged();
    if (this.isDocumentVisible()) {
      this.publishSequencerVisuals(hostTelemetry);
    }
    if (this.perfMonitorEnabled && this.isDocumentVisible()) {
      this.perfUpdateCallback?.(this.createPerfSnapshot(hostTelemetry));
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
    this.updateRuntimeWalkPositions(hostTelemetry);
    this.tickSequencerEvolveClock(hostTelemetry); this.publishStateIfHarmonyChanged();
    this.publishSequencerVisuals(hostTelemetry);
  }
  private tickSequencerEvolveClock(hostTelemetry: CoreProductTelemetrySnapshot): void { this.sequencerEvolveClock.tick({ telemetry: hostTelemetry, synthConfigs: this.adapterState.synthEuclidEvolveConfigs, drumConfigs: this.adapterState.drumEuclidEvolveConfigs, post: (event) => { this.captureSequencerHomeForEvent(event); this.runtime.postEvent(event); }, publish: (name, laneIndex) => this.invokeDisplayCallback(name, laneIndex), getSwing: (sequencer, laneIndex) => getCoreProductSequencerLaneSwing(this.adapterState, this.latestSliderState, sequencer, laneIndex), setSwing: (sequencer, laneIndex, swing) => { this.captureSequencerHomeLane(sequencer, laneIndex); this.setEvolvedSequencerLaneSwing(sequencer, laneIndex, swing); }, getEnabledSubLanes: (sequencer, laneIndex) => this.enabledSequencerSubLanes(sequencer, laneIndex), getSubLaneConfigs: (sequencer, laneIndex) => this.getSequencerStepValueConfigs(sequencer, laneIndex), getStepValueOverrides: (sequencer, laneIndex) => this.getSequencerStepValueOverrides(sequencer, laneIndex), setSubLaneConfigs: (sequencer, laneIndex, result) => { this.captureSequencerHomeLane(sequencer, laneIndex); this.setEvolvedSequencerSubLaneConfigs(sequencer, laneIndex, result); }, evolveSynthNoteRange: (laneIndex, config, seed) => { this.captureSequencerHomeLane('synth', laneIndex); const home = this.sequencerHome.restore('synth', laneIndex)?.noteRange ?? null; const evolved = evolveCoreProductSynthNoteRange({ laneIndex, config, seed, state: this.latestSliderState, pitchSettings: this.adapterState.synthPitchSettings, current: this.synthNoteRangeOverrides[laneIndex], home }); if (evolved.range && typeof evolved.midiNote === 'number') { this.synthNoteRangeOverrides[laneIndex] = evolved.range; if (this.runtimeReady) this.runtime.postEvent(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, evolved.midiNote)); this.invokeDisplayCallback('synthNoteRangeEvolved', laneIndex, evolved.range.min, evolved.range.max); } return { handled: evolved.handled, changed: !!evolved.range }; } }); }

  private publishSequencerVisuals(telemetry: CoreProductTelemetrySnapshot | null): void {
    publishCoreProductSequencerVisuals({ telemetry, snapshot: this.latestProductSnapshot, state: this.latestSliderState ? { ...this.latestSliderState, ...this.adapterState } : this.adapterState, synthToggles: this.synthStepToggleOverrides, drumToggles: this.drumStepToggleOverrides, sampleRate: telemetry?.sampleRate ?? this.runtime.audioContext?.sampleRate ?? 48000, publish: (name, steps, hitCounts) => this.invokeDisplayCallback(name, steps, hitCounts) });
  }

  private resetSequencerVisuals(): void { this.publishSequencerVisuals(null); }

  private captureSequencerHomeForEvent(event: CoreProductEvent): void { const sequencer = event.targetId === CORE_PRODUCT_SEQUENCER_IDS.synth ? 'synth' : event.targetId === CORE_PRODUCT_SEQUENCER_IDS.drum ? 'drum' : null; const laneIndex = typeof event.index === 'number' ? event.index : -1; if (sequencer) this.captureSequencerHomeLane(sequencer, laneIndex); }

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
    const state = telemetry.sequencerUiState;
    const revision = telemetry.sequencerUiStateRevision ?? state?.revision ?? 0;
    if (!state || revision === 0 || revision === this.lastSequencerUiStateRevision) return;
    this.lastSequencerUiStateRevision = revision;
    const laneIndex = state.lastChangedLaneIndex;
    if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= 16) return;
    const shouldNotify =
      state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE ||
      state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME;
    if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.synth) {
      if (laneIndex >= PRODUCT_VISIBLE_SYNTH_LANE_COUNT) return;
	      const lane = state.synthLanes[laneIndex];
	      if (!lane) return;
	      const manualDice = state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE && this.sequencerHome.hasManualDice('synth', laneIndex);
	      this.reconcileSynthSequencerLane(laneIndex, lane, shouldNotify, manualDice);
	      if (manualDice) this.captureSequencerHomeLane('synth', laneIndex, true);
	      return;
	    }
	    if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum) {
	      const lane = state.drumLanes[laneIndex];
	      if (!lane) return;
	      this.reconcileDrumSequencerLane(laneIndex, lane, shouldNotify);
	      if (state.lastChangeKind === CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE && this.sequencerHome.consumeManualDice('drum', laneIndex)) this.captureSequencerHomeLane('drum', laneIndex, true);
	    }
  }

  private reconcileSynthSequencerLane(laneIndex: number, lane: CoreProductSequencerLaneUiState, notify: boolean, denseStepValues = false): void {
    this.ensureSequencerLaneCache('synth', laneIndex);
    const includeEmpty = lane.mutationFlags === 0;
    this.synthStepToggleOverrides[laneIndex] = lane.triggerToggles.map(([step, value]) => ({ step, value }));
    this.synthStepValueOverrides[laneIndex] = coreProductStepValueOverridesFromLane(lane, true, denseStepValues);
    this.synthStepValueConfigs[laneIndex] = coreProductStepValueConfigsFromLane(lane, true);
    const payload = coreProductSynthEvolvePayloadFromLane(lane, this.latestProductSnapshot?.synthLanes[laneIndex]?.midiNote ?? 60, includeEmpty, this.adapterState.synthPitchSettings, laneIndex);
    if (notify) {
      this.invokeDisplayCallback('synthEvolveOverrides', laneIndex, payload);
    }
  }

  private reconcileDrumSequencerLane(
    laneIndex: number,
    lane: CoreProductSequencerLaneUiState,
    notify: boolean,
  ): void {
    this.ensureSequencerLaneCache('drum', laneIndex);
    const includeEmpty = lane.mutationFlags === 0;
    this.drumStepToggleOverrides[laneIndex] = lane.triggerToggles.map(([step, value]) => ({ step, value }));
    this.drumStepValueOverrides[laneIndex] = coreProductStepValueOverridesFromLane(lane, true);
    this.drumStepValueConfigs[laneIndex] = coreProductStepValueConfigsFromLane(lane, true);
    const payload = coreProductDrumEvolvePayloadFromLane(lane, laneIndex, this.drumLaneBaseMidi(laneIndex), includeEmpty);
    if (notify) {
      this.invokeDisplayCallback('drumEvolveOverrides', laneIndex, payload);
    }
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
    const decodedAssetBytes = telemetry.decodedAssetBytes ?? this.assetAdapter.registeredDecodedAssetByteLength();
    return {
      ...telemetry,
      wasmHeapBudgetBytes: CORE_PRODUCT_MEMORY_BUDGETS.webWorkletHeapBytes,
      decodedAssetBytes,
      decodedAssetBudgetBytes: CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes,
      dirtyDiffCount: this.dirtyDiffCount,
      fullSnapshotReloadCount: this.fullSnapshotReloadCount,
      unsupportedControlCount: this.unsupportedControlCount,
      unsupportedGetterCount: this.unsupportedGetterCount,
      lastUnsupportedMethod: this.lastUnsupportedMethod,
      lastUnsupportedMethodClass: this.lastUnsupportedMethodClass,
      runtimeFallbackDiagnosticCount: this.runtimeFallbackDiagnosticCount,
      audioCriticalFallbackCount: this.audioCriticalFallbackCount,
      snapshotReloadCpuMs: this.snapshotReloadCpuMs,
      lastSnapshotReloadReason: this.lastSnapshotReloadReason,
    };
  }

  private createPerfSnapshot(telemetry: CoreProductTelemetrySnapshot): Record<string, unknown> {
    return {
      product: {
        avgPercent: telemetry.renderCpuPercent ?? 0,
        peakPercent: telemetry.renderCpuPeakPercent ?? 0,
        missPercent: telemetry.missedQuantumCount ?? null,
        scope: 'worklet',
      },
      sequencerEventCount: telemetry.sequencerEventCount,
      controlQueueDepth: telemetry.controlQueueDepth,
      activeVoices: telemetry.activeVoices,
      activeSources: telemetry.activeSources,
      activeAssets: telemetry.activeAssets,
      wasmHeapBytes: telemetry.wasmHeapBytes ?? 0,
      wasmHeapBudgetBytes: telemetry.wasmHeapBudgetBytes ?? CORE_PRODUCT_MEMORY_BUDGETS.webWorkletHeapBytes,
      decodedAssetBytes: telemetry.decodedAssetBytes ?? this.assetAdapter.registeredDecodedAssetByteLength(),
      decodedAssetBudgetBytes: telemetry.decodedAssetBudgetBytes ?? CORE_PRODUCT_MEMORY_BUDGETS.totalRegisteredDecodedBytes,
      assetAllocationBytes: telemetry.assetAllocationBytes ?? telemetry.decodedAssetBytes ?? this.assetAdapter.registeredDecodedAssetByteLength(),
      activeGrains: telemetry.activeGrains ?? 0,
      masterTruePeak: telemetry.masterTruePeak ?? telemetry.masterOutputPeak ?? 0,
      masterTruePeakDbtp: telemetry.masterTruePeakDbtp ?? 0,
      masterIntegratedLufs: telemetry.masterIntegratedLufs ?? -100,
      journeyMorphPhase: telemetry.journeyMorphPhase ?? 0,
      journeyMorphRunning: telemetry.journeyMorphRunning ?? false,
      transportRunning: telemetry.transportRunning,
      absoluteSampleTime: telemetry.absoluteSampleTime ?? 0,
      assetMissingCount: telemetry.assetMissingCount,
      lastErrorCode: telemetry.lastErrorCode,
      dirtyDiffCount: telemetry.dirtyDiffCount ?? this.dirtyDiffCount,
      fullSnapshotReloadCount: telemetry.fullSnapshotReloadCount ?? this.fullSnapshotReloadCount,
      unsupportedControlCount: telemetry.unsupportedControlCount ?? this.unsupportedControlCount,
      unsupportedGetterCount: telemetry.unsupportedGetterCount ?? this.unsupportedGetterCount,
      lastUnsupportedMethod: telemetry.lastUnsupportedMethod ?? this.lastUnsupportedMethod,
      lastUnsupportedMethodClass: telemetry.lastUnsupportedMethodClass ?? this.lastUnsupportedMethodClass,
      runtimeFallbackDiagnosticCount: telemetry.runtimeFallbackDiagnosticCount ?? this.runtimeFallbackDiagnosticCount,
      audioCriticalFallbackCount: telemetry.audioCriticalFallbackCount ?? this.audioCriticalFallbackCount,
      snapshotReloadCpuMs: telemetry.snapshotReloadCpuMs ?? this.snapshotReloadCpuMs,
      lastSnapshotReloadReason: telemetry.lastSnapshotReloadReason ?? this.lastSnapshotReloadReason,
    };
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

  private syncSingleRange(
    store: Map<string, ProductRangeState>,
    key: string,
    target: CoreProductRangeTarget | CoreProductRangeTarget[],
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
  ): void {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      const previous = store.get(key);
      if (previous) {
        if (this.runtimeReady) {
          for (const previousTarget of previous.targets) {
            this.postModulationRange(previousTarget, null, mode, displayKey);
          }
        }
        store.delete(key);
      }
      return;
    }
    const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
    const targets = Array.isArray(target) ? target : [target];
    store.set(key, { range: normalized, targets });
    if (this.runtimeReady) {
      for (const rangeTarget of targets) {
        this.postModulationRange(rangeTarget, normalized, mode, displayKey);
      }
    }
  }

  private syncRangeSet(
    store: Map<string, ProductRangeState>,
    ranges: Partial<Record<string, { min: number; max: number }>>,
    mode: CoreProductModulationRangeMode,
  ): void {
    const nextKeys = new Set<string>();
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      const targets = resolveCoreProductRangeTargets(key);
      if (targets.length === 0) {
        this.reportUnsupportedRangeKey(key);
        continue;
      }
      const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
      store.set(key, { range: normalized, targets });
      nextKeys.add(key);
      if (this.runtimeReady) {
        for (const target of targets) {
          this.postModulationRange(target, normalized, mode, key);
        }
      }
    }
    for (const [key, previous] of Array.from(store.entries())) {
      if (nextKeys.has(key)) continue;
      if (this.runtimeReady) {
        for (const target of previous.targets) {
          this.postModulationRange(target, null, mode, key);
        }
      }
      store.delete(key);
    }
  }

  private flushModulationRanges(): void {
    if (!this.runtimeReady) return;
    for (const [key, state] of this.sampleHoldRanges.entries()) {
      for (const target of state.targets) {
        this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
      }
    }
    for (const [key, state] of this.drumSampleHoldRanges.entries()) {
      for (const target of state.targets) {
        this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
      }
    }
    this.flushRuntimeWalkRanges();
  }

  private flushRuntimeWalkRanges(): void {
    if (!this.runtimeReady) return;
    for (const [key, state] of this.runtimeWalkRanges.entries()) {
      for (const target of state.targets) {
        this.postModulationRange(target, state.range, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk, key);
      }
    }
  }

  private postModulationRange(
    target: CoreProductRangeTarget,
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
  ): void {
    if (!this.runtimeReady) {
      throw new Error('Core Product runtime cannot post modulation ranges before the product worklet is initialized');
    }
    const context = coreProductRangeValueContext(this.latestProductSnapshot?.transport.bpm, this.latestSliderState);
    if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk && range) {
      this.runtimeWalkControlNames.set(target.controlId, displayKey);
      this.runtimeWalkControlRanges.set(target.controlId, mappedCoreProductRange(target, range, context));
    } else if (!range) {
      this.runtimeWalkControlNames.delete(target.controlId);
      this.runtimeWalkControlRanges.delete(target.controlId);
    }
    this.runtime.postEvent(createCoreProductModulationRangeEvent(
      target,
      range,
      mode,
      this.currentNumericValue(displayKey, range),
      context,
    ));
  }

  private currentNumericValue(key: string, range: { min: number; max: number } | null): number {
    const value = this.latestSliderState?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (range) return (range.min + range.max) * 0.5;
    return 0;
  }

  private updateRuntimeWalkPositions(telemetry: CoreProductTelemetrySnapshot): void {
    const next = runtimeWalkPositionsFromTelemetry(telemetry.runtimeWalkValues, this.runtimeWalkControlNames, this.runtimeWalkControlRanges);
    if (!next) return;
    this.runtimeWalkPositions = next;
    this.invokeDisplayCallback('runtimeWalkPositions', { ...next });
  }

  private reportUnsupportedRangeKey(key: string): void {
    if (this.reportedUnsupportedRangeKeys.has(key)) return;
    this.reportedUnsupportedRangeKeys.add(key);
    this.unsupportedControlCount += 1;
    this.lastUnsupportedMethod = `range:${key}`;
    this.lastUnsupportedMethodClass = 'forbidden-production-fallback';
    this.runtimeFallbackDiagnosticCount += 1;
    this.audioCriticalFallbackCount += 1;
    if ((import.meta.env as unknown as { DEV?: boolean }).DEV || typeof console !== 'undefined') {
      console.error(`core-product runtime fallback forbidden-production-fallback for slider range "${key}".`);
    }
  }
}

const host = new CoreProductEngineHost();

export const coreProductEngineHost = new Proxy(host as unknown as AudioEngine, {
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
}) as AudioEngine;
