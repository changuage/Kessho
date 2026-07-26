import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type { ProductManualSynthSource } from './product/ProductEngineTypes';

/** Runtime capabilities used by Product chord scheduling. */
export interface ProductSourceCapabilities {
  readonly polyphonic: boolean;
  readonly maxVoices: number;
}

const POLYPHONIC_DEFAULT: ProductSourceCapabilities = Object.freeze({ polyphonic: true, maxVoices: 8 });
const MONOPHONIC_LEAD: ProductSourceCapabilities = Object.freeze({ polyphonic: false, maxVoices: 1 });

/**
 * Source capability metadata is deliberately small and stable: the sequencer
 * only needs to know whether a destination can hold a chord. Unknown sources
 * retain the historical polyphonic behavior.
 */
export function productSourceCapabilities(sourceId: number | null | undefined): ProductSourceCapabilities {
  if (sourceId === CORE_PRODUCT_SOURCE_IDS.lead1 || sourceId === CORE_PRODUCT_SOURCE_IDS.lead2) {
    return MONOPHONIC_LEAD;
  }
  return POLYPHONIC_DEFAULT;
}

export function isProductSourceMonophonic(sourceId: number | null | undefined): boolean {
  return !productSourceCapabilities(sourceId).polyphonic;
}

export function productSourceIdForManualSynthSource(source: ProductManualSynthSource): number {
  switch (source) {
    case 'pad1': return CORE_PRODUCT_SOURCE_IDS.pad1;
    case 'pad2': return CORE_PRODUCT_SOURCE_IDS.pad2;
    case 'lead1': return CORE_PRODUCT_SOURCE_IDS.lead1;
    case 'lead2': return CORE_PRODUCT_SOURCE_IDS.lead2;
    case 'sample1': return CORE_PRODUCT_SOURCE_IDS.sample1;
    case 'sample2': return CORE_PRODUCT_SOURCE_IDS.sample2;
  }
}
