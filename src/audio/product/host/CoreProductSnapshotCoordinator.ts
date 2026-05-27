import type { CoreProductEvent } from '../../coreProductEvents';
import { encodeCoreProductSnapshot, type CoreProductSnapshot } from '../../coreProductSnapshot';
import { buildCoreProductSnapshotDiff, type SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';

type CoreProductSnapshotRuntime = {
  postEvent(event: CoreProductEvent): void;
  loadSnapshot(encodedSnapshot: ArrayBuffer): void;
};

type CoreProductSnapshotLoadOptions = {
  runtime: CoreProductSnapshotRuntime;
  snapshot: CoreProductSnapshot;
  reason: SnapshotReloadReason;
  nowMs: () => number;
  afterLoad?: () => void;
};

export type CoreProductFullSnapshotResult = {
  mode: 'full-snapshot';
  snapshot: CoreProductSnapshot;
  reason: SnapshotReloadReason;
  cpuMs: number;
};

export type CoreProductSnapshotUpdateResult =
  | { mode: 'dirty-diff'; snapshot: CoreProductSnapshot }
  | CoreProductFullSnapshotResult;

export type CoreProductSnapshotUpdateOptions = {
  runtime: CoreProductSnapshotRuntime;
  previousSnapshot: CoreProductSnapshot | null;
  nextSnapshot: CoreProductSnapshot;
  fallbackReloadReason: SnapshotReloadReason;
  pendingReloadReason: SnapshotReloadReason | null;
  forceSequencerClockRejoin?: boolean;
  forwardRngDiffs?: boolean;
  nowMs: () => number;
  afterFullSnapshotLoad?: () => void;
};

export function loadCoreProductSnapshot(options: CoreProductSnapshotLoadOptions): CoreProductFullSnapshotResult {
  const startMs = options.nowMs();
  options.runtime.loadSnapshot(encodeCoreProductSnapshot(options.snapshot));
  options.afterLoad?.();
  return {
    mode: 'full-snapshot',
    snapshot: options.snapshot,
    reason: options.reason,
    cpuMs: Math.max(0, options.nowMs() - startMs),
  };
}

export function applyCoreProductSnapshotUpdate(options: CoreProductSnapshotUpdateOptions): CoreProductSnapshotUpdateResult {
  if (options.previousSnapshot) {
    const diff = buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot, {
      forwardRngDiffs: options.forwardRngDiffs,
      forceSequencerClockRejoin: options.forceSequencerClockRejoin,
    });
    if (diff.applied) {
      for (const event of diff.events) {
        options.runtime.postEvent(event);
      }
      return { mode: 'dirty-diff', snapshot: options.nextSnapshot };
    }
    return loadCoreProductSnapshot({
      runtime: options.runtime,
      snapshot: options.nextSnapshot,
      reason: options.pendingReloadReason ?? diff.reason ?? options.fallbackReloadReason,
      nowMs: options.nowMs,
      afterLoad: options.afterFullSnapshotLoad,
    });
  }

  return loadCoreProductSnapshot({
    runtime: options.runtime,
    snapshot: options.nextSnapshot,
    reason: 'initial-snapshot',
    nowMs: options.nowMs,
    afterLoad: options.afterFullSnapshotLoad,
  });
}
