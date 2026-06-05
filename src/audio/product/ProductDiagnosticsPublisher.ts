import type { ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';

type ProductDiagnosticsCallback = ((diagnostics: ProductRuntimeDiagnostics) => void) | null;

export class ProductDiagnosticsPublisher {
  private callback: ProductDiagnosticsCallback = null;
  private queued = false;
  private publishEpoch = 0;

  constructor(private readonly readDiagnostics: () => ProductRuntimeDiagnostics) {}

  setCallback(callback: ProductDiagnosticsCallback): void {
    this.callback = callback;
    callback?.(this.readDiagnostics());
  }

  schedule(): void {
    if (!this.callback || this.queued) return;
    this.queued = true;
    const queuedEpoch = this.publishEpoch;
    queueMicrotask(() => {
      this.queued = false;
      if (queuedEpoch !== this.publishEpoch) return;
      this.publish();
    });
  }

  publish(): void {
    this.publishEpoch += 1;
    this.callback?.(this.readDiagnostics());
  }
}
