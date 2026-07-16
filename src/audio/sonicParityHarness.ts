/**
 * REFERENCE / A-B TESTING PATH
 *
 * This harness is required for web-ts, core-smoke, product-test, parity checks,
 * smoke tests, and A/B comparison. Do not remove or narrow it until Product Core
 * replacement coverage and A/B validation make the reference runtime unnecessary.
 *
 * Status: Keep Active — Archive Later
 */

import { coreProductEngineHost } from './coreProductEngineHost';
import type { ManualSynthNoteOptions } from './engineSharedTypes';
import { applyPadPresetMorphParamsToState } from './padPresets';
import { loadReferenceAudioRuntime } from './referenceAudioRuntime';
import type { SliderState } from '../ui/state';

type CaptureOptions = {
  durationMs?: number;
  settleMs?: number;
  chunkFrames?: number;
  trackId?: string;
  statePatch?: Partial<SliderState>;
  stateEvents?: TimedStateEventOptions[];
  manualNotes?: ManualSynthNoteOptions[];
  manualDrumTriggers?: ManualDrumTriggerOptions[];
  manualTriggerDelayMs?: number;
  manualWarmup?: boolean;
  telemetrySampleIntervalMs?: number;
  captureStems?: boolean;
};

type TimedStateEventOptions = {
  delayMs?: number;
  patch?: Partial<SliderState>;
};

type ManualDrumTriggerOptions = {
  voice: string | number;
  velocity?: number;
  delayMs?: number;
};

type CaptureResult = {
  engine: string;
  sampleRate: number;
  frames: number;
  durationMs: number;
  manual: {
    enabled: boolean;
    noteCount: number;
    drumTriggerCount: number;
    stateEventCount: number;
    triggerDelayMs: number;
    warmedUp: boolean;
    warmupStartContextTime: number | null;
    warmupEndContextTime: number | null;
    recorderStartContextTime: number;
    preTriggerFrames: number;
    triggerStartContextTime: number | null;
    triggerEndContextTime: number | null;
  };
  left: number[];
  right: number[];
  stats: {
    peak: number;
    rms: number;
    mean: number;
    dc: number;
  };
  debug?: unknown;
};

type InstallOptions = {
  getState: () => SliderState;
};

type CaptureChunk = { left: Float32Array; right: Float32Array; frameCount: number };

type TapSession = {
  source: AudioNode;
  sourceOutputIndex?: number;
  tap: AudioWorkletNode;
  sink: GainNode;
  chunks: CaptureChunk[];
  flush: () => Promise<void>;
  destroy: () => void;
};

type AudioEngineRuntimeMode = 'web-ts' | 'core-product' | 'core-smoke';

type RecordableTrackSource = {
  node: AudioNode;
  outputIndex?: number;
};

type ProductGraphCaptureHost = {
  getSonicParityGraphTapId?: (trackId: string) => number | null;
  startSonicParityGraphCapture?: (trackId: string, chunkFrames: number) => number;
  flushSonicParityGraphCapture?: (tapId: number) => Promise<CaptureChunk[]>;
  stopSonicParityGraphCapture?: (tapId: number) => Promise<CaptureChunk[]>;
};

type ModulationRangeHost = {
  setDualRanges?: (ranges: Partial<Record<string, { min: number; max: number }>>) => void;
  setRuntimeWalkRanges?: (ranges: Partial<Record<string, { min: number; max: number }>>) => void;
};

type HarnessEngine = ProductGraphCaptureHost & ModulationRangeHost & {
  start: (state: SliderState) => Promise<void> | void;
  stop: () => void;
  getAudioContext: () => AudioContext | null;
  getLimiterNode?: () => AudioNode | null;
  getRecordableBusNodes?: () => Record<string, RecordableTrackSource>;
  getSonicParityDebugState?: () => unknown;
  requestSonicParityTelemetry?: () => void;
  setVisualTelemetryActive?: (active: boolean) => void;
  resetSonicParityFx?: () => void;
  auditionSynthNote: (note: ManualSynthNoteOptions, externalState?: SliderState) => Promise<void> | void;
  auditionSynthNotes?: (notes: ManualSynthNoteOptions[], externalState?: SliderState) => Promise<void> | void;
  triggerDrumVoice?: (voice: string | number, velocity: number, externalState?: SliderState) => Promise<void> | void;
  updateSnapshotPatch?: (reason: string, patch: Partial<SliderState>) => void;
  updateParams?: (state: SliderState) => void;
  applyParams?: (state: SliderState) => void;
  sourceSliderState?: SliderState;
  sliderState?: SliderState;
  _sliderStateJsonDirty?: boolean;
};

