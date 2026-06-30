import { predictSampleAssets } from '../../sampleLibraries/sampleAssetPredictor';
import { toSampleAssetDescriptor, type SampleAssetDescriptor } from '../../sampleLibraries/sampleAssetDescriptors';
import { getSampleLibraryRegistry } from '../../sampleLibraries/sampleLibraryRegistry';
import { resolveSample } from '../../sampleLibraries/sampleResolver';
import { createLegacyPianoSample1State, readSampleSlotState } from '../../sampleLibraries/sampleSlotState';
import type { SampleSlotId } from '../../sampleLibraries/SampleLibraryTypes';

type SampleSequencerLaneRange = { source: string; minMidi: number; maxMidi: number };

export function samplePredictionState(state: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return createLegacyPianoSample1State(state ?? {});
}

function velocityByteFromProductVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 100;
  if (velocity >= 0 && velocity <= 1) return velocity * 127;
  return velocity;
}

function numberFromState(state: Record<string, unknown>, key: string, fallback: number): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sampleSlotForSequencerSource(source: unknown): 'sample1' | 'sample2' | '' {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (normalized === 'sample2') return 'sample2';
  if (normalized === 'sample1' || normalized === 'piano') return 'sample1';
  return '';
}

function addSampleSequencerRange(
  ranges: SampleSequencerLaneRange[],
  source: unknown,
  minMidi: number,
  maxMidi: number,
): void {
  const slot = sampleSlotForSequencerSource(source);
  if (!slot) return;
  ranges.push({ source: slot, minMidi, maxMidi });
}

function sampleSequencerLaneRanges(state: Record<string, unknown>): SampleSequencerLaneRange[] {
  const ranges: SampleSequencerLaneRange[] = [];
  for (let lane = 1; lane <= 4; lane += 1) {
    if (state[`synthEuclid${lane}Enabled`] !== true) continue;
    const minMidi = state[`synthEuclid${lane}NoteMin`];
    const maxMidi = state[`synthEuclid${lane}NoteMax`];
    if (typeof minMidi === 'number' && Number.isFinite(minMidi) && typeof maxMidi === 'number' && Number.isFinite(maxMidi)) {
      addSampleSequencerRange(ranges, state[`synthEuclid${lane}Source`], minMidi, maxMidi);
    }
  }

  const chordOctaveShift = Math.max(-2, Math.min(2, Math.round(numberFromState(state, 'synthOctave', 0)))) * 12;
  if (state.synthChordGeneratorEnabled === true) {
    addSampleSequencerRange(ranges, state.synthChordGeneratorSource, 36 + chordOctaveShift, 84 + chordOctaveShift);
  }
  if (state.synthChordSequencerEnabled === true) {
    addSampleSequencerRange(ranges, state.synthChordSequencerSource, 36 + chordOctaveShift, 96 + chordOctaveShift);
  }
  if (state.leadRandomEnabled === true) {
    const baseOctaveOffset = Math.max(-1, Math.min(2, Math.round(numberFromState(state, 'lead1Octave', 1))));
    const octaveRange = Math.max(1, Math.min(4, Math.round(numberFromState(state, 'lead1OctaveRange', 2))));
    const baseLow = 64 + baseOctaveOffset * 12;
    addSampleSequencerRange(ranges, state.leadRandomSource, baseLow, baseLow + octaveRange * 12);
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
  const result = resolveSample({ slot, targetMidi: midiNote, velocity: velocityByteFromProductVelocity(velocity) }, [library]);
  return result.kind === 'hit' ? toSampleAssetDescriptor(result.library, result.sample) : null;
}
