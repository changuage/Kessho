import type { CoreProductEvent } from './coreProductEvents';
import type { DecodedCoreProductAsset } from './coreProductAssets';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';

type RuntimeMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'perf'; cpuPercent: number; peakPercent: number; sequencerEventCount?: number; controlQueueDepth?: number }
  | { type: 'telemetry'; telemetry: CoreProductTelemetrySnapshot };

export class CoreProductRuntime {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private outputGain: GainNode | null = null;
  private readyPromise: Promise<void> | null = null;
  private lastError: string | null = null;
  private telemetryTimer: number | null = null;
  private telemetryCallback: ((telemetry: CoreProductTelemetrySnapshot) => void) | null = null;

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
      node.port.onmessage = (event: MessageEvent<RuntimeMessage>) => {
        const message = event.data;
        if (message.type === 'ready') {
          resolve();
          return;
        }
        if (message.type === 'error') {
          this.lastError = message.message;
          reject(new Error(message.message));
          return;
        }
        if (message.type === 'telemetry') {
          this.telemetryCallback?.(message.telemetry);
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

  postEvent(event: CoreProductEvent): void {
    this.node?.port.postMessage({ type: 'event', event });
  }

  loadSnapshot(snapshot: ArrayBuffer): void {
    this.node?.port.postMessage({ type: 'snapshot', snapshot }, [snapshot]);
  }

  reset(): void {
    this.node?.port.postMessage({ type: 'reset' });
  }

  registerAsset(asset: DecodedCoreProductAsset): void {
    this.node?.port.postMessage({
      type: 'register-asset',
      assetId: asset.assetId,
      sampleRate: asset.sampleRate,
      flags: asset.flags,
      channels: asset.channels,
    }, asset.channels.map((channel) => channel.buffer));
  }

  private startTelemetryLoop(): void {
    if (this.telemetryTimer !== null) return;
    this.telemetryTimer = window.setInterval(() => {
      this.node?.port.postMessage({ type: 'request-telemetry' });
    }, 250);
  }
}
