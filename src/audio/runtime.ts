import type {
  AudioEngine,
  EarthTextureDebugState,
  RecordableTrackSource,
} from './engine';

export type {
  EarthTextureDebugState,
  EngineState,
  ManualSynthNoteOptions,
  ManualSynthSource,
  RecordableTrackSource,
} from './engine';

type EngineMethod = keyof AudioEngine & string;

let loadedAudioEngine: AudioEngine | null = null;
let audioEngineLoadPromise: Promise<AudioEngine> | null = null;

const queuedCalls = new Map<EngineMethod, unknown[]>();
const methodCache = new Map<EngineMethod, (...args: unknown[]) => unknown>();
const EMPTY_EARTH_TEXTURE_DEBUG_STATE: EarthTextureDebugState = {
  waves: null,
  birds: null,
  birds2: null,
  frogs: null,
};

const getterFallbacks: Partial<Record<EngineMethod, (...args: unknown[]) => unknown>> = {
  getAudioContext: () => null,
  getCurrentFilterFreq: () => 1000,
  getCurrentLfoValue: () => 0,
  getCurrentLfo2Value: () => 0,
  getDrumVoiceAnalyser: () => undefined,
  getEarthTextureDebugState: () => EMPTY_EARTH_TEXTURE_DEBUG_STATE,
  getGranularActiveGrainCount: () => 0,
  getGranularBufferWaveform: () => null,
  getGranularVoicePositions: () => [0, 0, 0, 0],
  getGranularWriteHeadPosition: () => 0,
  getLeadMorphedParams: () => null,
  getLimiterNode: () => null,
  getMediaStream: () => null,
  getRecordableBusNodes: () => ({} as Record<string, RecordableTrackSource>),
  getTransportDebugState: () => null,
};

const eagerAsyncMethods = new Set<EngineMethod>([
  'auditionSynthNote',
  'start',
  'triggerDrumVoice',
]);

const eagerVoidMethods = new Set<EngineMethod>([
  'resume',
  'suspend',
]);

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
    if (typeof candidate !== 'function') continue;
    (candidate as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
  }
  queuedCalls.clear();
}

async function loadAudioEngine(): Promise<AudioEngine> {
  if (loadedAudioEngine) return loadedAudioEngine;
  if (!audioEngineLoadPromise) {
    audioEngineLoadPromise = import('./engine').then((module) => {
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
  const cached = methodCache.get(method);
  if (cached) return cached;

  const proxyMethod = (...args: unknown[]) => {
    const engine = loadedAudioEngine;
    if (engine) {
      const candidate = (engine as unknown as Record<string, unknown>)[method];
      if (typeof candidate === 'function') {
        return (candidate as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
      }
      return candidate;
    }

    if (eagerAsyncMethods.has(method)) {
      return loadAudioEngine().then((nextEngine) => {
        const candidate = (nextEngine as unknown as Record<string, unknown>)[method];
        if (typeof candidate !== 'function') return undefined;
        return (candidate as (...invokeArgs: unknown[]) => unknown).apply(nextEngine, args);
      });
    }

    if (eagerVoidMethods.has(method)) {
      void loadAudioEngine().then((nextEngine) => {
        const candidate = (nextEngine as unknown as Record<string, unknown>)[method];
        if (typeof candidate !== 'function') return;
        (candidate as (...invokeArgs: unknown[]) => unknown).apply(nextEngine, args);
      });
      return undefined;
    }

    const fallback = getterFallbacks[method];
    if (fallback) {
      return fallback(...args);
    }

    if (isQueueableMethod(method)) {
      queueCall(method, args);
    }

    return undefined;
  };

  methodCache.set(method, proxyMethod);
  return proxyMethod;
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
      return candidate;
    }

    return createMethodProxy(property as EngineMethod);
  },
}) as AudioEngine;

export type {
  AudioEngine,
};
