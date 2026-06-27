import { choosePianoSampleVariant } from '../pianoSamples';
import type {
  NormalizedSampleDescriptor,
  NormalizedSampleLibraryManifest,
  SampleDynamicKey,
  SampleSlotState,
} from './SampleLibraryTypes';
import { getSampleLibraryRegistry } from './sampleLibraryRegistry';

export interface SampleResolveInput {
  slot: SampleSlotState;
  targetMidi: number;
  velocity: number;
}

export type SampleResolveMissReason =
  | 'slot-disabled'
  | 'library-not-found'
  | 'no-role-match'
  | 'no-articulation-match'
  | 'no-dynamic-match'
  | 'no-note-match';

export type SampleResolveResult =
  | {
      kind: 'hit';
      library: NormalizedSampleLibraryManifest;
      sample: NormalizedSampleDescriptor;
      assetId: number;
      sampleId: string;
      rootMidi: number;
      targetMidi: number;
      playbackRate: number;
      dynamic: SampleDynamicKey;
      loopEnabled: boolean;
      encodedLoopStartFrame: number;
      encodedLoopEndFrame: number;
    }
  | {
      kind: 'miss';
      reason: SampleResolveMissReason;
    };

function clampMidi(value: number): number {
  if (!Number.isFinite(value)) return 60;
  return Math.max(0, Math.min(127, Math.round(value)));
}

function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(127, Math.round(value)));
}

function compareNearest(left: NormalizedSampleDescriptor, right: NormalizedSampleDescriptor, targetMidi: number): number {
  const leftDistance = Math.abs(left.rootMidi - targetMidi);
  const rightDistance = Math.abs(right.rootMidi - targetMidi);
  return leftDistance - rightDistance ||
    left.rootMidi - right.rootMidi ||
    left.assetId - right.assetId ||
    left.sampleId.localeCompare(right.sampleId);
}

function nearestSample(
  samples: readonly NormalizedSampleDescriptor[],
  targetMidi: number,
): NormalizedSampleDescriptor | null {
  return [...samples].sort((left, right) => compareNearest(left, right, targetMidi))[0] ?? null;
}

function selectByNote(
  samples: readonly NormalizedSampleDescriptor[],
  mode: SampleSlotState['selectionMode'],
  targetMidi: number,
): NormalizedSampleDescriptor | null {
  if (mode === 'exact') {
    return samples.find((sample) => sample.rootMidi === targetMidi) ?? null;
  }
  if (mode === 'mapped') {
    const mapped = samples.filter((sample) => sample.loMidi <= targetMidi && targetMidi <= sample.hiMidi);
    if (mapped.length > 0) return nearestSample(mapped, targetMidi);
  }
  return nearestSample(samples, targetMidi);
}

function filterByDynamic(
  samples: readonly NormalizedSampleDescriptor[],
  slot: SampleSlotState,
  targetMidi: number,
  velocity: number,
): readonly NormalizedSampleDescriptor[] {
  if (slot.dynamicMode === 'legacy-piano-parity') {
    const variant = choosePianoSampleVariant(targetMidi, velocity / 127);
    return samples.filter((sample) => sample.dynamic === variant);
  }
  if (slot.dynamicMode === 'fixed') {
    return samples.filter((sample) => sample.dynamic === slot.fixedDynamic);
  }
  return samples.filter((sample) => sample.velocityMin <= velocity && velocity <= sample.velocityMax);
}

export function resolveSample(
  input: SampleResolveInput,
  registry: readonly NormalizedSampleLibraryManifest[] = getSampleLibraryRegistry(),
): SampleResolveResult {
  if (!input.slot.enabled) return { kind: 'miss', reason: 'slot-disabled' };

  const targetMidi = clampMidi(input.targetMidi);
  const velocity = clampVelocity(input.velocity);
  const library = registry.find((candidate) => candidate.libraryKey === input.slot.libraryKey);
  if (!library) return { kind: 'miss', reason: 'library-not-found' };

  const roleSamples = input.slot.role.length > 0
    ? library.samples.filter((sample) => sample.role === input.slot.role)
    : library.samples;
  if (roleSamples.length === 0) return { kind: 'miss', reason: 'no-role-match' };

  const articulationSamples = input.slot.articulation.length > 0
    ? roleSamples.filter((sample) => sample.articulation === input.slot.articulation)
    : roleSamples;
  if (articulationSamples.length === 0) return { kind: 'miss', reason: 'no-articulation-match' };

  const dynamicSamples = filterByDynamic(articulationSamples, input.slot, targetMidi, velocity);
  if (dynamicSamples.length === 0) return { kind: 'miss', reason: 'no-dynamic-match' };

  const sample = selectByNote(dynamicSamples, input.slot.selectionMode, targetMidi);
  if (!sample) return { kind: 'miss', reason: 'no-note-match' };

  const playbackRate = 2 ** ((targetMidi - sample.rootMidi) / 12);
  const loopEnabled = input.slot.loopEnabled && sample.loop !== null;
  return {
    kind: 'hit',
    library,
    sample,
    assetId: sample.assetId,
    sampleId: sample.sampleId,
    rootMidi: sample.rootMidi,
    targetMidi,
    playbackRate,
    dynamic: sample.dynamic,
    loopEnabled,
    encodedLoopStartFrame: loopEnabled ? sample.loop?.encodedStartFrame ?? 0 : 0,
    encodedLoopEndFrame: loopEnabled ? sample.loop?.encodedEndFrame ?? 0 : 0,
  };
}
