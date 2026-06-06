import type { CoreProductEvent } from '../../coreProductEvents';
import { createCoreProductSnapshot, encodeCoreProductSnapshot, usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from '../../coreProductSnapshot';
import { buildCoreProductSnapshotDiff, type SnapshotReloadReason } from '../../CoreProductRuntimeAdapter';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { withCoreProductClockStartDelayState } from '../../CoreProductHostSequencerClock';

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
  forceFullSnapshot?: boolean;
  forceSequencerClockRejoin?: boolean;
  forwardRngDiffs?: boolean;
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

function loadSnapshotUpdate(options: CoreProductSnapshotUpdateOptions, reason: SnapshotReloadReason): CoreProductFullSnapshotResult {
  return loadCoreProductSnapshot({
    runtime: options.runtime, snapshot: options.nextSnapshot, reason,
    nowMs: options.nowMs, afterLoad: options.afterFullSnapshotLoad,
  });
}

export function applyCoreProductSnapshotUpdate(options: CoreProductSnapshotUpdateOptions): CoreProductSnapshotUpdateResult {
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
