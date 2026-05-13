import type {
  AudioEngine,
  DynamicsVisualTelemetrySnapshot,
  EarthTextureDebugState,
  EngineState,
  ManualSynthNoteOptions,
  RecordableTrackSource,
} from './engine';
import type { TransportDebugSnapshot } from './transport';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import {
  CORE_PRODUCT_MEMORY_BUDGETS,
  type DecodedCoreProductAsset,
} from './coreProductAssets';
import { CoreProductAssetAdapter } from './CoreProductAssetAdapter';
import { midiSampleOffset } from './coreMidiEvents';
import { createCoreProductSnapshot, encodeCoreProductSnapshot, type CoreProductSnapshot } from './coreProductSnapshot';
import {
  CORE_PRODUCT_MODULATION_RANGE_MODE,
  CORE_PRODUCT_SEQUENCER_IDS,
  CORE_PRODUCT_SUBLANE_DIRECTIONS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  CORE_PRODUCT_SOURCE_IDS,
  type CoreProductEvent,
  type CoreProductModulationRangeMode,
  type CoreProductRangeTarget,
  type CoreProductRangeValueContext,
  type CoreProductSubLaneDirection,
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
  resolveCoreProductDrumParamRangeTarget,
  resolveCoreProductRangeTargets,
} from './coreProductEvents';
import {
  type CoreProductSequencerLaneUiState,
  type CoreProductTelemetrySnapshot,
  initialCoreProductCapabilityReport,
} from './coreProductTelemetry';
import {
  classifiedPlaceholderGetter,
  classifyCoreProductRuntimeFallback,
  runtimeFallbackIsDevelopmentError,
  type RuntimeFallbackClassification,
} from './CoreProductFallbackDiagnostics';
import {
  buildCoreProductSnapshotDiff,
  shouldForwardCoreProductRngDiffs,
  type SnapshotReloadReason,
} from './CoreProductRuntimeAdapter';
import { CoreProductRuntime } from './coreProductRuntime';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

const EMPTY_EARTH_TEXTURE_DEBUG_STATE: EarthTextureDebugState = {
  waves: null,
  birds: null,
  birds2: null,
  frogs: null,
};

const CORE_PRODUCT_SEQUENCER_UI_CHANGE_DICE = 3;
const CORE_PRODUCT_SEQUENCER_UI_CHANGE_RESET_HOME = 4;

type ProductRangeState = {
  range: { min: number; max: number };
  targets: CoreProductRangeTarget[];
};

type SequencerKind = 'synth' | 'drum';
type SequencerStepToggleOverride = {
  step: number;
  value: boolean;
};

type SequencerStepValueOverride = {
  step: number;
  field: CoreProductStepValueField;
  value: number;
  value2?: number;
};

type SequencerStepValueConfig = {
  field: CoreProductStepValueField;
  steps: number;
  direction: CoreProductSubLaneDirection;
};

function createCoreProductEngineState(isRunning: boolean): EngineState {
  return {
    isRunning,
    harmonyState: null,
    currentSeed: 0,
    currentBucket: '',
    currentFilterFreq: 1000,
    currentLfoValue: 0,
    currentLfo2Value: 0,
    cofCurrentStep: 0,
    fxOwners: {
      delayA: { owner: null, strength: 0, lastOrigin: null, active: false },
      delayB: { owner: null, strength: 0, lastOrigin: null, active: false },
      granular: { owner: null, strength: 0, lastOrigin: null, active: false },
      reverb: { owner: null, strength: 0, lastOrigin: null, active: false },
    },
    transportDebug: null,
  };
}

function drumVoiceIndex(voice: unknown): number {
  if (typeof voice === 'number' && Number.isFinite(voice)) return Math.max(0, voice | 0);
  const text = String(voice ?? 'kick').toLowerCase();
  const known: Record<string, number> = {
    sub: 0,
    kick: 1,
    snare: 2,
    click: 2,
    clap: 2,
    beephi: 3,
    beeplo: 4,
    noise: 5,
    hat: 5,
    hihat: 5,
    membrane: 6,
    perc: 6,
    tom: 6,
  };
  return known[text] ?? Math.abs([...text].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 24;
}

function sourceId(source: ManualSynthNoteOptions['source']): number {
  return CORE_PRODUCT_SOURCE_IDS[source] ?? CORE_PRODUCT_SOURCE_IDS.pad1;
}

function midiFromFrequency(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0) return 60;
  return Math.max(0, Math.min(127, 69 + 12 * Math.log2(frequency / 440)));
}

function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(0.000001, Math.abs(gain)));
}

class CoreProductEngineHost {
  private readonly runtime = new CoreProductRuntime();
  private latestSliderState: Record<string, unknown> | null = null;
  private readonly assetAdapter = new CoreProductAssetAdapter(this.runtime, () => this.latestSliderState);
  private readonly displayCallbacks = new Map<string, unknown>();
  private stateChangeCallback: ((state: EngineState) => void) | null = null;
  private perfMonitorEnabled = false;
  private perfUpdateCallback: ((data: Record<string, unknown>) => void) | null = null;
  private latestProductSnapshot: CoreProductSnapshot | null = null;
  private adapterState: Record<string, unknown> = {};
  private synthSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private drumSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private latestTelemetry: CoreProductTelemetrySnapshot | null = null;
  private runtimeReady = false;
  private running = false;
  private journeyMorphClockRunning = false;
  private runtimeWalkPositions: Record<string, number> = {};
  private readonly sampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly drumSampleHoldRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkRanges = new Map<string, ProductRangeState>();
  private readonly runtimeWalkControlNames = new Map<number, string>();
  private readonly reportedUnsupportedRangeKeys = new Set<string>();
  private dirtyDiffCount = 0;
  private fullSnapshotReloadCount = 0;
  private unsupportedControlCount = 0;
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

  readonly engineMode = 'core-product';
  readonly capabilityReport = initialCoreProductCapabilityReport;

