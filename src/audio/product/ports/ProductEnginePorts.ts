import type { ProductEngineAssetPort } from './ProductAssetPort';
import type { ProductEngineCommandPort } from './ProductCommandPort';
import type { ProductEngineControlPort } from './ProductControlPort';
import type { ProductEngineDiagnosticsPort } from './ProductDiagnosticsPort';
import type { ProductEngineLifecyclePort } from './ProductLifecyclePort';
import type { ProductEngineJourneyPort } from './ProductJourneyPort';
import type { ProductEngineModulationPort } from './ProductModulationPort';
import type { ProductEngineSequencerPort } from './ProductSequencerPort';
import type { ProductEngineTelemetryPort } from './ProductTelemetryPort';

export type ProductEnginePorts = {
  lifecycle: ProductEngineLifecyclePort;
  journey: ProductEngineJourneyPort;
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
  ProductEngineJourneyPort &
  ProductEngineCommandPort &
  ProductEngineControlPort &
  ProductEngineAssetPort &
  ProductEngineTelemetryPort &
  ProductEngineSequencerPort &
  ProductEngineModulationPort &
  ProductEngineDiagnosticsPort;
