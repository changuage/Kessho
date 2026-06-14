import type { GeneratedSequencerCaptureEvent } from '../../audio/coreProductGeneratedSequencerCaptureTypes';

export type CaptureCommitStatus =
  | 'idle'
  | 'recording'
  | 'committing'
  | 'committed'
  | 'overflow';

export interface CaptureCell {
  visitedCycle: number;
  hasNote: boolean;
  eventOrder: number;
  midiNote: number | null;
  velocity: number | null;
  gateSeconds: number | null;
  sourceEventId: number | null;
}

export interface CaptureScratch {
  stepCount: number;
  cycleIndex: number;
  lastStepIndex: number | null;
  nextEventOrder: number;
  cells: CaptureCell[];
}

export interface CaptureSession {
  active: boolean;
  sourceLaneIndex: number;
  targetLaneIndex: number;
  sourceMode: 'anchorWalker' | 'orbit';
  targetStepCount: number;
  startedAtSample: number | null;
  startedAtMs: number;
  status: CaptureCommitStatus;
  scratch: CaptureScratch;
  overflowCount: number;
}

export interface CaptureIngestArgs {
  events: readonly GeneratedSequencerCaptureEvent[];
  currentTargetStep: number;
  currentCycleIndex: number;
}
