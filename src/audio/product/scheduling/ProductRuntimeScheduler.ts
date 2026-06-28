import {
  ProductFrameScheduler,
  type ProductFrameSchedulerOptions,
  type ProductFrameChannel,
} from './ProductFrameScheduler';

export type ProductRuntimeSchedulerChannel =
  | 'visible-visuals'
  | 'telemetry-visible'
  | 'telemetry-hidden'
  | 'diagnostics-visible'
  | 'diagnostics-hidden'
  | 'midi-activity'
  | 'perf-overlay'
  | 'sample-cache-diagnostics'
  | 'sample-asset-miss-diagnostics'
  | 'sample-decode-progress'
  | 'sample-voice-telemetry';

export interface ProductRuntimeSchedulerOptions {
  readonly isMobile?: () => boolean;
  readonly isDebugEnabled?: () => boolean;
  readonly isDocumentHidden?: () => boolean;
  readonly requestAnimationFrame?: ProductFrameSchedulerOptions['requestAnimationFrame'];
  readonly setTimeout?: ProductFrameSchedulerOptions['setTimeout'];
  readonly now?: () => number;
}

type ProductRuntimeTimerHandle =
  | ReturnType<NonNullable<ProductRuntimeSchedulerOptions['setTimeout']>>
  | ReturnType<typeof setTimeout>
  | number;

const CHANNEL_TO_FRAME_CHANNEL: Record<ProductRuntimeSchedulerChannel, ProductFrameChannel> = {
  'visible-visuals': 'visuals',
  'telemetry-visible': 'telemetry',
  'telemetry-hidden': 'telemetry',
  'diagnostics-visible': 'diagnostics',
  'diagnostics-hidden': 'diagnostics',
  'midi-activity': 'midiActivity',
  'perf-overlay': 'visuals',
  'sample-cache-diagnostics': 'diagnostics',
  'sample-asset-miss-diagnostics': 'diagnostics',
  'sample-decode-progress': 'diagnostics',
  'sample-voice-telemetry': 'visuals',
};

const SAMPLE_CHANNELS = new Set<ProductRuntimeSchedulerChannel>([
  'sample-cache-diagnostics',
  'sample-asset-miss-diagnostics',
  'sample-decode-progress',
  'sample-voice-telemetry',
]);

const VISIBLE_SAMPLE_CHANNEL_DELAY_MS: Partial<Record<ProductRuntimeSchedulerChannel, number>> = {
  'sample-cache-diagnostics': 500,
  'sample-asset-miss-diagnostics': 250,
  'sample-decode-progress': 250,
};

const HIDDEN_SAMPLE_CHANNEL_DELAY_MS: Partial<Record<ProductRuntimeSchedulerChannel, number>> = {
  'sample-cache-diagnostics': 5000,
  'sample-asset-miss-diagnostics': 2000,
};

export class ProductRuntimeScheduler {
  private readonly frameScheduler: ProductFrameScheduler;
  private readonly callbacks = new Map<ProductRuntimeSchedulerChannel, Set<() => void>>();
  private readonly sampleTimers = new Map<ProductRuntimeSchedulerChannel, ProductRuntimeTimerHandle>();
  private readonly sampleLastFlushMs = new Map<ProductRuntimeSchedulerChannel, number>();
  private disposed = false;

  constructor(private readonly options: ProductRuntimeSchedulerOptions = {}) {
    this.frameScheduler = new ProductFrameScheduler({
      hiddenIntervalMs: options.isMobile?.() ? 2500 : 1000,
      isHidden: options.isDocumentHidden,
      requestAnimationFrame: options.requestAnimationFrame,
      setTimeout: options.setTimeout,
    });
    for (const frameChannel of ['visuals', 'telemetry', 'diagnostics', 'midiActivity'] as const) {
      this.frameScheduler.subscribe(frameChannel, () => this.flushFrameChannel(frameChannel));
    }
  }

