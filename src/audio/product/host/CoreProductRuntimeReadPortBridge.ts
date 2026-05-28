import type { ProductRuntimeCapabilityReport } from '../ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';
import type { ProductEngineState, ProductTelemetrySnapshot } from '../ProductEngineTypes';
import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';

// TODO(product-core-burn-down): replace this read bridge with product-owned
// telemetry/state/diagnostic read APIs once WebProductEngine is no longer
// adapting Product host method names.
export function readCoreProductState(callHost: CoreProductHostMethodCall): ProductEngineState {
  return callHost<ProductEngineState>('getState');
}

export function readCoreProductTelemetry(callHost: CoreProductHostMethodCall): ProductTelemetrySnapshot | null {
  return callHost<ProductTelemetrySnapshot | null>('getProductTelemetry');
}

export function readCoreProductDynamicsVisualTelemetry(callHost: CoreProductHostMethodCall): unknown {
  return callHost<unknown>('getDynamicsVisualTelemetry');
}

export function readCoreProductRuntimeDiagnostics(callHost: CoreProductHostMethodCall): ProductRuntimeDiagnostics {
  return callHost<ProductRuntimeDiagnostics>('getProductRuntimeDiagnostics');
}

export function readCoreProductCapabilityReport(callHost: CoreProductHostMethodCall): ProductRuntimeCapabilityReport {
  return callHost<ProductRuntimeCapabilityReport>('getCapabilityReport');
}
