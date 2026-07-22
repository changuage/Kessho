export type ReferenceAudioRuntimeModule = {
  /**
   * Kept only for the debug compatibility import shape. Production code must
   * never call through this object because the Web TS runtime is not bundled.
   */
  audioEngine: object;
  ensureAudioEngineLoaded: () => Promise<never>;
  preloadAudioEngine: () => Promise<never>;
};

const unavailableReferenceRuntimeError = (): Error => (
  new Error('web-ts reference runtime is unavailable in production builds')
);

export const audioEngine = Object.freeze({});

export async function loadReferenceAudioRuntime(): Promise<ReferenceAudioRuntimeModule> {
  throw unavailableReferenceRuntimeError();
}

export async function ensureAudioEngineLoaded(): Promise<never> {
  throw unavailableReferenceRuntimeError();
}

export async function preloadAudioEngine(): Promise<never> {
  throw unavailableReferenceRuntimeError();
}
