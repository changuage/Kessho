export type RuntimeFallbackClassification =
  | 'temporary-missing-product-telemetry'
  | 'reference-only-web-ts-behavior'
  | 'forbidden-production-fallback';

export type ProductCoreGetterPolicy =
  | 'backed-by-product-core-api'
  | 'explicitly-unsupported-hidden'
  | 'reference-only-web-ts-behavior'
  | 'temporary-missing-product-telemetry';

export const CORE_PRODUCT_GETTER_POLICIES = {
  getDynamicsAnalyser: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Web Audio dynamics analyser nodes are not exposed in core-product; Product Core telemetry backs dynamics visuals instead.',
  },
  getDynamicsVisualTelemetry: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core master/dynamics telemetry; analyser nodes remain unavailable in core-product.',
  },
  getDrumVoiceAnalyser: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Web Audio drum analyser nodes are not exposed in core-product; drum live analyser callbacks are disabled for that runtime.',
  },
  getGranularActiveGrainCount: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by activeGrains Product telemetry.',
  },
  getGranularBufferWaveform: {
    classification: 'backed-by-product-core-api',
    blocker: 'Core-product uses low-cost granular head/voice telemetry; waveform samples intentionally stay null to avoid realtime buffer copies.',
  },
  getGranularVoicePositions: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core granular voice position telemetry.',
  },
  getGranularWriteHeadPosition: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core granular write-head telemetry.',
  },
  getLeadMorphedParams: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Lead morphed-parameter preview is disabled in core-product until Product Core exposes resolved Lead source telemetry.',
  },
  getCurrentFilterFreq: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Live source filter telemetry polling is disabled in core-product until Product Core exposes source debug telemetry.',
  },
  getCurrentLfoValue: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Live source LFO telemetry polling is disabled in core-product until Product Core exposes source debug telemetry.',
  },
  getCurrentLfo2Value: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Live secondary LFO telemetry polling is disabled in core-product until Product Core exposes source debug telemetry.',
  },
  getCurrentPadFilterFreq: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core Pad source filter telemetry.',
  },
  getCurrentPadLfoValue: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core Pad source LFO telemetry.',
  },
  getRecordableBusNodes: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Stem-node recording is hidden in core-product; Product Core exposes stem buffers/peaks, not Web Audio bus nodes.',
  },
  getAllStemNodes: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Stem-node recording is hidden in core-product; Product Core exposes stem buffers/peaks, not Web Audio bus nodes.',
  },
  getEarthTextureDebugState: {
    classification: 'explicitly-unsupported-hidden',
    blocker: 'Earth texture debug polling is disabled in core-product until Product Core exposes soundscape layer debug telemetry.',
  },
  getTransportDebugState: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core transport telemetry and generated transport snapshot state.',
  },
} as const satisfies Record<string, { classification: ProductCoreGetterPolicy; blocker: string }>;

export type ProductCoreGetterName = keyof typeof CORE_PRODUCT_GETTER_POLICIES;

export const CORE_PRODUCT_REFERENCE_ONLY_METHODS = new Set<string>();

function classifyProductCoreGetterPolicy(policy: ProductCoreGetterPolicy): RuntimeFallbackClassification {
  switch (policy) {
    case 'explicitly-unsupported-hidden':
    case 'backed-by-product-core-api':
      return 'forbidden-production-fallback';
    case 'temporary-missing-product-telemetry':
      return 'temporary-missing-product-telemetry';
    case 'reference-only-web-ts-behavior':
      return 'reference-only-web-ts-behavior';
  }
}

export function classifyCoreProductRuntimeFallback(property: string): RuntimeFallbackClassification {
  if (property.startsWith('get')) {
    const policy = CORE_PRODUCT_GETTER_POLICIES[property as ProductCoreGetterName];
    return policy ? classifyProductCoreGetterPolicy(policy.classification) : 'forbidden-production-fallback';
  }
  if (/^(set|update|reset|dice|start|stop|resume|suspend|trigger|push|load|register|ensure|audition)/.test(property)) {
    return 'forbidden-production-fallback';
  }
  if (CORE_PRODUCT_REFERENCE_ONLY_METHODS.has(property)) {
    return 'reference-only-web-ts-behavior';
  }
  return 'forbidden-production-fallback';
}

export function runtimeFallbackIsDevelopmentError(classification: RuntimeFallbackClassification): boolean {
  return classification === 'forbidden-production-fallback';
}
