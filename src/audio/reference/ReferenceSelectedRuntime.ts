type ReferenceAudioRuntimeModule = Awaited<ReturnType<typeof import('../referenceAudioRuntime').loadReferenceAudioRuntime>>;
type ReferenceSelectedRuntimeTarget = Record<string, unknown>;

let referenceAudioRuntimePromise: Promise<ReferenceAudioRuntimeModule> | null = null;
let loadedReferenceAudioRuntime: ReferenceAudioRuntimeModule | null = null;

function ensureReferenceAudioRuntime(): Promise<ReferenceAudioRuntimeModule> {
  if (loadedReferenceAudioRuntime) return Promise.resolve(loadedReferenceAudioRuntime);
  if (!referenceAudioRuntimePromise) {
    referenceAudioRuntimePromise = import('../referenceAudioRuntime').then((module) =>
      module.loadReferenceAudioRuntime(),
    ).then((runtime) => {
      loadedReferenceAudioRuntime = runtime;
      return runtime;
    });
  }
  return referenceAudioRuntimePromise;
}

export function getLoadedReferenceSelectedRuntimeTarget(): ReferenceSelectedRuntimeTarget | null {
  return loadedReferenceAudioRuntime?.audioEngine as unknown as ReferenceSelectedRuntimeTarget | null;
}

export function invokeReferenceSelectedRuntimeMethod(
  runtimeMode: string,
  method: string,
  args: readonly unknown[],
): Promise<unknown> {
  return ensureReferenceAudioRuntime().then((runtime) => {
    const target = runtime.audioEngine as unknown as ReferenceSelectedRuntimeTarget;
    const value = target[method];
    if (typeof value !== 'function') {
      throw new Error(`Selected reference runtime ${method} is not implemented by ${runtimeMode}`);
    }
    return (value as (...invokeArgs: unknown[]) => unknown).apply(target, [...args]);
  });
}

export function preloadReferenceSelectedRuntime(): Promise<unknown> {
  return ensureReferenceAudioRuntime().then((runtime) => runtime.preloadAudioEngine());
}
