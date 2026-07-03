import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedSequencerCaptureEvent } from '../../audio/coreProductGeneratedSequencerCaptureTypes';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';
import type { UseEuclideanSequencerResult } from './useEuclideanSequencer';
import type {
  CaptureStartMode,
  CaptureSession,
  CaptureScratch,
} from './generatedSequencerCaptureTypes';
import {
  captureScratchForCycle,
  captureScratchForDisplay,
  captureStepCount,
  createCaptureScratch,
  markCaptureStepVisited,
  positiveModulo,
  writeCaptureEventToStep,
} from './generatedSequencerCaptureScratch';
import {
  commitGeneratedCaptureToEuclid,
  type GeneratedCaptureStepCommit,
} from './commitGeneratedCaptureToEuclid';
import type { CapturedPitchReference } from './generatedSequencerCapturePitch';
import {
  chooseGeneratedCaptureStopAction,
} from './generatedSequencerCapturePhrase';

const GENERATED_CAPTURE_COMMIT_FLUSH_MS = 320;

export interface UseGeneratedSequenceCaptureArgs {
  isRunning: boolean;
  activeLaneIndex: number;
  activeLaneMode: 'euclid' | 'anchorWalker' | 'orbit';
  seq: Pick<
    UseEuclideanSequencerResult,
    | 'playheads'
    | 'getParam'
    | 'setParam'
    | 'setParamSelect'
    | 'setTriggerShapeParams'
    | 'setStepOverrides'
    | 'setSubLaneStates'
    | 'setPitchSettings'
    | 'setOpenLane'
  >;
  setSequencerMode: (laneIndex: number, mode: 'euclid') => void;
  setPitchBindingMode?: (laneIndex: number, mode: PitchBindingMode) => void;
  capturePitchReference?: CapturedPitchReference | null;
  setProductCaptureEnabled: (request: {
    enabled: boolean;
    sourceLaneIndex: number;
    targetLaneIndex: number;
    sourceMode: 'anchorWalker' | 'orbit';
  }) => void;
  onStepCommit?: (commit: GeneratedCaptureStepCommit) => void;
}

export interface GeneratedSequenceCaptureApi {
  session: CaptureSession | null;
  isCapturing: boolean;
  capturedCount: number;
  startCapture: (request?: number | {
    sourceLaneIndex?: number;
    targetLaneIndex?: number;
    sourceMode?: 'anchorWalker' | 'orbit';
    startMode?: CaptureStartMode;
  }) => void;
  stopAndCommit: () => void;
  cancelCapture: () => void;
  captureManualNote: (note: {
    midiNote: number;
    velocity?: number;
    gateSeconds?: number;
    targetStepIndex?: number;
  }) => boolean;
  ingestProductEvents: (
    events: readonly GeneratedSequencerCaptureEvent[],
    overflowCount?: number,
  ) => void;
  markCurrentStepFromPlayhead: () => void;
}

function sourceModeForLaneMode(
  laneMode: 'euclid' | 'anchorWalker' | 'orbit',
): 'anchorWalker' | 'orbit' | null {
  if (laneMode === 'anchorWalker') return 'anchorWalker';
  if (laneMode === 'orbit') return 'orbit';
  return null;
}

function currentStepFromPlayhead(playhead: number, stepCount: number): number {
  const safeSteps = Math.max(1, stepCount);
  const normalized = Number.isFinite(playhead) ? playhead : 0;
  return positiveModulo(Math.floor(normalized), safeSteps);
}

function currentStepFromSessionPlayhead(session: CaptureSession, playhead: number): number | null {
  if (session.startMode === 'firstEvent') {
    if (session.originPlayheadStep === null) return null;
    return currentStepFromPlayhead(
      positiveModulo(playhead - session.originPlayheadStep, session.targetStepCount),
      session.targetStepCount,
    );
  }
  return currentStepFromPlayhead(playhead, session.targetStepCount);
}

function currentCaptureStepIndex(session: CaptureSession, playhead: number): number {
  return session.scratch.lastStepIndex
    ?? currentStepFromSessionPlayhead(session, playhead)
    ?? 0;
}

