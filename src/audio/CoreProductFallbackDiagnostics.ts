export type RuntimeFallbackClassification = 'forbidden-production-fallback';

export type ProductCoreGetterPolicy = 'backed-by-product-core-api';

export const CORE_PRODUCT_GETTER_POLICIES = {
  getDynamicsVisualTelemetry: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core master/dynamics telemetry; analyser nodes remain unavailable in core-product.',
  },
  getGranularActiveGrainCount: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by activeGrains Product telemetry.',
  },
  getGranularVoicePositions: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core granular voice position telemetry.',
  },
  getGranularWriteHeadPosition: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core granular write-head telemetry.',
  },
  getCurrentPadFilterFreq: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core Pad source filter telemetry.',
  },
  getCurrentPadLfoValue: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core Pad source LFO telemetry.',
  },
  getTransportDebugState: {
    classification: 'backed-by-product-core-api',
    blocker: 'Backed by Product Core transport telemetry and generated transport snapshot state.',
  },
} as const satisfies Record<string, { classification: ProductCoreGetterPolicy; blocker: string }>;

export type ProductCoreGetterName = keyof typeof CORE_PRODUCT_GETTER_POLICIES;

export function classifyCoreProductRuntimeFallback(property: string): RuntimeFallbackClassification {
  if (property.startsWith('get')) {
    return 'forbidden-production-fallback';
  }
  if (/^(set|update|reset|dice|start|stop|resume|suspend|trigger|push|load|register|ensure|audition)/.test(property)) {
    return 'forbidden-production-fallback';
  }
  return 'forbidden-production-fallback';
}
