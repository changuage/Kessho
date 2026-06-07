import type { CoreProductEvent } from '../../coreProductEvents';
import { CORE_PRODUCT_SOURCE_IDS } from '../../coreProductEvents';
import { createCoreProductSnapshot, encodeCoreProductSnapshot, usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from '../../coreProductSnapshot';
import { buildCoreProductSnapshotDiff, type SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { withCoreProductClockStartDelayState } from '../../CoreProductHostSequencerClock';
import { fnv1a32Bytes, hashJson } from '../../../debug/productStateDebugHash';
import { logProductStateDebug } from '../../../debug/productStateDebug';
import type {
  ProductRuntimeSnapshotMetadata,
  ProductSnapshotAppliedReceipt,
} from '../ProductEngineTypes';

type CoreProductSnapshotRuntime = {
  postEvent(event: CoreProductEvent): void;
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
  forceSequencerClockRejoin?: boolean;
  forwardRngDiffs?: boolean;
  metadata?: Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'>;
  awaitAudioThreadAck?: boolean;
  nowMs: () => number;
  afterFullSnapshotLoad?: () => void;
};

export type CoreProductHostSnapshotState = {
  latestSliderState: Record<string, unknown> | null;
  adapterState: Record<string, unknown>;
  journeyMorphClockRunning: boolean;
  latestTelemetry: CoreProductTelemetrySnapshot | null;
  running: boolean;
};

type ProductSourceSnapshot = CoreProductSnapshot['sources'][number];

export function createCoreProductHostSnapshot(
  state: CoreProductHostSnapshotState,
  includeClockStartDelay = false,
): CoreProductSnapshot {
  const hasAdapterState = Object.keys(state.adapterState).length > 0;
  const baseSnapshotState = state.latestSliderState
    ? { ...state.latestSliderState, ...state.adapterState, journeyEnabled: state.journeyMorphClockRunning }
    : hasAdapterState
    ? { ...state.adapterState, journeyEnabled: state.journeyMorphClockRunning }
    : state.journeyMorphClockRunning
    ? { journeyEnabled: true }
    : undefined;
  const telemetryRngState = !usesLegacyGranularRuntimeSeed(baseSnapshotState) && (state.latestTelemetry?.rngSeed || state.latestTelemetry?.rngState)
    ? {
      rngSeed: state.latestTelemetry.rngSeed,
      rngState: state.latestTelemetry.rngState,
    }
    : {};
  const snapshotState = baseSnapshotState
    ? { ...telemetryRngState, ...baseSnapshotState }
    : Object.keys(telemetryRngState).length > 0
    ? telemetryRngState
    : undefined;
  const snapshot = createCoreProductSnapshot(includeClockStartDelay ? withCoreProductClockStartDelayState(snapshotState) : snapshotState);
  snapshot.transport.running = state.running;
  return snapshot;
}

function sourceForDebug(
  snapshot: CoreProductSnapshot,
  sourceId: number,
): ProductSourceSnapshot | undefined {
  return snapshot.sources.find((source) => source.sourceId === sourceId);
}

function summarizeSourceForDebug(source: ProductSourceSnapshot | undefined): Record<string, unknown> | null {
  if (!source) return null;

  const padOverrideBlock = {
    padOverrideCount: source.padOverrideCount,
    padOverrideIndices: source.padOverrideIndices,
    padOverrideValues: source.padOverrideValues,
  };
  const leadOverrideBlock = {
    leadOverrideCount: source.leadOverrideCount,
    leadOverrideIndices: source.leadOverrideIndices,
    leadOverrideValues: source.leadOverrideValues,
  };

  return {
    sourceId: source.sourceId,
    enabled: source.enabled,
    presetId: source.presetId,
    sourcePresetAId: source.sourcePresetAId,
    sourcePresetBId: source.sourcePresetBId,
    morph: source.morph,
    postLpfHz: source.postLpfHz,
    attackSeconds: source.attackSeconds,
    decaySeconds: source.decaySeconds,
    sustain: source.sustain,
    holdSeconds: source.holdSeconds,
    releaseSeconds: source.releaseSeconds,
    padOverrideHash: hashJson(padOverrideBlock),
    leadOverrideHash: hashJson(leadOverrideBlock),
    sourceSnapshotHash: hashJson(source),
  };
}

function logEncodedSnapshotForDebug(
  snapshot: CoreProductSnapshot,
  reason: SnapshotReloadReason,
  encodedSnapshot: ArrayBuffer,
  metadata?: Omit<ProductRuntimeSnapshotMetadata, 'encodedSnapshotHash'>,
): void {
  logProductStateDebug({
    stage: 'encoded-product-snapshot',
    reason,
    revision: metadata?.revision ?? null,
    encodedSnapshotHash: fnv1a32Bytes(encodedSnapshot),
    encodedByteLength: encodedSnapshot.byteLength,
    pad1: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.pad1)),
    pad2: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.pad2)),
    lead1: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.lead1)),
    lead2: summarizeSourceForDebug(sourceForDebug(snapshot, CORE_PRODUCT_SOURCE_IDS.lead2)),
  });
}

export async function loadCoreProductSnapshot(options: CoreProductSnapshotLoadOptions): Promise<CoreProductFullSnapshotResult> {
  const startMs = options.nowMs();
  const encodedSnapshot = encodeCoreProductSnapshot(options.snapshot);
  const encodedSnapshotHash = fnv1a32Bytes(encodedSnapshot);
  const metadata = options.metadata
    ? { ...options.metadata, encodedSnapshotHash }
    : undefined;
  logEncodedSnapshotForDebug(options.snapshot, options.reason, encodedSnapshot, options.metadata);
  const receiptPromise = options.runtime.loadSnapshot(encodedSnapshot, metadata);
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
      forceSequencerClockRejoin: options.forceSequencerClockRejoin,
    });
    if (diff.applied) {
      for (const event of diff.events) {
        options.runtime.postEvent(event);
      }
      return { mode: 'dirty-diff', snapshot: options.nextSnapshot };
    }
    return loadSnapshotUpdate(options, options.pendingReloadReason ?? diff.reason ?? options.fallbackReloadReason);
  }

  return loadSnapshotUpdate(options, 'initial-snapshot');
}
