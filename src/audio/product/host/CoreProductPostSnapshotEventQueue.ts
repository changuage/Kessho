import type { CoreProductEvent } from '../../coreProductEvents';

const POST_SNAPSHOT_EVENT_FLUSH_BATCH_SIZE = 48;
const POST_SNAPSHOT_EVENT_FLUSH_RETRY_MS = 40;

type CoreProductPostSnapshotEventQueueOptions = {
  canFlush: () => boolean;
  post: (events: readonly CoreProductEvent[]) => void;
};

export class CoreProductPostSnapshotEventQueue {
  private readonly events: CoreProductEvent[] = [];
  private flushTimer: number | null = null;

  constructor(private readonly options: CoreProductPostSnapshotEventQueueOptions) {}

  queue(events: readonly CoreProductEvent[]): void {
    if (events.length === 0) return;
    this.events.length = 0;
    this.events.push(...events);
    this.schedule();
  }

  clear(): void {
    this.events.length = 0;
    if (this.flushTimer === null) return;
    if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') window.clearTimeout(this.flushTimer);
    else clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private schedule(): void {
    if (this.flushTimer !== null) return;
    const schedule = typeof window !== 'undefined' && typeof window.setTimeout === 'function' ? window.setTimeout.bind(window) : setTimeout;
    this.flushTimer = schedule(() => {
      this.flushTimer = null;
      this.flush();
    }, POST_SNAPSHOT_EVENT_FLUSH_RETRY_MS) as unknown as number;
  }

  flush(): void {
    if (this.events.length === 0) return;
    if (!this.options.canFlush()) {
      this.schedule();
      return;
    }
    this.options.post(this.events.splice(0, POST_SNAPSHOT_EVENT_FLUSH_BATCH_SIZE));
    if (this.events.length > 0) this.schedule();
  }
}