type HarnessRuntime = {
  engine: HarnessEngine;
  mode: AudioEngineRuntimeMode;
};

declare global {
  interface Window {
    __kesshoSonicParity?: {
      capture: (options?: CaptureOptions) => Promise<CaptureResult>;
      teardown: () => void;
    };
  }
}

const RECORDER_TAP_PROCESSOR = 'kessho-recorder-tap';
const DEFAULT_CAPTURE_MS = 3000;
const DEFAULT_SETTLE_MS = 500;
const DEFAULT_MANUAL_TRIGGER_DELAY_MS = 0;
let installed = false;
let recorderWorkletContext: AudioContext | null = null;
let activeSession: TapSession | null = null;
let loadedHarnessRuntime: HarnessRuntime | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

function isDevRuntime(): boolean {
  return Boolean((import.meta.env as unknown as { DEV?: boolean }).DEV);
}

function getEngineName(): AudioEngineRuntimeMode {
  if (!isDevRuntime()) return 'core-product';
  try {
    return normalizeEngineMode(new URLSearchParams(window.location.search).get('engine')) ?? 'core-product';
  } catch {
    return 'core-product';
  }
}

async function loadHarnessRuntime(): Promise<HarnessRuntime> {
  if (loadedHarnessRuntime) return loadedHarnessRuntime;
  const mode = getEngineName();
  if (mode === 'core-product') {
    loadedHarnessRuntime = {
      engine: coreProductEngineHost as unknown as HarnessEngine,
      mode,
    };
    return loadedHarnessRuntime;
  }
  if (!isDevRuntime()) {
    throw new Error(`Sonic parity reference runtime "${mode}" is unavailable in production builds.`);
  }
  const runtime = await loadReferenceAudioRuntime();
  loadedHarnessRuntime = {
    engine: await runtime.ensureAudioEngineLoaded() as unknown as HarnessEngine,
    mode,
  };
  return loadedHarnessRuntime;
}

function normalizeTrackId(trackId: string): string {
  return trackId.startsWith('graph:') ? trackId.slice('graph:'.length) : trackId;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const TELEMETRY_PEAK_FIELDS = [
  'activeVoices',
  'activeAssets',
  'masterOutputPeak',
  'masterOutputRms',
  'workletMasterStemPeak',
  'workletPadStemPeak',
  'workletLeadStemPeak',
  'workletFxStemPeak',
] as const;

function mergeTelemetryPeaks(debug: unknown, peaks: Record<string, number>): unknown {
  const debugRecord = objectRecord(debug);
  if (!debugRecord || Object.keys(peaks).length === 0) return debug;
  const telemetry = objectRecord(debugRecord.latestTelemetry) ?? {};
  return {
    ...debugRecord,
    latestTelemetry: {
      ...telemetry,
      ...peaks,
    },
  };
}

async function ensureRecorderTapWorklet(ctx: AudioContext): Promise<void> {
  if (recorderWorkletContext === ctx) return;
  const workletUrl = new URL(
    `${import.meta.env.BASE_URL}worklets/recorder-tap.worklet.js`,
    window.location.href,
  ).toString();
  await ctx.audioWorklet.addModule(workletUrl);
  recorderWorkletContext = ctx;
}

function createTapSession(
  ctx: AudioContext,
  source: AudioNode,
  chunkFrames: number,
  trackId: string,
  sourceOutputIndex?: number,
): TapSession {
  const chunks: TapSession['chunks'] = [];
  let resolveFlush: (() => void) | null = null;

  const tap = new AudioWorkletNode(ctx, RECORDER_TAP_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    processorOptions: {
      trackId,
      chunkFrames,
    },
  });
  const sink = ctx.createGain();
  sink.gain.value = 0;

  const onMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as {
      type?: string;
      frameCount?: number;
      left?: Float32Array;
      right?: Float32Array;
    };
    if (message.type === 'chunk' && message.left && message.right && typeof message.frameCount === 'number') {
      chunks.push({
        left: message.left,
        right: message.right,
        frameCount: message.frameCount,
      });
      return;
    }
    if (message.type === 'flushed') {
      resolveFlush?.();
      resolveFlush = null;
    }
  };

  tap.port.addEventListener('message', onMessage as EventListener);
  tap.port.start?.();
  if (typeof sourceOutputIndex === 'number') {
    source.connect(tap, sourceOutputIndex, 0);
  } else {
    source.connect(tap);
  }
  tap.connect(sink);
  sink.connect(ctx.destination);

  return {
    source,
    sourceOutputIndex,
    tap,
    sink,
    chunks,
    flush: () => new Promise<void>((resolve) => {
      resolveFlush = resolve;
      tap.port.postMessage({ type: 'flush' });
    }),
    destroy: () => {
      try {
        if (typeof sourceOutputIndex === 'number') {
          source.disconnect(tap, sourceOutputIndex, 0);
        } else {
          source.disconnect(tap);
        }
      } catch { /* noop */ }
      tap.port.removeEventListener('message', onMessage as EventListener);
      try {
        tap.port.postMessage({ type: 'destroy' });
      } catch { /* noop */ }
      try {
        tap.disconnect();
      } catch { /* noop */ }
      try {
        sink.disconnect();
      } catch { /* noop */ }
    },
  };
}