  constructor() {
    this.runtime.setTelemetryCallback((telemetry) => this.handleTelemetry(telemetry));
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

  getDynamicsAnalyser(): AnalyserNode | null {
    return classifiedPlaceholderGetter('getDynamicsAnalyser', null);
  }

  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    const telemetry = this.latestTelemetry;
    const contextTime = this.runtime.audioContext?.currentTime ?? 0;
    if (!telemetry) {
      return {
        contextTime,
        endCompHandledByWorklet: false,
        endCompReductionDb: 0,
        worklet: null,
        sidechainEvents: [],
      };
    }
    const inputPeak = Math.max(0, telemetry.masterInputPeak ?? 0);
    const outputPeak = Math.max(0, telemetry.masterTruePeak ?? telemetry.masterOutputPeak ?? 0);
    const outputRms = Math.max(0, telemetry.masterOutputRms ?? 0);
    const limiterReductionDb = Math.max(0, telemetry.masterLimiterGainReductionDb ?? 0);
    const saturationDrive = Math.max(0, telemetry.dynamicsSaturationDrive ?? telemetry.masterSaturationDrive ?? 0);
    const detectorDb = Number.isFinite(telemetry.masterIntegratedLufs ?? NaN)
      ? telemetry.masterIntegratedLufs!
      : gainToDb(inputPeak);
    return {
      contextTime,
      endCompHandledByWorklet: true,
      endCompReductionDb: limiterReductionDb,
      worklet: {
        inputPeak,
        outputPeak,
        wetPeak: outputPeak,
        characterEnv: Math.max(outputRms, outputPeak * 0.5),
        characterReductionDb: 0,
        dropoutGain: saturationDrive > 0 ? Math.max(0.25, 1 - Math.min(0.75, saturationDrive * 0.25)) : 1,
        endInputPeak: inputPeak,
        endOutputPeak: outputPeak,
        endReductionDb: limiterReductionDb,
        endDetectorDb: detectorDb,
        timestamp: contextTime,
      },
      sidechainEvents: [],
    };
  }

  getDrumVoiceAnalyser(): undefined {
    return classifiedPlaceholderGetter('getDrumVoiceAnalyser', undefined);
  }

  getGranularActiveGrainCount(): number {
    return this.latestTelemetry?.activeGrains ?? classifiedPlaceholderGetter('getGranularActiveGrainCount', 0);
  }

  getGranularBufferWaveform(): null {
    return classifiedPlaceholderGetter('getGranularBufferWaveform', null);
  }

  getGranularVoicePositions(): [number, number, number, number] {
    return classifiedPlaceholderGetter('getGranularVoicePositions', [0, 0, 0, 0] as [number, number, number, number]);
  }

  getGranularWriteHeadPosition(): number {
    return classifiedPlaceholderGetter('getGranularWriteHeadPosition', 0);
  }

  getLeadMorphedParams(): null {
    return classifiedPlaceholderGetter('getLeadMorphedParams', null);
  }

  getCurrentFilterFreq(): number {
    return classifiedPlaceholderGetter('getCurrentFilterFreq', 1000);
  }

  getCurrentLfoValue(): number {
    return classifiedPlaceholderGetter('getCurrentLfoValue', 0);
  }

  getCurrentLfo2Value(): number {
    return classifiedPlaceholderGetter('getCurrentLfo2Value', 0);
  }

  getCurrentPadFilterFreq(): number {
    return classifiedPlaceholderGetter('getCurrentPadFilterFreq', 1000);
  }

  getCurrentPadLfoValue(): number {
    return classifiedPlaceholderGetter('getCurrentPadLfoValue', 0);
  }

  getRecordableBusNodes(): Record<string, RecordableTrackSource> {
    return classifiedPlaceholderGetter('getRecordableBusNodes', {
      master: { node: this.runtime.outputNode },
    });
  }

