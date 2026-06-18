import { sampleGlobalWalkPosition } from '../../audio/transport';
import type { SliderMode, SliderState } from '../state';

export interface DualSliderAutomationInput {
  key: string;
  baseValue: number;
  minValue: number;
  maxValue: number;
  mode: SliderMode | undefined;
  lowerBound?: number;
  upperBound?: number;
  nowSeconds: number;
  deltaSeconds: number;
  triggerAmount: number;
  seed: number;
  state: DualSliderAutomationState | undefined;
  walkMode?: SliderState['randomWalkMode'];
  walkSpeed?: SliderState['randomWalkSpeed'];
  seedWindow?: SliderState['seedWindow'];
}

export interface DualSliderAutomationState {
  value: number;
  target: number;
  velocity: number;
  lastStepTime: number;
  lastTriggerBucket: number;
  holdValue: number;
  stepIndex: number;
  lastTriggerAmount: number;
}

export interface DualSliderAutomationResult {
  value: number;
  state: DualSliderAutomationState;
}

const WALK_STEP_SECONDS = 1 / 15;
const MAX_CATCHUP_STEPS = 6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function hashStringToUnit(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function normalizeRange(input: DualSliderAutomationInput): { min: number; max: number } {
  const minValue = Math.min(input.minValue, input.maxValue);
  const maxValue = Math.max(input.minValue, input.maxValue);
  const lower = typeof input.lowerBound === 'number' && Number.isFinite(input.lowerBound)
    ? input.lowerBound
    : input.baseValue;
  const upper = typeof input.upperBound === 'number' && Number.isFinite(input.upperBound)
    ? input.upperBound
    : input.baseValue;
  const min = clamp(Math.min(lower, upper), minValue, maxValue);
  const max = clamp(Math.max(lower, upper), minValue, maxValue);
  return max - min <= 0.000001
    ? { min: clamp(input.baseValue, minValue, maxValue), max: clamp(input.baseValue, minValue, maxValue) }
    : { min, max };
}

function valueToPosition(value: number, range: { min: number; max: number }): number {
  return clamp((value - range.min) / Math.max(0.000001, range.max - range.min), 0, 1);
}

function positionToValue(position: number, range: { min: number; max: number }): number {
  return range.min + clamp(position, 0, 1) * (range.max - range.min);
}

function createInitialState(input: DualSliderAutomationInput, range: { min: number; max: number }): DualSliderAutomationState {
  const initial = clamp(input.baseValue, range.min, range.max);
  return {
    value: initial,
    target: valueToPosition(initial, range),
    velocity: 0,
    lastStepTime: input.nowSeconds,
    lastTriggerBucket: -1,
    holdValue: initial,
    stepIndex: 0,
    lastTriggerAmount: 0,
  };
}

function nextSeededUnit(key: string, seed: number, stepIndex: number): number {
  return hashStringToUnit(`${key}|${Math.round(seed * 1000000)}|${stepIndex}`);
}

export function resolveDualSliderAutomation(input: DualSliderAutomationInput): DualSliderAutomationResult {
  const range = normalizeRange(input);
  const baseValue = clamp(input.baseValue, input.minValue, input.maxValue);
  const previous = input.state ?? createInitialState(input, range);

  if (input.mode !== 'walk' && input.mode !== 'sampleHold') {
    return {
      value: baseValue,
      state: {
        ...previous,
        value: baseValue,
        target: valueToPosition(baseValue, range),
        velocity: 0,
        lastStepTime: input.nowSeconds,
      },
    };
  }

  if (range.max - range.min <= 0.000001) {
    return {
      value: range.min,
      state: {
        ...previous,
        value: range.min,
        target: 0.5,
        velocity: 0,
        holdValue: range.min,
        lastStepTime: input.nowSeconds,
      },
    };
  }

  if (input.mode === 'walk') {
    const speed = Math.max(0.01, input.walkSpeed ?? 1);

    if (input.walkMode === 'globalWalk') {
      const position = sampleGlobalWalkPosition(input.key, speed, input.seedWindow ?? 'hour', input.nowSeconds);
      const value = positionToValue(position, range);
      return {
        value,
        state: {
          ...previous,
          value,
          target: position,
          velocity: 0,
          holdValue: value,
          lastStepTime: input.nowSeconds,
        },
      };
    }

    const elapsedSeconds = Math.max(input.deltaSeconds, input.nowSeconds - previous.lastStepTime, WALK_STEP_SECONDS);
    const stepCount = Math.max(1, Math.min(MAX_CATCHUP_STEPS, Math.round(elapsedSeconds / WALK_STEP_SECONDS) || 1));
    let position = Number.isFinite(previous.target) ? clamp(previous.target, 0, 1) : valueToPosition(previous.value, range);
    let velocity = Number.isFinite(previous.velocity) ? previous.velocity : 0;
    let stepIndex = previous.stepIndex;

    for (let step = 0; step < stepCount; step += 1) {
      const randomUnit = nextSeededUnit(input.key, input.seed, stepIndex);
      stepIndex += 1;
      velocity += (randomUnit - 0.5) * 0.01 * speed;
      velocity *= 0.98;
      velocity = clamp(velocity, -0.05 * speed, 0.05 * speed);
      position += velocity;

      if (position < 0) {
        position = 0;
        velocity = Math.abs(velocity);
      } else if (position > 1) {
        position = 1;
        velocity = -Math.abs(velocity);
      }
    }

    const value = positionToValue(position, range);
    return {
      value,
      state: {
        ...previous,
        value,
        target: position,
        velocity,
        holdValue: value,
        lastStepTime: input.nowSeconds,
        stepIndex,
        lastTriggerAmount: input.triggerAmount,
      },
    };
  }

  const triggerAmount = clamp(input.triggerAmount, 0, 1);
  const triggerHigh = triggerAmount >= 0.34;
  const wasHigh = previous.lastTriggerAmount >= 0.28;
  const enoughTimeElapsed = input.nowSeconds - previous.lastStepTime >= 0.18;
  const shouldSample = triggerHigh && !wasHigh && enoughTimeElapsed;
  let holdValue = Number.isFinite(previous.holdValue)
    ? clamp(previous.holdValue, range.min, range.max)
    : clamp(baseValue, range.min, range.max);
  let triggerBucket = previous.lastTriggerBucket;
  let stepTime = previous.lastStepTime;
  let stepIndex = previous.stepIndex;

  if (shouldSample) {
    const randomUnit = nextSeededUnit(input.key, input.seed + triggerAmount, stepIndex);
    stepIndex += 1;
    holdValue = positionToValue(randomUnit, range);
    triggerBucket = Math.floor(input.nowSeconds * 1000);
    stepTime = input.nowSeconds;
  }

  return {
    value: holdValue,
    state: {
      ...previous,
      value: holdValue,
      target: valueToPosition(holdValue, range),
      velocity: 0,
      lastStepTime: stepTime,
      lastTriggerBucket: triggerBucket,
      holdValue,
      stepIndex,
      lastTriggerAmount: triggerAmount,
    },
  };
}
