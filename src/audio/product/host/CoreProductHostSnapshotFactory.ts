import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { createCoreProductSnapshot, usesLegacyGranularRuntimeSeed, type CoreProductSnapshot } from '../../coreProductSnapshot';
import { withCoreProductClockStartDelayState } from '../../CoreProductHostSequencerClock';

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
