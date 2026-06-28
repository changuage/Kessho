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
  seed?: number;
  roundRobinIndex?: number;
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

function hashU32(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d) >>> 0;
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b) >>> 0;
  result ^= result >>> 16;
  return result >>> 0;
}

function chooseVariantCandidate(
  candidates: readonly NormalizedSampleDescriptor[],
  slot: SampleSlotState,
  targetMidi: number,
  velocity: number,
  seed: number | undefined,
  roundRobinIndex: number | undefined,
): NormalizedSampleDescriptor | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((left, right) => compareNearest(left, right, targetMidi));
  const best = sorted[0];
  if (!best) return null;
  const bestDistance = Math.abs(best.rootMidi - targetMidi);
  const tied = sorted.filter((sample) => Math.abs(sample.rootMidi - targetMidi) === bestDistance);
  if (tied.length <= 1 || slot.variantMode === 'stable') return tied[0] ?? best;
  const index = slot.variantMode === 'round-robin'
    ? Math.abs(Math.round(roundRobinIndex ?? 0)) % tied.length
    : hashU32((Math.round(seed ?? 1) >>> 0) ^ (targetMidi << 8) ^ velocity) % tied.length;
  return tied[index] ?? tied[0] ?? best;
}

function selectByNote(
  samples: readonly NormalizedSampleDescriptor[],
  mode: SampleSlotState['selectionMode'],
  targetMidi: number,
  slot: SampleSlotState,
  velocity: number,
  seed: number | undefined,
  roundRobinIndex: number | undefined,
): NormalizedSampleDescriptor | null {
  if (mode === 'exact') {
    return chooseVariantCandidate(
      samples.filter((sample) => sample.rootMidi === targetMidi),
      slot,
      targetMidi,
      velocity,
      seed,
      roundRobinIndex,
    );
  }
  if (mode === 'mapped') {
    const mapped = samples.filter((sample) => sample.loMidi <= targetMidi && targetMidi <= sample.hiMidi);
    if (mapped.length > 0) {
      return chooseVariantCandidate(mapped, slot, targetMidi, velocity, seed, roundRobinIndex);
    }
  }
  return chooseVariantCandidate(samples, slot, targetMidi, velocity, seed, roundRobinIndex);
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

  const sample = selectByNote(
    dynamicSamples,
    input.slot.selectionMode,
    targetMidi,
    input.slot,
    velocity,
    input.seed,
    input.roundRobinIndex,
  );
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
