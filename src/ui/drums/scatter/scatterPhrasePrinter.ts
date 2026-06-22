import type { ClockDivision } from '../../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import type { StepOverrides, SubLaneKind, SubLaneState } from '../../sequencer/useEuclideanSequencer';
import type { GeneratedDrumPhrase } from './scatterTypes';
import { resolveTriggerClip } from '../../sequencer/triggerClip';

export type PhrasePrintMode = 'replace';

type ScatterPhraseSubLane = SubLaneKind;

const AUDIBLE_SUB_LANES: ScatterPhraseSubLane[] = ['pitch', 'expression', 'morph', 'distance'];
const DISABLED_SCATTER_SUB_LANES: ScatterPhraseSubLane[] = ['nudge', 'slice', 'reverse'];

function cloneStepOverrides(overrides: StepOverrides): StepOverrides {
  const laneCount = overrides.triggerToggles.length;
  return {
    ...overrides,
    triggerClips: overrides.triggerClips ? [...overrides.triggerClips] : undefined,
    triggerToggles: overrides.triggerToggles.map((map) => new Map(map)),
    probability: [...overrides.probability],
    ratchet: [...overrides.ratchet],
    trigCondition: [...overrides.trigCondition],
    expression: [...overrides.expression],
    pitch: [...overrides.pitch],
    morph: [...overrides.morph],
    distance: [...overrides.distance],
    nudge: overrides.nudge ? [...overrides.nudge] : Array.from({ length: laneCount }, () => null),
    slice: [...overrides.slice],
    reverse: [...overrides.reverse],
    expressionDirection: [...overrides.expressionDirection],
    morphDirection: [...overrides.morphDirection],
    distanceDirection: [...overrides.distanceDirection],
    nudgeDirection: overrides.nudgeDirection ? [...overrides.nudgeDirection] : Array.from({ length: laneCount }, () => null),
    pitchDirection: [...overrides.pitchDirection],
    sliceDirection: [...overrides.sliceDirection],
    reverseDirection: [...overrides.reverseDirection],
    expressionRanges: overrides.expressionRanges ? [...overrides.expressionRanges] : overrides.expressionRanges,
    morphRanges: overrides.morphRanges ? [...overrides.morphRanges] : overrides.morphRanges,
    distanceRanges: overrides.distanceRanges ? [...overrides.distanceRanges] : overrides.distanceRanges,
  };
}

function cloneSubLaneStates(states: Record<SubLaneKind, SubLaneState>[]): Record<SubLaneKind, SubLaneState>[] {
  return states.map((state) => {
    const next = {} as Record<SubLaneKind, SubLaneState>;
    for (const lane of Object.keys(state) as SubLaneKind[]) {
      next[lane] = { ...state[lane] };
    }
    return next;
  });
}

const SUB_LANE_DEFAULT_VALUES: Record<ScatterPhraseSubLane, number> = {
  pitch: 0,
  expression: 1,
  morph: 0,
  distance: 0,
  nudge: 0,
  slice: 0,
  reverse: 0,
};

function activeTriggerIndexes(phrase: GeneratedDrumPhrase): number[] {
  const indexes: number[] = [];
  resolveTriggerClip(phrase.triggerClip).forEach((enabled, index) => {
    if (enabled) indexes.push(index);
  });
  return indexes;
}

function phraseValuesForActiveHits(
  phrase: GeneratedDrumPhrase,
  lane: ScatterPhraseSubLane,
  triggerIndexes: readonly number[],
): number[] {
  const values = phrase[lane];
  const fallback = SUB_LANE_DEFAULT_VALUES[lane];
  return triggerIndexes.map((stepIndex) => values[stepIndex] ?? fallback);
}

function phraseDirection(phrase: GeneratedDrumPhrase, lane: ScatterPhraseSubLane) {
  return phrase.directions[lane];
}

function directionField(lane: ScatterPhraseSubLane) {
  return `${lane}Direction` as keyof Pick<StepOverrides,
    'pitchDirection'
    | 'expressionDirection'
    | 'morphDirection'
    | 'distanceDirection'
    | 'nudgeDirection'
    | 'sliceDirection'
    | 'reverseDirection'>;
}

export function printGeneratedPhraseToLane(args: {
  phrase: GeneratedDrumPhrase;
  laneIndex: number;
  mode: PhrasePrintMode;
  currentStepOverrides: StepOverrides;
  currentSubLaneStates: Record<SubLaneKind, SubLaneState>[];
}): {
  stepOverrides: StepOverrides;
  subLaneStates: Record<SubLaneKind, SubLaneState>[];
  clockDiv?: ClockDivision;
  swing?: number;
  targetVoice: DrumVoiceType;
} {
  const { phrase, laneIndex } = args;
  const stepOverrides = cloneStepOverrides(args.currentStepOverrides);
  const subLaneStates = cloneSubLaneStates(args.currentSubLaneStates);
  const triggerIndexes = activeTriggerIndexes(phrase);
  const laneCount = Math.max(stepOverrides.triggerToggles.length, laneIndex + 1);
  if (!stepOverrides.triggerClips) {
    stepOverrides.triggerClips = Array.from({ length: laneCount }, () => null);
  }
  while (stepOverrides.triggerClips.length < laneCount) stepOverrides.triggerClips.push(null);

  stepOverrides.triggerClips[laneIndex] = null;
  stepOverrides.triggerToggles[laneIndex] = new Map();
  stepOverrides.probability[laneIndex] = phrase.probability.slice();
  stepOverrides.ratchet[laneIndex] = triggerIndexes.map((stepIndex) => phrase.ratchet[stepIndex] ?? 1);
  stepOverrides.trigCondition[laneIndex] = phrase.trigCondition.map((condition) => [condition[0], condition[1]]);

  for (const lane of AUDIBLE_SUB_LANES) {
    const values = phraseValuesForActiveHits(phrase, lane, triggerIndexes);
    stepOverrides[lane][laneIndex] = values;
    const field = directionField(lane);
    stepOverrides[field][laneIndex] = phraseDirection(phrase, lane);
    const targetLaneState = subLaneStates[laneIndex];
    const laneState = targetLaneState?.[lane];
    if (laneState) {
      targetLaneState[lane] = {
        ...laneState,
        enabled: phrase.subLaneEnabled[lane] && values.length > 0,
        steps: Math.max(1, values.length),
        direction: phraseDirection(phrase, lane),
        ...(lane === 'nudge' ? { followTriggerHits: true } : {}),
        ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
        ...(lane === 'expression' || lane === 'morph' || lane === 'distance' ? { valueMode: 'sequence' as const } : {}),
      };
    }
  }
  for (const lane of DISABLED_SCATTER_SUB_LANES) {
    stepOverrides[lane][laneIndex] = null;
    const field = directionField(lane);
    stepOverrides[field][laneIndex] = null;
    const targetLaneState = subLaneStates[laneIndex];
    const laneState = targetLaneState?.[lane];
    if (laneState) {
      targetLaneState[lane] = {
        ...laneState,
        enabled: false,
        steps: phrase.triggerClip.steps,
      };
    }
  }

  return {
    stepOverrides,
    subLaneStates,
    clockDiv: phrase.clockDiv,
    swing: phrase.swing,
    targetVoice: phrase.engine,
  };
}
