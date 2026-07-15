import { useCallback, useSyncExternalStore } from 'react';
import { recordSliderSystemCounter } from '../diagnostics/sliderSystemInstrumentation';

type RuntimeValueStoreState = {
  values: Record<string, number>;
};

const keyListeners = new Map<string, Set<() => void>>();
const keyVersions = new Map<string, number>();

let storeState: RuntimeValueStoreState = {
  values: {},
};

export function subscribeRuntimeValueKey(key: string, listener: () => void): () => void {
  let listeners = keyListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    keyListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) keyListeners.delete(key);
  };
}

export function subscribeRuntimeValueKeys(
  keys: readonly string[],
  listener: () => void,
): () => void {
  const unsubscribers = keys.map((key) => subscribeRuntimeValueKey(key, listener));
  return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); };
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

function emit(nextValues: Record<string, number>, changedKeys: Set<string>): void {
  storeState = {
    values: nextValues,
  };
  let notificationCount = 0;
  for (const key of changedKeys) {
    keyVersions.set(key, (keyVersions.get(key) ?? 0) + 1);
    const listeners = keyListeners.get(key);
    if (!listeners) continue;
    notificationCount += listeners.size;
    listeners.forEach((listener) => listener());
  }
  recordSliderSystemCounter('runtimeStoreListenerNotifications', notificationCount);
}

function updateStore(
  updater: (current: Record<string, number>) => Record<string, number>,
): void {
  const current = storeState.values;
  const next = updater(current);
  if (recordsEqual(current, next)) return;
  const changedKeys = new Set<string>();
  for (const key of Object.keys(current)) {
    if (!(key in next) || Math.abs(current[key]! - next[key]!) > 0.0005) changedKeys.add(key);
  }
  for (const key of Object.keys(next)) {
    if (!(key in current) || Math.abs(current[key]! - next[key]!) > 0.0005) changedKeys.add(key);
  }
  emit(next, changedKeys);
}

export function mergeRuntimeValues(partial: Record<string, number>): void {
  updateStore((current) => {
    let changed = false;
    const next = { ...current };
    for (const [key, value] of Object.entries(partial)) {
      if (!Number.isFinite(value)) continue;
      const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
      const currentValue = current[key];
      if (hasCurrent && currentValue !== undefined && Math.abs(currentValue - value) <= 0.0005) continue;
      next[key] = value;
      changed = true;
    }
    return changed ? next : current;
  });
}

export function removeRuntimeValues(keys: Iterable<string>): void {
  updateStore((current) => {
    let changed = false;
    const next = { ...current };
    for (const key of keys) {
      if (!(key in next)) continue;
      delete next[key];
      changed = true;
    }
    return changed ? next : current;
  });
}

export function getRuntimeValue(key: string): number | undefined {
  return storeState.values[key];
}

export function useRuntimeValue(
  key: string,
  fallback?: number,
): number | undefined {
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeValueKey(key, listener),
    [key],
  );
  return useSyncExternalStore(
    subscribe,
    () => getRuntimeValue(key) ?? fallback,
    () => fallback,
  );
}

export function useRuntimeValueKeysVersion(keys: readonly string[]): number {
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeValueKeys(keys, listener),
    [keys],
  );
  return useSyncExternalStore(
    subscribe,
    () => keys.reduce((version, key) => version + (keyVersions.get(key) ?? 0), 0),
    () => 0,
  );
}
