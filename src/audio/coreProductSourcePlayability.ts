import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import type { SampleSlotId } from './sampleLibraries/SampleLibraryTypes';

function booleanFromState(state: Record<string, unknown> | null | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function sampleSlotEnabledForPlayback(
  state: Record<string, unknown> | null | undefined,
  slotId: SampleSlotId,
): boolean {
  return booleanFromState(state, `${slotId}Enabled`, false);
}

export function productSourceEnabledForPlayback(
  state: Record<string, unknown> | null | undefined,
  sourceId: number,
): boolean {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      return booleanFromState(state, 'padEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return booleanFromState(state, 'pad2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      return booleanFromState(state, 'leadEnabled', false);
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return booleanFromState(state, 'lead2Enabled', false);
    case CORE_PRODUCT_SOURCE_IDS.sample1:
      return sampleSlotEnabledForPlayback(state, 'sample1');
    case CORE_PRODUCT_SOURCE_IDS.sample2:
      return sampleSlotEnabledForPlayback(state, 'sample2');
    case CORE_PRODUCT_SOURCE_IDS.drum:
      return booleanFromState(state, 'drumEnabled', false);
    default:
      return true;
  }
}
