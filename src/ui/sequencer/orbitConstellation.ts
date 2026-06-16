import {
  TAU,
  orbitHashUnit,
  wrapRadians,
} from './orbitSequencerMath';
import type {
  OrbitConstellationMode,
  OrbitDirection,
  OrbitPitchLayout,
} from './orbitSequencerTypes';

export type { OrbitConstellationMode } from './orbitSequencerTypes';

export interface OrbitConstellationOptions {
  mode: OrbitConstellationMode;
  seed: number;
  nodeCount: number;
  pitchLayout: OrbitPitchLayout;
  pitchRangeMin: number;
  pitchRangeMax: number;
}

export interface OrbitConstellationPoint {
  radiusNorm: number;
  phase: number;
  harmonyDegree: number;
  midiNote: number;
  speedValue?: number;
  direction?: OrbitDirection;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = TAU * (1 - 1 / PHI);
const DEGREE_SEQUENCE = [0, 2, 4, 1, 3, 5, 6] as const;
const PITCH_DEGREE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function safeCount(nodeCount: number): number {
  return Math.max(1, Math.min(32, Math.round(Number.isFinite(nodeCount) ? nodeCount : 1)));
}

function seedRotation(seed: number): number {
  return orbitHashUnit(seed ^ 0x9e3779b9) * TAU;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function pickCoprime(candidates: readonly number[], nodeCount: number, seed: number): number {
  const options = candidates.filter((candidate) => gcd(candidate, nodeCount) === 1);
  const pool = options.length > 0 ? options : candidates;
  const index = Math.floor(orbitHashUnit(seed ^ 0x85ebca6b) * pool.length) % pool.length;
  return pool[index] ?? 1;
}

function modeFromAuto(nodeCount: number): Exclude<OrbitConstellationMode, 'auto'> {
  const count = safeCount(nodeCount);
  if (count <= 5) return 'euclidean';
  if (count <= 8) return 'harmonicRose';
  if (count <= 13) return 'golden';
  if (count <= 21) return 'fibonacci';
  return 'pythagorean';
}

function midiForDegree(degree: number, options: OrbitConstellationOptions): number {
  const min = clamp(options.pitchRangeMin, 0, 127);
  const max = clamp(options.pitchRangeMax, min, 127);
  const base = options.pitchLayout === 'harmonyBloom' ? min : Math.max(min, Math.min(max, 60));
  const octave = Math.floor(Math.max(0, degree) / PITCH_DEGREE_OFFSETS.length) * 12;
  const offset = PITCH_DEGREE_OFFSETS[((degree % PITCH_DEGREE_OFFSETS.length) + PITCH_DEGREE_OFFSETS.length) % PITCH_DEGREE_OFFSETS.length] ?? 0;
  return Math.round(clamp(base + octave + offset, min, max));
}

function point(radiusNorm: number, phase: number, harmonyDegree: number, options: OrbitConstellationOptions): OrbitConstellationPoint {
  return {
    radiusNorm: clamp(radiusNorm, 0.08, 1),
    phase: wrapRadians(phase),
    harmonyDegree,
    midiNote: midiForDegree(harmonyDegree, options),
  };
}

function goldenPoints(options: OrbitConstellationOptions, fibonacci = false): OrbitConstellationPoint[] {
  const count = safeCount(options.nodeCount);
  const rotation = seedRotation(options.seed);
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 0.5) / count;
    const spiralTurns = fibonacci ? 1.45 : 1;
    const shellLift = fibonacci ? 0.035 * Math.sin(t * TAU * 3) : 0;
    const radiusNorm = 0.12 + 0.84 * Math.pow(t, fibonacci ? 0.72 : 0.5) + shellLift;
    return point(
      radiusNorm,
      rotation + index * GOLDEN_ANGLE * spiralTurns,
      DEGREE_SEQUENCE[index % DEGREE_SEQUENCE.length] ?? 0,
      options,
    );
  });
}

function pythagoreanPoints(options: OrbitConstellationOptions): OrbitConstellationPoint[] {
  const count = safeCount(options.nodeCount);
  const rotation = seedRotation(options.seed);
  const ringCount = count <= 8 ? 2 : count <= 21 ? 3 : 4;
  const spokes = Math.ceil(count / ringCount);
  return Array.from({ length: count }, (_, index) => {
    const ring = index % ringCount;
    const spoke = Math.floor(index / ringCount);
    const ringPhase = ringCount > 1 ? ring / (ringCount - 1) : 0;
    return point(
      0.24 + 0.68 * ringPhase,
      rotation + (spoke * TAU) / Math.max(1, spokes) + (ring * TAU) / Math.max(4, spokes * 2),
      (spoke * 2 + ring) % 7,
      options,
    );
  });
}

function harmonicRosePoints(options: OrbitConstellationOptions): OrbitConstellationPoint[] {
  const count = safeCount(options.nodeCount);
  const rotation = seedRotation(options.seed);
  const lobes = pickCoprime([3, 5, 7, 8, 13], count, options.seed);
  return Array.from({ length: count }, (_, index) => {
    const theta = rotation + (index * TAU) / count;
    const petal = Math.pow(Math.abs(Math.cos((lobes * theta) / 2)), 0.75);
    return point(
      0.22 + 0.76 * petal,
      theta + 0.05 * Math.sin((lobes + 1) * theta),
      (index * 2 + lobes) % 7,
      options,
    );
  });
}

function euclideanPoints(options: OrbitConstellationOptions): OrbitConstellationPoint[] {
  const count = safeCount(options.nodeCount);
  const rotation = seedRotation(options.seed);
  const step = pickCoprime([2, 3, 5, 7, 11, 13], count, options.seed);
  return Array.from({ length: count }, (_, index) => {
    const position = (index * step) % count;
    const inner = count <= 5 ? 0.34 : 0.42;
    const outer = count <= 5 ? 0.92 : 0.88;
    const accent = (position % 3) * 0.018;
    return point(
      (index % 2 === 0 ? outer : inner) + accent,
      rotation + (position * TAU) / count,
      (index * step) % 7,
      options,
    );
  });
}

export function generateOrbitConstellation(options: OrbitConstellationOptions): OrbitConstellationPoint[] {
  const mode = options.mode === 'auto' ? modeFromAuto(options.nodeCount) : options.mode;
  switch (mode) {
    case 'fibonacci':
      return goldenPoints(options, true);
    case 'pythagorean':
      return pythagoreanPoints(options);
    case 'harmonicRose':
      return harmonicRosePoints(options);
    case 'euclidean':
      return euclideanPoints(options);
    case 'golden':
    default:
      return goldenPoints(options);
  }
}