export function firstEventRelativeTargetStep(
  absoluteTargetStep: number,
  originStepFloat: number,
  stepCount: number,
  previousRelativeStep: number | null,
): number {
  const safeStepCount = Math.max(1, stepCount);
  if (!Number.isFinite(absoluteTargetStep)) return previousRelativeStep ?? 0;
  const origin = Number.isFinite(originStepFloat) ? originStepFloat : absoluteTargetStep;
  let relative = absoluteTargetStep - origin;
  if (relative < 0) {
    relative += Math.ceil(Math.abs(relative) / safeStepCount) * safeStepCount;
  }
  if (previousRelativeStep !== null && Number.isFinite(previousRelativeStep)) {
    while (relative + 1e-6 < previousRelativeStep) {
      relative += safeStepCount;
    }
  }
  return Math.max(0, relative);
}

function completedPhraseCycleIndex(session: CaptureSession): number | null {
  return session.completedScratch?.lastStepIndex === null
    ? null
    : session.completedScratch?.cycleIndex ?? null;
}

export function useGeneratedSequenceCapture({
  isRunning,
  activeLaneIndex,
  activeLaneMode,
  seq,
  setSequencerMode,
  setPitchBindingMode,
  capturePitchReference,
  setProductCaptureEnabled,
  onStepCommit,
}: UseGeneratedSequenceCaptureArgs): GeneratedSequenceCaptureApi {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const commitFlushTimerRef = useRef<number | null>(null);
  const manualEventIdRef = useRef(-1);
  const capturePitchReferenceRef = useRef<CapturedPitchReference | null>(null);

  useEffect(() => () => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    if (commitFlushTimerRef.current !== null) {
      window.clearTimeout(commitFlushTimerRef.current);
      commitFlushTimerRef.current = null;
    }
  }, []);

  const publishSession = useCallback((next: CaptureSession | null) => {
    sessionRef.current = next;
    if (previewRafRef.current !== null) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      setSession(sessionRef.current);
    });
  }, []);

  const startCapture = useCallback((request?: number | {
    sourceLaneIndex?: number;
    targetLaneIndex?: number;
    sourceMode?: 'anchorWalker' | 'orbit';
    startMode?: CaptureStartMode;
  }) => {
    const requested = typeof request === 'number'
      ? { targetLaneIndex: request }
      : request;
    const sourceLaneIndex = requested?.sourceLaneIndex ?? activeLaneIndex;
    const targetLaneIndex = requested?.targetLaneIndex ?? activeLaneIndex;
    const sourceMode = requested?.sourceMode ?? sourceModeForLaneMode(activeLaneMode);
    const startMode = requested?.startMode ?? 'sequencerBoundary';
    if (!sourceMode) return;
    if (commitFlushTimerRef.current !== null) {
      window.clearTimeout(commitFlushTimerRef.current);
      commitFlushTimerRef.current = null;
    }

    const rawSteps = seq.getParam(targetLaneIndex, 'Steps');
    const stepCount = typeof rawSteps === 'number' && Number.isFinite(rawSteps)
      ? Math.max(1, Math.min(64, Math.round(rawSteps)))
      : 16;

    const next: CaptureSession = {
      active: true,
      sourceLaneIndex,
      targetLaneIndex,
      sourceMode,
      startMode,
      originStepFloat: null,
      originPlayheadStep: null,
      targetStepCount: stepCount,
      startedAtSample: null,
      startedAtMs: performance.now(),
      status: startMode === 'firstEvent' ? 'waitingFirstTrigger' : 'recording',
      scratch: createCaptureScratch(stepCount),
      completedScratch: null,
      commitCycleIndex: null,
      overflowCount: 0,
    };

    capturePitchReferenceRef.current = capturePitchReference ?? null;
    sessionRef.current = next;
    setSession(next);
    setProductCaptureEnabled({
      enabled: true,
      sourceLaneIndex,
      targetLaneIndex,
      sourceMode,
    });
  }, [
    activeLaneIndex,
    activeLaneMode,
    capturePitchReference,
    seq,
    setProductCaptureEnabled,
  ]);

  const cancelCapture = useCallback(() => {
    const current = sessionRef.current;
    if (commitFlushTimerRef.current !== null) {
      window.clearTimeout(commitFlushTimerRef.current);
      commitFlushTimerRef.current = null;
    }
    if (current) {
      setProductCaptureEnabled({
        enabled: false,
        sourceLaneIndex: current.sourceLaneIndex,
        targetLaneIndex: current.targetLaneIndex,
        sourceMode: current.sourceMode,
      });
    }
    sessionRef.current = null;
    setSession(null);
  }, [setProductCaptureEnabled]);

  const beginCommit = useCallback((
    current: CaptureSession,
    commitCycleIndex: number | null,
  ) => {
    publishSession({
      ...current,
      status: 'committing',
      commitCycleIndex,
    });

    setProductCaptureEnabled({
      enabled: false,
      sourceLaneIndex: current.sourceLaneIndex,
      targetLaneIndex: current.targetLaneIndex,
      sourceMode: current.sourceMode,
    });

    if (commitFlushTimerRef.current !== null) {
      window.clearTimeout(commitFlushTimerRef.current);
    }
    commitFlushTimerRef.current = window.setTimeout(() => {
      commitFlushTimerRef.current = null;
      const latest = sessionRef.current;
      if (!latest?.active) return;

      const scratch = captureScratchForCycle(latest, latest.commitCycleIndex);
      const capturedCount = captureStepCount(scratch);
      if (capturedCount > 0) {
        commitGeneratedCaptureToEuclid({
          scratch,
          targetLaneIndex: latest.targetLaneIndex,
          seq,
          setSequencerMode,
          setPitchBindingMode,
          capturePitchReference: capturePitchReferenceRef.current,
          sourceMode: latest.sourceMode,
          onStepCommit,
        });
      }

      sessionRef.current = {
        ...latest,
        active: false,
        status: capturedCount > 0 ? 'committed' : 'empty',
        commitCycleIndex: null,
      };
      setSession(sessionRef.current);

      window.setTimeout(() => {
        const status = sessionRef.current?.status;
        if (status === 'committed' || status === 'empty') {
          sessionRef.current = null;
          setSession(null);
        }
      }, 1200);
    }, GENERATED_CAPTURE_COMMIT_FLUSH_MS);
  }, [
    publishSession,
    seq,
    setPitchBindingMode,
    setProductCaptureEnabled,
    setSequencerMode,
    onStepCommit,
  ]);

  const stopAndCommit = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    if (current.status === 'committing' || current.status === 'finishing') return;
    if (current.status === 'waitingFirstTrigger') {
      beginCommit(current, null);
      return;
    }

    const playhead = seq.playheads[current.targetLaneIndex] ?? 0;
    const stopAction = chooseGeneratedCaptureStopAction({
      currentStepIndex: currentCaptureStepIndex(current, playhead),
      stepCount: current.targetStepCount,
      completedCycleIndex: completedPhraseCycleIndex(current),
    });

    if (stopAction.kind === 'finishCurrentPhrase') {
      if (!isRunning) {
        const scratch = current.scratch.events.length > 0
          ? current.scratch
          : current.completedScratch;
        beginCommit(current, scratch && captureStepCount(scratch) > 0 ? scratch.cycleIndex : null);
        return;
      }
      publishSession({
        ...current,
        status: 'finishing',
      });
      return;
    }

    beginCommit(current, stopAction.cycleIndex);
  }, [
    beginCommit,
    isRunning,
    publishSession,
    seq.playheads,
  ]);

  const captureManualNote = useCallback((note: {
    midiNote: number;
    velocity?: number;
    gateSeconds?: number;
    targetStepIndex?: number;
  }): boolean => {
    const current = sessionRef.current;
    if (!current?.active || current.status === 'committing') return false;

    const explicitTargetStep = typeof note.targetStepIndex === 'number' && Number.isFinite(note.targetStepIndex)
      ? note.targetStepIndex
      : null;
    const rawStep = explicitTargetStep !== null
      ? explicitTargetStep
      : currentStepFromSessionPlayhead(current, seq.playheads[current.targetLaneIndex] ?? 0)
        ?? currentStepFromPlayhead(seq.playheads[current.targetLaneIndex] ?? 0, current.targetStepCount);
    const originStepFloat = current.startMode === 'firstEvent' && current.originStepFloat === null
      ? rawStep
      : current.originStepFloat;
    const originPlayheadStep = current.startMode === 'firstEvent' && current.originPlayheadStep === null
      ? positiveModulo(rawStep, current.targetStepCount)
      : current.originPlayheadStep;
    const rawStepIsSessionRelative = current.startMode === 'firstEvent' &&
      current.originStepFloat !== null &&
      explicitTargetStep === null;
    const relativeRawStep = current.startMode === 'firstEvent' && originStepFloat !== null
      ? rawStepIsSessionRelative
        ? rawStep
        : Math.max(0, rawStep - originStepFloat)
      : rawStep;
    const stepIndex = positiveModulo(Math.round(relativeRawStep), current.targetStepCount);
    const previousStep = current.scratch.lastStepIndex;
    let cycleIndex = current.startMode === 'firstEvent'
      ? Math.max(0, Math.floor(relativeRawStep / current.targetStepCount))
      : current.scratch.cycleIndex;
    if (current.startMode !== 'firstEvent' && previousStep !== null && stepIndex < previousStep) {
      cycleIndex += 1;
    }

    const completedScratch = cycleIndex > current.scratch.cycleIndex
      ? current.scratch
      : current.completedScratch;
    const scratch = writeCaptureEventToStep(
      current.scratch,
      stepIndex,
      cycleIndex,
      {
        eventId: manualEventIdRef.current--,
        midiNote: note.midiNote,
        velocity: note.velocity ?? 1,
        gateSeconds: note.gateSeconds ?? 0.18,
        targetStepFloat: relativeRawStep,
      },
    );
    const next = {
      ...current,
      status: current.status === 'waitingFirstTrigger' ? 'recording' as const : current.status,
      originStepFloat,
      originPlayheadStep,
      completedScratch,
      scratch,
    };
    if (current.status === 'finishing' && completedScratch?.cycleIndex === current.scratch.cycleIndex) {
      beginCommit(next, completedScratch.cycleIndex);
      return true;
    }
    publishSession(next);
    return true;
  }, [beginCommit, publishSession, seq.playheads]);

  const markCurrentStepFromPlayhead = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.active || !isRunning) return;
    if (current.status === 'committing') return;

    const playhead = seq.playheads[current.targetLaneIndex] ?? 0;
    const stepIndex = currentStepFromSessionPlayhead(current, playhead);
    if (stepIndex === null) return;
    const previousStep = current.scratch.lastStepIndex;
    let cycleIndex = current.scratch.cycleIndex;
    if (previousStep !== null && stepIndex < previousStep) {
      cycleIndex += 1;
    }
    if (previousStep === stepIndex && current.scratch.cycleIndex === cycleIndex) {
      return;
    }

    const completedScratch = cycleIndex > current.scratch.cycleIndex
      ? current.scratch
      : current.completedScratch;
    const scratch = markCaptureStepVisited(current.scratch, stepIndex, cycleIndex);
    const next = {
      ...current,
      completedScratch,
      scratch,
    };
    if (current.status === 'finishing' && completedScratch?.cycleIndex === current.scratch.cycleIndex) {
      beginCommit(next, completedScratch.cycleIndex);
      return;
    }
    publishSession(next);
  }, [beginCommit, isRunning, publishSession, seq.playheads]);

  useEffect(() => {
    if (isRunning) return;
    const current = sessionRef.current;
    if (!current?.active || current.status !== 'finishing') return;
    const scratch = current.scratch.events.length > 0
      ? current.scratch
      : current.completedScratch;
    if (!scratch || captureStepCount(scratch) === 0) {
      beginCommit(current, null);
      return;
    }
    beginCommit(current, scratch.cycleIndex);
  }, [beginCommit, isRunning]);

  const ingestProductEvents = useCallback((
    events: readonly GeneratedSequencerCaptureEvent[],
    overflowCount = 0,
  ) => {
    const current = sessionRef.current;
    if (!current?.active) return;

    let scratch: CaptureScratch = current.scratch;
    let completedScratch = current.completedScratch;
    const fallbackStepIndex = currentStepFromPlayhead(
      seq.playheads[current.targetLaneIndex] ?? 0,
      current.targetStepCount,
    );
    let startedAtSample = current.startedAtSample;
    let originStepFloat = current.originStepFloat;
    let originPlayheadStep = current.originPlayheadStep;
    let status = current.status;
    let previousFirstEventRelativeStep: number | null = null;

    const orderedEvents = current.startMode === 'firstEvent'
      ? [...events].sort((left, right) => (
          left.absoluteSample - right.absoluteSample ||
          left.eventId - right.eventId
        ))
      : events;

    for (const event of orderedEvents) {
      if (event.sourceLaneIndex !== current.sourceLaneIndex) continue;
      if (event.sourceMode !== current.sourceMode) continue;
      const targetStepFloat = typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
        ? event.targetStepFloat
        : null;
      const relativeTargetStep = typeof event.targetStepIndex === 'number'
        ? event.targetStepIndex
        : null;
      const absoluteTargetStep = targetStepFloat ?? relativeTargetStep;
      if (current.startMode === 'firstEvent' && originStepFloat === null) {
        originStepFloat = typeof absoluteTargetStep === 'number'
          ? absoluteTargetStep
          : fallbackStepIndex;
        originPlayheadStep = positiveModulo(originStepFloat, current.targetStepCount);
        status = 'recording';
      }
      const sessionTargetStep: number | null = current.startMode === 'firstEvent' && typeof absoluteTargetStep === 'number'
        ? firstEventRelativeTargetStep(
            absoluteTargetStep,
            originStepFloat ?? absoluteTargetStep,
            current.targetStepCount,
            previousFirstEventRelativeStep,
          )
        : absoluteTargetStep;
      if (current.startMode === 'firstEvent' && typeof sessionTargetStep === 'number') {
        previousFirstEventRelativeStep = sessionTargetStep;
      }
      const eventStepIndex = typeof sessionTargetStep === 'number'
        ? positiveModulo(Math.round(sessionTargetStep), current.targetStepCount)
        : fallbackStepIndex;
      const eventCycleIndex = typeof sessionTargetStep === 'number'
        ? Math.max(0, Math.floor(sessionTargetStep / current.targetStepCount))
        : scratch.cycleIndex;
      if (eventCycleIndex < scratch.cycleIndex) {
        if (!completedScratch || completedScratch.cycleIndex !== eventCycleIndex) continue;
        const completedCell = completedScratch.cells[eventStepIndex];
        if (completedCell && completedCell.visitedCycle > eventCycleIndex) continue;
        if (startedAtSample === null) startedAtSample = event.absoluteSample;
        completedScratch = writeCaptureEventToStep(
          completedScratch,
          eventStepIndex,
          eventCycleIndex,
          {
            eventId: event.eventId,
            midiNote: event.midiNote,
            velocity: event.velocity,
            gateSeconds: event.gateSeconds,
            targetStepFloat: typeof sessionTargetStep === 'number' ? sessionTargetStep : relativeTargetStep,
            nudge: event.nudge,
          },
        );
        continue;
      }

      if (eventCycleIndex > scratch.cycleIndex) {
        const completedByEvent = eventCycleIndex === scratch.cycleIndex + 1 && scratch.lastStepIndex !== null
          ? scratch
          : completedScratch;
        if (
          current.status === 'finishing' &&
          completedByEvent?.cycleIndex === scratch.cycleIndex
        ) {
          beginCommit({
            ...current,
            startedAtSample,
            originStepFloat,
            originPlayheadStep,
            status,
            completedScratch: completedByEvent,
            scratch,
            overflowCount,
          }, completedByEvent.cycleIndex);
          return;
        }
        completedScratch = completedByEvent;
      }

      const currentCell = scratch.cells[eventStepIndex];
      if (
        typeof sessionTargetStep === 'number' &&
        currentCell &&
        currentCell.visitedCycle > eventCycleIndex
      ) {
        continue;
      }
      if (startedAtSample === null) startedAtSample = event.absoluteSample;
      scratch = writeCaptureEventToStep(
        scratch,
        eventStepIndex,
        eventCycleIndex,
        {
          eventId: event.eventId,
          midiNote: event.midiNote,
          velocity: event.velocity,
          gateSeconds: event.gateSeconds,
          targetStepFloat: typeof sessionTargetStep === 'number' ? sessionTargetStep : relativeTargetStep,
          nudge: event.nudge,
        },
      );
    }

    publishSession({
      ...current,
      startedAtSample,
      originStepFloat,
      originPlayheadStep,
      completedScratch,
      scratch,
      overflowCount,
      status: overflowCount > current.overflowCount ? 'overflow' : status,
    });
  }, [beginCommit, publishSession, seq.playheads]);

  const capturedCount = useMemo(() => (
    session ? captureStepCount(captureScratchForDisplay(session)) : 0
  ), [session]);

  return {
    session,
    isCapturing: session?.active === true,
    capturedCount,
    startCapture,
    stopAndCommit,
    cancelCapture,
    captureManualNote,
    ingestProductEvents,
    markCurrentStepFromPlayhead,
  };
}
