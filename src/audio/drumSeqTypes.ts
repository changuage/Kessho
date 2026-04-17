import type { DrumEvolveMethod, DrumVoiceType } from './drumSynth';

export type ClockDivision = '1/4' | '1/4T' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32' | '1/32T' | '1/64';
export type LaneDirection = 'forward' | 'reverse' | 'pingpong';
export type PitchMode = 'semitones' | 'notes' | 'noteRange';
export type PitchBindingMode = 'polyrhythmic' | 'linked' | 'sequence';

export type ScaleName =
  | 'Chromatic'
  | 'Major'
  | 'Minor'
  | 'Dorian'
  | 'Phrygian'
  | 'Lydian'
  | 'Mixolydian'
  | 'Locrian'
  | 'Pentatonic'
  | 'Min Penta'
  | 'Blues'
  | 'Harmonic Minor'
  | 'Melodic Minor'
  | 'Whole Tone'
  | 'Diminished'
  | 'Augmented'
  | 'Hungarian Minor'
  | 'Japanese'
  | 'Arabic';

export const NOTE_DEGREE_OFFSET_MIN = -3;
export const NOTE_DEGREE_OFFSET_MAX = 14;
export const NOTE_DEGREE_OFFSET_RANGE = NOTE_DEGREE_OFFSET_MAX - NOTE_DEGREE_OFFSET_MIN;

export function normalizeNoteDegreeOffset(offset: number): number {
  return Math.max(0, Math.min(1, (offset - NOTE_DEGREE_OFFSET_MIN) / NOTE_DEGREE_OFFSET_RANGE));
}

export function scaleDegreeToSemitone(degree: number, scale: number[]): number {
  if (scale.length === 0) return 0;
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return oct * 12 + (scale[idx] ?? 0);
}

/** Elektron-style trig condition: [n, N] means fire on nth of every N cycles */
export type TrigCondition = [number, number];

/**
 * Full step override data bridged from UI sequencer to audio engine scheduler.
 * Each array is per-lane (4 lanes). Null means "use defaults" for that lane.
 */
export interface DrumStepOverrides {
  triggerToggles: Map<number, boolean>[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: (TrigCondition[] | null)[];
  expression: (number[] | null)[];
  pitch: (number[] | null)[];
  morph: (number[] | null)[];
  distance: (number[] | null)[];
  slice: (number[] | null)[];
  reverse: (number[] | null)[];
  /** Per-lane sub-lane directions (expression, morph, distance, pitch, slice, reverse) */
  expressionDirection: (LaneDirection | null)[];
  morphDirection: (LaneDirection | null)[];
  distanceDirection: (LaneDirection | null)[];
  pitchDirection: (LaneDirection | null)[];
  sliceDirection: (LaneDirection | null)[];
  reverseDirection: (LaneDirection | null)[];
}

export interface TriggerLane {
  enabled: boolean;
  steps: number;
  hits: number;
  rotation: number;
  pattern: boolean[];
  overrides: Set<number>;
  probability: number[];
  ratchet: number[];
  trigCondition: TrigCondition[];
}

export interface SubLane {
  enabled: boolean;
  steps: number;
  direction: LaneDirection;
  _ppForward: boolean;
}

export interface PitchLane extends SubLane {
  offsets: number[];
  mode: PitchMode;
  root: number;
  scale: ScaleName;
  scaleQuantize: boolean;
}

export interface ExpressionLane extends SubLane {
  velocities: number[];
}

export interface MorphLane extends SubLane {
  values: number[];
}

export interface DistanceLane extends SubLane {
  values: number[];
}

export interface SliceLane extends SubLane {
  values: number[];  // 0-15 slice index per step
}

export interface ReverseLane extends SubLane {
  values: number[];  // 0 = forward, 1 = reverse per step
}

export interface SequencerSnapshot {
  trigger: {
    steps: number;
    hits: number;
    rotation: number;
    probability: number[];
    ratchet: number[];
    pattern: boolean[];
  };
  pitch: {
    offsets: number[];
    root: number;
    scale: ScaleName;
    steps: number;
    direction: LaneDirection;
  };
  expression: {
    velocities: number[];
    steps: number;
    direction: LaneDirection;
  };
  morph: {
    values: number[];
    steps: number;
    direction: LaneDirection;
  };
  distance: {
    values: number[];
    steps: number;
    direction: LaneDirection;
  };
  slice: {
    values: number[];
    steps: number;
    direction: LaneDirection;
  };
  reverse: {
    values: number[];
    steps: number;
    direction: LaneDirection;
  };
  swing: number;
}

export interface EvolveState {
  enabled: boolean;
  everyBars: number;
  evolution: number;
  writeOffset: number | 'auto';
  mutationMode: 'strict' | 'biased';
  lastEvolveBar: number;
  methods: Record<DrumEvolveMethod, boolean>;
  home: SequencerSnapshot | null;
}

export interface SequencerState {
  id: number;
  rng: () => number;
  color: string;
  name: string;
  muted: boolean;
  solo: boolean;
  clockDiv: ClockDivision;
  swing: number;
  sources: Record<DrumVoiceType, boolean>;
  trigger: TriggerLane;
  pitch: PitchLane;
  expression: ExpressionLane;
  morph: MorphLane;
  distance: DistanceLane;
  slice: SliceLane;
  reverse: ReverseLane;
  stepIndex: number;
  hitCount: number;
  nextTime: number;
  lastDisplayStep: number;
  totalStepCount: number;
  linked: boolean;
  evolve: EvolveState;
}

export const SCALES: Record<ScaleName, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  Pentatonic: [0, 2, 4, 7, 9],
  'Min Penta': [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Melodic Minor': [0, 2, 3, 5, 7, 9, 11],
  'Whole Tone': [0, 2, 4, 6, 8, 10],
  Diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  Augmented: [0, 3, 4, 7, 8, 11],
  'Hungarian Minor': [0, 2, 3, 6, 7, 8, 11],
  Japanese: [0, 1, 5, 7, 8],
  Arabic: [0, 1, 4, 5, 7, 8, 11],
};
