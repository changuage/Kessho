export type ProductCpuModuleName =
  | 'sources'
  | 'soundscapes'
  | 'sequencer'
  | 'granular'
  | 'reverb'
  | 'spectral-freeze'
  | 'delay'
  | 'dynamics'
  | 'visual-telemetry'
  | 'assets'
  | 'worklet-messaging'
  | 'ui-telemetry'
  | 'native-render-callback';

export type ProductCpuModuleSample = {
  readonly module: ProductCpuModuleName;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
  readonly estimatedCpuPercent?: number | null;
};

export type ProductCpuTelemetryReport = {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly status: 'pass' | 'fail' | 'partial';
  readonly sampleRate: number | null;
  readonly blockSize: number | null;
  readonly quantumMs: number | null;
  readonly modules: readonly ProductCpuModuleSample[];
};
