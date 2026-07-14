import { CORE_PRODUCT_SOURCE_IDS } from '../coreProductEvents';
import type { ProductManualSynthSource } from './ProductEngineTypes';

export const MANUAL_SYNTH_SOURCE_ENABLED_KEYS = {
  pad1: 'padEnabled',
  pad2: 'pad2Enabled',
  lead1: 'leadEnabled',
  lead2: 'lead2Enabled',
  sample1: 'sample1Enabled',
  sample2: 'sample2Enabled',
} as const satisfies Record<ProductManualSynthSource, string>;

export const MANUAL_SYNTH_SOURCE_CONFIG = {
  pad1: { sourceId: CORE_PRODUCT_SOURCE_IDS.pad1, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.pad1 },
  pad2: { sourceId: CORE_PRODUCT_SOURCE_IDS.pad2, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.pad2 },
  lead1: { sourceId: CORE_PRODUCT_SOURCE_IDS.lead1, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.lead1 },
  lead2: { sourceId: CORE_PRODUCT_SOURCE_IDS.lead2, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.lead2 },
  sample1: { sourceId: CORE_PRODUCT_SOURCE_IDS.sample1, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.sample1 },
  sample2: { sourceId: CORE_PRODUCT_SOURCE_IDS.sample2, enabledKey: MANUAL_SYNTH_SOURCE_ENABLED_KEYS.sample2 },
} as const satisfies Record<ProductManualSynthSource, {
  readonly sourceId: number;
  readonly enabledKey: string;
}>;

export function isProductManualSynthSource(value: unknown): value is ProductManualSynthSource {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MANUAL_SYNTH_SOURCE_CONFIG, value);
}
