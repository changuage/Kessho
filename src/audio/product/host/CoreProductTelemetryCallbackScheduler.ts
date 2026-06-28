import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import { ProductRuntimeScheduler } from '../scheduling/ProductRuntimeScheduler';

type ProductTelemetryCallback = ((telemetry: CoreProductTelemetrySnapshot) => void) | null;

export class CoreProductTelemetryCallbackScheduler {
  private callback: ProductTelemetryCallback = null;
  private pendingTelemetry: CoreProductTelemetrySnapshot | null = null;

  constructor(private readonly scheduler = new ProductRuntimeScheduler()) {}

  setCallback(callback: ProductTelemetryCallback, latestTelemetry: CoreProductTelemetrySnapshot | null): void {
    this.callback = callback;
    if (!callback) {
      this.pendingTelemetry = null;
      return;
    }
    if (latestTelemetry) callback(latestTelemetry);
  }

  hasCallback(): boolean {
    return this.callback !== null;
  }

  schedule(telemetry: CoreProductTelemetrySnapshot): void {
    if (!this.callback) return;
    this.pendingTelemetry = telemetry;
    this.scheduler.schedule('telemetry-visible', () => this.flush());
  }

  private flush(): void {
    const callback = this.callback;
    const telemetry = this.pendingTelemetry;
    this.pendingTelemetry = null;
    if (callback && telemetry) callback(telemetry);
  }
}
