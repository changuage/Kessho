export type CoreProductUnsupportedDecision =
  | 'replace with product concept'
  | 'delete'
  | 'dev/reference-only';

export type CoreProductUnsupportedStatus =
  | 'retired'
  | 'temporary-compatibility';

export type CoreProductUnsupportedSurfacePolicy = {
  legacyMethod: string;
  caller: string;
  decision: CoreProductUnsupportedDecision;
  productReplacement: string;
  status: CoreProductUnsupportedStatus;
  ticket: string;
};

export const CORE_PRODUCT_UNSUPPORTED_SURFACE_POLICY: readonly CoreProductUnsupportedSurfacePolicy[] = [
  {
    legacyMethod: 'getAllStemNodes',
    caller: 'recording',
    decision: 'replace with product concept',
    productReplacement: 'ProductRecordingBridge/stems',
    status: 'retired',
    ticket: 'product-core-recording-stems',
  },
  {
    legacyMethod: 'getRecordableBusNodes',
    caller: 'recording',
    decision: 'replace with product concept',
    productReplacement: 'ProductRecordingBridge/stems',
    status: 'retired',
    ticket: 'product-core-recording-stems',
  },
  {
    legacyMethod: 'getMediaStream',
    caller: 'media-session',
    decision: 'replace with product concept',
    productReplacement: 'Product platform audio-session bridge',
    status: 'retired',
    ticket: 'product-core-platform-audio-session',
  },
  {
    legacyMethod: 'getDynamicsAnalyser',
    caller: 'visualizer',
    decision: 'replace with product concept',
    productReplacement: 'ProductVisualTelemetryFrame',
    status: 'retired',
    ticket: 'product-core-visual-telemetry',
  },
  {
    legacyMethod: 'getDrumVoiceAnalyser',
    caller: 'drum visualizer',
    decision: 'replace with product concept',
    productReplacement: 'ProductVisualTelemetryFrame',
    status: 'retired',
    ticket: 'product-core-visual-telemetry',
  },
  {
    legacyMethod: 'getLimiterNode',
    caller: 'none/internal',
    decision: 'delete',
    productReplacement: 'none',
    status: 'retired',
    ticket: 'product-core-delete-raw-node-getters',
  },
  {
    legacyMethod: 'getGranularBufferWaveform',
    caller: 'granular visualizer',
    decision: 'replace with product concept',
    productReplacement: 'Product telemetry waveform summary',
    status: 'retired',
    ticket: 'product-core-granular-visual-telemetry',
  },
  {
    legacyMethod: 'getLeadMorphedParams',
    caller: 'debug/reference',
    decision: 'dev/reference-only',
    productReplacement: 'Product telemetry/debug snapshot',
    status: 'retired',
    ticket: 'product-core-debug-telemetry',
  },
  {
    legacyMethod: 'getEarthTextureDebugState',
    caller: 'debug/reference',
    decision: 'dev/reference-only',
    productReplacement: 'Product telemetry/debug snapshot',
    status: 'retired',
    ticket: 'product-core-debug-telemetry',
  },
];

export const CORE_PRODUCT_UNSUPPORTED_PRODUCTION_FINDING_TARGET = 0 as const;
