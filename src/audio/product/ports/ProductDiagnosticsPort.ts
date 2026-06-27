import type { ProductRuntimeCapabilityReport } from '../ProductRuntimeCapabilityReport';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';
import type { ProductPerfSnapshot } from '../ProductEngineTypes';

export type ProductEngineDiagnosticsPort = {
  getDiagnostics(): ProductRuntimeDiagnostics;
  getCapabilityReport(): ProductRuntimeCapabilityReport;
  setPerfMonitorEnabled(enabled: boolean): void;
  setPerfUpdateCallback(callback: ((data: ProductPerfSnapshot) => void) | null): void;
  setDiagnosticsCallback(callback: ((diagnostics: ProductRuntimeDiagnostics) => void) | null): void;
};
