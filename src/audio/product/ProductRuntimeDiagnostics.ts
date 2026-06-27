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
  lastResolvedRevision: number;
  lastCommittedRevision: number;
  lastTriggeredRevision: number;
  pendingCommitCount: number;
  lastCommitReason: string | null;
  lastCommitMode: 'event' | 'dirty-diff' | 'source-rebuild' | 'full-snapshot' | 'deferred' | 'noop' | null;
  triggerBeforeCommitCount: number;
  commitThenTriggerCount: number;
  staleTriggerBlockedCount: number;
  lastRejectedLifecycleTransitionReason: string | null;
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
  lastResolvedRevision: 0,
  lastCommittedRevision: 0,
  lastTriggeredRevision: 0,
  pendingCommitCount: 0,
  lastCommitReason: null,
  lastCommitMode: null,
  triggerBeforeCommitCount: 0,
  commitThenTriggerCount: 0,
  staleTriggerBlockedCount: 0,
  lastRejectedLifecycleTransitionReason: null,
};
