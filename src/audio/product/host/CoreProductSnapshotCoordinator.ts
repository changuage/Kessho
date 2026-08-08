import type { CoreProductEvent } from '../../coreProductEvents';
import { encodeCoreProductSnapshot, type CoreProductSnapshot } from '../../coreProductSnapshot';
import { buildCoreProductSnapshotDiff, type SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { CoreProductSequencerClockRejoinMask } from '../../CoreProductHostSequencerClock';
import { fnv1a32Bytes } from '../../../debug/productStateDebugHash';
import type {
  ProductRuntimeSnapshotMetadata,
  ProductSnapshotAppliedReceipt,
} from '../ProductEngineTypes';
import { logEncodedSnapshotForDebug } from './CoreProductSnapshotDebug';

type CoreProductSnapshotRuntime = {
  postEvent(event: CoreProductEvent): void;
  postEvents?(events: readonly CoreProductEvent[]): void;
  loadSnapshot(
    encodedSnapshot: ArrayBuffer,
    metadata?: ProductRuntimeSnapshotMetadata,
  ): Promise<ProductSnapshotAppliedReceipt>;
};

type CoreProductSnapshotLoadOptions = {
  runtime: CoreProductSnapshotRuntime;
  snapshot: CoreProductSnapshot;
  reason: SnapshotReloadReason;
  metadata?: Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'>;
  awaitAudioThreadAck?: boolean;
  nowMs: () => number;
  afterLoad?: () => void;
};

export type CoreProductFullSnapshotResult = {
  mode: 'full-snapshot';
  snapshot: CoreProductSnapshot;
  reason: SnapshotReloadReason;
  cpuMs: number;
  receipt?: ProductSnapshotAppliedReceipt;
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
  forceFullSnapshot?: boolean;
  sequencerClockRejoinMask?: CoreProductSequencerClockRejoinMask;
  forwardRngDiffs?: boolean;
  metadata?: Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'>;
  awaitAudioThreadAck?: boolean;
  nowMs: () => number;
  afterFullSnapshotLoad?: () => void;
};

export async function loadCoreProductSnapshot(options: CoreProductSnapshotLoadOptions): Promise<CoreProductFullSnapshotResult> {
  const startMs = options.nowMs();
  const encodedSnapshot = encodeCoreProductSnapshot(options.snapshot);
  const metadata = options.awaitAudioThreadAck && options.metadata
    ? { ...options.metadata, encodedSnapshotHash: fnv1a32Bytes(encodedSnapshot) }
    : undefined;
  logEncodedSnapshotForDebug(options.snapshot, options.reason, encodedSnapshot, options.metadata);
  const receiptPromise = options.awaitAudioThreadAck
    ? options.runtime.loadSnapshot(encodedSnapshot, metadata)
    : options.runtime.loadSnapshot(encodedSnapshot);
  const receipt = options.awaitAudioThreadAck ? await receiptPromise : undefined;
  if (!options.awaitAudioThreadAck) {
    void receiptPromise.catch((error: unknown) => {
      console.warn('Core Product snapshot application failed after host post:', error);
    });
  }
  options.afterLoad?.();
  return {
    mode: 'full-snapshot',
    snapshot: options.snapshot,
    reason: options.reason,
    cpuMs: Math.max(0, options.nowMs() - startMs),
    ...(receipt ? { receipt } : {}),
  };
}

function loadSnapshotUpdate(options: CoreProductSnapshotUpdateOptions, reason: SnapshotReloadReason): Promise<CoreProductFullSnapshotResult> {
  return loadCoreProductSnapshot({
    runtime: options.runtime, snapshot: options.nextSnapshot, reason,
    metadata: options.metadata,
    awaitAudioThreadAck: options.awaitAudioThreadAck,
    nowMs: options.nowMs, afterLoad: options.afterFullSnapshotLoad,
  });
}

export async function applyCoreProductSnapshotUpdate(options: CoreProductSnapshotUpdateOptions): Promise<CoreProductSnapshotUpdateResult> {
  if (options.forceFullSnapshot) {
    return loadSnapshotUpdate(options, options.pendingReloadReason ?? options.fallbackReloadReason);
  }

  if (options.previousSnapshot) {
    const diff = buildCoreProductSnapshotDiff(options.previousSnapshot, options.nextSnapshot, {
      forwardRngDiffs: options.forwardRngDiffs,
      sequencerClockRejoinMask: options.sequencerClockRejoinMask,
    });
    if (diff.applied) {
      if (diff.events.length > 0) {
        if (options.runtime.postEvents) {
          options.runtime.postEvents(diff.events);
        } else {
          for (const event of diff.events) options.runtime.postEvent(event);
        }
      }
      return { mode: 'dirty-diff', snapshot: options.nextSnapshot };
    }
    return loadSnapshotUpdate(options, options.pendingReloadReason ?? diff.reason ?? options.fallbackReloadReason);
  }

  return loadSnapshotUpdate(options, 'initial-snapshot');
}
