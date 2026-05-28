import {
  getAudioEngineRuntimeMode,
} from '../product/ProductAudioRuntimeSelection';
import type {
  DynamicsVisualTelemetrySnapshot,
  EarthTextureDebugState,
} from '../engineSharedTypes';
import type { TransportDebugSnapshot } from '../transport';

type ReferenceAudioRuntimeModule = Awaited<ReturnType<typeof import('../referenceAudioRuntime').loadReferenceAudioRuntime>>;
type ReferenceAudioEngineTarget = Record<string, unknown>;
type LeadMorphedParams = { attack: number; decay: number; sustain: number; release: number } | null;
type RecordableTrackSource = { node: AudioNode; outputIndex?: number };
const NO_PREINIT_FALLBACK = Symbol('NO_PREINIT_FALLBACK');

type ReferenceAudioEngineDebugCompat = ReferenceAudioEngineTarget & {
  getAudioContext(): AudioContext | null;
  getMediaStream(): MediaStream | null;
  getLimiterNode(): AudioNode | null;
  getRecordableBusNodes(): Record<string, RecordableTrackSource>;
  getDynamicsAnalyser(key: unknown): AnalyserNode | null;
  getDrumVoiceAnalyser(voice: unknown): AnalyserNode | undefined;
  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot;
  getEarthTextureDebugState(): EarthTextureDebugState;
  getTransportDebugState(): TransportDebugSnapshot | null;
  getLeadMorphedParams(lead: 1 | 2): LeadMorphedParams;
  getGranularBufferWaveform(): Float32Array | null;
  updateParams(state: unknown, metadata?: unknown): void;
  dispose?: () => void;
};

let referenceAudioRuntimePromise: Promise<ReferenceAudioRuntimeModule> | null = null;
let loadedReferenceAudioRuntime: ReferenceAudioRuntimeModule | null = null;
const EMPTY_EARTH_TEXTURE_DEBUG_STATE: EarthTextureDebugState = {
  waves: null,
  birds: null,
  birds2: null,
  frogs: null,
};

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

function assertReferenceRuntime(method: string): void {
  if (getAudioEngineRuntimeMode() === 'core-product') {
    throw new Error(`Reference AudioEngine.${method} is unavailable in core-product`);
  }
}

function getLoadedReferenceAudioEngineTarget(): ReferenceAudioEngineTarget | null {
  return loadedReferenceAudioRuntime?.audioEngine as unknown as ReferenceAudioEngineTarget | null;
}

function invokeReferenceAudioEngineMethod(
  method: string,
  args: readonly unknown[],
  preInitFallback: unknown = NO_PREINIT_FALLBACK,
): unknown {
  assertReferenceRuntime(method);

  const loadedTarget = getLoadedReferenceAudioEngineTarget();
  if (loadedTarget) {
    const value = loadedTarget[method];
    if (typeof value !== 'function') {
      throw new Error(`Reference AudioEngine.${method} is not implemented by ${getAudioEngineRuntimeMode()}`);
    }
    return (value as (...invokeArgs: unknown[]) => unknown).apply(loadedTarget, [...args]);
  }

  if (preInitFallback !== NO_PREINIT_FALLBACK) {
    void ensureReferenceAudioRuntime();
    return preInitFallback;
  }

  return ensureReferenceAudioRuntime().then((runtime) => {
    const target = runtime.audioEngine as unknown as ReferenceAudioEngineTarget;
    const value = target[method];
    if (typeof value !== 'function') {
      throw new Error(`Reference AudioEngine.${method} is not implemented by ${getAudioEngineRuntimeMode()}`);
    }
    return (value as (...invokeArgs: unknown[]) => unknown).apply(target, [...args]);
  });
}

const preInitFallbacks: Partial<Record<keyof ReferenceAudioEngineDebugCompat & string, unknown>> = {
  getAudioContext: null,
  getMediaStream: null,
  getLimiterNode: null,
  getRecordableBusNodes: {},
  getDynamicsAnalyser: null,
  getDrumVoiceAnalyser: undefined,
  getTransportDebugState: null,
  getEarthTextureDebugState: EMPTY_EARTH_TEXTURE_DEBUG_STATE,
  getLeadMorphedParams: null,
  getGranularBufferWaveform: null,
};

export const referenceAudioEngineDebug = new Proxy({} as ReferenceAudioEngineTarget, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (typeof property !== 'string') return undefined;

    const loadedTarget = getLoadedReferenceAudioEngineTarget();
    if (loadedTarget) {
      const value = loadedTarget[property];
      return typeof value === 'function' ? value.bind(loadedTarget) : value;
    }

    return (...args: readonly unknown[]) => invokeReferenceAudioEngineMethod(
      property,
      args,
      Object.prototype.hasOwnProperty.call(preInitFallbacks, property)
        ? preInitFallbacks[property as keyof ReferenceAudioEngineDebugCompat & string]
        : NO_PREINIT_FALLBACK,
    );
  },
}) as unknown as ReferenceAudioEngineDebugCompat;
