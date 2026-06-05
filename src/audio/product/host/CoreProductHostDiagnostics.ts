import type { RuntimeFallbackClassification } from '../../CoreProductFallbackDiagnostics';
import type { ProductResolvedStateCommitReceipt } from '../ProductEngineTypes';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';

export class CoreProductHostDiagnostics {
  private readonly reportedRuntimeFallbacks = new Set<string>();
  private readonly reportedUnsupportedRangeKeys = new Set<string>();
  private dirtyDiffCount = 0; private fullSnapshotReloadCount = 0;
  private unsupportedControlCount = 0; private unsupportedGetterCount = 0;
  private lastUnsupportedMethod: string | null = null;
  private lastUnsupportedMethodClass: RuntimeFallbackClassification | null = null;
  private runtimeFallbackDiagnosticCount = 0; private audioCriticalFallbackCount = 0;
  private snapshotReloadCpuMs = 0; private lastResolvedRevision = 0;
  private lastSnapshotReloadReason: string | null = 'none';
  private snapshotReloadReasons: string[] = [];
  private lastCommittedRevision = 0; private lastTriggeredRevision = 0;
  private pendingCommitCount = 0; private triggerBeforeCommitCount = 0;
  private commitThenTriggerCount = 0; private staleTriggerBlockedCount = 0;
  private sequencerUiPatchCount = 0; private lastSequencerUiRevision = 0;
  private lastAppliedSequencerUiRevision = 0;
  private lastCommitReason: string | null = null;
  private lastCommitMode: ProductResolvedStateCommitReceipt['mode'] | null = null;
  private lastSequencerUiPatchKind: string | null = null;

  snapshot(): ProductRuntimeDiagnostics {
    return {
      dirtyDiffCount: this.dirtyDiffCount, fullSnapshotReloadCount: this.fullSnapshotReloadCount,
      unsupportedControlCount: this.unsupportedControlCount, unsupportedGetterCount: this.unsupportedGetterCount,
      runtimeFallbackDiagnosticCount: this.runtimeFallbackDiagnosticCount,
      audioCriticalFallbackCount: this.audioCriticalFallbackCount,
      lastUnsupportedMethod: this.lastUnsupportedMethod, lastUnsupportedMethodClass: this.lastUnsupportedMethodClass,
      lastSnapshotReloadReason: this.lastSnapshotReloadReason, snapshotReloadReasons: [...this.snapshotReloadReasons],
      snapshotReloadCpuMs: this.snapshotReloadCpuMs, lastResolvedRevision: this.lastResolvedRevision,
      lastCommittedRevision: this.lastCommittedRevision, lastTriggeredRevision: this.lastTriggeredRevision,
      pendingCommitCount: this.pendingCommitCount, lastCommitReason: this.lastCommitReason,
      lastCommitMode: this.lastCommitMode, triggerBeforeCommitCount: this.triggerBeforeCommitCount,
      commitThenTriggerCount: this.commitThenTriggerCount, staleTriggerBlockedCount: this.staleTriggerBlockedCount,
      sequencerUiPatchCount: this.sequencerUiPatchCount, lastSequencerUiPatchKind: this.lastSequencerUiPatchKind,
      lastSequencerUiRevision: this.lastSequencerUiRevision,
      lastAppliedSequencerUiRevision: this.lastAppliedSequencerUiRevision,
    };
  }

  recordDirtyDiff(): void { this.dirtyDiffCount += 1; }

  recordFullSnapshotReload(reason: string, cpuMs: number): void {
    this.fullSnapshotReloadCount += 1; this.snapshotReloadCpuMs += Math.max(0, cpuMs);
    this.lastSnapshotReloadReason = reason;
    this.snapshotReloadReasons = [...this.snapshotReloadReasons.slice(-15), reason];
  }

  recordPendingCommit(revision: number, reason: string, triggerCritical: boolean): void {
    this.lastResolvedRevision = revision; this.lastCommitReason = reason;
    this.pendingCommitCount += 1;
    if (triggerCritical) this.commitThenTriggerCount += 1;
  }

  recordCommitReceipt(receipt: ProductResolvedStateCommitReceipt): void {
    this.lastCommittedRevision = receipt.revision; this.lastCommitMode = receipt.mode;
    this.pendingCommitCount = Math.max(0, this.pendingCommitCount - 1);
  }

  recordCommitFailure(): void { this.pendingCommitCount = Math.max(0, this.pendingCommitCount - 1); }

  recordProductTrigger(committedRevision: number): void {
    this.lastTriggeredRevision = committedRevision;
    if (committedRevision < this.lastResolvedRevision) this.triggerBeforeCommitCount += 1;
  }

  recordStaleTriggerBlocked(): void { this.staleTriggerBlockedCount += 1; }

  recordSequencerUiPatch(revision: number, kind: string): void {
    this.sequencerUiPatchCount += 1; this.lastSequencerUiPatchKind = kind;
    this.lastSequencerUiRevision = revision; this.lastAppliedSequencerUiRevision = revision;
  }

  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void {
    this.recordUnsupportedMethod(method, classification);
    const dev = (import.meta.env as unknown as { DEV?: boolean }).DEV === true;
    const firstReport = !this.reportedRuntimeFallbacks.has(method);
    if (firstReport) {
      this.reportedRuntimeFallbacks.add(method);
    }
    if (dev || firstReport) {
      console.error(
        `core-product runtime fallback ${classification} for AudioEngine.${method}; add Product Core telemetry/event support before production use.`,
      );
    }
    if (dev) {
      throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`);
    }
  }

  reportUnsupportedRangeKey(key: string): void {
    if (this.reportedUnsupportedRangeKeys.has(key)) return;
    this.reportedUnsupportedRangeKeys.add(key);
    this.recordUnsupportedMethod(`range:${key}`, 'forbidden-production-fallback');
    if ((import.meta.env as unknown as { DEV?: boolean }).DEV || typeof console !== 'undefined') {
      console.error(`core-product runtime fallback forbidden-production-fallback for slider range "${key}".`);
    }
  }

  private recordUnsupportedMethod(method: string, classification: RuntimeFallbackClassification): void {
    this.unsupportedControlCount += 1;
    if (method.startsWith('get')) this.unsupportedGetterCount += 1;
    this.lastUnsupportedMethod = method; this.lastUnsupportedMethodClass = classification;
    this.runtimeFallbackDiagnosticCount += 1;
    if (classification === 'forbidden-production-fallback') this.audioCriticalFallbackCount += 1;
  }
}