  schedule(channel: ProductRuntimeSchedulerChannel, callback: () => void): void {
    if (this.disposed) return;
    if (channel === 'perf-overlay' && this.isDocumentHidden() && !this.options.isDebugEnabled?.()) return;
    if (channel === 'sample-decode-progress' && this.isDocumentHidden() && !this.options.isDebugEnabled?.()) return;
    if (channel === 'sample-voice-telemetry' && this.isDocumentHidden()) return;
    let callbacks = this.callbacks.get(channel);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(channel, callbacks);
    }
    callbacks.add(callback);
    if (SAMPLE_CHANNELS.has(channel)) {
      this.scheduleSampleChannel(channel);
      return;
    }
    this.frameScheduler.markDirty(CHANNEL_TO_FRAME_CHANNEL[channel]);
  }

  invalidate(channel?: ProductRuntimeSchedulerChannel): void {
    if (this.disposed) return;
    if (channel) {
      this.flushChannel(channel);
      return;
    }
    for (const runtimeChannel of Object.keys(CHANNEL_TO_FRAME_CHANNEL) as ProductRuntimeSchedulerChannel[]) {
      this.flushChannel(runtimeChannel);
    }
  }

  flushNowForTests(): void {
    this.frameScheduler.flushNowForTests();
  }

  dispose(): void {
    this.disposed = true;
    this.callbacks.clear();
    for (const timer of this.sampleTimers.values()) {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
    }
    this.sampleTimers.clear();
    this.sampleLastFlushMs.clear();
    this.frameScheduler.dispose();
  }

  private scheduleSampleChannel(channel: ProductRuntimeSchedulerChannel): void {
    if (channel === 'sample-voice-telemetry') {
      this.frameScheduler.markDirty(CHANNEL_TO_FRAME_CHANNEL[channel]);
      return;
    }

    const delayMs = this.sampleChannelDelayMs(channel);
    if (channel === 'sample-asset-miss-diagnostics') {
      const now = this.now();
      const lastFlush = this.sampleLastFlushMs.get(channel);
      if (lastFlush === undefined || now - lastFlush >= delayMs) {
        this.sampleLastFlushMs.set(channel, now);
        this.flushChannel(channel);
        return;
      }
      this.scheduleSampleTimer(channel, Math.max(0, delayMs - (now - lastFlush)));
      return;
    }

    this.scheduleSampleTimer(channel, delayMs);
  }

  private scheduleSampleTimer(channel: ProductRuntimeSchedulerChannel, delayMs: number): void {
    if (this.sampleTimers.has(channel)) return;
    const setTimeoutFn = this.options.setTimeout ?? setTimeout;
    const timer = setTimeoutFn(() => {
      this.sampleTimers.delete(channel);
      this.sampleLastFlushMs.set(channel, this.now());
      this.flushChannel(channel);
    }, delayMs);
    this.sampleTimers.set(channel, timer);
  }

  private sampleChannelDelayMs(channel: ProductRuntimeSchedulerChannel): number {
    if (this.isDocumentHidden()) {
      return HIDDEN_SAMPLE_CHANNEL_DELAY_MS[channel] ?? 5000;
    }
    return VISIBLE_SAMPLE_CHANNEL_DELAY_MS[channel] ?? 250;
  }

  private flushFrameChannel(frameChannel: ProductFrameChannel): void {
    for (const [runtimeChannel, mappedFrameChannel] of Object.entries(CHANNEL_TO_FRAME_CHANNEL) as Array<[ProductRuntimeSchedulerChannel, ProductFrameChannel]>) {
      if (mappedFrameChannel === frameChannel) this.flushChannel(runtimeChannel);
    }
  }

  private flushChannel(channel: ProductRuntimeSchedulerChannel): void {
    const callbacks = this.callbacks.get(channel);
    if (!callbacks?.size) return;
    this.callbacks.delete(channel);
    for (const callback of callbacks) callback();
  }

  private isDocumentHidden(): boolean {
    if (this.options.isDocumentHidden) return this.options.isDocumentHidden();
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
