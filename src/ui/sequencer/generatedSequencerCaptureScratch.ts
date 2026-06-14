import type {
  CaptureCell,
  CaptureScratch,
} from './generatedSequencerCaptureTypes';

export function createEmptyCaptureCell(cycle = -1): CaptureCell {
  return {
    visitedCycle: cycle,
    hasNote: false,
    eventOrder: -1,
    midiNote: null,
    velocity: null,
    gateSeconds: null,
    sourceEventId: null,
  };
}

export function createCaptureScratch(stepCount: number): CaptureScratch {
  const safeStepCount = Math.max(1, Math.min(64, Math.round(stepCount)));
  return {
    stepCount: safeStepCount,
    cycleIndex: 0,
    lastStepIndex: null,
    nextEventOrder: 0,
    cells: Array.from({ length: safeStepCount }, () => createEmptyCaptureCell()),
  };
}

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function markCaptureStepVisited(
  scratch: CaptureScratch,
  stepIndex: number,
  cycleIndex: number,
): CaptureScratch {
  const safeStep = positiveModulo(stepIndex, scratch.stepCount);
  const cells = scratch.cells.slice();
  const current = cells[safeStep] ?? createEmptyCaptureCell();

  if (current.visitedCycle !== cycleIndex) {
    cells[safeStep] = createEmptyCaptureCell(cycleIndex);
  }

  return {
    ...scratch,
    cycleIndex: Math.max(scratch.cycleIndex, cycleIndex),
    lastStepIndex: safeStep,
    cells,
  };
}

export function writeCaptureEventToStep(
  scratch: CaptureScratch,
  stepIndex: number,
  cycleIndex: number,
  event: {
    eventId: number;
    midiNote: number;
    velocity: number;
    gateSeconds: number;
  },
): CaptureScratch {
  const visited = markCaptureStepVisited(scratch, stepIndex, cycleIndex);
  const safeStep = positiveModulo(stepIndex, visited.stepCount);
  const cells = visited.cells.slice();

  cells[safeStep] = {
    visitedCycle: cycleIndex,
    hasNote: true,
    eventOrder: visited.nextEventOrder,
    midiNote: Math.max(0, Math.min(127, Math.round(event.midiNote))),
    velocity: Math.max(0, Math.min(1, event.velocity)),
    gateSeconds: Math.max(0.001, event.gateSeconds),
    sourceEventId: event.eventId,
  };

  return {
    ...visited,
    nextEventOrder: visited.nextEventOrder + 1,
    cells,
  };
}

export function captureStepCount(scratch: CaptureScratch): number {
  return scratch.cells.reduce((count, cell) => count + (cell.hasNote ? 1 : 0), 0);
}
