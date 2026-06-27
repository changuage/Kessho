export type ProductFrameChannel = 'diagnostics' | 'telemetry' | 'visuals' | 'midiActivity';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type FrameRequestCallbackLike = (time: number) => void;

export interface ProductFrameSchedulerOptions {
  hiddenIntervalMs?: number;
  visibleFallbackIntervalMs?: number;
  isHidden?: () => boolean;
  requestAnimationFrame?: (callback: FrameRequestCallbackLike) => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimeoutHandle;
}

export class ProductFrameScheduler {
  private queued = false;
  private readonly callbacks = new Map<ProductFrameChannel, Set<() => void>>();
  private readonly dirty = new Set<ProductFrameChannel>();

  constructor(private readonly options: ProductFrameSchedulerOptions = {}) {}

  subscribe(channel: ProductFrameChannel, callback: () => void): () => void {
    let callbacks = this.callbacks.get(channel);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(channel, callbacks);
    }
    callbacks.add(callback);
    return () => callbacks?.delete(callback);
  }

  markDirty(channel: ProductFrameChannel): void {
    this.dirty.add(channel);
    this.schedule();
  }

  flushNowForTests(): void {
    this.flush();
  }

  private schedule(): void {
    if (this.queued) return;
    this.queued = true;

    const setTimeoutFn = this.options.setTimeout ?? setTimeout;
    if (this.isHidden()) {
      setTimeoutFn(() => this.flush(), this.options.hiddenIntervalMs ?? 100);
      return;
    }

    const requestFrame = this.options.requestAnimationFrame ?? this.readRequestAnimationFrame();
    if (requestFrame) {
      requestFrame(() => this.flush());
      return;
    }

    setTimeoutFn(() => this.flush(), this.options.visibleFallbackIntervalMs ?? 16);
  }

  private flush(): void {
    if (!this.queued && this.dirty.size === 0) return;
    this.queued = false;
    const dirtyChannels = Array.from(this.dirty);
    this.dirty.clear();

    for (const channel of dirtyChannels) {
      const callbacks = this.callbacks.get(channel);
      if (!callbacks?.size) continue;
      for (const callback of Array.from(callbacks)) {
        callback();
      }
    }
  }

  private isHidden(): boolean {
    if (this.options.isHidden) return this.options.isHidden();
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private readRequestAnimationFrame(): ((callback: FrameRequestCallbackLike) => number) | null {
    if (typeof requestAnimationFrame !== 'function') return null;
    return requestAnimationFrame;
  }
}
