import type { SliderMode } from './state';
import {
  mergeRuntimeWalkPositions,
  removeRuntimeWalkPositions,
  replaceRuntimeWalkPositions,
} from './runtimeSliderState';

export function replaceRuntimeWalkPositionSnapshot(nextPositions: Record<string, number>): void {
  replaceRuntimeWalkPositions(nextPositions);
}

export function clearRuntimeWalkPositions(keys: Iterable<string>): void {
  removeRuntimeWalkPositions(keys);
}

export function seedRuntimeWalkPosition(key: string, position = 0.5): void {
  mergeRuntimeWalkPositions({ [key]: position });
}

export function resetRuntimeWalkPositionsForKeys(keys: Iterable<string>, positions: Record<string, number>): void {
  removeRuntimeWalkPositions(keys);
  mergeRuntimeWalkPositions(positions);
}

export function resetRuntimeWalkPositionsForModes(modes: Record<string, SliderMode>): void {
  const nextPositions: Record<string, number> = {};
  for (const [key, mode] of Object.entries(modes)) {
    if (mode === 'single') continue;
    nextPositions[key] = 0.5;
  }
  resetRuntimeWalkPositionsForKeys(Object.keys(modes), nextPositions);
}
