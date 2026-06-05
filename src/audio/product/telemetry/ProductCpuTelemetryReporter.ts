import type {
  ProductCpuModuleSample,
  ProductCpuTelemetryReport,
} from './ProductCpuTelemetryTypes';

export function createProductCpuTelemetryReport(options: {
  generatedAt?: string;
  sampleRate?: number | null;
  blockSize?: number | null;
  modules: readonly ProductCpuModuleSample[];
}): ProductCpuTelemetryReport {
  const sampleRate = options.sampleRate ?? null;
  const blockSize = options.blockSize ?? null;
  const quantumMs = sampleRate && blockSize ? (blockSize * 1000) / sampleRate : null;
  const failed = options.modules.some((module) => !Number.isFinite(module.averageMs) || !Number.isFinite(module.p95Ms));
  const populated = options.modules.some((module) => module.sampleCount > 0);

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: failed ? 'fail' : populated ? 'pass' : 'partial',
    sampleRate,
    blockSize,
    quantumMs,
    modules: options.modules,
  };
}
