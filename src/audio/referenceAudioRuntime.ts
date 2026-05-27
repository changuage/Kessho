export type ReferenceAudioRuntimeModule = {
  audioEngine: Record<string, unknown>;
  ensureAudioEngineLoaded: () => Promise<unknown>;
  preloadAudioEngine: () => Promise<unknown>;
};

export async function loadReferenceAudioRuntime(): Promise<ReferenceAudioRuntimeModule> {
  return import('./runtime') as unknown as Promise<ReferenceAudioRuntimeModule>;
}
