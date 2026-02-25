import type { DrumVoiceType } from './drumSynth';

export type ClockDivision = '1/4' | '1/8' | '1/16' | '1/8T';
export type LaneDirection = 'forward' | 'reverse' | 'pingpong';
export type PitchMode = 'semitones' | 'notes';

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

/** Elektron-style trig condition: [n, N] means fire on nth of every N cycles */
export type TrigCondition = [number, number];

/**
 * Full step override data bridged from UI sequencer to audio engine scheduler.
 * Each array is per-lane (4 lanes). Null means "use defaults" for that lane.
 */
export interface DrumStepOverrides {
  triggerToggles: Set<number>[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: (TrigCondition[] | null)[];
  expression: (number[] | null)[];
  morph: (number[] | null)[];
  distance: (number[] | null)[];
  /** Per-lane sub-lane directions (expression, morph, distance, pitch) */
  expressionDirection: (LaneDirection | null)[];
  morphDirection: (LaneDirection | null)[];
  distanceDirection: (LaneDirection | null)[];
  pitchDirection: (LaneDirection | null)[];
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
  };
  expression: {
    velocities: number[];
  };
  morph: {
    values: number[];
  };
  distance: {
    values: number[];
  };
  swing: number;
}

export interface EvolveState {
  enabled: boolean;
  everyBars: number;
  intensity: number;
  lastEvolveBar: number;
  methods: Record<string, boolean>;
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
