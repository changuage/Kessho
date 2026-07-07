import type { CoreProductEvent } from '../../coreProductEvents';
import type { CoreProductRuntime } from '../../coreProductRuntime';

const RUNTIME_EVENT_BATCH_SIZE = 48;
const RUNTIME_EVENT_BATCH_RETRY_MS = 40;

export class CoreProductRuntimeEventBatcher {
  private depth = 0;
  private readonly queue: CoreProductEvent[] = [];
  private readonly pendingPostQueue: CoreProductEvent[] = [];
  private flushTimer: number | null = null;

  constructor(private readonly runtime: CoreProductRuntime) {}

  post(event: CoreProductEvent): void {
    if (this.depth > 0) {
      this.queue.push(event);
      return;
    }
    this.runtime.postEvent(event);
  }

  postMany(events: readonly CoreProductEvent[]): void {
    if (events.length === 0) return;
    if (events.length <= RUNTIME_EVENT_BATCH_SIZE && this.pendingPostQueue.length === 0) {
      this.postManyNow(events);
      return;
    }
    this.pendingPostQueue.push(...events);
    this.flushPendingPostQueue();
  }

  private postManyNow(events: readonly CoreProductEvent[]): void {
    const runtime = this.runtime as CoreProductRuntime & {
      postEvents?: (events: readonly CoreProductEvent[]) => void;
    };
    if (runtime.postEvents) {
      runtime.postEvents(events);
      return;
    }
    for (const event of events) this.runtime.postEvent(event);
  }

  run<T>(operation: () => T): T {
    this.depth += 1;
    try {
      return operation();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.flush();
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0);
    this.postMany(events);
  }

  private canFlushPendingPostQueue(): boolean {
    return this.runtime.audioContext?.state === 'running';
  }

  private schedulePendingPostQueueFlush(): void {
    if (this.flushTimer !== null) return;
    const schedule = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : setTimeout;
    this.flushTimer = schedule(() => {
      this.flushTimer = null;
      this.flushPendingPostQueue();
    }, RUNTIME_EVENT_BATCH_RETRY_MS) as unknown as number;
  }

  private flushPendingPostQueue(): void {
    if (this.pendingPostQueue.length === 0) return;
    if (!this.canFlushPendingPostQueue()) {
      this.schedulePendingPostQueueFlush();
      return;
    }
    const batch = this.pendingPostQueue.splice(0, RUNTIME_EVENT_BATCH_SIZE);
    this.postManyNow(batch);
    if (this.pendingPostQueue.length > 0) this.schedulePendingPostQueueFlush();
  }
}
