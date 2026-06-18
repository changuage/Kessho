import type { ClockDivision } from '../../../audio/drumSeqTypes';
import type { DrumVoiceType } from '../../../audio/drumSynth';
import type { StepOverrides, SubLaneKind, SubLaneState } from '../../sequencer/useEuclideanSequencer';
import type { GeneratedDrumPhrase } from './scatterTypes';
import { deserializeTriggerClip, serializeTriggerClip } from '../../sequencer/triggerClip';

export type PhrasePrintMode =
  | 'replace'
  | 'merge'
  | 'fillEmpty'
  | 'triggerOnly'
  | 'modsOnly'
  | 'toneOnly'
  | 'motionOnly'
  | 'spaceOnly'
  | 'glitchOnly';

const SUB_LANES: SubLaneKind[] = ['pitch', 'expression', 'morph', 'distance', 'slice', 'reverse'];

function cloneStepOverrides(overrides: StepOverrides): StepOverrides {
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
    slice: [...overrides.slice],
    reverse: [...overrides.reverse],
    expressionDirection: [...overrides.expressionDirection],
    morphDirection: [...overrides.morphDirection],
    distanceDirection: [...overrides.distanceDirection],
    pitchDirection: [...overrides.pitchDirection],
    sliceDirection: [...overrides.sliceDirection],
    reverseDirection: [...overrides.reverseDirection],
    expressionRanges: overrides.expressionRanges ? [...overrides.expressionRanges] : overrides.expressionRanges,
    morphRanges: overrides.morphRanges ? [...overrides.morphRanges] : overrides.morphRanges,
    distanceRanges: overrides.distanceRanges ? [...overrides.distanceRanges] : overrides.distanceRanges,
  };
}

function cloneSubLaneStates(states: Record<SubLaneKind, SubLaneState>[]): Record<SubLaneKind, SubLaneState>[] {
  return states.map((state) => ({
    pitch: { ...state.pitch },
    expression: { ...state.expression },
    morph: { ...state.morph },
    distance: { ...state.distance },
    slice: { ...state.slice },
    reverse: { ...state.reverse },
  }));
}

function modeWritesTrigger(mode: PhrasePrintMode): boolean {
  return mode === 'replace' || mode === 'merge' || mode === 'fillEmpty' || mode === 'triggerOnly';
}

function modeWritesLane(mode: PhrasePrintMode, lane: SubLaneKind): boolean {
  if (mode === 'replace' || mode === 'merge' || mode === 'modsOnly') return true;
  if (mode === 'triggerOnly') return false;
  if (mode === 'toneOnly') return lane === 'pitch';
  if (mode === 'motionOnly') return lane === 'expression' || lane === 'morph';
  if (mode === 'spaceOnly') return lane === 'distance';
  if (mode === 'glitchOnly') return lane === 'slice' || lane === 'reverse';
  return mode === 'fillEmpty' ? false : true;
}

function phraseValues(phrase: GeneratedDrumPhrase, lane: SubLaneKind): number[] {
  return phrase[lane].slice();
}

function phraseDirection(phrase: GeneratedDrumPhrase, lane: SubLaneKind) {
  return phrase.directions[lane];
}

function directionField(lane: SubLaneKind) {
  return `${lane}Direction` as keyof Pick<StepOverrides,
    'pitchDirection'
    | 'expressionDirection'
    | 'morphDirection'
    | 'distanceDirection'
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
  const { phrase, laneIndex, mode } = args;
  const stepOverrides = cloneStepOverrides(args.currentStepOverrides);
  const subLaneStates = cloneSubLaneStates(args.currentSubLaneStates);
  const laneCount = Math.max(stepOverrides.triggerToggles.length, laneIndex + 1);
  if (!stepOverrides.triggerClips) {
    stepOverrides.triggerClips = Array.from({ length: laneCount }, () => null);
  }
  while (stepOverrides.triggerClips.length < laneCount) stepOverrides.triggerClips.push(null);

  if (modeWritesTrigger(mode)) {
    stepOverrides.triggerClips[laneIndex] = deserializeTriggerClip(serializeTriggerClip(phrase.triggerClip));
    stepOverrides.triggerToggles[laneIndex] = new Map();
    stepOverrides.probability[laneIndex] = phrase.probability.slice();
    stepOverrides.ratchet[laneIndex] = phrase.ratchet.slice();
    stepOverrides.trigCondition[laneIndex] = phrase.trigCondition.map((condition) => [condition[0], condition[1]]);
  }

  for (const lane of SUB_LANES) {
    if (!modeWritesLane(mode, lane)) continue;
    stepOverrides[lane][laneIndex] = phraseValues(phrase, lane);
    const field = directionField(lane);
    stepOverrides[field][laneIndex] = phraseDirection(phrase, lane);
    const targetLaneState = subLaneStates[laneIndex];
    const laneState = targetLaneState?.[lane];
    if (laneState) {
      targetLaneState[lane] = {
        ...laneState,
        enabled: phrase.subLaneEnabled[lane],
        steps: phraseValues(phrase, lane).length,
        direction: phraseDirection(phrase, lane),
        ...(lane === 'pitch' ? { scaleQuantize: false } : {}),
        ...(lane === 'expression' || lane === 'morph' || lane === 'distance' ? { valueMode: 'sequence' as const } : {}),
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
