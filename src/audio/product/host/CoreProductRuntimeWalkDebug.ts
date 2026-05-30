export type CoreProductRuntimeWalkDebugState = {
  rangeSetCallCount: number;
  rangeSetKeyCount: number;
  postedEventCount: number;
  activeControlNameCount: number;
  telemetryUpdateCount: number;
  telemetryValueCount: number;
  publishedPositionCount: number;
  lastRangeKeys: string[];
  lastPositionKeys: string[];
};

export function createCoreProductRuntimeWalkDebugState(): CoreProductRuntimeWalkDebugState {
  return {
    rangeSetCallCount: 0,
    rangeSetKeyCount: 0,
    postedEventCount: 0,
    activeControlNameCount: 0,
    telemetryUpdateCount: 0,
    telemetryValueCount: 0,
    publishedPositionCount: 0,
    lastRangeKeys: [],
    lastPositionKeys: [],
  };
}

export function snapshotCoreProductRuntimeWalkDebugState(
  state: CoreProductRuntimeWalkDebugState,
): CoreProductRuntimeWalkDebugState {
  return {
    ...state,
    lastRangeKeys: [...state.lastRangeKeys],
    lastPositionKeys: [...state.lastPositionKeys],
  };
}
