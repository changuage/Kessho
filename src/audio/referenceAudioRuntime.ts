/**
 * REFERENCE / A-B TESTING PATH
 *
 * This runtime loader is required for explicit web-ts, core-smoke, product-test,
 * parity checks, smoke tests, and A/B comparison. Production builds must keep
 * resolving through ProductEnginePort -> WebProductEngine -> coreProductEngineHost.
 *
 * Status: Keep Active — Archive Later
 */

import type { AudioEngine } from './reference/webTs/engine';

export type {
  EarthTextureDebugState,
  ManualSynthNoteOptions,
  ManualSynthSource,
} from './engineSharedTypes';

export type {
  EngineState,
  RecordableTrackSource,
} from './reference/webTs/engine';

export type ReferenceAudioRuntimeMode = 'web-ts' | 'core-smoke';

type EngineMethod = keyof AudioEngine & string;

export type ReferenceAudioRuntimeModule = {
  audioEngine: AudioEngine;
  ensureAudioEngineLoaded: () => Promise<AudioEngine>;
  preloadAudioEngine: () => Promise<AudioEngine>;
};

let loadedAudioEngine: AudioEngine | null = null;
let audioEngineLoadPromise: Promise<AudioEngine> | null = null;

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

const preInitNullableLifecycleGetters: Partial<Record<EngineMethod, () => unknown>> = {
  getAudioContext: () => null,
};

function normalizeEngineMode(mode: string | null): ReferenceAudioRuntimeMode | null {
  switch (mode) {
    case 'web':
    case 'web-ts':
    case 'web-audio':
      return 'web-ts';
    case 'core-smoke':
      return 'core-smoke';
    default:
      return null;
  }
}

function isDevRuntime(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

function getReferenceAudioRuntimeMode(): ReferenceAudioRuntimeMode {
  if (!isDevRuntime()) {
    throw new Error('web-ts reference runtime is unavailable in production builds');
  }
  if (typeof window === 'undefined') return 'web-ts';
  try {
    return normalizeEngineMode(new URLSearchParams(window.location.search).get('engine')) ?? 'web-ts';
  } catch {
    return 'web-ts';
  }
}

function isQueueableMethod(method: EngineMethod): boolean {
  return (
    method.startsWith('set') ||
    method.startsWith('update') ||
    method.startsWith('capture') ||
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
      throw new Error(`AudioEngine.${method} was queued before reference runtime init but is not implemented by ${getReferenceAudioRuntimeMode()}`);
    }
    (candidate as (...invokeArgs: unknown[]) => unknown).apply(engine, args);
  }
  queuedCalls.clear();
}

async function loadAudioEngine(): Promise<AudioEngine> {
  if (loadedAudioEngine) return loadedAudioEngine;
  if (!audioEngineLoadPromise) {
    const engineMode = getReferenceAudioRuntimeMode();
    audioEngineLoadPromise = engineMode === 'core-smoke'
      ? import('./coreEngineHost').then((module) => {
        loadedAudioEngine = module.coreEngineHost as unknown as AudioEngine;
        flushQueuedCalls(loadedAudioEngine);
        return loadedAudioEngine;
      })
      : import('./reference/webTs/engine').then((module) => {
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
          throw new Error(`AudioEngine.${method} is not implemented by ${getReferenceAudioRuntimeMode()}`);
        }
        return (candidate as (...invokeArgs: unknown[]) => unknown).apply(nextEngine, args);
      });
    }

    if (eagerVoidMethods.has(method)) {
      void loadAudioEngine().then((nextEngine) => {
        const candidate = (nextEngine as unknown as Record<string, unknown>)[method];
        if (typeof candidate !== 'function') {
          throw new Error(`AudioEngine.${method} is not implemented by ${getReferenceAudioRuntimeMode()}`);
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

    const nullableLifecycleGetter = preInitNullableLifecycleGetters[method];
    if (nullableLifecycleGetter) {
      void loadAudioEngine();
      return nullableLifecycleGetter();
    }

    throw new Error(`AudioEngine.${method} is unavailable before ${getReferenceAudioRuntimeMode()} has initialized`);
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

export async function loadReferenceAudioRuntime(): Promise<ReferenceAudioRuntimeModule> {
  if (!isDevRuntime()) {
    throw new Error('web-ts reference runtime is unavailable in production builds');
  }
  return {
    audioEngine,
    ensureAudioEngineLoaded,
    preloadAudioEngine,
  };
}

export type {
  AudioEngine,
};
