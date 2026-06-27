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
};

export class CoreProductRealtimeInputBootstrap {
  private bootstrapPromise: Promise<void> | null = null;

  constructor(private readonly options: CoreProductRealtimeInputBootstrapOptions) {}

  postWhenReady(event: CoreProductEvent, source: 'midi' | 'live-note'): void {
    const { runtime } = this.options;
    if (this.options.runtimeReady() && runtime.audioContext?.state === 'running') {
      this.options.post(event);
      return;
    }
    void this.ensureReady().then(() => {
      this.options.post(event);
    }).catch((error: unknown) => {
      console.warn(`Failed to prepare Product Core for ${source} input:`, error);
    });
  }

  private ensureReady(): Promise<void> {
    const { runtime } = this.options;
    if (this.options.runtimeReady()) return runtime.resume();
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = runtime.ensureStarted()
        .then(() => {
          this.options.setRuntimeReady(true);
          return this.options.loadLatestSnapshot();
        })
        .then(() => runtime.resume())
        .finally(() => {
          this.bootstrapPromise = null;
        });
    }
    return this.bootstrapPromise;
  }
}
