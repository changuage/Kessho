export type ProductFrameChannel = 'diagnostics' | 'telemetry' | 'visuals' | 'midiActivity';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type FrameRequestCallbackLike = (time: number) => void;

export interface ProductFrameSchedulerOptions {
  visibleFallbackIntervalMs?: number;
  isHidden?: () => boolean;
  requestAnimationFrame?: (callback: FrameRequestCallbackLike) => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimeoutHandle;
}

export class ProductFrameScheduler {
  private queued = false;
  private disposed = false;
  private hidden: boolean;
  private readonly callbacks = new Map<ProductFrameChannel, Set<() => void>>();
  private readonly dirty = new Set<ProductFrameChannel>();

  constructor(private readonly options: ProductFrameSchedulerOptions = {}) {
    this.hidden = this.readHiddenState();
  }

  subscribe(channel: ProductFrameChannel, callback: () => void): () => void {
    if (this.disposed) return () => undefined;
    let callbacks = this.callbacks.get(channel);
    if (!callbacks) {
      callbacks = new Set();
      this.callbacks.set(channel, callbacks);
    }
    callbacks.add(callback);
    return () => callbacks?.delete(callback);
  }

  markDirty(channel: ProductFrameChannel): void {
    if (this.disposed) return;
    this.dirty.add(channel);
    if (this.hidden) return;
    this.schedule();
  }

  setDocumentHidden(hidden: boolean): void {
    if (this.disposed || this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.queued = false;
      return;
    }
    if (this.dirty.size > 0) this.schedule();
  }

  flushNowForTests(): void {
    this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.queued = false;
    this.callbacks.clear();
    this.dirty.clear();
  }

  private schedule(): void {
    if (this.disposed) return;
    if (this.queued) return;
    this.queued = true;

    const requestFrame = this.options.requestAnimationFrame ?? this.readRequestAnimationFrame();
    if (requestFrame) {
      requestFrame(() => this.flush());
      return;
    }

    const setTimeoutFn = this.options.setTimeout ?? setTimeout;
    setTimeoutFn(() => this.flush(), this.options.visibleFallbackIntervalMs ?? 16);
  }

  private flush(): void {
    if (this.disposed) return;
    if (this.hidden) {
      this.queued = false;
      return;
    }
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

  private readHiddenState(): boolean {
    if (this.options.isHidden) return this.options.isHidden();
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private readRequestAnimationFrame(): ((callback: FrameRequestCallbackLike) => number) | null {
    if (typeof requestAnimationFrame !== 'function') return null;
    return requestAnimationFrame;
  }
}
