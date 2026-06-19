import type { GeneratedSequencerCaptureEvent } from '../../audio/coreProductGeneratedSequencerCaptureTypes';

export type CaptureCommitStatus =
  | 'idle'
  | 'recording'
  | 'committing'
  | 'committed'
  | 'empty'
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

export interface CaptureEvent {
  eventOrder: number;
  sourceEventId: number;
  targetStepIndex: number;
  targetStepFloat: number | null;
  cycleIndex: number;
  midiNote: number;
  velocity: number;
  gateSeconds: number;
  nudge: number;
}

export interface CaptureScratch {
  stepCount: number;
  cycleIndex: number;
  lastStepIndex: number | null;
  nextEventOrder: number;
  cells: CaptureCell[];
  events: CaptureEvent[];
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
