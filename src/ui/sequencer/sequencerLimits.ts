export const EUCLIDEAN_TRIGGER_STEP_MIN = 2;
export const EUCLIDEAN_STEP_MAX = 32;
export const EUCLIDEAN_SUB_LANE_STEP_MIN = 1;
export const EUCLIDEAN_SUB_LANE_STEP_MAX = 32;

function finiteInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function clampEuclideanTriggerSteps(value: number, fallback = 16): number {
  return Math.max(
    EUCLIDEAN_TRIGGER_STEP_MIN,
    Math.min(EUCLIDEAN_STEP_MAX, finiteInteger(value, fallback)),
  );
}

export function clampEuclideanSubLaneSteps(value: number, fallback = 1): number {
  return Math.max(
    EUCLIDEAN_SUB_LANE_STEP_MIN,
    Math.min(EUCLIDEAN_SUB_LANE_STEP_MAX, finiteInteger(value, fallback)),
  );
}

export function sequencerGridCellCount(steps: number, selectedStep?: number | null): number {
  const visibleSteps = selectedStep != null && selectedStep >= 0
    ? Math.max(steps, selectedStep + 1)
    : steps;
  if (visibleSteps < 9) return 8;
  if (visibleSteps <= 16) return 16;
  return EUCLIDEAN_STEP_MAX;
}

export function sequencerGridColumnCount(steps: number, selectedStep?: number | null): number {
  return Math.min(16, sequencerGridCellCount(steps, selectedStep));
}
