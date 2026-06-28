import { predictSampleAssets } from '../../sampleLibraries/sampleAssetPredictor';
import { toSampleAssetDescriptor, type SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import { getSampleLibraryRegistry } from '../../sampleLibraries/sampleLibraryRegistry';
import { resolveSample } from '../../sampleLibraries/sampleResolver';
import { createLegacyPianoSample1State, readSampleSlotState } from '../../sampleLibraries/sampleSlotState';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';

export function samplePredictionState(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return createLegacyPianoSample1State(state ?? {});
}

function sampleSequencerLaneRanges(state: Record<string, unknown>): { source: string; minMidi: number; maxMidi: number }[] {
  const ranges = [];
  for (let lane = 1; lane <= 4; lane += 1) {
    if (state[`synthEuclid${lane}Enabled`] !== true) continue;
    const rawSource = state[`synthEuclid${lane}Source`];
    const source = rawSource === 'sample2' ? 'sample2' : rawSource === 'sample1' || rawSource === 'piano' ? 'sample1' : '';
    if (!source) continue;
    const minMidi = state[`synthEuclid${lane}NoteMin`];
    const maxMidi = state[`synthEuclid${lane}NoteMax`];
    if (typeof minMidi === 'number' && Number.isFinite(minMidi) && typeof maxMidi === 'number' && Number.isFinite(maxMidi)) {
      ranges.push({ source, minMidi, maxMidi });
    }
  }
  return ranges;
}

export function predictedSampleAssetsForState(state: Record<string, unknown>): SampleAssetDescriptor[] {
  return predictSampleAssets({
    state,
    recentMidiBySlot: new Map(),
    sequencerLaneRanges: sampleSequencerLaneRanges(state),
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
  const slot = readSampleSlotState(state, slotId);
  const library = getSampleLibraryRegistry().find((candidate) => candidate.libraryKey === slot.libraryKey);
  if (!library) return null;
  const result = resolveSample({ slot, targetMidi: midiNote, velocity }, [library]);
  return result.kind === 'hit' ? toSampleAssetDescriptor(result.library, result.sample) : null;
}
