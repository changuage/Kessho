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
  type CapturedPitchCommit,
} from './generatedSequencerCapturePitch';
import {
  captureEventsInOrder,
  captureStepCount,
  positiveModulo,
} from './generatedSequencerCaptureScratch';
import { createBitmapTriggerClip, type TriggerClip } from './triggerClip';
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
  onStepCommit?: (commit: GeneratedCaptureStepCommit) => void;
}

export interface GeneratedCaptureStepCommit {
  targetLaneIndex: number;
  sourceMode?: 'anchorWalker' | 'orbit';
  stepCount: number;
  hits: number;
  triggerPattern: boolean[];
  triggerClip: TriggerClip;
  triggerToggles: Map<number, boolean>;
  pitchMidiValues: number[];
  pitchValues: number[];
  expressionValues: number[];
  nudgeValues: number[];
  hasNudge: boolean;
  pitchSettings: CapturedPitchCommit['pitchSettings'];
  pitchBindingMode: PitchBindingMode;
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

function capturedTriggerPattern(stepCount: number, events: readonly CaptureEvent[]): boolean[] {
  const pattern = new Array(stepCount).fill(false);
  for (const event of events) {
    if (event.targetStepIndex >= 0 && event.targetStepIndex < stepCount) {
      pattern[event.targetStepIndex] = true;
    }
  }
  return pattern;
}

function triggerPatternMap(pattern: readonly boolean[]): Map<number, boolean> {
  const toggles = new Map<number, boolean>();
  pattern.forEach((enabled, step) => {
    toggles.set(step, Boolean(enabled));
  });
  return toggles;
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
): number[] {
  const stepCount = Math.max(1, triggerPattern.length);
  const triggerSteps = triggerStepPositions(triggerPattern);
  return events.map((event) => {
    const currentStep = event.targetStepIndex;
    const targetStepFloat = typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
      ? event.targetStepFloat
      : event.targetStepIndex + event.nudge;
    const { previous, next } = adjacentTriggerSteps(triggerSteps, event.targetStepIndex, stepCount);
    return computeNudgeFromContinuousStep(
      targetStepFloat,
      previous,
      currentStep,
      next,
    );
  });
}

function captureEventCycleRelativeStep(event: CaptureEvent, baseStepCount: number): number {
  const safeBaseStepCount = Math.max(1, baseStepCount);
  if (typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)) {
    const cycleBase = event.cycleIndex * safeBaseStepCount;
    const cycleRelative = event.targetStepFloat - cycleBase;
    const rawRelative = cycleRelative >= -0.5 && cycleRelative < safeBaseStepCount + 0.5
      ? cycleRelative
      : event.targetStepFloat;
    return positiveModulo(rawRelative, safeBaseStepCount);
  }
  return positiveModulo(event.targetStepIndex + event.nudge, safeBaseStepCount);
}

function outputStepCountCandidates(baseStepCount: number): number[] {
  const safeBaseStepCount = Math.max(1, Math.min(64, Math.round(baseStepCount)));
  const candidates: number[] = [];
  for (let stepCount = safeBaseStepCount; stepCount <= 64; stepCount *= 2) {
    candidates.push(stepCount);
    if (stepCount === 64) break;
  }
  if (candidates[candidates.length - 1] !== 64) candidates.push(64);
  return [...new Set(candidates.map((value) => Math.max(1, Math.min(64, Math.round(value)))))];
}

function preferredOutputStep(
  relativeStep: number,
  outputStepCount: number,
  baseStepCount: number,
): number {
  const scaled = relativeStep * (outputStepCount / Math.max(1, baseStepCount));
  return positiveModulo(Math.round(scaled), outputStepCount);
}

function findAvailableOutputStep(
  preferredStep: number,
  usedSteps: Set<number>,
  outputStepCount: number,
): number | null {
  const safeStepCount = Math.max(1, outputStepCount);
  const safePreferred = positiveModulo(preferredStep, safeStepCount);
  if (!usedSteps.has(safePreferred)) return safePreferred;
  for (let offset = 1; offset < safeStepCount; offset += 1) {
    const forward = safePreferred + offset;
    if (forward < safeStepCount && !usedSteps.has(forward)) return forward;
    const backward = safePreferred - offset;
    if (backward >= 0 && !usedSteps.has(backward)) return backward;
  }
  return null;
}

