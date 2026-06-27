import type {
  ProductDynamicsVisualTelemetry,
  ProductEngineState,
  ProductTelemetrySnapshot,
} from '../ProductEngineTypes';

export type ProductEngineTelemetryPort = {
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry;
  requestTelemetryOnce(): void;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setVisualTelemetryActive(active: boolean): void;
};
