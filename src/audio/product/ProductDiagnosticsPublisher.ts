import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import { ProductRuntimeScheduler } from './scheduling/ProductRuntimeScheduler';

type ProductDiagnosticsCallback = ((diagnostics: ProductRuntimeDiagnostics) => void) | null;

export class ProductDiagnosticsPublisher {
  private callback: ProductDiagnosticsCallback = null;
  private queued = false;
  private publishEpoch = 0;
  private queuedEpoch = 0;

  constructor(
    private readonly readDiagnostics: () => ProductRuntimeDiagnostics,
    private readonly scheduler = new ProductRuntimeScheduler(),
  ) {
  }

  setCallback(callback: ProductDiagnosticsCallback): void {
    this.callback = callback;
    this.publishEpoch += 1;
    callback?.(this.readDiagnostics());
  }

  schedule(): void {
    if (!this.callback || this.queued) return;
    this.queued = true;
    this.queuedEpoch = this.publishEpoch;
    this.scheduler.schedule('diagnostics-visible', () => this.flushScheduledPublish());
  }

  publish(): void {
    this.publishEpoch += 1;
    this.queued = false;
    this.callback?.(this.readDiagnostics());
  }

  private flushScheduledPublish(): void {
    if (!this.queued) return;
    this.queued = false;
    if (this.queuedEpoch !== this.publishEpoch) return;
    this.publish();
  }
}
