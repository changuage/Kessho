import type { CoreProductEvent } from '../../coreProductEvents';

type CoreProductRealtimeInputRuntime = {
  readonly audioContext: AudioContext | null;
  ensureStarted(): Promise<void>;
  resume(): Promise<void>;
};

type CoreProductRealtimeInputBootstrapOptions = {
  runtime: CoreProductRealtimeInputRuntime;
  runtimeReady: () => boolean;
  setRuntimeReady: (ready: boolean) => void;
  loadLatestSnapshot: () => Promise<void>;
  post: (event: CoreProductEvent) => void;
  postMany?: (events: readonly CoreProductEvent[]) => void;
};

export class CoreProductRealtimeInputBootstrap {
  private bootstrapPromise: Promise<void> | null = null;

  constructor(private readonly options: CoreProductRealtimeInputBootstrapOptions) {}

  postWhenReady(event: CoreProductEvent, source: 'midi' | 'live-note'): void {
    void this.postWhenReadyAsync(event).catch((error: unknown) => {
      console.warn(`Failed to prepare Product Core for ${source} input:`, error);
    });
  }

  postWhenReadyAsync(event: CoreProductEvent): Promise<void> {
    return this.postManyWhenReadyAsync([event]);
  }

  postManyWhenReadyAsync(events: readonly CoreProductEvent[]): Promise<void> {
    if (events.length === 0) return Promise.resolve();
    const { runtime } = this.options;
    // Do not bypass an in-flight cold-start/resume transaction. During first
    // startup runtimeReady is set before snapshot loading (the loader needs it
    // to post state), so the promise itself is the ordering barrier.
    if (!this.bootstrapPromise && this.options.runtimeReady() && runtime.audioContext?.state === 'running') {
      this.postMany(events);
      return Promise.resolve();
    }
    return this.ensureReady().then(() => {
      this.postMany(events);
    });
  }

  private postMany(events: readonly CoreProductEvent[]): void {
    if (events.length > 1 && this.options.postMany) {
      this.options.postMany(events);
      return;
    }
    for (const event of events) this.options.post(event);
  }

  private ensureReady(): Promise<void> {
    const { runtime } = this.options;
    if (!this.bootstrapPromise) {
      const runtimeWasReady = this.options.runtimeReady();
      this.bootstrapPromise = runtime.resume()
        .then(async () => {
          // A suspended but initialized context only needs a resume. During
          // first startup, expose runtime readiness so snapshot loading can
          // actually post its state, while the in-flight bootstrap promise
          // still prevents realtime input from bypassing that snapshot.
          if (!runtimeWasReady) {
            this.options.setRuntimeReady(true);
            await this.options.loadLatestSnapshot();
          }
        })
        .finally(() => {
          this.bootstrapPromise = null;
        });
    }
    return this.bootstrapPromise;
  }
}
