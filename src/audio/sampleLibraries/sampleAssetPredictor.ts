import type {
  NormalizedSampleLibraryManifest,
  SampleSlotId,
  SampleSlotState,
} from './SampleLibraryTypes';
import { SAMPLE_SLOT_IDS } from './SampleLibraryTypes';
import { toSampleAssetDescriptor, type SampleAssetDescriptor } from './sampleAssetDescriptors';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';
import { resolveSample } from './sampleResolver';
import { createLegacyPianoSample1State, readSampleSlotState } from './sampleSlotState';

export interface SampleAssetPredictionInput {
  state: Record<string, unknown>;
  recentMidiBySlot: ReadonlyMap<SampleSlotId, readonly number[]>;
  sequencerLaneRanges: readonly {
    source: string;
    minMidi: number;
    maxMidi: number;
  }[];
  manualPriorityMidi: readonly number[];
  maxAssetsPerSlot?: number;
}

function clampMidi(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(127, Math.round(value)));
}

function addMidi(candidates: number[], value: number | null): void {
  if (value === null || candidates.includes(value)) return;
  candidates.push(value);
}

function numberFromState(state: Record<string, unknown>, key: string): number | null {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nearestRoots(library: NormalizedSampleLibraryManifest, midi: number, count: number): number[] {
  return [...new Set(library.samples.map((sample) => sample.rootMidi))]
    .sort((left, right) => Math.abs(left - midi) - Math.abs(right - midi) || left - right)
    .slice(0, count);
}

function collectCandidateMidi(
  input: SampleAssetPredictionInput,
  slotId: SampleSlotId,
  library: NormalizedSampleLibraryManifest,
): number[] {
  const candidates: number[] = [];
  addMidi(candidates, clampMidi(library.defaultMidi));

  for (const key of [`${slotId}CurrentMidi`, `${slotId}ManualMidi`]) {
    addMidi(candidates, clampMidi(numberFromState(input.state, key) ?? Number.NaN));
  }

  for (const midi of input.manualPriorityMidi) {
    addMidi(candidates, clampMidi(midi));
  }

  for (const midi of input.recentMidiBySlot.get(slotId) ?? []) {
    addMidi(candidates, clampMidi(midi));
  }

  for (const lane of input.sequencerLaneRanges) {
    if (lane.source !== slotId) continue;
    const minMidi = clampMidi(lane.minMidi);
    const maxMidi = clampMidi(lane.maxMidi);
    addMidi(candidates, minMidi);
    addMidi(candidates, maxMidi);
    if (minMidi !== null && maxMidi !== null) {
      addMidi(candidates, clampMidi((minMidi + maxMidi) * 0.5));
    }
  }

  for (const midi of [...candidates]) {
    for (const rootMidi of nearestRoots(library, midi, 3)) {
      addMidi(candidates, clampMidi(rootMidi));
    }
  }

  return candidates;
}

function addPredictedDescriptor(
  descriptors: Map<number, SampleAssetDescriptor>,
  library: NormalizedSampleLibraryManifest,
  slot: SampleSlotState,
  midi: number,
  velocity: number,
): void {
  const result = resolveSample({ slot, targetMidi: midi, velocity }, [library]);
  if (result.kind !== 'hit') return;
  descriptors.set(result.assetId, toSampleAssetDescriptor(result.library, result.sample));
}

function predictSlotAssets(
  slotId: SampleSlotId,
  slot: SampleSlotState,
  input: SampleAssetPredictionInput,
  registry: readonly NormalizedSampleLibraryManifest[],
): SampleAssetDescriptor[] {
  if (!slot.enabled) return [];
  const library = registry.find((candidate) => candidate.libraryKey === slot.libraryKey);
  if (!library) return [];

  const maxAssets = Math.max(1, Math.min(64, Math.round(input.maxAssetsPerSlot ?? 32)));
  const descriptors = new Map<number, SampleAssetDescriptor>();
  const candidates = collectCandidateMidi(input, slotId, library);

  for (const midi of candidates) {
    if (slot.libraryKey === 'piano' && slot.dynamicMode === 'legacy-piano-parity') {
      addPredictedDescriptor(descriptors, library, {
        ...slot,
        role: '',
        dynamicMode: 'fixed',
        fixedDynamic: 'regular',
      }, midi, 100);
      addPredictedDescriptor(descriptors, library, {
        ...slot,
        role: '',
        dynamicMode: 'fixed',
        fixedDynamic: 'short',
      }, midi, 100);
    } else {
      addPredictedDescriptor(descriptors, library, slot, midi, 100);
    }
    if (descriptors.size >= maxAssets) break;
  }

  return [...descriptors.values()].slice(0, maxAssets);
}

export function predictSampleAssets(
  input: SampleAssetPredictionInput,
  registry: readonly NormalizedSampleLibraryManifest[] = getSampleLibraryRegistry(),
): SampleAssetDescriptor[] {
  const descriptors = new Map<number, SampleAssetDescriptor>();
  for (const slotId of SAMPLE_SLOT_IDS) {
    const slot = readSampleSlotState(input.state, slotId);
    for (const descriptor of predictSlotAssets(slotId, slot, input, registry)) {
      descriptors.set(descriptor.assetId, descriptor);
    }
  }
  return [...descriptors.values()];
}

export function predictLegacyPianoSampleAssets(
  state: Record<string, unknown> | null | undefined,
  registry: readonly NormalizedSampleLibraryManifest[] = getSampleLibraryRegistry(),
): SampleAssetDescriptor[] {
  const record = state ?? {};
  const sequencerLaneRanges = [];
  for (let lane = 1; lane <= 4; lane += 1) {
    if (record[`synthEuclid${lane}Enabled`] !== true || record[`synthEuclid${lane}Source`] !== 'piano') {
      continue;
    }
    const minMidi = numberFromState(record, `synthEuclid${lane}NoteMin`);
    const maxMidi = numberFromState(record, `synthEuclid${lane}NoteMax`);
    if (minMidi !== null && maxMidi !== null) {
      sequencerLaneRanges.push({ source: 'sample1', minMidi, maxMidi });
    }
  }
  return predictSampleAssets({
    state: createLegacyPianoSample1State(record),
    recentMidiBySlot: new Map(),
    sequencerLaneRanges,
    manualPriorityMidi: [],
  }, registry);
}
