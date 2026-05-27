import type {
  ProductAssetHandle,
  ProductAssetRegistration,
  ProductEngineLifecycleState,
  ProductEngineStartOptions,
  ProductEngineState,
  ProductEvent,
  ProductSequencerUiState,
  ProductSnapshotPatch,
  ProductSnapshotPatchReason,
  ProductTelemetrySnapshot,
} from './ProductEngineTypes';
import type { ProductEngineRuntimeMode } from './ProductRuntimeMode';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';

/**
 * Product runtime boundary.
 * Production UI may import this file. It must not expose Web Audio node objects.
 */
export type ProductEnginePort = {
  readonly mode: ProductEngineRuntimeMode;

  preload(): Promise<void>;
  start(options?: ProductEngineStartOptions): Promise<void>;
  stop(): Promise<void>;
  suspend(): void;
  resume(): void;

  updateSnapshotPatch(reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void;
  enqueueEvent(event: ProductEvent): void;
  enqueueEvents(events: readonly ProductEvent[]): void;

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle>;
  unregisterAsset(assetId: number): void;

  getLifecycleState(): ProductEngineLifecycleState;
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getSequencerUiState(): ProductSequencerUiState | null;
  getDiagnostics(): ProductRuntimeDiagnostics;

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setPerfMonitorEnabled(enabled: boolean): void;
  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void;
};
