import { coreProductEngineHost } from '../coreProductEngineHost';
import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import type { ProductEnginePort } from './ProductEnginePort';
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

type ProductHost = Record<string, unknown>;

function host(): ProductHost {
  return coreProductEngineHost as unknown as ProductHost;
}

function callHost<T>(method: string, ...args: unknown[]): T {
  const candidate = host()[method];
  if (typeof candidate !== 'function') {
    throw new Error(`core-product host does not implement ${method}`);
  }
  return (candidate as (...invokeArgs: unknown[]) => T)(...args);
}

export class WebProductEngine implements ProductEnginePort {
  readonly mode = 'core-product' as const;
  private lifecycleState: ProductEngineLifecycleState = 'cold';
  private diagnosticsCallback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null = null;

  async preload(): Promise<void> {
    this.lifecycleState = this.lifecycleState === 'cold' ? 'ready' : this.lifecycleState;
  }

  async start(options?: ProductEngineStartOptions): Promise<void> {
    this.lifecycleState = 'loading';
    try {
      await callHost<Promise<void>>('start', options?.initialState);
      this.lifecycleState = 'running';
      this.publishDiagnostics();
    } catch (error) {
      this.lifecycleState = 'failed';
      throw error;
    }
  }

  stop(): Promise<void> {
    callHost<void>('stop');
    this.lifecycleState = 'stopped';
    this.publishDiagnostics();
    return Promise.resolve();
  }

  suspend(): void {
    void callHost<Promise<void>>('suspend').then(() => {
      this.lifecycleState = 'suspended';
      this.publishDiagnostics();
    });
  }

  resume(): void {
    this.lifecycleState = 'loading';
    void callHost<Promise<void>>('resume').then(() => {
      this.lifecycleState = 'running';
      this.publishDiagnostics();
    }).catch((error: unknown) => {
      this.lifecycleState = 'failed';
      throw error;
    });
  }

  updateSnapshotPatch(_reason: ProductSnapshotPatchReason, patch: ProductSnapshotPatch): void {
    callHost<void>('updateParams', patch);
    this.publishDiagnostics();
  }

  enqueueEvent(event: ProductEvent): void {
    callHost<void>('postProductEvent', event);
    this.publishDiagnostics();
  }

  enqueueEvents(events: readonly ProductEvent[]): void {
    for (const event of events) {
      this.enqueueEvent(event);
    }
  }

  registerAsset(asset: ProductAssetRegistration): Promise<ProductAssetHandle> {
    callHost<void>('registerAsset', asset);
    this.publishDiagnostics();
    return Promise.resolve({ assetId: asset.assetId });
  }

  unregisterAsset(_assetId: number): void {
    throw new Error('core-product host does not yet expose asset unregistration');
  }

  getLifecycleState(): ProductEngineLifecycleState {
    return this.lifecycleState;
  }

  getProductState(): ProductEngineState {
    return callHost<ProductEngineState>('getState');
  }

  getTelemetry(): ProductTelemetrySnapshot | null {
    return callHost<ProductTelemetrySnapshot | null>('getProductTelemetry');
  }

  getSequencerUiState(): ProductSequencerUiState | null {
    return this.getTelemetry()?.sequencerUiState ?? null;
  }

  getDiagnostics(): ProductRuntimeDiagnostics {
    return callHost<ProductRuntimeDiagnostics>('getProductRuntimeDiagnostics');
  }

  setStateChangeCallback(callback: ((state: ProductEngineState) => void) | null): void {
    callHost<void>('setStateChangeCallback', callback);
  }

  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void {
    callHost<void>('setProductTelemetryCallback', callback ? (telemetry: ProductTelemetrySnapshot) => {
      callback(telemetry);
      this.publishDiagnostics();
    } : null);
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    callHost<void>('setPerfMonitorEnabled', enabled);
  }

  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void {
    this.diagnosticsCallback = callback;
    callback?.(this.getDiagnostics());
  }

  private publishDiagnostics(): void {
    this.diagnosticsCallback?.(this.getDiagnostics());
  }
}
