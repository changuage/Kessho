import type { RuntimeFallbackClassification } from '../../CoreProductFallbackDiagnostics';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { ProductRuntimeDiagnostics } from '../ProductRuntimeDiagnostics';

export class CoreProductHostDiagnostics {
  private readonly reportedRuntimeFallbacks = new Set<string>();
  private readonly reportedUnsupportedRangeKeys = new Set<string>();
  private dirtyDiffCount = 0;
  private fullSnapshotReloadCount = 0;
  private unsupportedControlCount = 0;
  private unsupportedGetterCount = 0;
  private lastUnsupportedMethod: string | null = null;
  private lastUnsupportedMethodClass: RuntimeFallbackClassification | null = null;
  private runtimeFallbackDiagnosticCount = 0;
  private audioCriticalFallbackCount = 0;
  private snapshotReloadCpuMs = 0;
  private lastSnapshotReloadReason: string | null = 'none';

  snapshot(): ProductRuntimeDiagnostics {
    return {
      dirtyDiffCount: this.dirtyDiffCount,
      fullSnapshotReloadCount: this.fullSnapshotReloadCount,
      unsupportedControlCount: this.unsupportedControlCount,
      unsupportedGetterCount: this.unsupportedGetterCount,
      runtimeFallbackDiagnosticCount: this.runtimeFallbackDiagnosticCount,
      audioCriticalFallbackCount: this.audioCriticalFallbackCount,
      lastUnsupportedMethod: this.lastUnsupportedMethod,
      lastUnsupportedMethodClass: this.lastUnsupportedMethodClass,
      lastSnapshotReloadReason: this.lastSnapshotReloadReason,
      snapshotReloadCpuMs: this.snapshotReloadCpuMs,
    };
  }

  enrichTelemetry(telemetry: CoreProductTelemetrySnapshot): CoreProductTelemetrySnapshot {
    return {
      ...telemetry,
      ...this.snapshot(),
      lastSnapshotReloadReason: this.lastSnapshotReloadReason ?? undefined,
    };
  }

  recordDirtyDiff(): void {
    this.dirtyDiffCount += 1;
  }

  recordFullSnapshotReload(reason: string, cpuMs: number): void {
    this.fullSnapshotReloadCount += 1;
    this.snapshotReloadCpuMs += Math.max(0, cpuMs);
    this.lastSnapshotReloadReason = reason;
  }

  reportRuntimeFallback(method: string, classification: RuntimeFallbackClassification): void {
    this.recordUnsupportedMethod(method, classification);
    const dev = (import.meta.env as unknown as { DEV?: boolean }).DEV === true;
    const firstReport = !this.reportedRuntimeFallbacks.has(method);
    if (firstReport) {
      this.reportedRuntimeFallbacks.add(method);
    }
    if (dev || firstReport) {
      console.error(
        `core-product runtime fallback ${classification} for AudioEngine.${method}; add Product Core telemetry/event support before production use.`,
      );
    }
    if (dev) {
      throw new Error(`Missing audio-critical core-product method: AudioEngine.${method}`);
    }
  }

  reportUnsupportedRangeKey(key: string): void {
    if (this.reportedUnsupportedRangeKeys.has(key)) return;
    this.reportedUnsupportedRangeKeys.add(key);
    this.recordUnsupportedMethod(`range:${key}`, 'forbidden-production-fallback');
    if ((import.meta.env as unknown as { DEV?: boolean }).DEV || typeof console !== 'undefined') {
      console.error(`core-product runtime fallback forbidden-production-fallback for slider range "${key}".`);
    }
  }

  private recordUnsupportedMethod(method: string, classification: RuntimeFallbackClassification): void {
    this.unsupportedControlCount += 1;
    if (method.startsWith('get')) {
      this.unsupportedGetterCount += 1;
    }
    this.lastUnsupportedMethod = method;
    this.lastUnsupportedMethodClass = classification;
    this.runtimeFallbackDiagnosticCount += 1;
    if (classification === 'forbidden-production-fallback') {
      this.audioCriticalFallbackCount += 1;
    }
  }
}
