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
  readonly isDocumentHidden?: () => boolean;
  readonly requestAnimationFrame?: ProductFrameSchedulerOptions['requestAnimationFrame'];
  readonly setTimeout?: ProductFrameSchedulerOptions['setTimeout'];
  readonly clearTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
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

export class ProductRuntimeScheduler {
  private readonly frameScheduler: ProductFrameScheduler;
  private readonly callbacks = new Map<ProductRuntimeSchedulerChannel, () => void>();
  private readonly sampleTimers = new Map<ProductRuntimeSchedulerChannel, ProductRuntimeTimerHandle>();
  private readonly sampleLastFlushMs = new Map<ProductRuntimeSchedulerChannel, number>();
  private disposed = false;
  private documentHidden: boolean;
  private readonly handleVisibilityChange = (): void => {
    this.setDocumentHidden(this.readDocumentHidden());
  };

  constructor(private readonly options: ProductRuntimeSchedulerOptions = {}) {
    this.documentHidden = this.readDocumentHidden();
    this.frameScheduler = new ProductFrameScheduler({
      isHidden: () => this.documentHidden,
      requestAnimationFrame: options.requestAnimationFrame,
      setTimeout: options.setTimeout,
    });
    for (const frameChannel of ['visuals', 'telemetry', 'diagnostics', 'midiActivity'] as const) {
      this.frameScheduler.subscribe(frameChannel, () => this.flushFrameChannel(frameChannel));
    }
    if (typeof document !== 'undefined' && !options.isDocumentHidden) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  schedule(channel: ProductRuntimeSchedulerChannel, callback: () => void): void {
    if (this.disposed) return;
    this.callbacks.set(channel, callback);
    if (this.documentHidden) return;
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

  setDocumentHidden(hidden: boolean): void {
    if (this.disposed || this.documentHidden === hidden) return;
    this.documentHidden = hidden;
    this.frameScheduler.setDocumentHidden(hidden);
    if (hidden) {
      const clearTimeoutFn = this.options.clearTimeout ?? clearTimeout;
      for (const timer of this.sampleTimers.values()) {
        clearTimeoutFn(timer as ReturnType<typeof setTimeout>);
      }
      this.sampleTimers.clear();
      return;
    }
    for (const channel of this.callbacks.keys()) {
      this.frameScheduler.markDirty(CHANNEL_TO_FRAME_CHANNEL[channel]);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (typeof document !== 'undefined' && !this.options.isDocumentHidden) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.callbacks.clear();
    const clearTimeoutFn = this.options.clearTimeout ?? clearTimeout;
    for (const timer of this.sampleTimers.values()) {
      clearTimeoutFn(timer as ReturnType<typeof setTimeout>);
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
    return VISIBLE_SAMPLE_CHANNEL_DELAY_MS[channel] ?? 250;
  }

  private flushFrameChannel(frameChannel: ProductFrameChannel): void {
    for (const [runtimeChannel, mappedFrameChannel] of Object.entries(CHANNEL_TO_FRAME_CHANNEL) as Array<[ProductRuntimeSchedulerChannel, ProductFrameChannel]>) {
      if (mappedFrameChannel === frameChannel) this.flushChannel(runtimeChannel);
    }
  }

  private flushChannel(channel: ProductRuntimeSchedulerChannel): void {
    const callbacks = this.callbacks.get(channel);
    if (!callbacks || this.documentHidden) return;
    this.callbacks.delete(channel);
    callbacks();
  }

  private readDocumentHidden(): boolean {
    if (this.options.isDocumentHidden) return this.options.isDocumentHidden();
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
