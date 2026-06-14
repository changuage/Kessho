import type { HarmonyState } from '../../audio/harmony';
import type { AnchorWalkerLayerConfig, AnchorWalkerSnapSource, WalkerBoundaryMode } from './anchorWalkerTypes';

export const CHROMATIC_PITCH_CLASS_MASK = 0x0fff;

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pitchClass(value: number): number {
  return ((Math.round(value) % 12) + 12) % 12;
}

export function pitchClassMaskToPitchClasses(mask: number): number[] {
  const safeMask = Number.isFinite(mask) ? Math.round(mask) : CHROMATIC_PITCH_CLASS_MASK;
  const result: number[] = [];
  for (let pitch = 0; pitch < 12; pitch += 1) {
    if ((safeMask & (1 << pitch)) !== 0) result.push(pitch);
  }
  return result.length > 0 ? result : Array.from({ length: 12 }, (_, index) => index);
}

export function pitchClassesToMask(pitchClasses: readonly number[]): number {
  let mask = 0;
  for (const value of pitchClasses) {
    if (!Number.isFinite(value)) continue;
    mask |= 1 << pitchClass(value);
  }
  return mask || CHROMATIC_PITCH_CLASS_MASK;
}

export function formatMidiNoteName(midi: number): string {
  const safeMidi = clamp(Math.round(midi), 0, 127);
  return `${NOTE_NAMES[pitchClass(safeMidi)] ?? 'C'}${Math.floor(safeMidi / 12) - 1}`;
}

export function formatPitchClassName(value: number): string {
  return NOTE_NAMES[pitchClass(value)] ?? 'C';
}

export function buildPitchLattice(
  anchorMidi: number,
  snapMask: number,
  minMidi: number,
  maxMidi: number,
): number[] {
  const min = clamp(Math.floor(Math.min(minMidi, maxMidi)), 0, 127);
  const max = clamp(Math.ceil(Math.max(minMidi, maxMidi)), min, 127);
  const allowed = new Set(pitchClassMaskToPitchClasses(snapMask));
  const lattice: number[] = [];
  for (let midi = min; midi <= max; midi += 1) {
    if (allowed.has(pitchClass(midi))) lattice.push(midi);
  }
  if (lattice.length > 0) return lattice;
  const safeAnchor = clamp(Math.round(anchorMidi), min, max);
  return [safeAnchor];
}

export function findNearestLatticeIndex(lattice: readonly number[], midi: number): number {
  if (lattice.length === 0) return 0;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lattice.length; index += 1) {
    const distance = Math.abs((lattice[index] ?? 0) - midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function degreeToMidi(cursorDegree: number, lattice: readonly number[], anchorMidi = 60): number {
  return degreeToMidiBounded(cursorDegree, lattice, anchorMidi, 'clamp');
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function applyBoundaryIndex(index: number, length: number, boundaryMode: WalkerBoundaryMode): number {
  if (length <= 1) return 0;
  if (boundaryMode === 'wrap') return positiveModulo(index, length);
  if (boundaryMode === 'fold') {
    const period = (length - 1) * 2;
    const folded = positiveModulo(index, period);
    return folded <= length - 1 ? folded : period - folded;
  }
  return clamp(index, 0, length - 1);
}

export function degreeToMidiBounded(
  cursorDegree: number,
  lattice: readonly number[],
  anchorMidi = 60,
  boundaryMode: WalkerBoundaryMode = 'fold',
): number {
  if (lattice.length === 0) return clamp(Math.round(anchorMidi), 0, 127);
  const anchorIndex = findNearestLatticeIndex(lattice, anchorMidi);
  const index = applyBoundaryIndex(anchorIndex + Math.round(cursorDegree), lattice.length, boundaryMode);
  return lattice[index] ?? lattice[anchorIndex] ?? clamp(Math.round(anchorMidi), 0, 127);
}

export function gestureMidiToDelta(anchorMidi: number, gestureMidi: number, snapMask: number): number {
  const min = clamp(Math.min(anchorMidi, gestureMidi) - 36, 0, 127);
  const max = clamp(Math.max(anchorMidi, gestureMidi) + 36, 0, 127);
  const lattice = buildPitchLattice(anchorMidi, snapMask, min, max);
  const anchorIndex = findNearestLatticeIndex(lattice, anchorMidi);
  const gestureIndex = findNearestLatticeIndex(lattice, gestureMidi);
  const delta = gestureIndex - anchorIndex;
  if (delta === 0) return gestureMidi >= anchorMidi ? 1 : -1;
  return clamp(delta, -7, 7);
}

export function snapMidiToMask(midi: number, snapMask: number, minMidi = 0, maxMidi = 127): number {
  const lattice = buildPitchLattice(midi, snapMask, minMidi, maxMidi);
  return lattice[findNearestLatticeIndex(lattice, midi)] ?? clamp(Math.round(midi), 0, 127);
}

export function applyLayer(
  baseMidi: number,
  layer: AnchorWalkerLayerConfig,
  snapMask: number,
  anchorMidi = baseMidi,
  minMidi = 0,
  maxMidi = 127,
): number {
  if (layer.tuning === 'diatonicOffset') {
    const lattice = buildPitchLattice(anchorMidi, snapMask, minMidi, maxMidi);
    const baseIndex = findNearestLatticeIndex(lattice, baseMidi);
    const index = clamp(baseIndex + Math.round(layer.diatonicOffset), 0, Math.max(0, lattice.length - 1));
    return lattice[index] ?? baseMidi;
  }
  const transposed = baseMidi + Math.round(layer.transposeSemitones);
  if (layer.tuning === 'snapAfterTranspose') {
    return snapMidiToMask(transposed, snapMask, minMidi, maxMidi);
  }
  return clamp(Math.round(transposed), 0, 127);
}

export function applyLayerBounded(
  baseMidi: number,
  layer: AnchorWalkerLayerConfig,
  snapMask: number,
  anchorMidi = baseMidi,
  minMidi = 0,
  maxMidi = 127,
  boundaryMode: WalkerBoundaryMode = 'fold',
): number {
  if (layer.tuning === 'diatonicOffset') {
    const lattice = buildPitchLattice(anchorMidi, snapMask, minMidi, maxMidi);
    const baseIndex = findNearestLatticeIndex(lattice, baseMidi);
    const index = applyBoundaryIndex(
      baseIndex + Math.round(layer.diatonicOffset),
      lattice.length,
      boundaryMode,
    );
    return lattice[index] ?? baseMidi;
  }
  const transposed = baseMidi + Math.round(layer.transposeSemitones);
  if (layer.tuning === 'snapAfterTranspose') {
    return snapMidiToMask(clamp(Math.round(transposed), 0, 127), snapMask, minMidi, maxMidi);
  }
  return clamp(Math.round(transposed), 0, 127);
}

export function resolveHarmonySnapMask(harmonyState?: HarmonyState | null): number {
  const root = typeof harmonyState?.effectiveRoot === 'number' ? pitchClass(harmonyState.effectiveRoot) : 0;
  const intervals = harmonyState?.scaleFamily?.intervals ?? [0, 2, 4, 5, 7, 9, 11];
  return pitchClassesToMask(intervals.map((interval) => root + interval));
}

export function resolveAnchorWalkerSnapMask(args: {
  snapSource: AnchorWalkerSnapSource;
  customPitchClasses: readonly number[];
  harmonyState?: HarmonyState | null;
}): number {
  if (args.snapSource === 'customPitchClasses') {
    return pitchClassesToMask(args.customPitchClasses);
  }
  return resolveHarmonySnapMask(args.harmonyState);
}