function flattenChunks(chunks: CaptureChunk[]): { left: Float32Array; right: Float32Array; frames: number } {
  const frames = chunks.reduce((sum, chunk) => sum + chunk.frameCount, 0);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let offset = 0;
  for (const chunk of chunks) {
    left.set(chunk.left.subarray(0, chunk.frameCount), offset);
    right.set(chunk.right.subarray(0, chunk.frameCount), offset);
    offset += chunk.frameCount;
  }
  return { left, right, frames };
}

function countChunkFrames(chunks: CaptureChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.frameCount, 0);
}

function getProductGraphCaptureHost(engine: unknown, trackId: string): ProductGraphCaptureHost | null {
  const host = engine as ProductGraphCaptureHost;
  if (
    typeof host.getSonicParityGraphTapId !== 'function' ||
    typeof host.startSonicParityGraphCapture !== 'function' ||
    typeof host.flushSonicParityGraphCapture !== 'function' ||
    typeof host.stopSonicParityGraphCapture !== 'function'
  ) {
    return null;
  }
  return host.getSonicParityGraphTapId(trackId) === null ? null : host;
}

function isolateModulationRanges(engine: unknown): void {
  const host = engine as ModulationRangeHost;
  host.setDualRanges?.({});
  host.setRuntimeWalkRanges?.({});
}

function normalizeCaptureLength(
  capture: { left: Float32Array; right: Float32Array; frames: number },
  expectedFrames: number,
): { left: Float32Array; right: Float32Array; frames: number } {
  if (capture.frames === expectedFrames) return capture;

  const left = new Float32Array(expectedFrames);
  const right = new Float32Array(expectedFrames);
  const copyFrames = Math.min(capture.frames, expectedFrames);
  left.set(capture.left.subarray(0, copyFrames));
  right.set(capture.right.subarray(0, copyFrames));
  return { left, right, frames: expectedFrames };
}

function calculateStats(left: Float32Array, right: Float32Array): CaptureResult['stats'] {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  const sampleCount = (left.length + right.length) || 1;
  for (let index = 0; index < left.length; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
    sumSquares += leftSample * leftSample + rightSample * rightSample;
    sum += leftSample + rightSample;
  }
  const mean = sum / sampleCount;
  return {
    peak,
    rms: Math.sqrt(sumSquares / sampleCount),
    mean,
    dc: Math.abs(mean),
  };
}

function stopActiveSession(): void {
  activeSession?.destroy();
  activeSession = null;
}

function createCaptureState(
  currentState: SliderState,
  statePatch: Partial<SliderState> | undefined,
  manualMode: boolean,
): SliderState {
  const patchedState = applyPadPresetMorphParamsToState({
    ...currentState,
    ...(statePatch ?? {}),
  }, statePatch ?? {});

  if (!manualMode) return patchedState;

  return {
    ...patchedState,
    synthChordSequencerEnabled: false,
  };
}

