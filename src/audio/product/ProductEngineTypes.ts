import type { DecodedCoreProductAsset } from '../coreProductAssets';
import type { CoreProductEvent } from '../coreProductEvents';
import type {
  CoreProductSequencerUiState,
  CoreProductTelemetrySnapshot,
} from '../coreProductTelemetry';
import type { EngineState } from '../engineSharedTypes';

export type ProductSnapshotPatchReason =
  | 'ui-control-change'
  | 'legacy-adapter-update'
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

export type ProductEngineState = EngineState;

export type ProductTelemetrySnapshot = CoreProductTelemetrySnapshot;

export type ProductSequencerUiState = CoreProductSequencerUiState;

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
