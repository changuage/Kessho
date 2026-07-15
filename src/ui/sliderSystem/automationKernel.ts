import { clampValue } from './scale';

export const DUAL_WALK_TICK_SECONDS = 0.1;
export const MAX_WALK_CATCH_UP_STEPS = 6;

export interface RandomWalkState {
  position: number;
  velocity: number;
  accumulatorSeconds: number;
}

export function advanceRandomWalk(
  previous: RandomWalkState,
  elapsedSeconds: number,
  speed: number,
  randomUnit: () => number,
): RandomWalkState {
  const safeElapsed = Math.min(
    Math.max(Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0, 0),
    DUAL_WALK_TICK_SECONDS * MAX_WALK_CATCH_UP_STEPS,
  );
  const accumulated = Math.max(0, previous.accumulatorSeconds) + safeElapsed;
  const stepCount = Math.min(
    MAX_WALK_CATCH_UP_STEPS,
    Math.floor((accumulated + Number.EPSILON) / DUAL_WALK_TICK_SECONDS),
  );

  if (stepCount === 0) {
    return { ...previous, accumulatorSeconds: accumulated };
  }

  const resolvedSpeed = Math.max(0.01, Number.isFinite(speed) ? speed : 1);
  let position = clampValue(previous.position, 0, 1);
  let velocity = Number.isFinite(previous.velocity) ? previous.velocity : 0;

  for (let index = 0; index < stepCount; index += 1) {
    velocity += (clampValue(randomUnit(), 0, 1) - 0.5) * 0.01 * resolvedSpeed;
    velocity *= 0.98;
    velocity = clampValue(velocity, -0.05 * resolvedSpeed, 0.05 * resolvedSpeed);
    position += velocity;

    if (position < 0) {
      position = 0;
      velocity = Math.abs(velocity);
    } else if (position > 1) {
      position = 1;
      velocity = -Math.abs(velocity);
    }
  }

  return {
    position,
    velocity,
    accumulatorSeconds: accumulated - stepCount * DUAL_WALK_TICK_SECONDS,
  };
}
