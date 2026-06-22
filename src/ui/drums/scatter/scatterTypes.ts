import type { ClockDivision, LaneDirection, TrigCondition } from '../../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import type { TriggerClip } from '../../sequencer/triggerClip';

export interface ScatterRuleState {
  anchor: number;
  breath: number;
  memory: number;
  motion: number;
  fracture: number;
  spread: number;
}

export interface EngineScatterState {
  enabled: boolean;
  triggerProbability: number;
  burstProbability: number;
  randomWalk?: number;
  randomWalkEnabled?: boolean;
  feelX: number;
  feelY: number;
  rules: ScatterRuleState;
}

export interface SeqScatterState {
  active: boolean;
  selectedEngine: DrumVoiceType;
  engines: Record<DrumVoiceType, EngineScatterState>;
  recentPhrasesByEngine: Record<DrumVoiceType, GeneratedDrumPhrase[]>;
}

export type ScatterFeelZone = 'pulse' | 'gesture' | 'wave' | 'fracture' | 'scatter';
export type ScatterContour =
  | 'linear'
  | 'exponential'
  | 'logarithmic'
  | 'stepped'
  | 'wave'
  | 'randomWalk'
  | 'scatter';

export interface GeneratedDrumPhrase {
  id: string;
  seed: number;
  createdAt: number;
  engine: DrumVoiceType;
  label: string;
  triggerClip: TriggerClip;
  clockDiv: ClockDivision;
  swing: number;
  probability: number[];
  ratchet: number[];
  trigCondition: TrigCondition[];
  pitch: number[];
  expression: number[];
  morph: number[];
  distance: number[];
  nudge: number[];
  slice: number[];
  reverse: number[];
  directions: {
    pitch: LaneDirection;
    expression: LaneDirection;
    morph: LaneDirection;
    distance: LaneDirection;
    nudge: LaneDirection;
    slice: LaneDirection;
    reverse: LaneDirection;
  };
  subLaneEnabled: {
    pitch: boolean;
    expression: boolean;
    morph: boolean;
    distance: boolean;
    nudge: boolean;
    slice: boolean;
    reverse: boolean;
  };
  feel: {
    x: number;
    y: number;
    chaos: number;
    zone: ScatterFeelZone;
  };
  summary: {
    steps: number;
    hits: number;
    rotation?: number;
    contour: ScatterContour;
    hasRatchet: boolean;
    hasSlice: boolean;
    hasReverse: boolean;
  };
}
