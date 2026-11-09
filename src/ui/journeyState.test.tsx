import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimpleJourney } from '../audio/journeyTypes';
import { DEFAULT_STATE } from './state';
import { useJourney, type UseJourneyResult } from './journeyState';

test('Journey waits for audio readiness, cancels stale starts, and pauses its clock while staging a morph', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousRequestAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const previousCancelAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const previousPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let wallTime = 0;
  const visibilityListeners = new Set<() => void>();
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  let rafSerial = 0;
  const requestAnimationFrameShim = (callback: FrameRequestCallback): number => {
    const id = ++rafSerial;
    rafCallbacks.set(id, callback);
    return id;
  };
  const cancelAnimationFrameShim = (id: number): void => {
    rafCallbacks.delete(id);
  };
  const documentShim: any = {
    visibilityState: 'visible',
    activeElement: null,
    body: null,
    addEventListener: (name: string, listener: () => void) => { if (name === 'visibilitychange') visibilityListeners.add(listener); },
    removeEventListener: (name: string, listener: () => void) => { if (name === 'visibilitychange') visibilityListeners.delete(listener); },
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
    requestAnimationFrame: requestAnimationFrameShim,
    cancelAnimationFrame: cancelAnimationFrameShim,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout,
    clearTimeout,
  };
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: requestAnimationFrameShim });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: cancelAnimationFrameShim });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => wallTime } });


  let api!: UseJourneyResult;
  let resolveLoad!: () => void;
  let rejectLoad!: (error: Error) => void;
  let currentRequest!: () => boolean;
  let resolveMorph!: () => void;
  let morphRequested = false;
  let requestedDurationMs = 0;
  let getMorphProgress!: () => number;
  function Probe() {
    api = useJourney(1, (_name, _duration, durationMs, getProgress) => {
      morphRequested = true;
      requestedDurationMs = durationMs;
      getMorphProgress = getProgress;
      return new Promise<void>((resolve) => { resolveMorph = resolve; });
    }, (_name, isCurrent) => {
      currentRequest = isCurrent;
      return new Promise<void>((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    });
    return null;
  }
  const root = createRoot(container);
  const tick = async (now: number) => {
    wallTime = now;
    const callbacks = [...rafCallbacks.values()];
    rafCallbacks.clear();
    await act(async () => callbacks.forEach((callback) => callback(now)));
  };
  try {
    await act(async () => root.render(React.createElement(Probe)));
    const config = createSimpleJourney(
      { name: 'A', timestamp: '', state: DEFAULT_STATE },
      { name: 'B', timestamp: '', state: DEFAULT_STATE },
    );
    config.nodes.forEach((node) => { node.phraseLength = 0.1; });
    config.connections.forEach((connection) => { connection.morphDuration = 1; });
    await act(async () => api.setConfig(config));
    await act(async () => { api.play(); });
    assert.equal(api.isStarting, true);
    assert.equal(api.state.phase, 'idle');
    assert.equal(api.state.elapsedTime, 0);
    assert.equal(rafCallbacks.size, 0, 'no timer before audio is ready');
    await act(async () => api.stop());
    assert.equal(currentRequest(), false);
    await act(async () => resolveLoad());
    assert.equal(api.state.phase, 'idle');
    assert.equal(rafCallbacks.size, 0, 'cancelled startup cannot schedule a timer');

    await act(async () => { api.play(); });
    await act(async () => rejectLoad(new Error('asset unavailable')));
    assert.equal(api.startupError, 'asset unavailable');
    assert.equal(api.isStarting, false);
    assert.equal(api.state.phase, 'idle');
    await act(async () => { api.play(); });
    await act(async () => resolveLoad());
    assert.equal(api.state.phase, 'playing');
    assert.equal(api.startupError, null);
    await tick(100);
    await tick(250);
    assert.equal(api.state.phase, 'morphing');
    assert.equal(morphRequested, true);
    assert.equal(requestedDurationMs, 1000);
    const elapsed = api.state.elapsedTime;
    await tick(2000);
    assert.equal(api.state.elapsedTime, elapsed, 'staging assets cannot consume morph time');
    assert.equal(api.state.morphProgress, 0);
    await act(async () => resolveMorph());
    await tick(performance.now() + 500);
    assert.ok(api.state.morphProgress > 0.4 && api.state.morphProgress < 0.6);
    assert.equal(getMorphProgress(), api.state.morphProgress, 'sound morph reads the same progress as Journey');
    documentShim.visibilityState = 'hidden';
    await act(async () => visibilityListeners.forEach((listener) => listener()));
    assert.equal(rafCallbacks.size, 0);
    wallTime += 100000;
    documentShim.visibilityState = 'visible';
    await act(async () => visibilityListeners.forEach((listener) => listener()));
    await tick(wallTime + 100);
    assert.ok(Math.abs(getMorphProgress() - 0.6) < 1e-6, 'both clocks exclude the hidden interval');
    await tick(wallTime + 500);
    assert.equal(api.state.phase, 'playing');
    assert.equal(getMorphProgress(), 1, 'the final sound frame retains the completed transition progress');
  } finally {
    await act(async () => root.unmount());
    for (const [name, descriptor] of [
      ['window', previousWindow], ['document', previousDocument],
      ['requestAnimationFrame', previousRequestAnimationFrame], ['cancelAnimationFrame', previousCancelAnimationFrame],
      ['IS_REACT_ACT_ENVIRONMENT', previousActEnvironment],
      ['performance', previousPerformance],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
