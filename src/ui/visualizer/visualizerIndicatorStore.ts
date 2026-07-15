import { useSyncExternalStore } from 'react';
import type { VisualizerNumericControlKey } from './visualizerModulation';

export type VisualizerControlKey = VisualizerNumericControlKey;

export interface VisualizerIndicatorSnapshot {
  automationPosition?: number;
  modulatedPosition?: number;
}

const EMPTY_SNAPSHOT: VisualizerIndicatorSnapshot = Object.freeze({});
const snapshots = new Map<VisualizerControlKey, VisualizerIndicatorSnapshot>();
const listeners = new Map<VisualizerControlKey, Set<() => void>>();

function positionsEqual(left?: number, right?: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= 0.001;
}

export function subscribeVisualizerIndicator(key: VisualizerControlKey, listener: () => void): () => void {
  let keyListeners = listeners.get(key);
  if (!keyListeners) {
    keyListeners = new Set();
    listeners.set(key, keyListeners);
  }
  keyListeners.add(listener);
  return () => {
    keyListeners?.delete(listener);
    if (keyListeners?.size === 0) listeners.delete(key);
  };
}

export function publishVisualizerIndicator(
  key: VisualizerControlKey,
  snapshot: VisualizerIndicatorSnapshot,
): void {
  const previous = snapshots.get(key);
  if (
    previous &&
    positionsEqual(previous.automationPosition, snapshot.automationPosition) &&
    positionsEqual(previous.modulatedPosition, snapshot.modulatedPosition)
  ) {
    return;
  }
  snapshots.set(key, snapshot);
  listeners.get(key)?.forEach((listener) => listener());
}

export function clearVisualizerIndicator(key: VisualizerControlKey): void {
  if (!snapshots.delete(key)) return;
  listeners.get(key)?.forEach((listener) => listener());
}

export function getVisualizerIndicatorSnapshot(key: VisualizerControlKey): VisualizerIndicatorSnapshot {
  return snapshots.get(key) ?? EMPTY_SNAPSHOT;
}

export function useVisualizerIndicator(key: VisualizerControlKey): VisualizerIndicatorSnapshot {
  return useSyncExternalStore(
    (listener) => subscribeVisualizerIndicator(key, listener),
    () => getVisualizerIndicatorSnapshot(key),
    () => EMPTY_SNAPSHOT,
  );
}
