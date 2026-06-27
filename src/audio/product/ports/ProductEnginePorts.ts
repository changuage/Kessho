import type { ProductEngineAssetPort } from './ProductAssetPort';
import type { ProductEngineCommandPort } from './ProductCommandPort';
import type { ProductEngineControlPort } from './ProductControlPort';
import type { ProductEngineDiagnosticsPort } from './ProductDiagnosticsPort';
import type { ProductEngineLifecyclePort } from './ProductLifecyclePort';
import type { ProductEngineModulationPort } from './ProductModulationPort';
import type { ProductEngineSequencerPort } from './ProductSequencerPort';
import type { ProductEngineTelemetryPort } from './ProductTelemetryPort';

export type ProductEnginePorts = {
  lifecycle: ProductEngineLifecyclePort;
  command: ProductEngineCommandPort;
  control: ProductEngineControlPort;
  assets: ProductEngineAssetPort;
  telemetry: ProductEngineTelemetryPort;
  sequencer: ProductEngineSequencerPort;
  modulation: ProductEngineModulationPort;
  diagnostics: ProductEngineDiagnosticsPort;
};

export type ProductEnginePort =
  ProductEngineLifecyclePort &
  ProductEngineCommandPort &
  ProductEngineControlPort &
  ProductEngineAssetPort &
  ProductEngineTelemetryPort &
  ProductEngineSequencerPort &
  ProductEngineModulationPort &
  ProductEngineDiagnosticsPort;
