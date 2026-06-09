import type { DrumVoiceType } from './drumSynth';
import type { EarthTexturePlayerDebugSnapshot } from './earthTexturePlayer';
import type { HarmonyState } from './harmony';
import type { TransportDebugSnapshot } from './transport';

export type DynamicsAnalyserKey =
  | 'input'
  | 'postDegrade'
  | 'preSaturation'
  | 'postSaturation'
  | 'endInput'
  | 'endOutput';

export type DynamicsWorkletVisualTelemetry = {
  inputPeak: number;
  outputPeak: number;
  wetPeak: number;
  driftEnv: number;
  driftReductionDb: number;
  dropoutGain: number;
  endInputPeak: number;
  endOutputPeak: number;
  endReductionDb: number;
  endDetectorDb: number;
  driftCombRisk: number;
  driftMinDelayMs: number;
  driftDiffusion: number;
  erosionEventEnv: number;
  erosionEventGainDb: number;
  erosionProfileAmount: number;
  endLowReductionDb: number;
  endHighReductionDb: number;
  endClarityBoostDb: number;
  endBandSplitHz: number;
  endCompMode: number;
  masterSatOversamplingFactor: number;
  timestamp: number;
};

export type DynamicsSidechainVisualEvent = {
  id: number;
  time: number;
  voice: DrumVoiceType;
  attack: number;
  hold: number;
  release: number;
  amount: number;
  keyStrength: number;
  targetStrength: number;
  reductionDb: number;
};

export type DynamicsVisualTelemetrySnapshot = {
  contextTime: number;
  endCompHandledByWorklet: boolean;
  endCompReductionDb: number;
  worklet: DynamicsWorkletVisualTelemetry | null;
  sidechainEvents: DynamicsSidechainVisualEvent[];
};

export type ManualSynthSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano';

export type ManualSynthNoteOptions = {
  source: ManualSynthSource;
  midi: number;
  velocity?: number;
  durationMs?: number;
  voiceIndex?: number;
};

export type FxOwnershipBus = 'delayA' | 'delayB' | 'granular' | 'reverb';
export type FxOwnershipSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano' | 'drum';
export type FxOwnershipOrigin = 'padChord' | 'padEuclid' | 'leadNote' | 'pianoNote' | 'drumHit';

export type FxOwnershipDebugState = Record<
  FxOwnershipBus,
  {
    owner: FxOwnershipSource | null;
    strength: number;
    lastOrigin: FxOwnershipOrigin | null;
    active: boolean;
  }
>;

export type EngineState = {
  isRunning: boolean;
  harmonyState: HarmonyState | null;
  currentSeed: number;
  currentBucket: string;
  currentFilterFreq: number;
  currentLfoValue: number;
  currentLfo2Value: number;
  cofCurrentStep: number;
  fxOwners: FxOwnershipDebugState;
  transportDebug: TransportDebugSnapshot | null;
};

export type EarthTextureDebugState = {
  waves: EarthTexturePlayerDebugSnapshot | null;
  birds: EarthTexturePlayerDebugSnapshot | null;
  birds2: EarthTexturePlayerDebugSnapshot | null;
  frogs: EarthTexturePlayerDebugSnapshot | null;
};
