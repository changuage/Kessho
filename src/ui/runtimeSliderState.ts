import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { recordSliderSystemCounter } from '../diagnostics/sliderSystemInstrumentation';
import type { SliderMode } from './state';

type RuntimeSliderStoreState = {
  walkPositions: Record<string, number>;
  triggerPositions: Record<string, number>;
  flashKeys: Set<string>;
};

type RuntimeSliderStoreSnapshot = Omit<RuntimeSliderStoreState, 'version'>;

const keyListeners = new Map<string, Set<() => void>>();
const keyVersions = new Map<string, number>();
const demandListeners = new Set<() => void>();
let subscriberDemandCount = 0;
const runtimeSliderDiagnosticsEnabled = Boolean(import.meta.env?.DEV);

let storeState: RuntimeSliderStoreState = {
  walkPositions: {},
  triggerPositions: {},
  flashKeys: new Set<string>(),
};

type RuntimeSliderDebugState = {
  walkStoreUpdateCount: number;
  walkIndicatorConsumeCount: number;
  triggerStoreUpdateCount: number;
  triggerFlashUpdateCount: number;
  triggerIndicatorConsumeCount: number;
  lastWalkKeys: string[];
  lastWalkIndicatorKey: string | null;
  lastWalkIndicatorPosition: number | null;
  lastTriggerKeys: string[];
  lastFlashKeys: string[];
  lastTriggerIndicatorKey: string | null;
  lastTriggerIndicatorPosition: number | null;
  lastTriggerIndicatorFlashing: boolean;
};

const runtimeSliderDebugState: RuntimeSliderDebugState = {
  walkStoreUpdateCount: 0,
  walkIndicatorConsumeCount: 0,
  triggerStoreUpdateCount: 0,
  triggerFlashUpdateCount: 0,
  triggerIndicatorConsumeCount: 0,
  lastWalkKeys: [],
  lastWalkIndicatorKey: null,
  lastWalkIndicatorPosition: null,
  lastTriggerKeys: [],
  lastFlashKeys: [],
  lastTriggerIndicatorKey: null,
  lastTriggerIndicatorPosition: null,
  lastTriggerIndicatorFlashing: false,
};

function emit(next: RuntimeSliderStoreSnapshot, changedKeys: Set<string>): void {
  storeState = {
    walkPositions: next.walkPositions,
    triggerPositions: next.triggerPositions,
    flashKeys: next.flashKeys,
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

export function subscribeRuntimeSliderKey(key: string, listener: () => void): () => void {
  let listeners = keyListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    keyListeners.set(key, listeners);
  }
  const wasPresent = listeners.has(listener);
  listeners.add(listener);
  if (!wasPresent) {
    subscriberDemandCount += 1;
    demandListeners.forEach((notify) => notify());
  }
  return () => {
    const removed = listeners?.delete(listener) ?? false;
    if (listeners?.size === 0) keyListeners.delete(key);
    if (removed) {
      subscriberDemandCount = Math.max(0, subscriberDemandCount - 1);
      demandListeners.forEach((notify) => notify());
    }
  };
}

export function subscribeRuntimeSliderKeys(
  keys: readonly string[],
  listener: () => void,
): () => void {
  const unsubscribers = keys.map((key) => subscribeRuntimeSliderKey(key, listener));
  return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); };
}

function changedStoreKeys(
  current: RuntimeSliderStoreSnapshot,
  next: RuntimeSliderStoreSnapshot,
): Set<string> {
  const changed = new Set<string>();
  for (const key of Object.keys(current.walkPositions)) {
    if (!(key in next.walkPositions) || Math.abs(current.walkPositions[key]! - next.walkPositions[key]!) > 0.0005) changed.add(key);
  }
  for (const key of Object.keys(next.walkPositions)) {
    if (!(key in current.walkPositions) || Math.abs(current.walkPositions[key]! - next.walkPositions[key]!) > 0.0005) changed.add(key);
  }
  for (const key of Object.keys(current.triggerPositions)) {
    if (!(key in next.triggerPositions) || Math.abs(current.triggerPositions[key]! - next.triggerPositions[key]!) > 0.0005) changed.add(key);
  }
  for (const key of Object.keys(next.triggerPositions)) {
    if (!(key in current.triggerPositions) || Math.abs(current.triggerPositions[key]! - next.triggerPositions[key]!) > 0.0005) changed.add(key);
  }
  for (const key of current.flashKeys) if (!next.flashKeys.has(key)) changed.add(key);
  for (const key of next.flashKeys) if (!current.flashKeys.has(key)) changed.add(key);
  return changed;
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
  emit(next, changedStoreKeys(current, next));
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
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const currentValue = current[key];
    if (hasCurrent && currentValue !== undefined && Math.abs(currentValue - value) < 0.0005) continue;
    next[key] = value;
    changed = true;
  }
  return changed ? next : current;
}