function createWarmupNote(note: ManualSynthNoteOptions): ManualSynthNoteOptions {
  return {
    ...note,
    velocity: Math.min(note.velocity ?? 0.05, 0.05),
    durationMs: Math.min(note.durationMs ?? 80, 80),
  };
}

function patchRequiresPadPresetResolution(patch: Partial<SliderState>): boolean {
  return Object.prototype.hasOwnProperty.call(patch, 'padPresetA') ||
    Object.prototype.hasOwnProperty.call(patch, 'padPresetB') ||
    Object.prototype.hasOwnProperty.call(patch, 'padMorph') ||
    Object.prototype.hasOwnProperty.call(patch, 'pad2PresetC') ||
    Object.prototype.hasOwnProperty.call(patch, 'pad2PresetD') ||
    Object.prototype.hasOwnProperty.call(patch, 'pad2Morph');
}

function createResolvedStateEventPatch(
  previousState: SliderState,
  patch: Partial<SliderState>,
  manualMode: boolean,
): { state: SliderState; patch: Partial<SliderState> } {
  if (!patchRequiresPadPresetResolution(patch)) {
    return {
      state: {
        ...previousState,
        ...patch,
        ...(manualMode ? { synthChordSequencerEnabled: false } : {}),
      },
      patch,
    };
  }
  const state = createCaptureState(previousState, patch, manualMode);
  const resolvedPatch: Partial<SliderState> = {};
  const resolvedPatchRecord = resolvedPatch as Record<string, unknown>;
  const previousRecord = previousState as unknown as Record<string, unknown>;
  const nextRecord = state as unknown as Record<string, unknown>;
  for (const key of Object.keys(nextRecord)) {
    if (!Object.is(nextRecord[key], previousRecord[key])) {
      resolvedPatchRecord[key] = nextRecord[key];
    }
  }
  return { state, patch: resolvedPatch };
}

