export type ReferenceAudioRuntimeModule = {
  audioEngine: Record<string, unknown>;
  ensureAudioEngineLoaded: () => Promise<unknown>;
  preloadAudioEngine: () => Promise<unknown>;
};

export async function loadReferenceAudioRuntime(): Promise<ReferenceAudioRuntimeModule> {
  throw new Error('web-ts reference runtime is unavailable in production builds');
}
