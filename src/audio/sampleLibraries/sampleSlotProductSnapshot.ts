import {
  SAMPLE_ARTICULATION_IDS_BY_KEY,
  SAMPLE_DYNAMIC_IDS_BY_KEY,
  SAMPLE_LIBRARY_IDS_BY_KEY,
  SAMPLE_ROLE_IDS_BY_KEY,
} from './generated/sampleLibraryRegistry.generated';
import type { SampleSlotState } from './SampleLibraryTypes';

export const SAMPLE_SELECTION_MODE_IDS = Object.freeze({
  nearest: 0,
  mapped: 1,
  exact: 2,
} as const);

export const SAMPLE_DYNAMIC_MODE_IDS = Object.freeze({
  velocity: 0,
  fixed: 1,
  'legacy-piano-parity': 2,
} as const);

export const SAMPLE_VARIANT_MODE_IDS = Object.freeze({
  stable: 0,
  seeded: 1,
  'round-robin': 2,
} as const);

export type SampleSlotSnapshotFields = {
  sampleLibraryId: number;
  sampleRoleId: number;
  sampleArticulationId: number;
  sampleSelectionMode: number;
  sampleDynamicMode: number;
  sampleFixedDynamicId: number;
  sampleLoopEnabled: boolean;
  sampleMaxVoices: number;
  sampleVariantMode: number;
  sampleReserved0: number;
};

function generatedIdForKey(map: Readonly<Record<string, number>>, key: string, fallback = 0): number {
  return map[key] ?? fallback;
}

export function sampleSlotSnapshotFields(slot: SampleSlotState): SampleSlotSnapshotFields {
  const defaultDynamicId = SAMPLE_DYNAMIC_IDS_BY_KEY.regular;
  return {
    sampleLibraryId: generatedIdForKey(SAMPLE_LIBRARY_IDS_BY_KEY, slot.libraryKey, SAMPLE_LIBRARY_IDS_BY_KEY.piano),
    sampleRoleId: slot.role ? generatedIdForKey(SAMPLE_ROLE_IDS_BY_KEY, slot.role, 0) : 0,
    sampleArticulationId: slot.articulation ? generatedIdForKey(SAMPLE_ARTICULATION_IDS_BY_KEY, slot.articulation, 0) : 0,
    sampleSelectionMode: SAMPLE_SELECTION_MODE_IDS[slot.selectionMode],
    sampleDynamicMode: SAMPLE_DYNAMIC_MODE_IDS[slot.dynamicMode],
    sampleFixedDynamicId: generatedIdForKey(SAMPLE_DYNAMIC_IDS_BY_KEY, slot.fixedDynamic, defaultDynamicId),
    sampleLoopEnabled: slot.loopEnabled,
    sampleMaxVoices: Math.max(1, Math.min(64, Math.round(slot.maxVoices))),
    sampleVariantMode: SAMPLE_VARIANT_MODE_IDS[slot.variantMode],
    sampleReserved0: 0,
  };
}
