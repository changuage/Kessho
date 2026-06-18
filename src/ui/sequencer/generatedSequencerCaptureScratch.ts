import type {
  CaptureCell,
  CaptureEvent,
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
    events: [],
  };
}

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function resetCaptureScratchForCycle(
  scratch: CaptureScratch,
  cycleIndex: number,
): CaptureScratch {
  return {
    ...scratch,
    cycleIndex,
    lastStepIndex: null,
    cells: Array.from({ length: scratch.stepCount }, () => createEmptyCaptureCell()),
    events: [],
  };
}

export function markCaptureStepVisited(
  scratch: CaptureScratch,
  stepIndex: number,
  cycleIndex: number,
): CaptureScratch {
  const base = cycleIndex > scratch.cycleIndex
    ? resetCaptureScratchForCycle(scratch, cycleIndex)
    : scratch;
  const safeStep = positiveModulo(stepIndex, base.stepCount);
  const cells = base.cells.slice();
  const current = cells[safeStep] ?? createEmptyCaptureCell();
  let events = base.events;

  if (current.visitedCycle !== cycleIndex) {
    cells[safeStep] = createEmptyCaptureCell(cycleIndex);
    events = base.events.filter((event) => event.targetStepIndex !== safeStep);
  }

  return {
    ...base,
    cycleIndex: Math.max(base.cycleIndex, cycleIndex),
    lastStepIndex: safeStep,
    cells,
    events,
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
  if (scratch.events.some((captured) => captured.sourceEventId === event.eventId)) {
    return scratch;
  }
  const visited = markCaptureStepVisited(scratch, stepIndex, cycleIndex);
  const safeStep = positiveModulo(stepIndex, visited.stepCount);
  const cells = visited.cells.slice();
  const eventOrder = visited.nextEventOrder;

  cells[safeStep] = {
    visitedCycle: cycleIndex,
    hasNote: true,
    eventOrder,
    midiNote: Math.max(0, Math.min(127, Math.round(event.midiNote))),
    velocity: Math.max(0, Math.min(1, event.velocity)),
    gateSeconds: Math.max(0.001, event.gateSeconds),
    sourceEventId: event.eventId,
  };

  const capturedEvent: CaptureEvent = {
    eventOrder,
    sourceEventId: event.eventId,
    targetStepIndex: safeStep,
    cycleIndex,
    midiNote: cells[safeStep]?.midiNote ?? 60,
    velocity: cells[safeStep]?.velocity ?? 1,
    gateSeconds: cells[safeStep]?.gateSeconds ?? 0.001,
  };

  return {
    ...visited,
    nextEventOrder: visited.nextEventOrder + 1,
    cells,
    events: [...visited.events, capturedEvent],
  };
}

export function captureStepCount(scratch: CaptureScratch): number {
  return scratch.events.length;
}

export function captureEventsInOrder(scratch: CaptureScratch): CaptureEvent[] {
  return [...scratch.events].sort((left, right) => left.eventOrder - right.eventOrder);
}
