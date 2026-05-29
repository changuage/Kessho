import type { RuntimeFallbackClassification } from '../CoreProductFallbackDiagnostics';

export type ProductRuntimeDiagnostics = {
  dirtyDiffCount: number;
  fullSnapshotReloadCount: number;
  unsupportedControlCount: number;
  unsupportedGetterCount: number;
  runtimeFallbackDiagnosticCount: number;
  audioCriticalFallbackCount: number;
  lastUnsupportedMethod: string | null;
  lastUnsupportedMethodClass: RuntimeFallbackClassification | null;
  lastSnapshotReloadReason: string | null;
  snapshotReloadReasons: readonly string[];
  snapshotReloadCpuMs: number;
};

export const EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS: ProductRuntimeDiagnostics = {
  dirtyDiffCount: 0,
  fullSnapshotReloadCount: 0,
  unsupportedControlCount: 0,
  unsupportedGetterCount: 0,
  runtimeFallbackDiagnosticCount: 0,
  audioCriticalFallbackCount: 0,
  lastUnsupportedMethod: null,
  lastUnsupportedMethodClass: null,
  lastSnapshotReloadReason: null,
  snapshotReloadReasons: [],
  snapshotReloadCpuMs: 0,
};
