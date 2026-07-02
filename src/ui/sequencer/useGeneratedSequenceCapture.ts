import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedSequencerCaptureEvent } from '../../audio/coreProductGeneratedSequencerCaptureTypes';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';
import type { UseEuclideanSequencerResult } from './useEuclideanSequencer';
import type {
  CaptureSession,
  CaptureScratch,
} from './generatedSequencerCaptureTypes';
import {
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

function captureScratchForCycle(
  session: CaptureSession,
  cycleIndex: number | null,
): CaptureScratch {
  if (cycleIndex !== null) {
    if (session.scratch.cycleIndex === cycleIndex) return session.scratch;
    if (session.completedScratch?.cycleIndex === cycleIndex) return session.completedScratch;
  }
  return session.completedScratch ?? session.scratch;
}

function currentCaptureStepIndex(session: CaptureSession, playhead: number): number {
  return session.scratch.lastStepIndex
    ?? currentStepFromPlayhead(playhead, session.targetStepCount);
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
  }) => {
    const requested = typeof request === 'number'
      ? { targetLaneIndex: request }
      : request;
    const sourceLaneIndex = requested?.sourceLaneIndex ?? activeLaneIndex;
    const targetLaneIndex = requested?.targetLaneIndex ?? activeLaneIndex;
    const sourceMode = requested?.sourceMode ?? sourceModeForLaneMode(activeLaneMode);
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
      targetStepCount: stepCount,
      startedAtSample: null,
      startedAtMs: performance.now(),
      status: 'recording',
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

    const playhead = seq.playheads[current.targetLaneIndex] ?? 0;
    const stopAction = chooseGeneratedCaptureStopAction({
      currentStepIndex: currentCaptureStepIndex(current, playhead),
      stepCount: current.targetStepCount,
      completedCycleIndex: completedPhraseCycleIndex(current),
    });

    if (stopAction.kind === 'finishCurrentPhrase') {
      publishSession({
        ...current,
        status: 'finishing',
      });
      return;
    }

    beginCommit(current, stopAction.cycleIndex);
  }, [
    beginCommit,
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

    const rawStep = typeof note.targetStepIndex === 'number' && Number.isFinite(note.targetStepIndex)
      ? note.targetStepIndex
      : currentStepFromPlayhead(seq.playheads[current.targetLaneIndex] ?? 0, current.targetStepCount);
    const stepIndex = positiveModulo(Math.round(rawStep), current.targetStepCount);
    const previousStep = current.scratch.lastStepIndex;
    let cycleIndex = current.scratch.cycleIndex;
    if (previousStep !== null && stepIndex < previousStep) {
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
        targetStepFloat: rawStep,
      },
    );
    const next = {
      ...current,
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
    const stepIndex = currentStepFromPlayhead(playhead, current.targetStepCount);
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

    for (const event of events) {
      if (event.sourceLaneIndex !== current.sourceLaneIndex) continue;
      if (event.sourceMode !== current.sourceMode) continue;
      const relativeTargetStep = event.targetStepIndex;
      const eventStepIndex = typeof relativeTargetStep === 'number'
        ? positiveModulo(relativeTargetStep, current.targetStepCount)
        : fallbackStepIndex;
      const eventCycleIndex = typeof relativeTargetStep === 'number'
        ? Math.max(0, Math.floor(relativeTargetStep / current.targetStepCount))
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
            targetStepFloat: typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
              ? event.targetStepFloat
              : relativeTargetStep,
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
        typeof relativeTargetStep === 'number' &&
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
          targetStepFloat: typeof event.targetStepFloat === 'number' && Number.isFinite(event.targetStepFloat)
            ? event.targetStepFloat
            : relativeTargetStep,
          nudge: event.nudge,
        },
      );
    }

    publishSession({
      ...current,
      startedAtSample,
      completedScratch,
      scratch,
      overflowCount,
      status: overflowCount > current.overflowCount ? 'overflow' : current.status,
    });
  }, [beginCommit, publishSession, seq.playheads]);

  const capturedCount = useMemo(() => (
    session ? captureStepCount(captureScratchForCycle(session, session.commitCycleIndex)) : 0
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
