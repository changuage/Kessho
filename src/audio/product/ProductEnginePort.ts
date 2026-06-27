import type { ProductEngineAssetPort } from './ports/ProductAssetPort';
import type { ProductEngineCommandPort } from './ports/ProductCommandPort';
import type { ProductEngineControlPort } from './ports/ProductControlPort';
import type { ProductEngineDiagnosticsPort } from './ports/ProductDiagnosticsPort';
import type { ProductEngineLifecyclePort } from './ports/ProductLifecyclePort';
import type { ProductEngineModulationPort } from './ports/ProductModulationPort';
import type { ProductEngineSequencerPort } from './ports/ProductSequencerPort';
import type { ProductEngineTelemetryPort } from './ports/ProductTelemetryPort';

/**
 * Product runtime boundary.
 * Production UI may import this compatibility file. It must not expose Web Audio node objects.
 * Prefer facet imports from `src/audio/product/ports/*` for new focused consumers.
 */
export type { ProductEngineAssetPort } from './ports/ProductAssetPort';
export type { ProductEngineCommandPort } from './ports/ProductCommandPort';
export type { ProductEngineControlPort } from './ports/ProductControlPort';
export type { ProductEngineDiagnosticsPort } from './ports/ProductDiagnosticsPort';
export type { ProductEngineLifecyclePort } from './ports/ProductLifecyclePort';
export type { ProductEngineModulationPort } from './ports/ProductModulationPort';
export type { ProductEngineSequencerPort } from './ports/ProductSequencerPort';
export type { ProductEngineTelemetryPort } from './ports/ProductTelemetryPort';
export type { ProductEnginePorts } from './ports/ProductEnginePorts';

export type ProductEnginePort =
  ProductEngineLifecyclePort &
  ProductEngineCommandPort &
  ProductEngineControlPort &
  ProductEngineAssetPort &
  ProductEngineTelemetryPort &
  ProductEngineSequencerPort &
  ProductEngineModulationPort &
  ProductEngineDiagnosticsPort;
