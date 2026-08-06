import { predictSampleAssets } from '../../sampleLibraries/sampleAssetPredictor';
import { toSampleAssetDescriptor, type SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import { getSampleLibraryRegistry } from '../../sampleLibraries/sampleLibraryRegistry';
import { resolveSample } from '../../sampleLibraries/sampleResolver';
import { readSampleSlotState } from '../../sampleLibraries/sampleSlotState';
import { discoverCoreProductSequencerTargets } from '../../coreProductSampleSequencerTargets';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';

export function samplePredictionState(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(state ?? {}) };
}

function velocityByteFromProductVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 100;
  if (velocity >= 0 && velocity <= 1) return velocity * 127;
  return velocity;
}


export function predictedSampleAssetsForState(state: Record<string, unknown>): SampleAssetDescriptor[] {
  return predictSampleAssets({
    state,
    recentMidiBySlot: new Map(),
    sequencerLaneRanges: discoverCoreProductSequencerTargets(state).sampleRanges,
    manualPriorityMidi: [],
  });
}

export function sampleDescriptorForAssetId(assetId: number): SampleAssetDescriptor | null {
  for (const library of getSampleLibraryRegistry()) {
    const sample = library.samples.find((candidate) => candidate.assetId === assetId);
    if (sample) return toSampleAssetDescriptor(library, sample);
  }
  return null;
}

export function sampleDescriptorForSlotNote(
  state: Record<string, unknown>,
  slotId: SampleSlotId,
  midiNote: number,
  velocity: number,
): SampleAssetDescriptor | null {
  // A manual audition is an explicit request to sound this slot even when the
  // persistent source is disabled. Keep that transient intent local to asset
  // resolution so auditioning never mutates the saved Product state.
  const slot = { ...readSampleSlotState(state, slotId), enabled: true };
  const library = getSampleLibraryRegistry().find((candidate) => candidate.libraryKey === slot.libraryKey);
  if (!library) return null;
  const result = resolveSample({ slot, targetMidi: midiNote, velocity: velocityByteFromProductVelocity(velocity) }, [library]);
  return result.kind === 'hit' ? toSampleAssetDescriptor(result.library, result.sample) : null;
}
