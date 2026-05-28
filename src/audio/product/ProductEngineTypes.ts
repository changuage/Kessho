import type { DecodedCoreProductAsset } from '../coreProductAssets';
import type { CoreProductEvent } from '../coreProductEvents';
import type {
  CoreProductSequencerUiState,
  CoreProductTelemetrySnapshot,
} from '../coreProductTelemetry';
import type { HarmonyState } from '../harmony';
import type { TransportDebugSnapshot } from '../transport';

export type ProductSnapshotPatchReason =
  | 'ui-control-change'
  | 'sequencer-edit'
  | 'transport-change'
  | 'asset-reference-change'
  | 'preset-load'
  | 'runtime-start'
  | 'runtime-bootstrap'
  | 'debug-force-reload';

export type ProductSnapshotPatch = Readonly<Record<string, unknown>>;

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

export type ProductSequencerUiPatch =
  | { kind: 'drum-evolve-configs'; configs: readonly unknown[] }
  | { kind: 'synth-evolve-configs'; configs: readonly unknown[] }
  | { kind: 'drum-sub-lane-enabled'; states: readonly Record<string, boolean>[] }
  | { kind: 'synth-sub-lane-enabled'; states: readonly Record<string, boolean>[] }
  | { kind: 'synth-pitch-settings'; settings: readonly unknown[] }
  | { kind: 'drum-step-overrides'; overrides: unknown }
  | { kind: 'synth-step-overrides'; overrides: unknown }
  | { kind: 'preset-home-snapshots' }
  | {
      kind: 'capture-synth-lane-home';
      laneIndex: number;
      pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null;
    }
  | {
      kind: 'capture-drum-lane-home';
      laneIndex: number;
      pitchSettings?: unknown;
      pitchState?: { steps?: number; direction?: string; scaleQuantize?: boolean } | null;
    };

export type ProductEngineStartOptions = {
  initialState?: Record<string, unknown>;
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
