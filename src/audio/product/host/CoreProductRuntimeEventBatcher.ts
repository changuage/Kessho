import type { CoreProductEvent } from '../../coreProductEvents';
import type { CoreProductRuntime } from '../../coreProductRuntime';

export class CoreProductRuntimeEventBatcher {
  private depth = 0;
  private readonly queue: CoreProductEvent[] = [];

  constructor(private readonly runtime: CoreProductRuntime) {}

  post(event: CoreProductEvent): void {
    if (this.depth > 0) {
      this.queue.push(event);
      return;
    }
    this.runtime.postEvent(event);
  }

  postMany(events: readonly CoreProductEvent[]): void {
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
}
