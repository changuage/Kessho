import type { CoreProductEvent } from './coreProductEvents';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';

const CORE_PRODUCT_GRAPH_TAP_COUNT = 110;

type RuntimeMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'perf'; cpuPercent: number; peakPercent: number; sequencerEventCount?: number; controlQueueDepth?: number }
  | { type: 'telemetry'; telemetry: CoreProductTelemetrySnapshot }
  | { type: 'graph-capture-chunk'; tapId: number; frameCount: number; left: Float32Array; right: Float32Array }
  | { type: 'graph-capture-flushed'; tapId: number; stopped?: boolean };

export type CoreProductGraphTapCaptureChunk = {
  tapId: number;
  frameCount: number;
  left: Float32Array;
  right: Float32Array;
};

type GraphTapCaptureSession = {
  tapId: number;
  chunks: CoreProductGraphTapCaptureChunk[];
  resolveFlush: (() => void) | null;
  rejectFlush: ((error: Error) => void) | null;
};

export class CoreProductRuntime {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private outputGain: GainNode | null = null;
  private readyPromise: Promise<void> | null = null;
  private lastError: string | null = null;
  private telemetryTimer: number | null = null;
  private telemetryCallback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;
  private perfMonitorEnabled = false;
  private readonly graphTapCaptureSessions = new Map<number, GraphTapCaptureSession>();

  get audioContext(): AudioContext | null {
    return this.context;
  }

  get outputNode(): AudioNode | null {
    return this.outputGain ?? this.node;
  }

  get error(): string | null {
    return this.lastError;
  }

