import type {
  ProductCpuModuleName,
  ProductCpuModuleSample,
} from './ProductCpuTelemetryTypes';

export const PRODUCT_CPU_MODULE_NAMES: readonly ProductCpuModuleName[] = [
  'sources',
  'soundscapes',
  'sequencer',
  'granular',
  'reverb',
  'spectral-freeze',
  'delay',
  'dynamics',
  'visual-telemetry',
  'assets',
  'worklet-messaging',
  'ui-telemetry',
  'native-render-callback',
];

const DEFAULT_CAPACITY = 120;

type MutableModuleBucket = {
  readonly values: Float64Array;
  index: number;
  count: number;
  sumMs: number;
  maxMs: number;
};

function createBucket(capacity: number): MutableModuleBucket {
  return {
    values: new Float64Array(capacity),
    index: 0,
    count: 0,
    sumMs: 0,
    maxMs: 0,
  };
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index] ?? 0;
}

export class ProductModuleCpuTelemetry {
  private readonly buckets = new Map<ProductCpuModuleName, MutableModuleBucket>();

  constructor(private readonly capacity = DEFAULT_CAPACITY) {
    for (const module of PRODUCT_CPU_MODULE_NAMES) {
      this.buckets.set(module, createBucket(Math.max(1, capacity)));
    }
  }

  record(module: ProductCpuModuleName, elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    const bucket = this.buckets.get(module);
    if (!bucket) return;

    if (bucket.count === this.capacity) {
      bucket.sumMs -= bucket.values[bucket.index] ?? 0;
    } else {
      bucket.count += 1;
    }

    bucket.values[bucket.index] = elapsedMs;
    bucket.sumMs += elapsedMs;
    bucket.maxMs = Math.max(bucket.maxMs, elapsedMs);
    bucket.index = (bucket.index + 1) % this.capacity;
  }

  snapshot(quantumMs: number | null = null): ProductCpuModuleSample[] {
    const samples: ProductCpuModuleSample[] = [];
    for (const module of PRODUCT_CPU_MODULE_NAMES) {
      const bucket = this.buckets.get(module);
      if (!bucket || bucket.count === 0) {
        samples.push({
          module,
          averageMs: 0,
          p95Ms: 0,
          maxMs: 0,
          sampleCount: 0,
          estimatedCpuPercent: quantumMs && quantumMs > 0 ? 0 : null,
        });
        continue;
      }

      const values = Array.from(bucket.values.slice(0, bucket.count));
      const averageMs = bucket.sumMs / bucket.count;
      samples.push({
        module,
        averageMs,
        p95Ms: percentile(values, 0.95),
        maxMs: bucket.maxMs,
        sampleCount: bucket.count,
        estimatedCpuPercent: quantumMs && quantumMs > 0 ? (averageMs / quantumMs) * 100 : null,
      });
    }
    return samples;
  }

  reset(): void {
    for (const bucket of this.buckets.values()) {
      bucket.values.fill(0);
      bucket.index = 0;
      bucket.count = 0;
      bucket.sumMs = 0;
      bucket.maxMs = 0;
    }
  }
}
