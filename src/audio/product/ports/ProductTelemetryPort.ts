import type {
  ProductDynamicsVisualTelemetry,
  ProductEngineState,
  ProductSimpleSequencerVisualPlanActive,
  ProductTelemetrySnapshot,
} from '../ProductEngineTypes';

export type ProductEngineTelemetryPort = {
  getProductState(): ProductEngineState;
  getTelemetry(): ProductTelemetrySnapshot | null;
  getDynamicsVisualTelemetry(): ProductDynamicsVisualTelemetry;
  requestTelemetryOnce(): void;
  requestVisualTelemetryAfterRender(): void;
  setTelemetryCallback(callback: ((telemetry: ProductTelemetrySnapshot) => void) | null): void;
  setSimpleSequencerVisualPlanActive(active: ProductSimpleSequencerVisualPlanActive): void;
  setVisualTelemetryActive(active: boolean): void;
};
