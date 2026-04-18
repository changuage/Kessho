import { useSyncExternalStore } from 'react';
import type { SliderMode } from './state';

type RuntimeSliderStoreState = {
  version: number;
  walkPositions: Record<string, number>;
  triggerPositions: Record<string, number>;
  flashKeys: Set<string>;
};

type RuntimeSliderStoreSnapshot = Omit<RuntimeSliderStoreState, 'version'>;

const listeners = new Set<() => void>();

let storeState: RuntimeSliderStoreState = {
  version: 0,
  walkPositions: {},
  triggerPositions: {},
  flashKeys: new Set<string>(),
};

function emit(next: RuntimeSliderStoreSnapshot): void {
  storeState = {
    version: storeState.version + 1,
    walkPositions: next.walkPositions,
    triggerPositions: next.triggerPositions,
    flashKeys: next.flashKeys,
  };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function recordsEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of rightKeys) {
    if (Math.abs((left[key] ?? 0) - (right[key] ?? 0)) > 0.0005) return false;
  }
  return true;
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const key of right) {
    if (!left.has(key)) return false;
  }
  return true;
}

function updateStore(
  updater: (current: RuntimeSliderStoreSnapshot) => RuntimeSliderStoreSnapshot,
): void {
  const current: RuntimeSliderStoreSnapshot = {
    walkPositions: storeState.walkPositions,
    triggerPositions: storeState.triggerPositions,
    flashKeys: storeState.flashKeys,
  };
  const next = updater(current);
  if (
    recordsEqual(current.walkPositions, next.walkPositions) &&
    recordsEqual(current.triggerPositions, next.triggerPositions) &&
    setsEqual(current.flashKeys, next.flashKeys)
  ) {
    return;
  }
  emit(next);
}

function cloneFlashKeys(keys: Iterable<string>): Set<string> {
  const next = new Set<string>();
  for (const key of keys) {
    next.add(key);
  }
  return next;
}

function mergePositions(
  current: Record<string, number>,
  partial: Record<string, number>,
): Record<string, number> {
  let changed = false;
  const next = { ...current };
  for (const [key, value] of Object.entries(partial)) {
    if (!Number.isFinite(value)) continue;
    if (Math.abs((current[key] ?? 0.5) - value) < 0.0005) continue;
    next[key] = value;
    changed = true;
  }
  return changed ? next : current;
}

export function replaceRuntimeWalkPositions(nextPositions: Record<string, number>): void {
  updateStore((current) => {
    if (recordsEqual(current.walkPositions, nextPositions)) return current;
    return {
      ...current,
      walkPositions: { ...nextPositions },
    };
  });
}

export function mergeRuntimeWalkPositions(partial: Record<string, number>): void {
  updateStore((current) => ({
    ...current,
    walkPositions: mergePositions(current.walkPositions, partial),
  }));
}

export function removeRuntimeWalkPositions(keys: Iterable<string>): void {
  updateStore((current) => {
    let changed = false;
    const next = { ...current.walkPositions };
    for (const key of keys) {
      if (!(key in next)) continue;
      delete next[key];
      changed = true;
    }
    return changed ? { ...current, walkPositions: next } : current;
  });
}

export function mergeRuntimeTriggerPositions(partial: Record<string, number>): void {
  updateStore((current) => ({
    ...current,
    triggerPositions: mergePositions(current.triggerPositions, partial),
  }));
}

export function removeRuntimeTriggerPositions(keys: Iterable<string>): void {
  updateStore((current) => {
    let changed = false;
    const next = { ...current.triggerPositions };
    for (const key of keys) {
      if (!(key in next)) continue;
      delete next[key];
      changed = true;
    }
    return changed ? { ...current, triggerPositions: next } : current;
  });
}

export function setRuntimeFlashKeys(keys: Iterable<string>): void {
  const nextKeys = cloneFlashKeys(keys);
  updateStore((current) => (
    setsEqual(current.flashKeys, nextKeys)
      ? current
      : { ...current, flashKeys: nextKeys }
  ));
}

export function clearRuntimeFlashKeys(): void {
  setRuntimeFlashKeys([]);
}

export function getRuntimeSliderPosition(
  key: string,
  mode: SliderMode,
): number | undefined {
  if (mode === 'walk') return storeState.walkPositions[key];
  if (mode === 'sampleHold') return storeState.triggerPositions[key];
  return undefined;
}

export function getRuntimeSliderFlashing(
  key: string,
  mode: SliderMode,
): boolean {
  return mode === 'sampleHold' && storeState.flashKeys.has(key);
}

export function useRuntimeSliderPosition(
  key: string,
  mode: SliderMode,
  fallback?: number,
): number | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getRuntimeSliderPosition(key, mode) ?? fallback,
    () => fallback,
  );
}

export function useRuntimeSliderFlashing(
  key: string,
  mode: SliderMode,
  fallback = false,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getRuntimeSliderFlashing(key, mode) || fallback,
    () => fallback,
  );
}

export function useRuntimeSliderIndicator(
  key: string,
  mode: SliderMode,
  fallbackPosition?: number,
  fallbackFlashing = false,
): { walkPosition?: number; isFlashing: boolean } {
  const walkPosition = useRuntimeSliderPosition(key, mode, fallbackPosition);
  const isFlashing = useRuntimeSliderFlashing(key, mode, fallbackFlashing);
  return { walkPosition, isFlashing };
}

export function useRuntimeSliderVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => storeState.version,
    () => 0,
  );
}
