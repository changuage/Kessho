import type {
  StepOverrides,
  SubLaneState,
  UseEuclideanSequencerResult,
} from './useEuclideanSequencer';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';
import type { CaptureScratch } from './generatedSequencerCaptureTypes';
import type { CaptureEvent } from './generatedSequencerCaptureTypes';
import {
  capturedMidisToSemitonePitchValues,
  type CapturedPitchReference,
} from './generatedSequencerCapturePitch';
import { seqEuclidean } from '../../audio/euclideanPatterns';
import {
  captureEventsInOrder,
  captureStepCount,
} from './generatedSequencerCaptureScratch';
import { createBitmapTriggerClip } from './triggerClip';
import { NUDGE_EPSILON, computeNudgeFromContinuousStep } from './nudgeTiming';
import { clampEuclideanSubLaneSteps } from './sequencerLimits';

export interface CommitGeneratedCaptureArgs {
  scratch: CaptureScratch;
  targetLaneIndex: number;
  seq: Pick<
    UseEuclideanSequencerResult,
    | 'setParam'
    | 'setParamSelect'
    | 'setStepOverrides'
    | 'setSubLaneStates'
    | 'setPitchSettings'
    | 'setOpenLane'
  > & {
    setTriggerShapeParams?: (
      laneIdx: number,
      params: { preset?: string; steps: number; hits: number; rotation: number },
    ) => void;
  };
  setSequencerMode: (laneIndex: number, mode: 'euclid') => void;
  setPitchBindingMode?: (laneIndex: number, mode: PitchBindingMode) => void;
  capturePitchReference?: CapturedPitchReference | null;
  sourceMode?: 'anchorWalker' | 'orbit';
}

function cloneStepOverrides(prev: StepOverrides): StepOverrides {
  return {
    ...prev,
    triggerClips: prev.triggerClips ? [...prev.triggerClips] : prev.triggerClips,
    triggerToggles: prev.triggerToggles.map((map) => new Map(map)),
    probability: [...prev.probability],
    ratchet: [...prev.ratchet],
    trigCondition: [...prev.trigCondition],
    expression: [...prev.expression],
    pitch: [...prev.pitch],
    morph: [...prev.morph],
    distance: [...prev.distance],
    nudge: [...prev.nudge],
    slice: [...prev.slice],
    reverse: [...prev.reverse],
    expressionDirection: [...prev.expressionDirection],
    morphDirection: [...prev.morphDirection],
    distanceDirection: [...prev.distanceDirection],
    nudgeDirection: [...prev.nudgeDirection],
    pitchDirection: [...prev.pitchDirection],
    sliceDirection: [...prev.sliceDirection],
    reverseDirection: [...prev.reverseDirection],
    expressionRanges: prev.expressionRanges ? [...prev.expressionRanges] : prev.expressionRanges,
    morphRanges: prev.morphRanges ? [...prev.morphRanges] : prev.morphRanges,
    distanceRanges: prev.distanceRanges ? [...prev.distanceRanges] : prev.distanceRanges,
  };
}

function ensureSubLane(
  prevLane: Record<string, SubLaneState> | undefined,
  lane: 'pitch' | 'expression',
  steps: number,
): SubLaneState {
  const previous = prevLane?.[lane];
  return {
    ...previous,
    enabled: true,
    steps,
    direction: previous?.direction ?? 'forward',
    ...(lane === 'pitch' ? { scaleQuantize: false } : { valueMode: 'sequence' as const }),
  };
}

function ensureNudgeSubLane(
  prevLane: Record<string, SubLaneState> | undefined,
  steps: number,
  enabled: boolean,
): SubLaneState {
  const previous = prevLane?.nudge;
  return {
    ...previous,
    enabled,
    steps,
    direction: previous?.direction ?? 'forward',
    followTriggerHits: true,
  };
}

function canPreserveCapturedTriggerSteps(events: readonly CaptureEvent[], stepCount: number): boolean {
  const eventSteps = events.map((event) => event.targetStepIndex);
  const uniqueSteps = new Set(eventSteps);
  return events.length > 0 && events.length <= stepCount && uniqueSteps.size === events.length;
}

function capturedTriggerPattern(
  scratch: CaptureScratch,
  events: readonly CaptureEvent[],
): boolean[] {
  const eventSteps = events.map((event) => event.targetStepIndex);

  if (canPreserveCapturedTriggerSteps(events, scratch.stepCount)) {
    const pattern = new Array(scratch.stepCount).fill(false);
    for (const step of eventSteps) {
      if (step >= 0 && step < scratch.stepCount) pattern[step] = true;
    }
    return pattern;
  }

  return seqEuclidean(scratch.stepCount, Math.min(scratch.stepCount, events.length), 0);
}

function captureSourceLabel(sourceMode: 'anchorWalker' | 'orbit' | undefined): string {
  if (sourceMode === 'orbit') return 'Orbit capture';
  if (sourceMode === 'anchorWalker') return 'Walker capture';
  return 'Recorded capture';
}

function triggerStepPositions(pattern: readonly boolean[]): number[] {
  const positions: number[] = [];
  pattern.forEach((enabled, step) => {
    if (enabled) positions.push(step);
  });
  return positions;
}

function adjacentTriggerSteps(
  triggerSteps: readonly number[],
  currentStep: number,
  stepCount: number,
): { previous: number; next: number } {
  if (triggerSteps.length <= 1) {
    return {
      previous: currentStep - stepCount,
      next: currentStep + stepCount,
    };
  }
  let previous = triggerSteps[triggerSteps.length - 1]! - stepCount;
  let next = triggerSteps[0]! + stepCount;
  for (const step of triggerSteps) {
    if (step < currentStep) previous = step;
    if (step > currentStep) {
      next = step;
      break;
    }
  }
  return { previous, next };
}

