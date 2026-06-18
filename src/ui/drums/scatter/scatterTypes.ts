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
  feelX: number;
  feelY: number;
  rules: ScatterRuleState;
}

export interface SeqScatterState {
  active: boolean;
  selectedEngine: DrumVoiceType;
  engines: Record<DrumVoiceType, EngineScatterState>;
  recentPhrasesByEngine: Record<DrumVoiceType, GeneratedDrumPhrase[]>;
  pinnedPhrases: GeneratedDrumPhrase[];
}

export type ScatterFeelZone = 'pulse' | 'gesture' | 'wave' | 'fracture' | 'scatter';
export type ScatterContour = 'flat' | 'rise' | 'fall' | 'wave' | 'zigzag' | 'randomWalk' | 'scatter';

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
  slice: number[];
  reverse: number[];
  directions: {
    pitch: LaneDirection;
    expression: LaneDirection;
    morph: LaneDirection;
    distance: LaneDirection;
    slice: LaneDirection;
    reverse: LaneDirection;
  };
  subLaneEnabled: {
    pitch: boolean;
    expression: boolean;
    morph: boolean;
    distance: boolean;
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
    contour: ScatterContour;
    hasRatchet: boolean;
    hasSlice: boolean;
    hasReverse: boolean;
  };
}
