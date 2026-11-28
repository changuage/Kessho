export class CoreProductArrangementBridge {
  private runtimeWalkStatePatch: Record<string, number> = {};

  createState(
    latestSliderState: Record<string, unknown> | null,
    adapterState: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!latestSliderState && Object.keys(adapterState).length === 0) return null;
    const restartState = {
      ...(latestSliderState ?? {}),
      ...adapterState,
    };
    const state = {
      ...restartState,
      ...this.runtimeWalkStatePatch,
    };
    Object.defineProperty(state, '__arrangementRestartState', {
      value: restartState,
      enumerable: false,
      configurable: true,
    });
    return state;
  }

  setRuntimeWalkStatePatch(patch: Record<string, number>): void {
    this.runtimeWalkStatePatch = { ...patch };
  }
}