function capturedNudgeValues(
  events: readonly CaptureEvent[],
  triggerPattern: readonly boolean[],
  preserveTriggerSteps: boolean,
): number[] {
  if (!preserveTriggerSteps) return new Array(events.length).fill(0);
  const stepCount = Math.max(1, triggerPattern.length);
  const triggerSteps = triggerStepPositions(triggerPattern);
  return events.map((event) => {
    const currentCycleBase = event.cycleIndex * stepCount;
    const currentStep = currentCycleBase + event.targetStepIndex;
    const targetStepFloat = typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
      ? event.targetStepFloat
      : currentStep + event.nudge;
    const { previous, next } = adjacentTriggerSteps(triggerSteps, event.targetStepIndex, stepCount);
    return computeNudgeFromContinuousStep(
      targetStepFloat,
      currentCycleBase + previous,
      currentStep,
      currentCycleBase + next,
    );
  });
}

export function commitGeneratedCaptureToEuclid({
  scratch,
  targetLaneIndex,
  seq,
  setSequencerMode,
  setPitchBindingMode,
  capturePitchReference,
  sourceMode,
}: CommitGeneratedCaptureArgs): void {
  const stepCount = scratch.stepCount;
  if (captureStepCount(scratch) === 0) return;
  const committedEventLimit = clampEuclideanSubLaneSteps(scratch.events.length);
  const rawCapturedEvents = captureEventsInOrder(scratch).slice(0, committedEventLimit);
  const preserveTriggerSteps = canPreserveCapturedTriggerSteps(rawCapturedEvents, stepCount);
  const capturedEvents = preserveTriggerSteps
    ? [...rawCapturedEvents].sort((left, right) => (
        left.targetStepIndex - right.targetStepIndex || left.eventOrder - right.eventOrder
      ))
    : rawCapturedEvents;
  const capturedCount = capturedEvents.length;
  const hits = Math.max(1, Math.min(stepCount, capturedCount));
  const capturedMidis = capturedEvents.map((event) => event.midiNote);
  const capturedVelocities = capturedEvents.map((event) => event.velocity);
  const triggerPattern = capturedTriggerPattern(scratch, capturedEvents);
  const nudgeValues = capturedNudgeValues(capturedEvents, triggerPattern, preserveTriggerSteps);
  const hasNudge = nudgeValues.some((value) => Math.abs(value) > NUDGE_EPSILON);
  const pitchCommit = capturedMidisToSemitonePitchValues(capturedMidis, capturePitchReference);
  const triggerClip = createBitmapTriggerClip({
    steps: stepCount,
    bits: triggerPattern,
    origin: 'recorded',
    generator: {
      kind: 'recorded',
      takeId: `${sourceMode ?? 'generated'}-capture`,
      quantize: stepCount,
    },
    label: captureSourceLabel(sourceMode),
  });

  setSequencerMode(targetLaneIndex, 'euclid');
  if (seq.setTriggerShapeParams) {
    seq.setTriggerShapeParams(targetLaneIndex, {
      preset: 'custom',
      steps: stepCount,
      hits,
      rotation: 0,
    });
  } else {
    seq.setParamSelect(targetLaneIndex, 'Preset', 'custom' as never);
    seq.setParam(targetLaneIndex, 'Steps', stepCount);
    seq.setParam(targetLaneIndex, 'Hits', hits);
    seq.setParam(targetLaneIndex, 'Rotation', 0);
  }
  setPitchBindingMode?.(targetLaneIndex, 'polyrhythmic');

  seq.setPitchSettings((previous) => previous.map((settings, index) => (
    index === targetLaneIndex ? pitchCommit.pitchSettings : settings
  )));

  seq.setSubLaneStates((previous) => previous.map((laneState, index) => {
    if (index !== targetLaneIndex) return laneState;
    return {
      ...laneState,
      pitch: ensureSubLane(laneState, 'pitch', capturedCount),
      expression: ensureSubLane(laneState, 'expression', capturedCount),
      nudge: ensureNudgeSubLane(laneState, capturedCount, hasNudge),
    };
  }));

  seq.setStepOverrides((previous) => {
    const next = cloneStepOverrides(previous);
    if (!next.triggerClips) {
      next.triggerClips = Array.from({ length: Math.max(next.triggerToggles.length, targetLaneIndex + 1) }, () => null);
    }
    while (next.triggerClips.length <= targetLaneIndex) next.triggerClips.push(null);
    next.triggerClips[targetLaneIndex] = triggerClip;
    next.triggerToggles[targetLaneIndex] = new Map();
    next.pitch[targetLaneIndex] = pitchCommit.pitchValues;
    next.expression[targetLaneIndex] = capturedVelocities;
    next.nudge[targetLaneIndex] = nudgeValues;
    next.probability[targetLaneIndex] = new Array(stepCount).fill(1);
    next.trigCondition[targetLaneIndex] = Array.from(
      { length: stepCount },
      () => [1, 1] as [number, number],
    );
    next.pitchDirection[targetLaneIndex] = 'forward';
    next.expressionDirection[targetLaneIndex] = 'forward';
    next.nudgeDirection[targetLaneIndex] = 'forward';

    return next;
  });

  seq.setOpenLane('pitch');
}
