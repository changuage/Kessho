import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedSequencerCaptureEvent } from '../../audio/coreProductGeneratedSequencerCaptureTypes';
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
} from './commitGeneratedCaptureToEuclid';

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
    | 'setStepOverrides'
    | 'setSubLaneStates'
    | 'setPitchSettings'
    | 'setOpenLane'
  >;
  setSequencerMode: (laneIndex: number, mode: 'euclid') => void;
  setPitchBindingMode?: (laneIndex: number, mode: 'sequence') => void;
  setProductCaptureEnabled: (request: {
    enabled: boolean;
    sourceLaneIndex: number;
    targetLaneIndex: number;
    sourceMode: 'anchorWalker' | 'orbit';
  }) => void;
}

export interface GeneratedSequenceCaptureApi {
  session: CaptureSession | null;
  isCapturing: boolean;
  capturedCount: number;
  startCapture: (targetLaneIndex?: number) => void;
  stopAndCommit: () => void;
  cancelCapture: () => void;
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

export function useGeneratedSequenceCapture({
  isRunning,
  activeLaneIndex,
  activeLaneMode,
  seq,
  setSequencerMode,
  setPitchBindingMode,
  setProductCaptureEnabled,
}: UseGeneratedSequenceCaptureArgs): GeneratedSequenceCaptureApi {
  const [session, setSession] = useState<CaptureSession | null>(null);
  const sessionRef = useRef<CaptureSession | null>(null);
  const previewRafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
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

  const startCapture = useCallback((targetLaneIndex = activeLaneIndex) => {
    const sourceMode = sourceModeForLaneMode(activeLaneMode);
    if (!sourceMode) return;

    const rawSteps = seq.getParam(targetLaneIndex, 'Steps');
    const stepCount = typeof rawSteps === 'number' && Number.isFinite(rawSteps)
      ? Math.max(1, Math.min(64, Math.round(rawSteps)))
      : 16;

    const next: CaptureSession = {
      active: true,
      sourceLaneIndex: activeLaneIndex,
      targetLaneIndex,
      sourceMode,
      targetStepCount: stepCount,
      startedAtSample: null,
      startedAtMs: performance.now(),
      status: 'recording',
      scratch: createCaptureScratch(stepCount),
      overflowCount: 0,
    };

    sessionRef.current = next;
    setSession(next);
    setProductCaptureEnabled({
      enabled: true,
      sourceLaneIndex: activeLaneIndex,
      targetLaneIndex,
      sourceMode,
    });
  }, [
    activeLaneIndex,
    activeLaneMode,
    seq,
    setProductCaptureEnabled,
  ]);

  const cancelCapture = useCallback(() => {
    const current = sessionRef.current;
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

  const stopAndCommit = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;

    setProductCaptureEnabled({
      enabled: false,
      sourceLaneIndex: current.sourceLaneIndex,
      targetLaneIndex: current.targetLaneIndex,
      sourceMode: current.sourceMode,
    });

    commitGeneratedCaptureToEuclid({
      scratch: current.scratch,
      targetLaneIndex: current.targetLaneIndex,
      seq,
      setSequencerMode,
      setPitchBindingMode,
    });

    sessionRef.current = {
      ...current,
      active: false,
      status: 'committed',
    };
    setSession(sessionRef.current);

    window.setTimeout(() => {
      if (sessionRef.current?.status === 'committed') {
        sessionRef.current = null;
        setSession(null);
      }
    }, 1200);
  }, [
    seq,
    setPitchBindingMode,
    setProductCaptureEnabled,
    setSequencerMode,
  ]);

  const markCurrentStepFromPlayhead = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.active || !isRunning) return;

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

    const scratch = markCaptureStepVisited(current.scratch, stepIndex, cycleIndex);
    publishSession({
      ...current,
      scratch,
    });
  }, [isRunning, publishSession, seq.playheads]);

  const ingestProductEvents = useCallback((
    events: readonly GeneratedSequencerCaptureEvent[],
    overflowCount = 0,
  ) => {
    const current = sessionRef.current;
    if (!current?.active) return;

    let scratch: CaptureScratch = current.scratch;
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
        },
      );
    }

    publishSession({
      ...current,
      startedAtSample,
      scratch,
      overflowCount,
      status: overflowCount > current.overflowCount ? 'overflow' : current.status,
    });
  }, [publishSession, seq.playheads]);

  const capturedCount = useMemo(() => (
    session ? captureStepCount(session.scratch) : 0
  ), [session]);

  return {
    session,
    isCapturing: session?.active === true,
    capturedCount,
    startCapture,
    stopAndCommit,
    cancelCapture,
    ingestProductEvents,
    markCurrentStepFromPlayhead,
  };
}
