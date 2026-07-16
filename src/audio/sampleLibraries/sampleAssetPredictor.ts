import type {
  NormalizedSampleDescriptor,
  NormalizedSampleLibraryManifest,
  SampleSlotId,
  SampleSlotState,
} from './SampleLibraryTypes';
import { SAMPLE_SLOT_IDS } from './SampleLibraryTypes';
import { toSampleAssetDescriptor, type SampleAssetDescriptor } from './sampleAssetDescriptors';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';
import { resolveSample } from './sampleResolver';
import { readSampleSlotState } from './sampleSlotState';

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

function scopedSamples(
  library: NormalizedSampleLibraryManifest,
  slot: SampleSlotState,
): readonly NormalizedSampleDescriptor[] {
  return library.samples.filter((sample) => (
    (slot.role.length === 0 || sample.role === slot.role) &&
    (slot.articulation.length === 0 || sample.articulation === slot.articulation)
  ));
}

function laneMappedRoots(
  library: NormalizedSampleLibraryManifest,
  slot: SampleSlotState,
  minMidi: number,
  maxMidi: number,
): number[] {
  const low = Math.min(minMidi, maxMidi);
  const high = Math.max(minMidi, maxMidi);
  const midpoint = (low + high) * 0.5;
  const roots = new Set<number>();
  for (const sample of scopedSamples(library, slot)) {
    if (slot.selectionMode === 'mapped') {
      if (sample.loMidi <= high && low <= sample.hiMidi) roots.add(sample.rootMidi);
    } else if (sample.rootMidi >= low && sample.rootMidi <= high) {
      roots.add(sample.rootMidi);
    }
  }
  return [...roots].sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint) || left - right);
}

function collectCandidateMidi(
  input: SampleAssetPredictionInput,
  slotId: SampleSlotId,
  slot: SampleSlotState,
  library: NormalizedSampleLibraryManifest,
): number[] {
  const candidates: number[] = [];
  addMidi(candidates, clampMidi(library.defaultMidi));

  for (const midi of library.recommendedPreloadMidi) {
    addMidi(candidates, clampMidi(midi));
  }

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
      for (const midi of laneMappedRoots(library, slot, minMidi, maxMidi)) {
        addMidi(candidates, clampMidi(midi));
      }
    }
  }

  for (const midi of [...candidates]) {
    for (const rootMidi of nearestRoots(library, midi, 3)) {
      addMidi(candidates, clampMidi(rootMidi));
    }
  }

  return candidates;
}

function representativeVelocity(min: number, max: number): number {
  return Math.max(0, Math.min(127, Math.round((min + max) * 0.5)));
}

function velocityCandidatesForSlot(
  library: NormalizedSampleLibraryManifest,
  slot: SampleSlotState,
): number[] {
  if (slot.libraryKey === 'piano' && slot.dynamicMode === 'legacy-piano-parity') return [100];
  if (slot.dynamicMode === 'fixed') return [100];

  const velocities = new Set<number>();
  for (const sample of scopedSamples(library, slot)) {
    velocities.add(representativeVelocity(sample.velocityMin, sample.velocityMax));
  }
  if (velocities.size === 0) velocities.add(100);
  return [...velocities].sort((left, right) => left - right);
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

  const maxAssets = Math.max(
    1,
    Math.min(library.samples.length, Math.round(input.maxAssetsPerSlot ?? library.samples.length)),
  );
  const descriptors = new Map<number, SampleAssetDescriptor>();
  const candidates = collectCandidateMidi(input, slotId, slot, library);
  const velocities = velocityCandidatesForSlot(library, slot);

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
      for (const velocity of velocities) {
        addPredictedDescriptor(descriptors, library, slot, midi, velocity);
        if (descriptors.size >= maxAssets) break;
      }
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
