import type { DrumVoiceType } from './drumSynth';
import type {
  ClockDivision,
  LaneDirection,
  SequencerState,
  SubLane,
} from './drumSeqTypes';
import {
  DRUM_EUCLID_PRESET_DATA,
  resolveEuclidPatternParams,
  seqEuclidean,
} from './euclideanPatterns';

export { DRUM_EUCLID_PRESET_DATA, seqEuclidean };

export function resolveDrumEuclidPatternParams(
  preset: string,
  steps: number,
  hits: number,
  rotation: number,
): { steps: number; hits: number; rotation: number } {
  return resolveEuclidPatternParams(preset, steps, hits, rotation);
}

import { createRng as createSeededRng } from './rng';
export { createSeededRng };

export function seqPickVoice(s: SequencerState): DrumVoiceType | null {
  const enabled = (Object.keys(s.sources) as DrumVoiceType[]).filter((v) => s.sources[v]);
  if (enabled.length === 0) return null;
  const index = Math.floor(s.rng() * enabled.length);
  return enabled[Math.max(0, Math.min(enabled.length - 1, index))] ?? null;
}

/**
 * Returns the sub-lane index for the current hit.
 * Matches prototype: sub-lanes advance per trigger hit, indexed by hitCount.
 */
export function seqLaneIndex(
  lane: SubLane,
  hitCount: number,
): number {
  const n = lane.steps;
  if (n <= 1) return 0;
  const dir = lane.direction || 'forward';
  if (dir === 'forward') return hitCount % n;
  if (dir === 'reverse') return (n - 1) - (hitCount % n);
  // pingpong: 0,1,...,n-1,n-2,...,1,0,1,...  cycle length = 2*(n-1)
  const cycle = 2 * (n - 1);
  const pos = hitCount % cycle;
  return pos < n ? pos : cycle - pos;
}

function defaultSources(id: number): Record<DrumVoiceType, boolean> {
  return {
    sub: false,
    kick: id === 0,
    click: id === 2,
    beepHi: id === 1,
    beepLo: false,
    noise: id === 3,
    membrane: false,
  };
}

function defaultClockDiv(id: number): ClockDivision {
  if (id === 0) return '1/8';
  if (id === 1) return '1/16';
  if (id === 2) return '1/8T';
  return '1/4';
}

function defaultStepsHits(id: number): { steps: number; hits: number } {
  if (id === 0) return { steps: 8, hits: 5 };
  if (id === 1) return { steps: 16, hits: 3 };
  if (id === 2) return { steps: 12, hits: 5 };
  return { steps: 8, hits: 3 };
}

function defaultDirection(): LaneDirection {
  return 'forward';
}

export function createSequencer(id: number, seed = 'drum-seq'): SequencerState {
  const { steps, hits } = defaultStepsHits(id);
  const pattern = seqEuclidean(steps, hits, 0);
  const stepCount = 16;
  const makeArray = (len: number, fill: number) => new Array(len).fill(fill);

  return {
    id,
    rng: createSeededRng(`${seed}-${id}`),
    color: ['#ef4444', '#f97316', '#22c55e', '#8b5cf6'][id] ?? '#a855f7',
    name: `Seq ${id + 1}`,
    muted: false,
    solo: false,
    clockDiv: defaultClockDiv(id),
    swing: 0,
    sources: defaultSources(id),
    trigger: {
      enabled: true,
      steps,
      hits,
      rotation: 0,
      pattern,
      overrides: new Set<number>(),
      probability: makeArray(stepCount, 1),
      ratchet: makeArray(stepCount, 1),
      trigCondition: new Array(stepCount).fill([1, 1] as [number, number]),
    },
    pitch: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      offsets: makeArray(stepCount, 0),
      mode: 'semitones',
      root: 60,
      scale: 'Chromatic',
      scaleQuantize: false,
    },
    expression: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      velocities: makeArray(stepCount, 0.8),
    },
    morph: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      values: makeArray(stepCount, 0),
    },
    distance: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      values: makeArray(stepCount, 0.5),
    },
    slice: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      values: makeArray(stepCount, 0),
    },
    reverse: {
      enabled: false,
      steps: stepCount,
      direction: defaultDirection(),
      _ppForward: true,
      values: makeArray(stepCount, 0),
    },
    stepIndex: 0,
    hitCount: 0,
    nextTime: 0,
    lastDisplayStep: -1,
    totalStepCount: 0,
    linked: false,
    evolve: {
      enabled: false,
      everyBars: 4,
      evolution: 0.5,
      writeOffset: 0 as number | 'auto',
      mutationMode: 'biased' as const,
      lastEvolveBar: 0,
      methods: {
        rotateDrift: true,
        swingDrift: true,
        probDrift: false,
        ghostNotes: false,
        ratchetSpray: false,
        hitDrift: false,
        pitchWalk: false,
        valueDrift: true,
        valueScramble: false,
        valueWiden: false,
        subLaneLengthDrift: false,
        subLaneDirectionFlip: false,
      },
      home: null,
    },
  };
}
