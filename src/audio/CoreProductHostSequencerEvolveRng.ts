import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { getUtcBucket, xmur3 } from './rng';

export function coreProductSequencerEvolveRngMaterial(
  latestSliderState: Record<string, unknown> | null,
  telemetry: CoreProductTelemetrySnapshot,
  fallbackSeed: number,
): string {
  const seedWindow = latestSliderState?.seedWindow === 'day' ? 'day' : 'hour';
  const runtimeSeed = typeof telemetry.rngSeed === 'number' && Number.isFinite(telemetry.rngSeed)
    ? Math.round(telemetry.rngSeed)
    : fallbackSeed;
  return `${getUtcBucket(seedWindow)}|${runtimeSeed}|core-product-sequencer-evolve`;
}

export function coreProductSequencerEvolveRngSeed(
  latestSliderState: Record<string, unknown> | null,
  telemetry: CoreProductTelemetrySnapshot,
  fallbackSeed: number,
): number {
  return xmur3(coreProductSequencerEvolveRngMaterial(latestSliderState, telemetry, fallbackSeed))();
}
