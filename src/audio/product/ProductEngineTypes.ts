import type { DecodedCoreProductAsset } from '../coreProductAssets';
import type { CoreProductEvent } from '../coreProductEvents';
import type {
  CoreProductSequencerUiState,
  CoreProductTelemetrySnapshot,
} from '../coreProductTelemetry';
import type { HarmonyState } from '../harmony';
import type { TransportDebugSnapshot } from '../transport';

export type ProductStateRecord = Readonly<Record<string, unknown>>;

export type ProductSnapshotPatchReason =
  | 'ui-control-change'
  | 'fx-control-change'
  | 'morph-control-change'
  | 'journey-morph-change'
  | 'sequencer-edit'
  | 'sequencer-control-change'
  | 'midi-cc-control-change'
  | 'transport-change'
  | 'asset-reference-change'
  | 'preset-load'
  | 'runtime-start'
  | 'runtime-bootstrap'
  | 'debug-force-reload';

export type ProductSnapshotPatch = ProductStateRecord;

export type ProductResolvedStateApplyMode =
  | 'auto'
  | 'event'
  | 'dirty-diff'
  | 'source-rebuild'
  | 'full-snapshot';

export type ProductResolvedStateCommit = {
  readonly revision: number;
  readonly reason: ProductSnapshotPatchReason;
  readonly patch: ProductSnapshotPatch;
  readonly events?: readonly ProductEvent[];
  readonly triggerCritical: boolean;
  readonly applyMode?: ProductResolvedStateApplyMode;
};

export type ProductResolvedStateCommitReceipt = {
  readonly revision: number;
  readonly applied: boolean;
  readonly mode: 'event' | 'dirty-diff' | 'source-rebuild' | 'full-snapshot' | 'deferred' | 'noop';
  readonly audioThreadApplied?: boolean;
  readonly encodedSnapshotHash?: string;
  readonly workletSourceSummaryHash?: string;
  readonly appliedAtFrame?: number;
};

export type ProductRuntimeSnapshotMetadata = {
  readonly revision: number;
  readonly reason: string;
  readonly triggerCritical: boolean;
  readonly encodedSnapshotHash: string;
};

export type ProductSnapshotAppliedReceipt = {
  readonly revision: number;
  readonly applied: true;
  readonly encodedSnapshotHash: string;
  readonly workletSourceSummaryHash?: string;
  readonly appliedAtFrame?: number;
};

export type ProductExternalState = Readonly<object>;

export type ProductMidiMessageKind =
  | 'noteOn'
  | 'noteOff'
  | 'controlChange'
  | 'programChange'
  | 'pitchBend'
  | 'channelPressure'
  | 'polyPressure'
  | 'systemExclusive'
  | 'unknown';

export type ProductMidiMessage = {
  readonly timestamp: number;
  readonly kind: ProductMidiMessageKind;
  readonly status: number;
  readonly channel?: number;
  readonly data1?: number;
  readonly data2?: number;
  readonly rawBytes: readonly number[];
  readonly endpointUniqueID?: number;
  readonly endpointName?: string;
};

export type ProductManualSynthSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano';

export type ProductManualSynthNote = {
  readonly source: ProductManualSynthSource;
  readonly midi: number;
  readonly velocity?: number;
  readonly durationMs?: number;
  readonly voiceIndex?: number;
};

export type ProductDrumVoice = string | number;

export type ProductDrumVoiceName = 'sub' | 'kick' | 'click' | 'beepHi' | 'beepLo' | 'noise' | 'membrane';

export type ProductRange = Readonly<{
  min: number;
  max: number;
}>;

export type ProductRangeMap = Partial<Record<string, ProductRange>>;

export type ProductNumberMap = Readonly<Record<string, number>>;

export type ProductLeadPair = Readonly<{
  lead1: number;
  lead2: number;
}>;

export type ProductLeadDelayState = Readonly<Record<string, number | string>>;