  getEarthTextureDebugState(): EarthTextureDebugState {
    return classifiedPlaceholderGetter('getEarthTextureDebugState', EMPTY_EARTH_TEXTURE_DEBUG_STATE);
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
          presetId: source.presetId,
          expression: source.expression,
        })),
      },
      latestTelemetry: this.latestTelemetry,
    };
  }

  getTransportDebugState(): TransportDebugSnapshot | null {
    const telemetry = this.latestTelemetry;
    const transport = this.latestProductSnapshot?.transport;
    if (!telemetry || !transport) return null;

    const effectiveBpm = Number.isFinite(transport.bpm) && transport.bpm > 0 ? transport.bpm : 120;
    const beatsPerBar = Math.max(1, transport.beatsPerBar || 4);
    const barsPerPhrase = Math.max(1, transport.barsPerPhrase || 4);
    const beatDurationSec = 60 / effectiveBpm;
    const effectivePhraseSeconds = beatDurationSec * beatsPerBar * barsPerPhrase;
    const beatsPerPhrase = beatsPerBar * barsPerPhrase;
    const beatPosition = Number.isFinite(telemetry.beatPosition ?? NaN) ? telemetry.beatPosition! : 0;
    const beatInPhrase = ((beatPosition % beatsPerPhrase) + beatsPerPhrase) % beatsPerPhrase;
    const remainingBeats = beatInPhrase === 0 && telemetry.transportRunning
      ? beatsPerPhrase
      : Math.max(0, beatsPerPhrase - beatInPhrase);
    const nextPhraseBoundaryIn = telemetry.transportRunning ? remainingBeats * beatDurationSec : 0;

    return {
      effectiveBpm,
      effectivePhraseSeconds,
      nextPhraseBoundaryIn,
      nextHarmonyEventIn: null,
      nextProgressionStepIn: null,
    };
  }

  getState(): EngineState {
    return createCoreProductEngineState(this.running || this.latestTelemetry?.transportRunning === true);
  }

  getAllStemNodes(): Record<string, RecordableTrackSource> {
    return classifiedPlaceholderGetter('getAllStemNodes', this.getRecordableBusNodes());
  }

  setStateChangeCallback(callback: ((state: EngineState) => void) | null): void {
    this.stateChangeCallback = callback;
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
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

  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void {
    this.unsupportedControlCount += 1;
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
    this.latestSliderState = { ...sliderState };
    if (this.runtimeReady && this.assetAdapter.shouldUseDefaultAssets()) {
      void this.assetAdapter.ensureDefaultAssetsForState().then(() => this.applyLatestSnapshotUpdate('asset-reference-change'));
      return;
    }
    this.applyLatestSnapshotUpdate();
  }

  setSynthEuclidClockDivs(divs: unknown[]): void {
    this.patchIndexedAdapterState(
      'synthEuclid',
      'ClockDivision',
      divs,
      (value) => this.normalizeClockDivisionValue(value, 16),
      false,
    );
    this.syncSequencerLaneParams(
      'synth',
      divs,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
      (value) => this.normalizeClockDivisionValue(value, 16),
    );
  }

  setDrumEuclidClockDivs(divs: unknown[]): void {
    this.patchIndexedAdapterState(
      'drumEuclid',
      'ClockDivision',
      divs,
      (value) => this.normalizeClockDivisionValue(value, 16),
      false,
    );
    this.syncSequencerLaneParams(
      'drum',
      divs,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneClockDivision,
      (value) => this.normalizeClockDivisionValue(value, 16),
    );
  }

  setSynthEuclidSwings(swings: unknown[]): void {
    this.patchIndexedAdapterState('synthEuclid', 'Swing', swings, (value) => this.normalizedUnitValue(value, 0), false);
    this.syncSequencerLaneParams(
      'synth',
      swings,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
      (value) => this.normalizedUnitValue(value, 0),
    );
  }

  setDrumEuclidSwings(swings: unknown[]): void {
    this.patchIndexedAdapterState('drumEuclid', 'Swing', swings, (value) => this.normalizedUnitValue(value, 0), false);
    this.syncSequencerLaneParams(
      'drum',
      swings,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLaneSwing,
      (value) => this.normalizedUnitValue(value, 0),
    );
  }

  setSynthEuclidEvolveConfigs(configs: unknown[]): void {
    this.patchAdapterState({
      synthEuclidEvolveConfigs: this.normalizeEvolveConfigs(configs),
    });
  }

  setDrumEuclidEvolveConfigs(configs: unknown[]): void {
    this.patchAdapterState({
      drumEuclidEvolveConfigs: this.normalizeEvolveConfigs(configs),
    });
  }

  setSynthSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.synthSubLaneEnabled = this.normalizeSubLaneEnabledStates(states);
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.drumSubLaneEnabled = this.normalizeSubLaneEnabledStates(states);
    this.syncSequencerStepToggles('drum', true);
  }

  setSynthPitchSettings(settings: unknown[]): void {
    this.adapterState = {
      ...this.adapterState,
      synthPitchSettings: Array.isArray(settings) ? settings.slice(0, 16) : [],
    };
  }

  setSynthPitchBindingModes(modes: unknown[]): void {
    this.adapterState = {
      ...this.adapterState,
      synthPitchBindingModes: Array.isArray(modes) ? modes.slice(0, 16) : [],
    };
  }

  setSynthStepOverrides(overrides: unknown): void {
    this.synthStepToggleOverrides = this.normalizeSequencerStepToggleOverrides(
      overrides,
      this.synthStepToggleOverrides,
    );
    this.synthStepValueOverrides = this.normalizeSequencerStepValueOverrides(
      overrides,
      this.synthStepValueOverrides,
      true,
    );
    this.synthStepValueConfigs = this.normalizeSequencerStepValueConfigs(
      overrides,
      this.synthStepValueConfigs,
      true,
    );
    this.syncSequencerStepToggles('synth', true);
  }

  setDrumStepOverrides(overrides: unknown): void {
    this.drumStepToggleOverrides = this.normalizeSequencerStepToggleOverrides(
      overrides,
      this.drumStepToggleOverrides,
    );
    this.drumStepValueOverrides = this.normalizeSequencerStepValueOverrides(
      overrides,
      this.drumStepValueOverrides,
      false,
    );
    this.drumStepValueConfigs = this.normalizeSequencerStepValueConfigs(
      overrides,
      this.drumStepValueConfigs,
      false,
    );
    this.syncSequencerStepToggles('drum', true);
  }

  async start(sliderState?: Record<string, unknown>): Promise<void> {
    if (sliderState) {
      this.latestSliderState = { ...sliderState };
    }
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    await this.assetAdapter.ensureDefaultAssetsForState();
    this.loadLatestSnapshot('runtime-start');
    await this.runtime.resume();
    this.runtime.postEvent(createCoreProductStartEvent());
    this.flushModulationRanges();
    this.running = true;
    this.stateChangeCallback?.(createCoreProductEngineState(true));
  }

  async resume(): Promise<void> {
    await this.runtime.resume();
    this.runtime.postEvent(createCoreProductStartEvent());
    this.running = true;
    this.stateChangeCallback?.(createCoreProductEngineState(true));
  }

  async suspend(): Promise<void> {
    this.runtime.postEvent(createCoreProductStopEvent());
    await this.runtime.suspend();
    this.running = false;
    this.stateChangeCallback?.(createCoreProductEngineState(false));
  }

  stop(): void {
    this.runtime.postEvent(createCoreProductStopEvent());
    void this.runtime.suspend();
    this.running = false;
    this.stateChangeCallback?.(createCoreProductEngineState(false));
  }

  dispose(): void {
    this.runtime.postEvent(createCoreProductStopEvent());
    this.runtime.dispose();
    this.runtimeReady = false;
    this.running = false;
    this.latestProductSnapshot = null;
    this.assetAdapter.clear();
    this.stateChangeCallback?.(createCoreProductEngineState(false));
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
    this.stateChangeCallback?.(this.getState());
  }

  resetSonicParityFx(): void {
    this.runtime.reset();
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
    if (padParamsOverride) {
      this.updateParams(padParamsOverride);
    }
    const targetSource = voiceIndex >= 3 ? CORE_PRODUCT_SOURCE_IDS.pad2 : CORE_PRODUCT_SOURCE_IDS.pad1;
    const post = () => {
      this.runtime.postEvent(createCoreProductManualNoteEvent(
        targetSource,
        midiFromFrequency(frequency),
        velocity,
        noteDuration * 1000,
      ));
    };
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

  async loadLeadPreset(slot: unknown, presetId: unknown): Promise<void> {
    const slotKey = String(slot ?? '').toUpperCase();
    const stateKeyBySlot: Record<string, string> = {
      A: 'lead1PresetA',
      B: 'lead1PresetB',
      C: 'lead2PresetC',
      D: 'lead2PresetD',
    };
    const key = stateKeyBySlot[slotKey] ?? 'lead1PresetA';
    this.patchAdapterState({ [key]: String(presetId ?? '') });
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
    const sampleOffset = midiSampleOffset(message, {
      sampleRate: this.runtime.audioContext?.sampleRate ?? 48000,
      currentTimeSeconds: this.runtime.audioContext?.currentTime ?? 0,
    });
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
    const target = this.resolveDrumParamRangeTarget(key);
    if (!target) {
      this.reportUnsupportedRangeKey(key);
      return;
    }
    this.syncSingleRange(this.drumSampleHoldRanges, key, target, range, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold, key);
  }

  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.sampleHoldRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold);
  }

  setRuntimeWalkRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    this.syncRangeSet(this.runtimeWalkRanges, ranges, CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk);
  }

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    this.setDisplayCallback('journeyMorphClock', callback);
  }

  setLeadExpressionCallback(callback: ((expression: { lead1: number; lead2: number }) => void) | null): void {
    this.setDisplayCallback('leadExpression', callback);
  }

  setLeadMorphCallback(callback: ((morph: { lead1: number; lead2: number }) => void) | null): void {
    this.setDisplayCallback('leadMorph', callback);
  }

  setPadMorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void {
    this.setDisplayCallback('padMorph', callback);
  }

  setPad2MorphTriggerCallback(callback: ((morphPosition: number) => void) | null): void {
    this.setDisplayCallback('pad2Morph', callback);
  }

  setLeadDistanceCallback(callback: ((distance: { lead1: number; lead2: number }) => void) | null): void {
    this.setDisplayCallback('leadDistance', callback);
  }

  setPadDistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    this.setDisplayCallback('padDistance', callback);
  }

  setPad2DistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    this.setDisplayCallback('pad2Distance', callback);
  }

  setPianoDistanceTriggerCallback(callback: ((distance: number) => void) | null): void {
    this.setDisplayCallback('pianoDistance', callback);
  }

  setLeadDelayCallback(callback: ((delay: { lead1: string; lead2: string }) => void) | null): void {
    this.setDisplayCallback('leadDelay', callback);
  }

  setDrumTriggerCallback(callback: ((voice: unknown, velocity: number) => void) | null): void {
    this.setDisplayCallback('drumTrigger', callback);
  }

  setDrumMorphTriggerCallback(callback: ((voice: unknown, morphPosition: number) => void) | null): void {
    this.setDisplayCallback('drumMorph', callback);
  }

  setDrumParamSHTriggerCallback(callback: ((voice: unknown, key: string, position: number) => void) | null): void {
    this.setDisplayCallback('drumParamSH', callback);
  }

  setGranularSHTriggerCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    this.setDisplayCallback('granularSH', callback);
  }

  setDrumEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void {
    this.setDisplayCallback('drumEvolveOverrides', callback);
  }

  setSynthEvolveOverridesChangedCallback(callback: ((laneIndex: number, overrides: unknown) => void) | null): void {
    this.setDisplayCallback('synthEvolveOverrides', callback);
  }

  setSynthNoteRangeEvolvedCallback(callback: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null): void {
    this.setDisplayCallback('synthNoteRangeEvolved', callback);
  }

  setDrumStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    this.setDisplayCallback('drumStepPosition', callback);
    callback?.([0, 0, 0, 0], [0, 0, 0, 0]);
  }

  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null): void {
    this.setDisplayCallback('synthStepPosition', callback);
    callback?.([0, 0, 0, 0], [0, 0, 0, 0]);
  }

  setDrumEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void {
    this.setDisplayCallback('drumEuclidEvolve', callback);
  }

  setSynthEuclidEvolveTriggerCallback(callback: ((laneIndex: number) => void) | null): void {
    this.setDisplayCallback('synthEuclidEvolve', callback);
  }

  setGranularUiActive(active: boolean): void {
    this.displayCallbacks.set('granularUiActive', active);
  }

  async triggerDrumVoice(voice: unknown, velocity = 0.8): Promise<void> {
    await this.runtime.ensureStarted();
    this.runtime.postEvent(createCoreProductDrumTriggerEvent(drumVoiceIndex(voice), velocity));
    this.invokeDisplayCallback('drumTrigger', voice, velocity);
  }

  resetSynthEuclidLaneHome(laneIndex: number): void {
    this.postSequencerControlEvent(createCoreProductSequencerResetHomeEvent('synth', laneIndex));
  }

  diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.postSequencerControlEvent(createCoreProductSequencerDiceEvent('synth', laneIndex, intensity));
    this.invokeDisplayCallback('synthEuclidEvolve', laneIndex);
  }

  resetDrumEuclidLaneHome(laneIndex: number): void {
    this.postSequencerControlEvent(createCoreProductSequencerResetHomeEvent('drum', laneIndex));
  }

  diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void {
    this.postSequencerControlEvent(createCoreProductSequencerDiceEvent('drum', laneIndex, intensity));
    this.invokeDisplayCallback('drumEuclidEvolve', laneIndex);
  }

  startJourneyMorphClock(): void {
    this.journeyMorphClockRunning = true;
    const phase = this.latestTelemetry?.journeyMorphPhase ?? 0;
    this.adapterState = {
      ...this.adapterState,
      journeyEnabled: true,
      journeyMorphPhase: phase,
    };
    this.runtime.postEvent(createCoreProductJourneyEvent(true));
    this.runtime.postEvent(createCoreProductJourneyStateEvent(true, phase));
  }

  stopJourneyMorphClock(): void {
    this.journeyMorphClockRunning = false;
    this.adapterState = {
      ...this.adapterState,
      journeyEnabled: false,
      journeyMorphPhase: this.latestTelemetry?.journeyMorphPhase ?? 0,
    };
    this.runtime.postEvent(createCoreProductJourneyEvent(false));
    this.runtime.postEvent(createCoreProductJourneyStateEvent(false, this.latestTelemetry?.journeyMorphPhase ?? 0));
  }

  async auditionSynthNote(note: ManualSynthNoteOptions): Promise<void> {
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    if (note.source === 'piano') {
      await this.assetAdapter.ensurePianoAssetForMidi(note.midi);
      this.loadLatestSnapshot('manual-piano-asset');
    }
    this.runtime.postEvent(createCoreProductManualNoteEvent(
      sourceId(note.source),
      note.midi,
      note.velocity ?? 0.8,
      note.durationMs ?? 180,
    ));
  }

  async auditionSynthNotes(notes: ManualSynthNoteOptions[]): Promise<void> {
    await this.runtime.ensureStarted();
    this.runtimeReady = true;
    if (notes.some((note) => note.source === 'piano')) {
      await Promise.all(
        notes
          .filter((note) => note.source === 'piano')
          .map((note) => this.assetAdapter.ensurePianoAssetForMidi(note.midi)),
      );
      this.loadLatestSnapshot('manual-piano-asset');
    }
    for (const note of notes) {
      this.runtime.postEvent(createCoreProductManualNoteEvent(
        sourceId(note.source),
        note.midi,
        note.velocity ?? 0.8,
        note.durationMs ?? 180,
      ));
    }
  }

  private loadLatestSnapshot(reason: SnapshotReloadReason = 'adapter-update'): void {
    if (!this.runtimeReady) return;
    this.loadProductSnapshot(this.createLatestSnapshot(), reason);
  }

  private applyLatestSnapshotUpdate(reason: SnapshotReloadReason = 'adapter-update'): void {
    if (!this.runtimeReady) return;
    const nextSnapshot = this.createLatestSnapshot();
    const previousSnapshot = this.latestProductSnapshot;
    if (previousSnapshot && this.applySnapshotDiff(previousSnapshot, nextSnapshot)) {
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
    this.fullSnapshotReloadCount += 1;
    this.snapshotReloadCpuMs += Math.max(0, this.nowMs() - startMs);
    this.lastSnapshotReloadReason = reason;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private createLatestSnapshot(): CoreProductSnapshot {
    const hasAdapterState = Object.keys(this.adapterState).length > 0;
    const telemetryRngState = this.latestTelemetry?.rngSeed || this.latestTelemetry?.rngState
      ? {
        rngSeed: this.latestTelemetry.rngSeed,
        rngState: this.latestTelemetry.rngState,
      }
      : {};
    const snapshotState = this.latestSliderState
      ? { ...telemetryRngState, ...this.latestSliderState, ...this.adapterState, journeyEnabled: this.journeyMorphClockRunning }
      : hasAdapterState
      ? { ...telemetryRngState, ...this.adapterState, journeyEnabled: this.journeyMorphClockRunning }
      : this.journeyMorphClockRunning
      ? { ...telemetryRngState, journeyEnabled: true }
      : undefined;
    return createCoreProductSnapshot(snapshotState);
  }

  private applySnapshotDiff(previous: CoreProductSnapshot, next: CoreProductSnapshot): boolean {
    this.pendingSnapshotReloadReason = null;
    const diff = buildCoreProductSnapshotDiff(previous, next, {
      forwardRngDiffs: shouldForwardCoreProductRngDiffs(this.latestSliderState, this.latestTelemetry),
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
    this.updateRuntimeWalkPositions(hostTelemetry);
    this.reconcileSequencerUiState(hostTelemetry);
    if (this.perfMonitorEnabled) {
      this.perfUpdateCallback?.(this.createPerfSnapshot(hostTelemetry));
    }
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
      const lane = state.synthLanes[laneIndex];
      if (!lane) return;
      this.reconcileSynthSequencerLane(laneIndex, lane, shouldNotify);
      return;
    }
    if (state.lastChangedTargetId === CORE_PRODUCT_SEQUENCER_IDS.drum) {
      const lane = state.drumLanes[laneIndex];
      if (!lane) return;
      this.reconcileDrumSequencerLane(laneIndex, lane, shouldNotify);
    }
  }

  private reconcileSynthSequencerLane(
    laneIndex: number,
    lane: CoreProductSequencerLaneUiState,
    notify: boolean,
  ): void {
    this.ensureSequencerLaneCache('synth', laneIndex);
    const includeEmpty = lane.mutationFlags === 0;
    this.synthStepToggleOverrides[laneIndex] = lane.triggerToggles.map(([step, value]) => ({ step, value }));
    this.synthStepValueOverrides[laneIndex] = this.stepValueOverridesFromLane(lane, true);
    this.synthStepValueConfigs[laneIndex] = [];
    const payload = this.synthEvolvePayloadFromLane(lane, laneIndex, includeEmpty);
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
    this.drumStepValueOverrides[laneIndex] = this.stepValueOverridesFromLane(lane, false);
    this.drumStepValueConfigs[laneIndex] = [];
    const payload = this.drumEvolvePayloadFromLane(lane, laneIndex, includeEmpty);
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

  private stepValueOverridesFromLane(
    lane: CoreProductSequencerLaneUiState,
    includeMidiNote: boolean,
  ): SequencerStepValueOverride[] {
    const out: SequencerStepValueOverride[] = [];
    const addValues = (field: CoreProductStepValueField, values: number[] | null | undefined, round = false) => {
      if (!Array.isArray(values)) return;
      for (let step = 0; step < Math.min(values.length, 64); step += 1) {
        const value = values[step];
        if (typeof value === 'number' && Number.isFinite(value)) {
          out.push({ step, field, value: round ? Math.round(value) : value });
        }
      }
    };
    addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.probability, lane.probability);
    addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, lane.ratchet, true);
    if (includeMidiNote) {
      addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, lane.midiNote);
    }
    addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.expression, lane.expression);
    addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.morph, lane.morph);
    addValues(CORE_PRODUCT_STEP_VALUE_FIELDS.distance, lane.distance);
    if (Array.isArray(lane.trigCondition)) {
      for (let step = 0; step < Math.min(lane.trigCondition.length, 64); step += 1) {
        const value = lane.trigCondition[step];
        if (Array.isArray(value)) {
          out.push({
            step,
            field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition,
            value: value[0] ?? 1,
            value2: value[1] ?? 1,
          });
        }
      }
    }
    return out.sort((left, right) => left.step - right.step || left.field - right.field);
  }

  private synthEvolvePayloadFromLane(
    lane: CoreProductSequencerLaneUiState,
    laneIndex: number,
    includeEmpty: boolean,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    payload.triggerToggles = lane.triggerToggles;
    const baseMidi = this.latestProductSnapshot?.synthLanes[laneIndex]?.midiNote ?? 60;
    const pitch = Array.isArray(lane.midiNote)
      ? lane.midiNote.map((value) => Math.round(value - baseMidi))
      : null;
    for (const [key, values] of Object.entries({
      pitch,
      expression: lane.expression,
      morph: lane.morph,
      distance: lane.distance,
      probability: lane.probability,
      ratchet: lane.ratchet,
    })) {
      if (Array.isArray(values) || includeEmpty) {
        payload[key] = Array.isArray(values) ? values : [];
      }
    }
    return payload;
  }

  private drumEvolvePayloadFromLane(
    lane: CoreProductSequencerLaneUiState,
    laneIndex: number,
    includeEmpty: boolean,
  ): Record<string, unknown> {
    const laneArray = <T>(value: T[] | null | undefined): (T[] | null)[] => {
      const lanes: (T[] | null)[] = [null, null, null, null];
      if (laneIndex < lanes.length) {
        lanes[laneIndex] = Array.isArray(value) ? value : includeEmpty ? [] : null;
      }
      return lanes;
    };
    const triggerToggles = [new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>(), new Map<number, boolean>()];
    if (laneIndex < triggerToggles.length) {
      triggerToggles[laneIndex] = new Map(lane.triggerToggles);
    }
    return {
      triggerToggles,
      probability: laneArray(lane.probability),
      ratchet: laneArray(lane.ratchet),
      trigCondition: laneArray(lane.trigCondition),
      expression: laneArray(lane.expression),
      pitch: laneArray(lane.midiNote),
      morph: laneArray(lane.morph),
      distance: laneArray(lane.distance),
      slice: laneArray(null),
      reverse: laneArray(null),
    };
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
      snapshotReloadCpuMs: this.snapshotReloadCpuMs,
      lastSnapshotReloadReason: this.lastSnapshotReloadReason,
    };
  }

  private createPerfSnapshot(telemetry: CoreProductTelemetrySnapshot): Record<string, unknown> {
    return {
      product: {
        avgPercent: telemetry.renderCpuPercent ?? 0,
        peakPercent: telemetry.renderCpuPeakPercent ?? 0,
        missPercent: null,
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
      snapshotReloadCpuMs: telemetry.snapshotReloadCpuMs ?? this.snapshotReloadCpuMs,
      lastSnapshotReloadReason: telemetry.lastSnapshotReloadReason ?? this.lastSnapshotReloadReason,
    };
  }

  private patchAdapterState(patch: Record<string, unknown>, loadSnapshot = true): void {
    this.adapterState = { ...this.adapterState, ...patch };
    if (loadSnapshot) {
      this.applyLatestSnapshotUpdate();
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

  private normalizedUnitValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : fallback;
  }

  private normalizeClockDivisionValue(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(1, Math.min(128, Math.round(value)));
    }
    if (typeof value !== 'string') {
      return fallback;
    }
    const table: Record<string, number> = {
      '1/4': 4,
      '1/4T': 6,
      '1/8': 8,
      '1/8T': 12,
      '1/16': 16,
      '1/16T': 24,
      '1/32': 32,
      '1/32T': 48,
      '1/64': 64,
    };
    return table[value] ?? fallback;
  }

  private normalizeEvolveConfigs(configs: unknown): Array<{ enabled: boolean; evolution: number; everyBars: number }> {
    const items = Array.isArray(configs) ? configs : [];
    return items.slice(0, 4).map((config) => {
      const source = config && typeof config === 'object' ? config as Record<string, unknown> : {};
      const evolution = typeof source.evolution === 'number' && Number.isFinite(source.evolution)
        ? source.evolution
        : 0;
      const everyBars = typeof source.everyBars === 'number' && Number.isFinite(source.everyBars)
        ? source.everyBars
        : 4;
      return {
        enabled: source.enabled !== false,
        evolution: Math.max(0, Math.min(1, evolution)),
        everyBars: Math.max(1, Math.round(everyBars)),
      };
    });
  }

  private normalizeSubLaneEnabledStates(states: unknown): Record<string, boolean>[] {
    const lanes = Array.isArray(states) ? states : [];
    return Array.from({ length: Math.max(4, Math.min(16, lanes.length || 4)) }, (_, laneIndex) => {
      const source = lanes[laneIndex];
      if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
      const out: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value === 'boolean') {
          out[key] = value;
        }
      }
      return out;
    });
  }

  private normalizeSequencerStepToggleOverrides(
    overrides: unknown,
    fallback: SequencerStepToggleOverride[][],
  ): SequencerStepToggleOverride[][] {
    const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
      ? overrides as Record<string, unknown>
      : null;
    if (source && !Object.prototype.hasOwnProperty.call(source, 'triggerToggles')) {
      return this.cloneStepToggleOverrides(fallback);
    }
    const candidate = source ? source.triggerToggles : overrides;
    if (candidate === undefined) {
      return this.cloneStepToggleOverrides(fallback);
    }
    const lanes = Array.isArray(candidate) ? candidate : [];
    const laneCount = Math.max(4, Math.min(16, Math.max(lanes.length, fallback.length)));
    return Array.from({ length: laneCount }, (_, laneIndex) =>
      this.normalizeStepToggleLane(lanes[laneIndex]),
    );
  }

  private cloneStepToggleOverrides(overrides: SequencerStepToggleOverride[][]): SequencerStepToggleOverride[][] {
    return overrides.map((lane) => lane.map((toggle) => ({ ...toggle })));
  }

  private normalizeStepToggleLane(lane: unknown): SequencerStepToggleOverride[] {
    const toggles = new Map<number, boolean>();
    const add = (stepValue: unknown, enabledValue: unknown) => {
      if (typeof stepValue !== 'number' || !Number.isFinite(stepValue)) return;
      const step = Math.round(stepValue);
      if (step < 0 || step > 63) return;
      toggles.set(step, this.booleanToggleValue(enabledValue));
    };

    if (lane instanceof Map) {
      for (const [step, enabled] of lane.entries()) {
        add(step, enabled);
      }
    } else if (Array.isArray(lane)) {
      lane.forEach((entry, index) => {
        if (Array.isArray(entry)) {
          add(entry[0], entry[1]);
          return;
        }
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          add(record.step, record.value);
          return;
        }
        if (typeof entry === 'boolean' || typeof entry === 'number') {
          add(index, entry);
        }
      });
    } else if (lane && typeof lane === 'object') {
      for (const [step, enabled] of Object.entries(lane as Record<string, unknown>)) {
        const parsedStep = Number(step);
        add(parsedStep, enabled);
      }
    }

    return Array.from(toggles.entries())
      .sort(([left], [right]) => left - right)
      .map(([step, value]) => ({ step, value }));
  }

  private booleanToggleValue(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    return Boolean(value);
  }

  private normalizeSequencerStepValueOverrides(
    overrides: unknown,
    fallback: SequencerStepValueOverride[][],
    includeMidiNote: boolean,
  ): SequencerStepValueOverride[][] {
    const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
      ? overrides as Record<string, unknown>
      : null;
    if (!source) {
      return fallback.map((lane) => lane.map((entry) => ({ ...entry })));
    }
    const laneCount = Math.max(4, Math.min(16, fallback.length));
    const lanes: SequencerStepValueOverride[][] = Array.from({ length: laneCount }, () => []);
    const addNumericField = (
      key: string,
      field: CoreProductStepValueField,
      min: number,
      max: number,
      round = false,
    ) => {
      const value = source[key];
      if (!Array.isArray(value)) return;
      const count = Math.max(laneCount, Math.min(16, value.length));
      while (lanes.length < count) lanes.push([]);
      for (let laneIndex = 0; laneIndex < Math.min(value.length, lanes.length); laneIndex += 1) {
        const laneOut = lanes[laneIndex];
        if (!laneOut) continue;
        this.collectNumericStepValues(value[laneIndex], field, min, max, round, laneOut);
      }
    };

    addNumericField('probability', CORE_PRODUCT_STEP_VALUE_FIELDS.probability, 0, 1);
    addNumericField('ratchet', CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet, 1, 8, true);
    if (includeMidiNote) {
      addNumericField('pitch', CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, 0, 127);
    }
    addNumericField('expression', CORE_PRODUCT_STEP_VALUE_FIELDS.expression, 0, 1);
    addNumericField('morph', CORE_PRODUCT_STEP_VALUE_FIELDS.morph, 0, 1);
    addNumericField('distance', CORE_PRODUCT_STEP_VALUE_FIELDS.distance, 0, 1);

    if (Array.isArray(source.trigCondition)) {
      for (let laneIndex = 0; laneIndex < Math.min(source.trigCondition.length, lanes.length); laneIndex += 1) {
        const laneOut = lanes[laneIndex];
        if (!laneOut) continue;
        this.collectTrigConditionStepValues(source.trigCondition[laneIndex], laneOut);
      }
    }
    return lanes.map((lane) => lane.sort((left, right) => left.step - right.step || left.field - right.field));
  }

  private normalizeSequencerStepValueConfigs(
    overrides: unknown,
    fallback: SequencerStepValueConfig[][],
    includeMidiNote: boolean,
  ): SequencerStepValueConfig[][] {
    const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides) && !(overrides instanceof Map)
      ? overrides as Record<string, unknown>
      : null;
    if (!source) {
      return fallback.map((lane) => lane.map((entry) => ({ ...entry })));
    }

    const laneCount = Math.max(4, Math.min(16, fallback.length));
    const lanes: SequencerStepValueConfig[][] = Array.from({ length: laneCount }, () => []);
    const addConfig = (
      valueKey: string,
      directionKey: string,
      field: CoreProductStepValueField,
    ) => {
      const values = source[valueKey];
      if (!Array.isArray(values)) return;
      const directions = Array.isArray(source[directionKey]) ? source[directionKey] as unknown[] : [];
      while (lanes.length < Math.min(16, values.length)) lanes.push([]);
      for (let laneIndex = 0; laneIndex < Math.min(values.length, lanes.length); laneIndex += 1) {
        const laneValues = values[laneIndex];
        if (!Array.isArray(laneValues) || laneValues.length === 0) continue;
        const laneOut = lanes[laneIndex];
        if (!laneOut) continue;
        laneOut.push({
          field,
          steps: Math.max(1, Math.min(64, laneValues.length)),
          direction: this.normalizeSubLaneDirection(directions[laneIndex]),
        });
      }
    };

    if (includeMidiNote) {
      addConfig('pitch', 'pitchDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote);
    }
    addConfig('ratchet', 'expressionDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet);
    addConfig('expression', 'expressionDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.expression);
    addConfig('morph', 'morphDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.morph);
    addConfig('distance', 'distanceDirection', CORE_PRODUCT_STEP_VALUE_FIELDS.distance);

    return lanes;
  }

  private normalizeSubLaneDirection(value: unknown): CoreProductSubLaneDirection {
    const text = String(value ?? 'forward').toLowerCase();
    if (text === 'reverse') return CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse;
    if (text === 'pingpong') return CORE_PRODUCT_SUBLANE_DIRECTIONS.pingpong;
    return CORE_PRODUCT_SUBLANE_DIRECTIONS.forward;
  }

  private collectNumericStepValues(
    lane: unknown,
    field: CoreProductStepValueField,
    min: number,
    max: number,
    round: boolean,
    out: SequencerStepValueOverride[],
  ): void {
    if (!Array.isArray(lane)) return;
    for (let step = 0; step < Math.min(64, lane.length); step += 1) {
      const raw = lane[step];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      const value = Math.max(min, Math.min(max, round ? Math.round(raw) : raw));
      out.push({ step, field, value });
    }
  }

  private collectTrigConditionStepValues(lane: unknown, out: SequencerStepValueOverride[]): void {
    if (!Array.isArray(lane)) return;
    for (let step = 0; step < Math.min(64, lane.length); step += 1) {
      const condition = lane[step];
      if (!Array.isArray(condition)) continue;
      const numerator = typeof condition[0] === 'number' && Number.isFinite(condition[0])
        ? Math.max(1, Math.min(16, Math.round(condition[0])))
        : 1;
      const denominator = typeof condition[1] === 'number' && Number.isFinite(condition[1])
        ? Math.max(1, Math.min(16, Math.round(condition[1])))
        : 1;
      out.push({
        step,
        field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition,
        value: Math.min(numerator, denominator),
        value2: denominator,
      });
    }
  }

  private flushSequencerStepToggles(): void {
    this.syncSequencerStepToggles('synth', false);
    this.syncSequencerStepToggles('drum', false);
  }

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

  private stepValueFieldEnabled(
    sequencer: SequencerKind,
    laneIndex: number,
    field: CoreProductStepValueField,
  ): boolean {
    const key = this.stepValueFieldSubLaneKey(field);
    if (!key) return true;
    const lanes = sequencer === 'synth' ? this.synthSubLaneEnabled : this.drumSubLaneEnabled;
    return lanes[laneIndex]?.[key] !== false;
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

  private syncSingleRange(
    store: Map<string, ProductRangeState>,
    key: string,
    target: CoreProductRangeTarget,
    range: { min: number; max: number } | null,
    mode: CoreProductModulationRangeMode,
    displayKey: string,
  ): void {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
      const previous = store.get(key);
      if (previous) {
        for (const previousTarget of previous.targets) {
          this.postModulationRange(previousTarget, null, mode, displayKey);
        }
        store.delete(key);
      }
      return;
    }
    const normalized = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
    store.set(key, { range: normalized, targets: [target] });
    this.postModulationRange(target, normalized, mode, displayKey);
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
      for (const target of targets) {
        this.postModulationRange(target, normalized, mode, key);
      }
    }
    for (const [key, previous] of Array.from(store.entries())) {
      if (nextKeys.has(key)) continue;
      for (const target of previous.targets) {
        this.postModulationRange(target, null, mode, key);
      }
      store.delete(key);
    }
  }

  private flushModulationRanges(): void {
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
    if (mode === CORE_PRODUCT_MODULATION_RANGE_MODE.randomWalk && range) {
      this.runtimeWalkControlNames.set(target.controlId, displayKey);
    } else if (!range) {
      this.runtimeWalkControlNames.delete(target.controlId);
    }
    this.runtime.postEvent(createCoreProductModulationRangeEvent(
      target,
      range,
      mode,
      this.currentNumericValue(displayKey, range),
      this.currentRangeValueContext(),
    ));
  }

  private currentRangeValueContext(): CoreProductRangeValueContext {
    const snapshotBpm = this.latestProductSnapshot?.transport.bpm;
    return { bpm: typeof snapshotBpm === 'number' && Number.isFinite(snapshotBpm) ? snapshotBpm : 120 };
  }

  private currentNumericValue(key: string, range: { min: number; max: number } | null): number {
    const value = this.latestSliderState?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (range) return (range.min + range.max) * 0.5;
    return 0;
  }

  private updateRuntimeWalkPositions(telemetry: CoreProductTelemetrySnapshot): void {
    const values = telemetry.runtimeWalkValues;
    if (!values) return;
    const next: Record<string, number> = {};
    for (const [idText, value] of Object.entries(values)) {
      const key = this.runtimeWalkControlNames.get(Number(idText));
      if (!key || typeof value !== 'number') continue;
      next[key] = value;
    }
    this.runtimeWalkPositions = next;
    this.invokeDisplayCallback('runtimeWalkPositions', { ...next });
  }

  private resolveDrumParamRangeTarget(key: string): CoreProductRangeTarget | null {
    const voicePatterns: Array<[RegExp, number]> = [
      [/^drumSub/, 0],
      [/^drumKick/, 1],
      [/^drumClick/, 2],
      [/^drumBeepHi/, 3],
      [/^drumBeepLo/, 4],
      [/^drumNoise/, 5],
      [/^drumMembrane/, 6],
    ];
    const voice = voicePatterns.find(([pattern]) => pattern.test(key))?.[1];
    if (voice === undefined) return null;
    if (/Expression/i.test(key)) {
      return resolveCoreProductDrumParamRangeTarget(voice, 'expression', key);
    }
    if (/DelaySend/i.test(key)) {
      return resolveCoreProductDrumParamRangeTarget(voice, 'delayA', key);
    }
    if (/Distance/i.test(key)) {
      return resolveCoreProductDrumParamRangeTarget(voice, 'distance', key);
    }
    return null;
  }

  private reportUnsupportedRangeKey(key: string): void {
    if (this.reportedUnsupportedRangeKeys.has(key)) return;
    this.reportedUnsupportedRangeKeys.add(key);
    this.unsupportedControlCount += 1;
    if ((import.meta.env as unknown as { DEV?: boolean }).DEV || typeof console !== 'undefined') {
      console.error(`core-product runtime fallback forbidden-production-fallback for slider range "${key}".`);
    }
  }
}

const host = new CoreProductEngineHost();
const unsupportedMethods = new Set<string>();

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
        unsupportedMethods.add(property);
        host.reportRuntimeFallback(property, classification);
        return null;
      };
    }
    return (..._args: unknown[]) => {
      unsupportedMethods.add(property);
      host.reportRuntimeFallback(property, classification);
    };
  },
}) as AudioEngine;
