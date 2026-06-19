export const NUDGE_MIN = -1;
export const NUDGE_MAX = 1;
export const NUDGE_EPSILON = 0.001;

export function clampNudge(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(NUDGE_MIN, Math.min(NUDGE_MAX, value));
}

export function computeNudgedEventTime(
  currentTime: number,
  previousTriggerTime: number | null | undefined,
  nextTriggerTime: number | null | undefined,
  nudge: number,
): number {
  const amount = clampNudge(nudge);
  if (Math.abs(amount) <= NUDGE_EPSILON) return currentTime;
  if (amount < 0) {
    if (previousTriggerTime == null || !Number.isFinite(previousTriggerTime)) return currentTime;
    return currentTime + (currentTime - previousTriggerTime) * amount;
  }
  if (nextTriggerTime == null || !Number.isFinite(nextTriggerTime)) return currentTime;
  return currentTime + (nextTriggerTime - currentTime) * amount;
}

export function computeNudgeFromContinuousStep(
  targetStepFloat: number,
  previousTriggerStep: number | null | undefined,
  currentTriggerStep: number,
  nextTriggerStep: number | null | undefined,
): number {
  if (!Number.isFinite(targetStepFloat) || !Number.isFinite(currentTriggerStep)) return 0;
  const delta = targetStepFloat - currentTriggerStep;
  if (Math.abs(delta) <= NUDGE_EPSILON) return 0;
  if (delta < 0) {
    if (previousTriggerStep == null || !Number.isFinite(previousTriggerStep)) return 0;
    const span = currentTriggerStep - previousTriggerStep;
    return span > NUDGE_EPSILON ? clampNudge(delta / span) : 0;
  }
  if (nextTriggerStep == null || !Number.isFinite(nextTriggerStep)) return 0;
  const span = nextTriggerStep - currentTriggerStep;
  return span > NUDGE_EPSILON ? clampNudge(delta / span) : 0;
}

export function nudgeLabel(value: number): string {
  const nudge = clampNudge(value);
  if (Math.abs(nudge) <= NUDGE_EPSILON) return 'quantized';
  const pct = Math.round(Math.abs(nudge) * 100);
  return nudge > 0 ? `+${pct}% late` : `-${pct}% early`;
}