export type ProductDynamicsWorkletVisualTelemetry = Readonly<{
  inputPeak: number;
  outputPeak: number;
  wetPeak: number;
  characterEnv: number;
  characterReductionDb: number;
  dropoutGain: number;
  endInputPeak: number;
  endOutputPeak: number;
  endReductionDb: number;
  endDetectorDb: number;
  characterCombRisk: number;
  characterMinDelayMs: number;
  characterDiffusion: number;
  degradeEventEnv: number;
  degradeEventGainDb: number;
  degradeProfileAmount: number;
  endLowReductionDb: number;
  endHighReductionDb: number;
  endClarityBoostDb: number;
  endBandSplitHz: number;
  endCompMode: number;
  masterSatOversamplingFactor: number;
  timestamp: number;
}>;

export type ProductDynamicsSidechainVisualEvent = Readonly<{
  id: number;
  time: number;
  voice: ProductDrumVoiceName;
  attack: number;
  hold: number;
  release: number;
  amount: number;
  keyStrength: number;
  targetStrength: number;
  reductionDb: number;
}>;

export type ProductDynamicsVisualTelemetry = Readonly<{
  contextTime: number;
  endCompHandledByWorklet: boolean;
  endCompReductionDb: number;
  worklet: ProductDynamicsWorkletVisualTelemetry | null;
  sidechainEvents: ProductDynamicsSidechainVisualEvent[];
}>;

export type ProductSequencerStepPositionCallback = (steps: number[], hitCounts: number[]) => void;

export type ProductSequencerEvolveTriggerCallback = (laneIndex: number) => void;

export type ProductDrumTriggerCallback = (voice: ProductDrumVoice, velocity: number) => void;

export type ProductRuntimeWalkPositionsCallback = (positions: ProductNumberMap) => void;

export type ProductLeadExpressionCallback = (expression: ProductNumberMap) => void;

export type ProductLeadPairCallback = (value: ProductLeadPair) => void;

export type ProductScalarCallback = (value: number) => void;

export type ProductLeadDelayCallback = (delay: ProductLeadDelayState) => void;

export type ProductDrumMorphCallback = (voice: ProductDrumVoice, morphPosition: number) => void;

export type ProductDrumParamSampleHoldCallback = (voice: ProductDrumVoice, key: string, position: number) => void;

export type ProductEvolveOverrides = unknown;

export type ProductEvolveOverridesCallback = (laneIndex: number, overrides: ProductEvolveOverrides) => void;

export type ProductSynthNoteRangeEvolvedCallback = (laneIndex: number, noteMin: number, noteMax: number) => void;

export type ProductEvent = CoreProductEvent;

export type ProductAssetRegistration = DecodedCoreProductAsset;

export type ProductAssetHandle = {
  assetId: number;
};

export type ProductFxOwnershipBus = 'delayA' | 'delayB' | 'granular' | 'reverb';
export type ProductFxOwnershipSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano' | 'drum';
export type ProductFxOwnershipOrigin = 'padChord' | 'padEuclid' | 'leadNote' | 'pianoNote' | 'drumHit';

export type ProductFxOwnershipDebugState = Record<
  ProductFxOwnershipBus,
  {
    owner: ProductFxOwnershipSource | null;
    strength: number;
    lastOrigin: ProductFxOwnershipOrigin | null;
    active: boolean;
  }
>;

export type ProductEngineState = {
  isRunning: boolean;
  harmonyState: HarmonyState | null;
  currentSeed: number;
  currentBucket: string;
  currentFilterFreq: number;
  currentLfoValue: number;
  currentLfo2Value: number;
  cofCurrentStep: number;
  fxOwners: ProductFxOwnershipDebugState;
  transportDebug: TransportDebugSnapshot | null;
};

export type ProductTelemetrySnapshot = CoreProductTelemetrySnapshot;

export type ProductSequencerUiState = CoreProductSequencerUiState;

export type ProductEngineStartOptions = {
  initialState?: ProductStateRecord;
  sampleRateHint?: number;
};

export type ProductEngineLifecycleState =
  | 'cold'
  | 'loading'
  | 'ready'
  | 'running'
  | 'suspended'
  | 'stopped'
  | 'failed';
