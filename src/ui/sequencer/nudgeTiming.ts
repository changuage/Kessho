export const NUDGE_MIN = -1;
export const NUDGE_MAX = 1;
export const NUDGE_EPSILON = 0.001;

export function clampNudge(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(NUDGE_MIN, Math.min(NUDGE_MAX, value));
}

/** Nudge is relative to the owning grid step: zero is quantized, +/-1 is an adjacent grid step. */
export function computeGridRelativeNudge(
  targetBeat: number,
  gridBeat: number,
  stepBeatDuration: number,
): number {
  if (!Number.isFinite(targetBeat) || !Number.isFinite(gridBeat) || !Number.isFinite(stepBeatDuration)) return 0;
  if (stepBeatDuration <= NUDGE_EPSILON) return 0;
  return clampNudge((targetBeat - gridBeat) / stepBeatDuration);
}

/** Convert a continuous step position to the nearest cyclic grid anchor. */
export function computeGridRelativeNudgeFromContinuousStep(
  targetStepFloat: number,
  currentStep: number,
  cycleSteps?: number,
): number {
  if (!Number.isFinite(targetStepFloat) || !Number.isFinite(currentStep)) return 0;
  let delta = targetStepFloat - currentStep;
  if (cycleSteps && Number.isFinite(cycleSteps) && cycleSteps > 1) {
    const cycle = Math.max(1, Math.round(cycleSteps));
    if (delta > cycle / 2) delta -= cycle;
    else if (delta < -cycle / 2) delta += cycle;
  }
  return clampNudge(delta);
}

export function computeGridRelativeEventTime(
  currentTime: number,
  previousGridTime: number | null | undefined,
  nextGridTime: number | null | undefined,
  nudge: number,
): number {
  const amount = clampNudge(nudge);
  if (Math.abs(amount) <= NUDGE_EPSILON) return currentTime;
  if (amount < 0) {
    if (previousGridTime == null || !Number.isFinite(previousGridTime)) return currentTime;
    return currentTime + (currentTime - previousGridTime) * amount;
  }
  if (nextGridTime == null || !Number.isFinite(nextGridTime)) return currentTime;
  return currentTime + (nextGridTime - currentTime) * amount;
}

export function nudgeLabel(value: number): string {
  const nudge = clampNudge(value);
  if (Math.abs(nudge) <= NUDGE_EPSILON) return '0 steps';
  const rounded = Number(nudge.toFixed(3));
  const amount = rounded > 0 ? `+${rounded}` : `${rounded}`;
  return `${amount} ${Math.abs(rounded) === 1 ? 'step' : 'steps'}`;
}
