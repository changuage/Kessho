export type GeneratedCaptureStopAction =
  | { kind: 'finishCurrentPhrase' }
  | { kind: 'commitCycle'; cycleIndex: number };

export function generatedCaptureStepPastHalf(stepIndex: number, stepCount: number): boolean {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const safeStepIndex = Math.max(0, Math.min(safeStepCount - 1, Math.floor(stepIndex)));
  return safeStepIndex >= Math.floor(safeStepCount / 2);
}

export function chooseGeneratedCaptureStopAction(args: {
  currentStepIndex: number;
  stepCount: number;
  completedCycleIndex: number | null;
}): GeneratedCaptureStopAction {
  if (
    args.completedCycleIndex !== null &&
    !generatedCaptureStepPastHalf(args.currentStepIndex, args.stepCount)
  ) {
    return { kind: 'commitCycle', cycleIndex: args.completedCycleIndex };
  }
  return { kind: 'finishCurrentPhrase' };
}
