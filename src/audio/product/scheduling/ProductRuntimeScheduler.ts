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
  | 'sample-decode-progress';

export interface ProductRuntimeSchedulerOptions {
  readonly isMobile?: () => boolean;
  readonly isDebugEnabled?: () => boolean;
  readonly isDocumentHidden?: () => boolean;
  readonly requestAnimationFrame?: ProductFrameSchedulerOptions['requestAnimationFrame'];
  readonly setTimeout?: ProductFrameSchedulerOptions['setTimeout'];
}

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
};

export class ProductRuntimeScheduler {
  private readonly frameScheduler: ProductFrameScheduler;
  private readonly callbacks = new Map<ProductRuntimeSchedulerChannel, Set<() => void>>();
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
    let callbacks = this.callbacks.get(channel);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(channel, callbacks);
    }
    callbacks.add(callback);
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
    this.frameScheduler.dispose();
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
}
