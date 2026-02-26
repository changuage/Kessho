import type { DrumVoiceType } from './drumSynth';
import type {
  ClockDivision,
  LaneDirection,
  SequencerState,
  SubLane,
} from './drumSeqTypes';

export const DRUM_EUCLID_PRESET_DATA: Record<string, { steps: number; hits: number; rotation: number }> = {
  sparse: { steps: 16, hits: 1, rotation: 0 },
  dense: { steps: 8, hits: 7, rotation: 0 },
  longSparse: { steps: 32, hits: 3, rotation: 0 },
  poly3v4: { steps: 12, hits: 3, rotation: 0 },
  poly4v3: { steps: 12, hits: 4, rotation: 0 },
  poly5v4: { steps: 20, hits: 5, rotation: 0 },
  lancaran: { steps: 16, hits: 4, rotation: 0 },
  ketawang: { steps: 16, hits: 2, rotation: 0 },
  ladrang: { steps: 32, hits: 8, rotation: 0 },
  gangsaran: { steps: 8, hits: 4, rotation: 0 },
  kotekan: { steps: 8, hits: 3, rotation: 1 },
  kotekan2: { steps: 8, hits: 3, rotation: 4 },
  srepegan: { steps: 16, hits: 6, rotation: 2 },
  sampak: { steps: 8, hits: 5, rotation: 0 },
  ayak: { steps: 16, hits: 3, rotation: 4 },
  bonang: { steps: 12, hits: 5, rotation: 2 },
  tresillo: { steps: 8, hits: 3, rotation: 0 },
  cinquillo: { steps: 8, hits: 5, rotation: 0 },
  rumba: { steps: 16, hits: 5, rotation: 0 },
  bossa: { steps: 16, hits: 5, rotation: 3 },
  son: { steps: 16, hits: 7, rotation: 0 },
  shiko: { steps: 16, hits: 5, rotation: 0 },
  soukous: { steps: 12, hits: 7, rotation: 0 },
  gahu: { steps: 16, hits: 7, rotation: 0 },
  bembe: { steps: 12, hits: 7, rotation: 0 },
  clapping: { steps: 12, hits: 8, rotation: 0 },
  clappingB: { steps: 12, hits: 8, rotation: 5 },
  additive7: { steps: 7, hits: 4, rotation: 0 },
  additive11: { steps: 11, hits: 5, rotation: 0 },
  additive13: { steps: 13, hits: 5, rotation: 0 },
  reich18: { steps: 12, hits: 7, rotation: 3 },
  drumming: { steps: 8, hits: 6, rotation: 1 },
};

export function resolveDrumEuclidPatternParams(
  preset: string,
  steps: number,
  hits: number,
  rotation: number,
): { steps: number; hits: number; rotation: number } {
  if (preset === 'custom' || !DRUM_EUCLID_PRESET_DATA[preset]) {
    return { steps, hits, rotation };
  }
  const presetData = DRUM_EUCLID_PRESET_DATA[preset];
  return {
    steps: presetData.steps,
    hits: presetData.hits,
    rotation: (presetData.rotation + rotation) % presetData.steps,
  };
}

import { createRng as createSeededRng } from './rng';
export { createSeededRng };

export function seqEuclidean(steps: number, hits: number, rotation: number): boolean[] {
  const safeSteps = Math.max(1, Math.floor(steps));
  const safeHits = Math.max(0, Math.min(Math.floor(hits), safeSteps));

  if (safeHits === 0) return new Array(safeSteps).fill(false);
  if (safeHits >= safeSteps) return new Array(safeSteps).fill(true);

  const counts: number[] = [];
  const remainders: number[] = [safeHits];
  let divisor = safeSteps - safeHits;
  let level = 0;

  while (remainders[level] > 1) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
  }
  counts.push(divisor);

  const pattern: number[] = [];
  const build = (lvl: number): void => {
    if (lvl === -1) {
      pattern.push(0);
      return;
    }
    if (lvl === -2) {
      pattern.push(1);
      return;
    }
    for (let i = 0; i < counts[lvl]; i++) build(lvl - 1);
    if (remainders[lvl] !== 0) build(lvl - 2);
  };

  build(level);
  const rotated = new Array(safeSteps).fill(false);
  const rot = ((rotation % safeSteps) + safeSteps) % safeSteps;
  for (let i = 0; i < safeSteps; i++) {
    rotated[(i + rot) % safeSteps] = pattern[i] === 1;
  }
  return rotated;
}

export function seqPickVoice(s: SequencerState): DrumVoiceType | null {
  const enabled = (Object.keys(s.sources) as DrumVoiceType[]).filter((v) => s.sources[v]);
  if (enabled.length === 0) return null;
  const index = Math.floor(s.rng() * enabled.length);
  return enabled[Math.max(0, Math.min(enabled.length - 1, index))];
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
    stepIndex: 0,
    hitCount: 0,
    nextTime: 0,
    lastDisplayStep: -1,
    totalStepCount: 0,
    linked: false,
    evolve: {
      enabled: false,
      everyBars: 4,
      intensity: 0.5,
      lastEvolveBar: 0,
      methods: {
        rotateDrift: true,
        velocityBreath: true,
        swingDrift: true,
        probDrift: true,
        morphDrift: true,
        ghostNotes: true,
        ratchetSpray: true,
        hitDrift: true,
        pitchWalk: true,
      },
      home: null,
    },
  };
}
