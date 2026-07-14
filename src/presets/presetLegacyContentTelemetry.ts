import type { PresetLevel, PresetVersionMetadata } from './types';
import type { PresetVersionContentRefV2Row, PresetVersionRefV2Row } from './presetStorageV2';

export interface PresetLegacyContentReadCounters {
  flatSequencerMetadata: number;
  combinedEuclideanChildren: number;
  expandedStateSnapshots: number;
}

const counters: PresetLegacyContentReadCounters = {
  flatSequencerMetadata: 0,
  combinedEuclideanChildren: 0,
  expandedStateSnapshots: 0,
};

const SEQUENCER_METADATA_KEYS: readonly (keyof PresetVersionMetadata)[] = [
  'drumStepOverrides', 'synthStepOverrides', 'drumClockDivs', 'synthClockDivs',
  'drumSubLaneStates', 'synthSubLaneStates', 'drumPitchSettings', 'synthPitchSettings',
];

export function recordPresetLegacyContentRead(options: {
  type: PresetLevel;
  resolvedHash: string | null;
  metadata?: PresetVersionMetadata;
  refs: readonly PresetVersionRefV2Row[];
  contentRefs: readonly PresetVersionContentRefV2Row[];
}): void {
  if (options.contentRefs.length > 0) return;
  if (SEQUENCER_METADATA_KEYS.some(key => options.metadata?.[key] !== undefined)) {
    counters.flatSequencerMetadata += 1;
  }
  if (options.refs.some(ref => ref.ref_slot === 'euclideanPattern')) {
    counters.combinedEuclideanChildren += 1;
  }
  if (options.type === 'state' && options.resolvedHash) {
    counters.expandedStateSnapshots += 1;
  }
}

export function getPresetLegacyContentReadCounters(): PresetLegacyContentReadCounters {
  return { ...counters };
}

export function resetPresetLegacyContentReadCounters(): void {
  counters.flatSequencerMetadata = 0;
  counters.combinedEuclideanChildren = 0;
  counters.expandedStateSnapshots = 0;
}
