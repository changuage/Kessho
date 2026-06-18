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
  >;
  setSequencerMode: (laneIndex: number, mode: 'euclid') => void;
  setPitchBindingMode?: (laneIndex: number, mode: PitchBindingMode) => void;
  capturePitchReference?: CapturedPitchReference | null;
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
    slice: [...prev.slice],
    reverse: [...prev.reverse],
    expressionDirection: [...prev.expressionDirection],
    morphDirection: [...prev.morphDirection],
    distanceDirection: [...prev.distanceDirection],
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

export function commitGeneratedCaptureToEuclid({
  scratch,
  targetLaneIndex,
  seq,
  setSequencerMode,
  setPitchBindingMode,
  capturePitchReference,
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
  const pitchCommit = capturedMidisToSemitonePitchValues(capturedMidis, capturePitchReference);

  setSequencerMode(targetLaneIndex, 'euclid');
  seq.setParamSelect(targetLaneIndex, 'Preset', 'custom' as never);
  seq.setParam(targetLaneIndex, 'Steps', stepCount);
  seq.setParam(targetLaneIndex, 'Hits', hits);
  seq.setParam(targetLaneIndex, 'Rotation', 0);
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
    };
  }));

  seq.setStepOverrides((previous) => {
    const next = cloneStepOverrides(previous);
    const triggerMap = new Map<number, boolean>();
    for (let step = 0; step < stepCount; step += 1) {
      triggerMap.set(step, triggerPattern[step] === true);
    }

    next.triggerToggles[targetLaneIndex] = triggerMap;
    if (next.triggerClips) next.triggerClips[targetLaneIndex] = null;
    next.pitch[targetLaneIndex] = pitchCommit.pitchValues;
    next.expression[targetLaneIndex] = capturedVelocities;
    next.probability[targetLaneIndex] = new Array(stepCount).fill(1);
    next.trigCondition[targetLaneIndex] = Array.from(
      { length: stepCount },
      () => [1, 1] as [number, number],
    );
    next.pitchDirection[targetLaneIndex] = 'forward';
    next.expressionDirection[targetLaneIndex] = 'forward';

    return next;
  });

  seq.setOpenLane('pitch');
}
