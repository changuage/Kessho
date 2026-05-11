import {
  audioEngine,
  ensureAudioEngineLoaded,
  type ManualSynthNoteOptions,
  type RecordableTrackSource,
} from './runtime';
import type { SliderState } from '../ui/state';

type CaptureOptions = {
  durationMs?: number;
  settleMs?: number;
  chunkFrames?: number;
  trackId?: string;
  statePatch?: Partial<SliderState>;
  manualNotes?: ManualSynthNoteOptions[];
  manualTriggerDelayMs?: number;
  manualWarmup?: boolean;
};

type CaptureResult = {
  engine: string;
  sampleRate: number;
  frames: number;
  durationMs: number;
  manual: {
    enabled: boolean;
    noteCount: number;
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

type TapSession = {
  source: AudioNode;
  sourceOutputIndex?: number;
  tap: AudioWorkletNode;
  sink: GainNode;
  chunks: Array<{ left: Float32Array; right: Float32Array; frameCount: number }>;
  flush: () => Promise<void>;
  destroy: () => void;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getEngineName(): string {
  try {
    return new URLSearchParams(window.location.search).get('engine') || 'web';
  } catch {
    return 'web';
  }
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

function flattenChunks(chunks: TapSession['chunks']): { left: Float32Array; right: Float32Array; frames: number } {
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
  const patchedState = {
    ...currentState,
    ...(statePatch ?? {}),
  };

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
        ? options.trackId.trim()
        : 'mix';
      const manualNotes = Array.isArray(options.manualNotes) ? options.manualNotes : [];
      const manualTriggerDelayMs = Math.max(0, options.manualTriggerDelayMs ?? DEFAULT_MANUAL_TRIGGER_DELAY_MS);
      const manualMode = manualNotes.length > 0;
      const manualWarmup = manualMode && options.manualWarmup === true;
      const engine = await ensureAudioEngineLoaded();
      const state = createCaptureState(getState(), options.statePatch, manualMode);

      await engine.start(state);
      const ctx = audioEngine.getAudioContext();
      const limiter = audioEngine.getLimiterNode();
      if (!ctx || !limiter) {
        throw new Error(`Sonic parity capture could not find an AudioContext and "${trackId}" source node.`);
      }
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      await ensureRecorderTapWorklet(ctx);
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

      const recordableNodes = (audioEngine.getRecordableBusNodes?.() ?? {}) as Record<string, RecordableTrackSource>;
      const recordableSource = trackId === 'mix' ? null : recordableNodes[trackId];
      const captureSource = trackId === 'mix'
        ? limiter
        : recordableSource?.node ?? null;
      if (!captureSource) {
        throw new Error(`Sonic parity capture could not find an AudioContext and "${trackId}" source node.`);
      }

      const session = createTapSession(
        ctx,
        captureSource,
        chunkFrames,
        trackId,
        trackId === 'mix' ? undefined : recordableSource?.outputIndex,
      );
      activeSession = session;
      const recorderStartContextTime = ctx.currentTime;
      let preTriggerFrames = 0;
      let triggerStartContextTime: number | null = null;
      let triggerEndContextTime: number | null = null;
      if (manualMode) {
        if (typeof engine.resetSonicParityFx === 'function') {
          engine.resetSonicParityFx();
          await delay(50);
        }
        if (manualTriggerDelayMs > 0) {
          await delay(manualTriggerDelayMs);
        }
        await session.flush();
        preTriggerFrames = session.chunks.reduce((sum, chunk) => sum + chunk.frameCount, 0);
        session.chunks.length = 0;
        triggerStartContextTime = ctx.currentTime;
        if (typeof engine.auditionSynthNotes === 'function') {
          await engine.auditionSynthNotes(manualNotes, state);
        } else {
          for (const note of manualNotes) {
            await engine.auditionSynthNote(note, state);
          }
        }
        triggerEndContextTime = ctx.currentTime;
      }
      await delay(durationMs);
      await session.flush();

      const expectedFrames = Math.max(1, Math.round((durationMs / 1000) * ctx.sampleRate));
      const { left, right, frames } = normalizeCaptureLength(
        flattenChunks(session.chunks),
        expectedFrames,
      );
      const stats = calculateStats(left, right);
      stopActiveSession();

      return {
        engine: getEngineName(),
        sampleRate: ctx.sampleRate,
        frames,
        durationMs,
        manual: {
          enabled: manualMode,
          noteCount: manualNotes.length,
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
        debug: typeof (engine as unknown as { getSonicParityDebugState?: () => unknown }).getSonicParityDebugState === 'function'
          ? (engine as unknown as { getSonicParityDebugState: () => unknown }).getSonicParityDebugState()
          : undefined,
      };
    },
    teardown() {
      stopActiveSession();
      try {
        audioEngine.stop();
      } catch { /* noop */ }
    },
  };
}
