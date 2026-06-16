import type {
  StepOverrides,
  SubLaneState,
  UseEuclideanSequencerResult,
} from './useEuclideanSequencer';
import type { CaptureScratch } from './generatedSequencerCaptureTypes';
import {
  capturedMidisToSemitonePitchValues,
} from './generatedSequencerCapturePitch';
import { captureStepCount } from './generatedSequencerCaptureScratch';

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
  setPitchBindingMode?: (laneIndex: number, mode: 'sequence') => void;
}

function cloneStepOverrides(prev: StepOverrides): StepOverrides {
  return {
    ...prev,
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

export function commitGeneratedCaptureToEuclid({
  scratch,
  targetLaneIndex,
  seq,
  setSequencerMode,
  setPitchBindingMode,
}: CommitGeneratedCaptureArgs): void {
  const stepCount = scratch.stepCount;
  const capturedCount = captureStepCount(scratch);
  if (capturedCount === 0) return;
  const hits = Math.max(1, Math.min(stepCount, capturedCount));
  const midisByStep = scratch.cells.map((cell) => (
    cell.hasNote ? cell.midiNote : null
  ));
  const velocitiesByStep = scratch.cells.map((cell) => (
    cell.hasNote ? cell.velocity ?? 1 : 1
  ));
  const pitchCommit = capturedMidisToSemitonePitchValues(midisByStep);

  setSequencerMode(targetLaneIndex, 'euclid');
  seq.setParamSelect(targetLaneIndex, 'Preset', 'custom' as never);
  seq.setParam(targetLaneIndex, 'Steps', stepCount);
  seq.setParam(targetLaneIndex, 'Hits', hits);
  seq.setParam(targetLaneIndex, 'Rotation', 0);
  setPitchBindingMode?.(targetLaneIndex, 'sequence');

  seq.setPitchSettings((previous) => previous.map((settings, index) => (
    index === targetLaneIndex ? pitchCommit.pitchSettings : settings
  )));

  seq.setSubLaneStates((previous) => previous.map((laneState, index) => {
    if (index !== targetLaneIndex) return laneState;
    return {
      ...laneState,
      pitch: ensureSubLane(laneState, 'pitch', stepCount),
      expression: ensureSubLane(laneState, 'expression', stepCount),
    };
  }));

  seq.setStepOverrides((previous) => {
    const next = cloneStepOverrides(previous);
    const triggerMap = new Map<number, boolean>();
    for (let step = 0; step < stepCount; step += 1) {
      triggerMap.set(step, scratch.cells[step]?.hasNote === true);
    }

    next.triggerToggles[targetLaneIndex] = triggerMap;
    next.pitch[targetLaneIndex] = pitchCommit.pitchValues;
    next.expression[targetLaneIndex] = velocitiesByStep;
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
