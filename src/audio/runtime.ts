import type {
  AudioEngine,
} from './engine';

export type {
  EarthTextureDebugState,
  EngineState,
  ManualSynthNoteOptions,
  ManualSynthSource,
  RecordableTrackSource,
} from './engine';

type EngineMethod = keyof AudioEngine & string;
export type AudioEngineRuntimeMode = 'web-ts' | 'core-product' | 'core-smoke';

let loadedAudioEngine: AudioEngine | null = null;
let audioEngineLoadPromise: Promise<AudioEngine> | null = null;
let resolvedRuntimeMode: AudioEngineRuntimeMode | null = null;

const queuedCalls = new Map<EngineMethod, unknown[]>();

const eagerAsyncMethods = new Set<EngineMethod>([
  'auditionSynthNote',
  'start',
  'triggerDrumVoice',
]);

const eagerVoidMethods = new Set<EngineMethod>([
  'resume',
  'startJourneyMorphClock',
  'stopJourneyMorphClock',
  'suspend',
]);

function normalizeEngineMode(mode: string | null): AudioEngineRuntimeMode | null {
  switch (mode) {
    case 'web':
    case 'web-ts':
    case 'web-audio':
      return 'web-ts';
    case 'core-product':
      return 'core-product';
    case 'core-smoke':
      return 'core-smoke';
    default:
      return null;
  }
}

export function getAudioEngineRuntimeMode(): AudioEngineRuntimeMode {
  if (resolvedRuntimeMode) return resolvedRuntimeMode;
  if (typeof window === 'undefined') return 'core-product';
  try {
    const params = new URLSearchParams(window.location.search);
    resolvedRuntimeMode = normalizeEngineMode(params.get('engine')) ?? 'core-product';
    return resolvedRuntimeMode;
  } catch {
    resolvedRuntimeMode = 'core-product';
    return resolvedRuntimeMode;
  }
}

function isQueueableMethod(method: EngineMethod): boolean {
  return (
    method.startsWith('set') ||
    method.startsWith('update') ||
    method.startsWith('reset') ||
    method.startsWith('dice')
  );
}

function queueCall(method: EngineMethod, args: unknown[]): void {
  queuedCalls.set(method, args);
}

function flushQueuedCalls(engine: AudioEngine): void {
  if (queuedCalls.size === 0) return;
  for (const [method, args] of queuedCalls.entries()) {
    const candidate = (engine as unknown as Record<string, unknown>)[method];
    if (typeof candidate !== 'function') {
      throw new Error(`AudioEngine.${method} was queued before runtime init but is not implemented by ${getAudioEngineRuntimeMode()}`);
    }
    (candidate as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
  }
  queuedCalls.clear();
}

async function loadAudioEngine(): Promise<AudioEngine> {
  if (loadedAudioEngine) return loadedAudioEngine;
  if (!audioEngineLoadPromise) {
    const engineMode = getAudioEngineRuntimeMode();
    audioEngineLoadPromise = engineMode === 'core-product'
      ? import('./coreProductEngineHost').then((module) => {
        loadedAudioEngine = module.coreProductEngineHost as unknown as AudioEngine;
        flushQueuedCalls(loadedAudioEngine);
        return loadedAudioEngine;
      })
      : engineMode === 'core-smoke'
      ? import('./coreEngineHost').then((module) => {
        loadedAudioEngine = module.coreEngineHost as unknown as AudioEngine;
        flushQueuedCalls(loadedAudioEngine);
        return loadedAudioEngine;
      })
      : import('./engine').then((module) => {
        loadedAudioEngine = module.audioEngine;
        flushQueuedCalls(loadedAudioEngine);
        return loadedAudioEngine;
      });
  }
  return audioEngineLoadPromise;
}

export function preloadAudioEngine(): Promise<AudioEngine> {
  return loadAudioEngine();
}

export function ensureAudioEngineLoaded(): Promise<AudioEngine> {
  return loadAudioEngine();
}

function createMethodProxy(method: EngineMethod): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const engine = loadedAudioEngine;
    if (engine) {
      const candidate = (engine as unknown as Record<string, unknown>)[method];
      if (typeof candidate === 'function') {
        return (candidate as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
      }
      if (candidate !== undefined) return candidate;
    }

    if (eagerAsyncMethods.has(method)) {
      return loadAudioEngine().then((nextEngine) => {
        const candidate = (nextEngine as unknown as Record<string, unknown>)[method];
        if (typeof candidate !== 'function') {
          throw new Error(`AudioEngine.${method} is not implemented by ${getAudioEngineRuntimeMode()}`);
        }
        return (candidate as (...invokeArgs: unknown[]) => unknown).apply(nextEngine, args);
      });
    }

    if (eagerVoidMethods.has(method)) {
      void loadAudioEngine().then((nextEngine) => {
        const candidate = (nextEngine as unknown as Record<string, unknown>)[method];
        if (typeof candidate !== 'function') {
          throw new Error(`AudioEngine.${method} is not implemented by ${getAudioEngineRuntimeMode()}`);
        }
        (candidate as (...invokeArgs: unknown[]) => unknown).apply(nextEngine, args);
      });
      return undefined;
    }

    if (isQueueableMethod(method)) {
      if (!loadedAudioEngine) {
        queueCall(method, args);
      }
      return undefined;
    }

    throw new Error(`AudioEngine.${method} is unavailable before ${getAudioEngineRuntimeMode()} has initialized`);
  };
}

const proxyTarget = {} as AudioEngine;

export const audioEngine = new Proxy(proxyTarget, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;

    const engine = loadedAudioEngine;
    if (engine) {
      const candidate = (engine as unknown as Record<string, unknown>)[property];
      if (typeof candidate === 'function') {
        return (candidate as (...args: unknown[]) => unknown).bind(engine);
      }
      if (candidate !== undefined) return candidate;

      return createMethodProxy(property as EngineMethod);
    }

    return createMethodProxy(property as EngineMethod);
  },
}) as AudioEngine;

export type {
  AudioEngine,
};
