import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { loadProductEngine } from '../audio/product/ProductEngineProxy';
import type { ProductResolvedStateCommit, ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE, type SliderState } from './state';
import { useAudioEngineParamSync, type AudioEngineParamUpdateOptions } from './useAudioEngineParamSync';

type AudioEngineParamScheduler = (
  nextState: SliderState,
  options?: AudioEngineParamUpdateOptions,
) => Promise<void>;

function makeState(masterVolume: number, rootNote: number = DEFAULT_STATE.rootNote): SliderState {
  return { ...DEFAULT_STATE, masterVolume, rootNote };
}

test('audio scheduler flushes current morph targets and drops stale timer values', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const timers = new Map<number, () => void>();
  let timerSerial = 0;
  const setTimeoutShim = (callback: TimerHandler): number => {
    const id = ++timerSerial;
    timers.set(id, () => {
      if (typeof callback === 'function') callback();
    });
    return id;
  };
  const clearTimeoutShim = (id: number): void => {
    timers.delete(id);
  };
  const advanceTimers = async (): Promise<void> => {
    while (timers.size > 0) {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  const documentShim: any = {
    visibilityState: 'visible',
    activeElement: null,
    body: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const container: any = {
    nodeType: 1,
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: documentShim,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  documentShim.documentElement = container;
  const windowShim: any = {
    document: documentShim,
    setTimeout: setTimeoutShim,
    clearTimeout: clearTimeoutShim,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  windowShim.setTimeout = setTimeoutShim;
  windowShim.clearTimeout = clearTimeoutShim;
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  documentShim.defaultView = windowShim;
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  const engine = await loadProductEngine();
  const originalMethods = new Map<string, PropertyDescriptor | undefined>();
  const timerDispatches: Array<{
    kind: 'timer' | 'immediate';
    reason: ProductSnapshotPatchReason;
    target: number;
    rootNote?: number;
  }> = [];
  const replace = (name: string, value: unknown): void => {
    originalMethods.set(name, Object.getOwnPropertyDescriptor(engine, name));
    Object.defineProperty(engine, name, { configurable: true, writable: true, value });
  };
  replace('getCommittedStateRevision', () => 0);
  replace('updateSnapshotPatch', (reason: ProductSnapshotPatchReason, patch: Record<string, unknown>) => {
    timerDispatches.push({
      kind: 'timer',
      reason,
      target: patch.masterVolume as number,
      rootNote: patch.rootNote as number | undefined,
    });
  });
  replace('commitResolvedState', async (commit: ProductResolvedStateCommit) => {
    timerDispatches.push({
      kind: 'immediate',
      reason: commit.reason,
      target: commit.patch.masterVolume as number,
      rootNote: commit.patch.rootNote as number | undefined,
    });
    return { revision: commit.revision, applied: true, mode: 'dirty-diff' as const };
  });

  let schedule: AudioEngineParamScheduler | null = null;
  function Probe() {
    schedule = useAudioEngineParamSync();
    return null;
  }
  let root: ReturnType<typeof createRoot> | null = null;
  try {
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(Probe)));
    assert.ok(schedule);
    const getSchedule = (): AudioEngineParamScheduler => {
      if (schedule === null) throw new Error('audio scheduler hook did not mount');
      return schedule;
    };

    await getSchedule()(makeState(0.85), { immediate: true, reason: 'ui-control-change' });
    timerDispatches.length = 0;

    getSchedule()(makeState(0.1), { reason: 'ui-control-change' });
    getSchedule()(makeState(0.2), { reason: 'ui-control-change' });
    getSchedule()(makeState(0.3), { reason: 'ui-control-change' });
    await advanceTimers();
    assert.deepEqual(timerDispatches.map(({ target }) => target), [0.3], 'burst coalesces to the newest target');
    timerDispatches.length = 0;

    await getSchedule()(makeState(0.4), { reason: 'morph-control-change', immediate: true });
    assert.deepEqual(timerDispatches.map(({ target }) => target), [0.4], 'interior release submits immediately');
    timerDispatches.length = 0;

    await getSchedule()(makeState(0), { reason: 'morph-control-change', immediate: true });
    await getSchedule()(makeState(1), { reason: 'morph-control-change', immediate: true });
    assert.deepEqual(timerDispatches.map(({ target }) => target), [0, 1], 'both endpoint releases submit their current targets');
    timerDispatches.length = 0;

    getSchedule()(makeState(0.55), { reason: 'ui-control-change' });
    assert.equal(timers.size, 1, 'ordinary movement leaves one audio timer pending');
    await getSchedule()(makeState(0.55), { reason: 'morph-control-change', immediate: true });
    await advanceTimers();
    assert.deepEqual(timerDispatches.map(({ target }) => target), [0.55], 'same-position release cancels the pending audio target');
    timerDispatches.length = 0;

    getSchedule()(makeState(0.65, 4), { reason: 'ui-control-change' });
    await getSchedule()(makeState(0.65, 9), { reason: 'morph-control-change', immediate: true });
    await advanceTimers();
    assert.deepEqual(
      timerDispatches.map(({ target, rootNote }) => ({ target, rootNote })),
      [{ target: 0.65, rootNote: 9 }],
      'endpoint content replacement at the same position cannot replay stale work',
    );
  } finally {
    if (root) await act(async () => root!.unmount());
    for (const [name, descriptor] of originalMethods) {
      if (descriptor) Object.defineProperty(engine, name, descriptor);
      else Reflect.deleteProperty(engine, name);
    }
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
