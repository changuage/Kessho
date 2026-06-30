import type { SampleLibraryKey, SampleSlotId, SampleSlotState } from './SampleLibraryTypes';
import { getSampleLibrary } from './sampleLibraryRegistry';
import { getDefaultSampleSlotStateForSlot, writeSampleSlotStateToFlatState } from './sampleSlotState';

export function sampleSlotDefaultsForLibrary(
  slotId: SampleSlotId,
  libraryKey: SampleLibraryKey,
): SampleSlotState {
  const library = getSampleLibrary(libraryKey);
  const isPiano = libraryKey === 'piano';
  return getDefaultSampleSlotStateForSlot(slotId, {
    enabled: true,
    libraryKey,
    role: isPiano ? '' : library?.defaultRole ?? '',
    articulation: isPiano ? '' : library?.defaultArticulation ?? '',
    selectionMode: isPiano ? 'nearest' : 'mapped',
    dynamicMode: isPiano ? 'legacy-piano-parity' : 'velocity',
    fixedDynamic: library?.defaultDynamic ?? (isPiano ? 'regular' : 'single'),
    loopEnabled: !isPiano,
  });
}

export function applySampleLibrarySelectionDefaultsToFlatState(
  state: Record<string, unknown>,
  slotId: SampleSlotId,
  libraryKey: SampleLibraryKey,
): Record<string, unknown> {
  return Object.assign(state, writeSampleSlotStateToFlatState(slotId, sampleSlotDefaultsForLibrary(slotId, libraryKey), state));
}
