import type { DynamicsVisualTelemetrySnapshot } from '../../engineSharedTypes';
import type { TransportDebugSnapshot } from '../../transport';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import {
  createCoreProductDynamicsVisualTelemetry,
  createCoreProductSonicParityDebugState,
  createCoreProductTransportDebugState,
} from '../../CoreProductHostDebugTelemetry';

type CoreProductHostDebugSurfaceOptions = {
  engineMode: string;
  runtime: CoreProductRuntime;
  running: () => boolean;
  runtimeReady: () => boolean;
  latestProductSnapshot: () => CoreProductSnapshot | null;
  latestSliderState: () => Record<string, unknown> | null;
  latestTelemetry: () => CoreProductTelemetrySnapshot | null;
  runtimeWalkDebug: () => unknown;
};

function normalizedTelemetryPosition(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

export class CoreProductHostDebugSurface {
  constructor(private readonly options: CoreProductHostDebugSurfaceOptions) {}

  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    return createCoreProductDynamicsVisualTelemetry(
      this.options.latestTelemetry(),
      this.options.runtime.audioContext?.currentTime ?? 0,
    );
  }

  getGranularActiveGrainCount(): number {
    return this.options.latestTelemetry()?.activeGrains ?? 0;
  }

  getGranularVoicePositions(): [number, number, number, number] {
    const positions = this.options.latestTelemetry()?.granularVoicePositions;
    return [
      normalizedTelemetryPosition(positions?.[0]),
      normalizedTelemetryPosition(positions?.[1]),
      normalizedTelemetryPosition(positions?.[2]),
      normalizedTelemetryPosition(positions?.[3]),
    ];
  }

  getGranularWriteHeadPosition(): number {
    return normalizedTelemetryPosition(this.options.latestTelemetry()?.granularWriteHeadPosition);
  }

  getSonicParityDebugState(): Record<string, unknown> {
    return createCoreProductSonicParityDebugState({
      engineMode: this.options.engineMode,
      running: this.options.running(),
      runtimeReady: this.options.runtimeReady(),
      runtimeError: this.options.runtime.error,
      hasOutputNode: Boolean(this.options.runtime.outputNode),
      latestProductSnapshot: this.options.latestProductSnapshot(),
      latestSliderState: this.options.latestSliderState(),
      latestTelemetry: this.options.latestTelemetry(),
      runtimeWalkDebug: this.options.runtimeWalkDebug(),
    });
  }

  getTransportDebugState(): TransportDebugSnapshot | null {
    return createCoreProductTransportDebugState(
      this.options.latestTelemetry(),
      this.options.latestProductSnapshot()?.transport,
    );
  }
}