  async ensureStarted(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    const context = new AudioContext();
    this.context = context;
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const workletUrl = new URL('worklets/kessho-core-product.worklet.js', base);
    const wasmUrl = new URL('worklets/kessho_core.wasm', base);
    await context.audioWorklet.addModule(workletUrl);
    const wasmBinary = await fetch(wasmUrl).then((response) => {
      if (!response.ok) throw new Error(`Failed to fetch ${wasmUrl}: ${response.status}`);
      return response.arrayBuffer();
    });

    this.readyPromise = new Promise((resolve, reject) => {
      const node = new AudioWorkletNode(context, 'kessho-core-product', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          wasmBinary,
          wasmUrl: wasmUrl.toString(),
        },
      });
      const outputGain = context.createGain();
      outputGain.gain.value = 1;
      this.node = node;
      this.outputGain = outputGain;
      if (this.perfMonitorEnabled) {
        node.port.postMessage({ type: 'enablePerf', enabled: true });
      }
      node.port.onmessage = (event: MessageEvent<RuntimeMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          resolve();
          return;
        }
        if (message.type === 'error') {
          this.lastError = message.message;
          const runtimeError = new Error(message.message);
          for (const session of this.graphTapCaptureSessions.values()) {
            session.rejectFlush?.(runtimeError);
            session.resolveFlush = null;
            session.rejectFlush = null;
          }
          reject(runtimeError);
          return;
        }
        if (message.type === 'telemetry') {
          this.telemetryCallback?.(message.telemetry);
          return;
        }
        if (message.type === 'graph-capture-chunk') {
          const session = this.graphTapCaptureSessions.get(message.tapId);
          if (session) {
            session.chunks.push({
              tapId: message.tapId,
              frameCount: message.frameCount,
              left: message.left,
              right: message.right,
            });
          }
          return;
        }
        if (message.type === 'graph-capture-flushed') {
          const session = this.graphTapCaptureSessions.get(message.tapId);
          if (session?.resolveFlush) {
            session.resolveFlush();
            session.resolveFlush = null;
            session.rejectFlush = null;
          }
        }
      };
      node.connect(outputGain);
      outputGain.connect(context.destination);
      this.startTelemetryLoop();
    });

    await this.readyPromise;
  }

  async resume(): Promise<void> {
    await this.ensureStarted();
    await this.context?.resume();
  }

  async suspend(): Promise<void> {
    await this.context?.suspend();
  }

  dispose(): void {
    if (this.telemetryTimer !== null) {
      window.clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    this.node?.disconnect();
    this.outputGain?.disconnect();
    const context = this.context;
    this.node = null;
    this.outputGain = null;
    this.context = null;
    this.readyPromise = null;
    if (context && context.state !== 'closed') {
      void context.close();
    }
  }

  setTelemetryCallback(callback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null): void {
    this.telemetryCallback = callback;
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
    this.node?.port.postMessage({ type: 'enablePerf', enabled });
  }

  postEvent(event: CoreProductEvent): void {
    this.requireNode('postEvent').port.postMessage({ type: 'event', event });
  }

  loadSnapshot(snapshot: ArrayBuffer): void {
    this.requireNode('loadSnapshot').port.postMessage({ type: 'snapshot', snapshot }, [snapshot]);
  }

  reset(): void {
    this.requireNode('reset').port.postMessage({ type: 'reset' });
  }

  resetParityFx(): void {
    this.requireNode('resetParityFx').port.postMessage({ type: 'reset-parity-fx' });
  }

  startGraphTapCapture(tapId: number, chunkFrames: number): void {
    const node = this.requireNode('startGraphTapCapture');
    const normalizedTapId = this.normalizeGraphTapId(tapId);
    const normalizedChunkFrames = Math.max(128, Math.round(chunkFrames || 4096));
    this.graphTapCaptureSessions.set(normalizedTapId, {
      tapId: normalizedTapId,
      chunks: [],
      resolveFlush: null,
      rejectFlush: null,
    });
    node.port.postMessage({
      type: 'graph-capture-start',
      tapId: normalizedTapId,
      chunkFrames: normalizedChunkFrames,
    });
  }

  async flushGraphTapCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.requestGraphTapFlush(tapId, false);
  }

  async stopGraphTapCapture(tapId: number): Promise<CoreProductGraphTapCaptureChunk[]> {
    return this.requestGraphTapFlush(tapId, true);
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    this.requireNode('registerAsset').port.postMessage({
      type: 'register-asset',
      assetId: asset.assetId,
      sampleRate: asset.sampleRate,
      flags: asset.flags,
      channels: asset.channels,
    }, asset.channels.map((channel) => channel.buffer));
  }

  private requireNode(operation: string): AudioWorkletNode {
    if (!this.node) {
      throw new Error(`Core Product runtime cannot ${operation} before the product worklet is initialized`);
    }
    return this.node;
  }

  private normalizeGraphTapId(tapId: number): number {
    const normalized = Math.trunc(Number(tapId));
    if (!Number.isFinite(normalized) || normalized < 0 || normalized >= CORE_PRODUCT_GRAPH_TAP_COUNT) {
      throw new Error(`Core Product graph tap id is invalid: ${String(tapId)}`);
    }
    return normalized;
  }

  private async requestGraphTapFlush(tapId: number, stopped: boolean): Promise<CoreProductGraphTapCaptureChunk[]> {
    const node = this.requireNode(stopped ? 'stopGraphTapCapture' : 'flushGraphTapCapture');
    const normalizedTapId = this.normalizeGraphTapId(tapId);
    const session = this.graphTapCaptureSessions.get(normalizedTapId);
    if (!session) {
      throw new Error(`Core Product graph tap ${normalizedTapId} capture has not been started`);
    }
    if (session.resolveFlush) {
      throw new Error(`Core Product graph tap ${normalizedTapId} capture is already flushing`);
    }
    await new Promise<void>((resolve, reject) => {
      session.resolveFlush = resolve;
      session.rejectFlush = reject;
      node.port.postMessage({
        type: stopped ? 'graph-capture-stop' : 'graph-capture-flush',
        tapId: normalizedTapId,
      });
    });
    const chunks = session.chunks.splice(0);
    if (stopped) {
      this.graphTapCaptureSessions.delete(normalizedTapId);
    }
    return chunks;
  }

  private startTelemetryLoop(): void {
    if (this.telemetryTimer !== null) return;
    this.telemetryTimer = window.setInterval(() => {
      this.node?.port.postMessage({ type: 'request-telemetry' });
    }, 250);
  }
}
