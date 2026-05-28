import { useSyncExternalStore } from 'react';

type RuntimeValueStoreState = {
  version: number;
  values: Record<string, number>;
};

const listeners = new Set<() => void>();

let storeState: RuntimeValueStoreState = {
  version: 0,
  values: {},
};

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

function emit(nextValues: Record<string, number>): void {
  storeState = {
    version: storeState.version + 1,
    values: nextValues,
  };
  listeners.forEach((listener) => listener());
}

function updateStore(
  updater: (current: Record<string, number>) => Record<string, number>,
): void {
  const current = storeState.values;
  const next = updater(current);
  if (recordsEqual(current, next)) return;
  emit(next);
}

export function mergeRuntimeValues(partial: Record<string, number>): void {
  updateStore((current) => {
    let changed = false;
    const next = { ...current };
    for (const [key, value] of Object.entries(partial)) {
      if (!Number.isFinite(value)) continue;
      if (Math.abs((current[key] ?? 0) - value) <= 0.0005) continue;
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
  return useSyncExternalStore(
    subscribe,
    () => getRuntimeValue(key) ?? fallback,
    () => fallback,
  );
}

export function useRuntimeValueVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => storeState.version,
    () => 0,
  );
}
