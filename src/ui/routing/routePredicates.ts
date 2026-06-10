import type { SliderState } from '../state';

export const ROUTING_ACTIVE_EPSILON = 0.0001;

export function numericStateValue(state: SliderState, key: keyof SliderState): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function levelAboveEpsilon(state: SliderState, key: keyof SliderState): boolean {
  return numericStateValue(state, key) > ROUTING_ACTIVE_EPSILON;
}

export function routingFlagEnabled(state: SliderState, key: keyof SliderState): boolean {
  return Boolean(state[key]);
}

export function routingAnyFlagEnabled(state: SliderState, keys: readonly (keyof SliderState)[]): boolean {
  return keys.some((key) => routingFlagEnabled(state, key));
}