function quantizeCapturedEventsToStepGrid(
  events: readonly CaptureEvent[],
  baseStepCount: number,
): { stepCount: number; events: CaptureEvent[] } {
  const safeBaseStepCount = Math.max(1, Math.min(64, Math.round(baseStepCount)));
  const orderedEvents = [...events].sort((left, right) => {
    const leftStep = captureEventCycleRelativeStep(left, safeBaseStepCount);
    const rightStep = captureEventCycleRelativeStep(right, safeBaseStepCount);
    return leftStep - rightStep || left.eventOrder - right.eventOrder;
  });

  let outputStepCount = safeBaseStepCount;
  let bestUniqueCount = -1;
  const candidates = outputStepCountCandidates(safeBaseStepCount);
  for (const candidate of candidates) {
    const mappedSteps = orderedEvents.map((event) => preferredOutputStep(
      captureEventCycleRelativeStep(event, safeBaseStepCount),
      candidate,
      safeBaseStepCount,
    ));
    const uniqueCount = new Set(mappedSteps).size;
    if (uniqueCount === mappedSteps.length) {
      outputStepCount = candidate;
      break;
    }
    if (uniqueCount > bestUniqueCount) {
      bestUniqueCount = uniqueCount;
      outputStepCount = candidate;
    }
  }
  if (outputStepCount < orderedEvents.length) {
    outputStepCount = candidates.find((candidate) => candidate >= orderedEvents.length)
      ?? candidates[candidates.length - 1]
      ?? outputStepCount;
  }

  const usedSteps = new Set<number>();
  const ratio = outputStepCount / safeBaseStepCount;
  const quantizedEvents = orderedEvents.map((event) => {
    const relativeStep = captureEventCycleRelativeStep(event, safeBaseStepCount);
    const preferredStep = preferredOutputStep(relativeStep, outputStepCount, safeBaseStepCount);
    const assignedStep = findAvailableOutputStep(preferredStep, usedSteps, outputStepCount);
    const targetStepIndex = assignedStep ?? preferredStep;
    usedSteps.add(targetStepIndex);
    return {
      ...event,
      targetStepIndex,
      targetStepFloat: relativeStep * ratio,
    };
  }).sort((left, right) => (
    left.targetStepIndex - right.targetStepIndex ||
    (left.targetStepFloat ?? left.targetStepIndex) - (right.targetStepFloat ?? right.targetStepIndex) ||
    left.eventOrder - right.eventOrder
  ));

  return {
    stepCount: outputStepCount,
    events: quantizedEvents,
  };
}

export function commitGeneratedCaptureToEuclid({
  scratch,
  targetLaneIndex,
  seq,
  setSequencerMode,
  setPitchBindingMode,
  capturePitchReference,
  sourceMode,
  onStepCommit,
}: CommitGeneratedCaptureArgs): void {
  if (captureStepCount(scratch) === 0) return;
  const committedEventLimit = clampEuclideanSubLaneSteps(scratch.events.length);
  const rawCapturedEvents = captureEventsInOrder(scratch).slice(0, committedEventLimit);
  const quantizedCapture = quantizeCapturedEventsToStepGrid(rawCapturedEvents, scratch.stepCount);
  const stepCount = quantizedCapture.stepCount;
  const capturedEvents = quantizedCapture.events;
  const capturedCount = capturedEvents.length;
  const hits = Math.max(1, Math.min(stepCount, capturedCount));
  const capturedMidis = capturedEvents.map((event) => event.midiNote);
  const capturedVelocities = capturedEvents.map((event) => event.velocity);
  const triggerPattern = capturedTriggerPattern(stepCount, capturedEvents);
  const triggerToggles = triggerPatternMap(triggerPattern);
  const nudgeValues = capturedNudgeValues(capturedEvents, triggerPattern);
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
    while (next.triggerToggles.length <= targetLaneIndex) next.triggerToggles.push(new Map());
    next.triggerClips[targetLaneIndex] = triggerClip;
    next.triggerToggles[targetLaneIndex] = new Map(triggerToggles);
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

  onStepCommit?.({
    targetLaneIndex,
    sourceMode,
    stepCount,
    hits,
    triggerPattern: [...triggerPattern],
    triggerClip,
    triggerToggles: new Map(triggerToggles),
    pitchMidiValues: capturedMidis,
    pitchValues: pitchCommit.pitchValues,
    expressionValues: capturedVelocities,
    nudgeValues,
    hasNudge,
    pitchSettings: pitchCommit.pitchSettings,
    pitchBindingMode: 'polyrhythmic',
  });

  seq.setOpenLane('pitch');
}
