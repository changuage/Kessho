import type { CoreProductHostMethodCall } from './CoreProductHostInvoker';
import type { ProductEngineState, ProductTelemetrySnapshot } from '../ProductEngineTypes';

type ProductDiagnosticsPublisher = () => void;

// TODO(product-core-burn-down): replace this port-to-host telemetry callback
// bridge with product-owned telemetry subscriptions once WebProductEngine no
// longer adapts Product host callback method names.
export function setCoreProductStateChangeCallback(
  callHost: CoreProductHostMethodCall,
  callback: ((state: ProductEngineState) => void) | null,
): void {
  callHost<void>('setStateChangeCallback', callback);
}

export function setCoreProductTelemetryCallback(
  callHost: CoreProductHostMethodCall,
  callback: ((telemetry: ProductTelemetrySnapshot) => void) | null,
  publishDiagnostics: ProductDiagnosticsPublisher,
): void {
  callHost<void>('setProductTelemetryCallback', callback ? (telemetry: ProductTelemetrySnapshot) => {
    callback(telemetry);
    publishDiagnostics();
  } : null);
}

export function setCoreProductPerfMonitorEnabled(
  callHost: CoreProductHostMethodCall,
  enabled: boolean,
): void {
  callHost<void>('setPerfMonitorEnabled', enabled);
}

export function setCoreProductVisualTelemetryActive(
  callHost: CoreProductHostMethodCall,
  active: boolean,
): void {
  callHost<void>('setVisualTelemetryActive', active);
}