export function installSonicParityHarness({ getState }: InstallOptions): void {
  if (installed) return;
  installed = true;

  window.__kesshoSonicParity = {
    async capture(options = {}) {
      stopActiveSession();

      const durationMs = Math.max(100, options.durationMs ?? DEFAULT_CAPTURE_MS);
      const settleMs = Math.max(0, options.settleMs ?? DEFAULT_SETTLE_MS);
      const chunkFrames = Math.max(512, Math.round(options.chunkFrames ?? 4096));
      const trackId = typeof options.trackId === 'string' && options.trackId.trim()
        ? normalizeTrackId(options.trackId.trim())
        : 'mix';
      const stateEvents = Array.isArray(options.stateEvents)
        ? options.stateEvents
            .filter((event) => event && typeof event === 'object' && event.patch && typeof event.patch === 'object')
            .map((event) => ({
              delayMs: Math.max(0, Number(event.delayMs ?? 0)),
              patch: event.patch ?? {},
            }))
        : [];
      const manualNotes = Array.isArray(options.manualNotes) ? options.manualNotes : [];
      const manualDrumTriggers = Array.isArray(options.manualDrumTriggers) ? options.manualDrumTriggers : [];
      const manualTriggerDelayMs = Math.max(0, options.manualTriggerDelayMs ?? DEFAULT_MANUAL_TRIGGER_DELAY_MS);
      const manualMode = manualNotes.length > 0 || manualDrumTriggers.length > 0;
      const manualWarmup = manualMode && options.manualWarmup === true;
      const runtime = await loadHarnessRuntime();
      const { engine } = runtime;
      isolateModulationRanges(engine);
      const state = createCaptureState(getState(), options.statePatch, manualMode);
      const getDebugState = typeof engine.getSonicParityDebugState === 'function'
        ? () => engine.getSonicParityDebugState!()
        : null;
      const requestTelemetry = typeof engine.requestSonicParityTelemetry === 'function'
        ? () => engine.requestSonicParityTelemetry!()
        : null;
      const telemetryPeaks: Record<string, number> = {};
      let latestDebugState: unknown;
      const collectTelemetryPeaks = (): void => {
        if (!getDebugState) return;
        requestTelemetry?.();
        latestDebugState = getDebugState();
        const telemetry = objectRecord(objectRecord(latestDebugState)?.latestTelemetry);
        if (!telemetry) return;
        for (const field of TELEMETRY_PEAK_FIELDS) {
          const value = finiteNumber(telemetry[field]);
          if (value === null) continue;
          telemetryPeaks[field] = Math.max(telemetryPeaks[field] ?? 0, value);
        }
      };

      await engine.start(state);
      if (options.captureStems) engine.setVisualTelemetryActive?.(true);
      const productGraphCaptureHost = getProductGraphCaptureHost(engine, trackId);
      const engineContext = engine.getAudioContext();
      if (!engineContext) {
        throw new Error(`Sonic parity capture could not find an AudioContext and "${trackId}" source node.`);
      }
      if (engineContext.state !== 'running') {
        await engineContext.resume();
      }
      const recordableSource = trackId === 'mix' || productGraphCaptureHost
        ? null
        : (engine.getRecordableBusNodes?.() ?? {})[trackId];
      const captureSource = productGraphCaptureHost ? null : trackId === 'mix'
        ? engine.getLimiterNode?.() ?? null
        : recordableSource?.node ?? null;
      if (!captureSource && !productGraphCaptureHost) {
        throw new Error(`Sonic parity capture could not find an AudioContext and "${trackId}" source node.`);
      }
      const ctx = productGraphCaptureHost ? engineContext : captureSource!.context;
      if (!(ctx instanceof AudioContext)) {
        throw new Error(`Sonic parity capture source "${trackId}" is not attached to a live AudioContext.`);
      }
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      if (!productGraphCaptureHost) {
        await ensureRecorderTapWorklet(ctx);
      }
      let warmupStartContextTime: number | null = null;
      let warmupEndContextTime: number | null = null;
      if (manualWarmup) {
        warmupStartContextTime = ctx.currentTime;
        for (const note of manualNotes) {
          await engine.auditionSynthNote(createWarmupNote(note), state);
        }
        warmupEndContextTime = ctx.currentTime;
      }
      await delay(settleMs);

      const session = productGraphCaptureHost
        ? null
        : createTapSession(
          ctx,
          captureSource!,
          chunkFrames,
          trackId,
          trackId === 'mix' ? undefined : recordableSource?.outputIndex,
        );
      activeSession = session;
      let productGraphTapId: number | null = null;
      let productGraphCaptureStopped = false;
      if (productGraphCaptureHost) {
        productGraphTapId = productGraphCaptureHost.startSonicParityGraphCapture!(trackId, chunkFrames);
      }
      const recorderStartContextTime = ctx.currentTime;
      const telemetrySampleIntervalMs = Math.max(50, Math.round(options.telemetrySampleIntervalMs ?? 100));
      collectTelemetryPeaks();
      const telemetrySampler = getDebugState
        ? window.setInterval(collectTelemetryPeaks, telemetrySampleIntervalMs)
        : null;
      let preTriggerFrames = 0;
      let triggerStartContextTime: number | null = null;
      let triggerEndContextTime: number | null = null;
      let capturedChunks: CaptureChunk[] = [];
      let eventState = state;
      const stateEventTimers: number[] = [];
      const scheduleStateEvents = (): void => {
	        const paramTarget = engine as unknown as {
	          updateSnapshotPatch?: (reason: string, patch: Partial<SliderState>) => void;
	          updateParams?: (state: SliderState) => void;
	          applyParams?: (state: SliderState) => void;
	          sourceSliderState?: SliderState;
          sliderState?: SliderState;
          _sliderStateJsonDirty?: boolean;
        };
        for (const event of stateEvents) {
          const timer = window.setTimeout(() => {
            const resolvedEvent = createResolvedStateEventPatch(eventState, event.patch, manualMode);
            eventState = resolvedEvent.state;
	            if (manualMode && runtime.mode === 'web-ts' && typeof paramTarget.applyParams === 'function') {
	              paramTarget.sourceSliderState = eventState;
	              paramTarget.sliderState = eventState;
	              paramTarget._sliderStateJsonDirty = true;
	              paramTarget.applyParams.call(engine, eventState);
	              return;
	            }
	            if (runtime.mode === 'core-product' && typeof paramTarget.updateSnapshotPatch === 'function') {
	              paramTarget.updateSnapshotPatch.call(engine, 'fx-control-change', resolvedEvent.patch);
	              return;
	            }
	            if (typeof paramTarget.updateParams === 'function') {
	              paramTarget.updateParams.call(engine, eventState);
	            }
          }, event.delayMs);
          stateEventTimers.push(timer);
        }
      };
      try {
        if (manualMode) {
          if (typeof engine.resetSonicParityFx === 'function') {
            engine.resetSonicParityFx();
            await delay(50);
          }
          if (manualTriggerDelayMs > 0) {
            await delay(manualTriggerDelayMs);
          }
          if (productGraphCaptureHost && productGraphTapId !== null) {
            const flushedChunks = await productGraphCaptureHost.flushSonicParityGraphCapture!(productGraphTapId);
            preTriggerFrames = countChunkFrames(flushedChunks);
          } else if (session) {
            await session.flush();
            preTriggerFrames = countChunkFrames(session.chunks);
            session.chunks.length = 0;
          }
          triggerStartContextTime = ctx.currentTime;
          if (manualNotes.length > 0) {
            if (typeof engine.auditionSynthNotes !== 'function') {
              throw new Error(`Sonic parity runtime "${runtime.mode}" does not implement auditionSynthNotes.`);
            }
            await engine.auditionSynthNotes(manualNotes, state);
          }
          for (const trigger of manualDrumTriggers) {
            const delayMs = Math.max(0, trigger.delayMs ?? 0);
            if (delayMs > 0) {
              await delay(delayMs);
            }
            if (typeof engine.triggerDrumVoice !== 'function') {
              throw new Error(`Sonic parity runtime "${runtime.mode}" does not implement triggerDrumVoice.`);
            }
            await engine.triggerDrumVoice(
              trigger.voice,
              Math.max(0.000001, Math.min(1, trigger.velocity ?? 0.8)),
              state,
            );
          }
          triggerEndContextTime = ctx.currentTime;
        }
        scheduleStateEvents();
        await delay(durationMs);
        if (productGraphCaptureHost && productGraphTapId !== null) {
          capturedChunks = await productGraphCaptureHost.stopSonicParityGraphCapture!(productGraphTapId);
          productGraphCaptureStopped = true;
        } else if (session) {
          await session.flush();
          capturedChunks = session.chunks;
        }
        collectTelemetryPeaks();
      } finally {
        if (options.captureStems) engine.setVisualTelemetryActive?.(false);
        if (telemetrySampler !== null) {
          window.clearInterval(telemetrySampler);
        }
        for (const timer of stateEventTimers) {
          window.clearTimeout(timer);
        }
        if (productGraphCaptureHost && productGraphTapId !== null && !productGraphCaptureStopped) {
          try {
            await productGraphCaptureHost.stopSonicParityGraphCapture!(productGraphTapId);
          } catch { /* noop */ }
        }
      }

      const expectedFrames = Math.max(1, Math.round((durationMs / 1000) * ctx.sampleRate));
      const { left, right, frames } = normalizeCaptureLength(
        flattenChunks(capturedChunks),
        expectedFrames,
      );
      const stats = calculateStats(left, right);
      stopActiveSession();
      const debugState = mergeTelemetryPeaks(
        getDebugState ? getDebugState() : latestDebugState,
        telemetryPeaks,
      );

      return {
        engine: getEngineName(),
        sampleRate: ctx.sampleRate,
        frames,
        durationMs,
        manual: {
          enabled: manualMode,
          noteCount: manualNotes.length,
          drumTriggerCount: manualDrumTriggers.length,
          stateEventCount: stateEvents.length,
          triggerDelayMs: manualTriggerDelayMs,
          warmedUp: manualWarmup,
          warmupStartContextTime,
          warmupEndContextTime,
          recorderStartContextTime,
          preTriggerFrames,
          triggerStartContextTime,
          triggerEndContextTime,
        },
        left: Array.from(left),
        right: Array.from(right),
        stats,
        debug: debugState,
      };
    },
    teardown() {
      stopActiveSession();
      try {
        loadedHarnessRuntime?.engine.stop();
      } catch { /* noop */ }
    },
  };
}