export function replaceRuntimeWalkPositions(nextPositions: Record<string, number>): void {
  updateStore((current) => {
    if (recordsEqual(current.walkPositions, nextPositions)) return current;
    if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.walkStoreUpdateCount += 1;
    if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.lastWalkKeys = Object.keys(nextPositions).sort();
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
  updateStore((current) => {
    const triggerPositions = mergePositions(current.triggerPositions, partial);
    if (triggerPositions !== current.triggerPositions) {
      if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.triggerStoreUpdateCount += 1;
      if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.lastTriggerKeys = Object.keys(partial).sort();
    }
    return {
      ...current,
      triggerPositions,
    };
  });
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
      : (() => {
          if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.triggerFlashUpdateCount += 1;
          if (runtimeSliderDiagnosticsEnabled) runtimeSliderDebugState.lastFlashKeys = Array.from(nextKeys).sort();
          return { ...current, flashKeys: nextKeys };
        })()
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
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeSliderKey(key, listener),
    [key],
  );
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
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeSliderKey(key, listener),
    [key],
  );
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
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeSliderKey(key, listener),
    [key],
  );
  useSyncExternalStore(
    subscribe,
    () => keyVersions.get(key) ?? 0,
    () => 0,
  );
  const walkPosition = getRuntimeSliderPosition(key, mode) ?? fallbackPosition;
  const isFlashing = getRuntimeSliderFlashing(key, mode) || fallbackFlashing;
  useEffect(() => {
    if (mode !== 'walk' || typeof walkPosition !== 'number' || !Number.isFinite(walkPosition)) return;
    if (!runtimeSliderDiagnosticsEnabled) return;
    runtimeSliderDebugState.walkIndicatorConsumeCount += 1;
    runtimeSliderDebugState.lastWalkIndicatorKey = key;
    runtimeSliderDebugState.lastWalkIndicatorPosition = walkPosition;
  }, [key, mode, walkPosition]);
  useEffect(() => {
    if (mode !== 'sampleHold') return;
    if (typeof walkPosition !== 'number' || !Number.isFinite(walkPosition)) return;
    if (!runtimeSliderDiagnosticsEnabled) return;
    runtimeSliderDebugState.triggerIndicatorConsumeCount += 1;
    runtimeSliderDebugState.lastTriggerIndicatorKey = key;
    runtimeSliderDebugState.lastTriggerIndicatorPosition = walkPosition;
    runtimeSliderDebugState.lastTriggerIndicatorFlashing = isFlashing;
  }, [isFlashing, key, mode, walkPosition]);
  return { walkPosition, isFlashing };
}

export function getRuntimeSliderKeysVersion(keys: readonly string[]): number {
  return keys.reduce((version, key) => version + (keyVersions.get(key) ?? 0), 0);
}

export function getRuntimeSliderDemandCount(): number {
  return subscriberDemandCount;
}

function subscribeRuntimeSliderDemand(listener: () => void): () => void {
  demandListeners.add(listener);
  return () => { demandListeners.delete(listener); };
}

export function useRuntimeSliderDemand(): number {
  return useSyncExternalStore(
    subscribeRuntimeSliderDemand,
    getRuntimeSliderDemandCount,
    () => 0,
  );
}

export function getRuntimeSliderDebugState(): RuntimeSliderDebugState {
  return {
    ...runtimeSliderDebugState,
    lastWalkKeys: [...runtimeSliderDebugState.lastWalkKeys],
    lastTriggerKeys: [...runtimeSliderDebugState.lastTriggerKeys],
    lastFlashKeys: [...runtimeSliderDebugState.lastFlashKeys],
  };
}
