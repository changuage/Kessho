import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { DualSliderConfig } from './sliderSystem/dualConfigReducer';
import { DEFAULT_STATE, type SliderMode, type SliderState } from './state';
import type {
  ProductAutoCycleEndpointPair,
  ProductAutoCycleProjection,
  ProductAutoCycleRuntimeSurface,
} from './useProductRuntimeAutoCycleSurface';
import { useMorphPositionRuntimeSurface } from './useMorphPositionRuntimeSurface';

type TestPreset = {
  name: string;
  timestamp: string;
  state: SliderState;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

function deferred(): Deferred {
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: () => resolvePromise!(),
    reject: (error) => rejectPromise!(error),
  };
}

function preset(name: string, source: SliderState['modulationSourceA']): TestPreset {
  return {
    name,
    timestamp: name,
    state: {
      ...DEFAULT_STATE,
      modulationSourceA: source,
    },
  };
}

function projection(position: number, confirmedPair: ProductAutoCycleEndpointPair | null): ProductAutoCycleProjection {
  return {
    enabled: true,
    position,
    phase: position < 0.5 ? 'playA' : 'playB',
    phaseEndFrame: 200,
    absoluteSampleTime: 100,
    phraseSeconds: 1,
    sampleRate: 100,
    confirmedEndpointA: confirmedPair?.endpointA ?? null,
    confirmedEndpointB: confirmedPair?.endpointB ?? null,
  };
}

test('Product auto owner keeps lifecycle stable and refreshes metadata only after adoption', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousRequestAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const previousCancelAnimationFrame = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
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
    requestAnimationFrame: requestAnimationFrameShim,
    cancelAnimationFrame: cancelAnimationFrameShim,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: requestAnimationFrameShim });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: cancelAnimationFrameShim });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  let presetA: TestPreset | null = preset('a-initial', { type: 'sampleHold' });
  let presetB: TestPreset | null = preset('b-initial', {
    type: 'walk',
    walk: { relationship: 'free', speed: 2 },
  });
  let state: SliderState = { ...DEFAULT_STATE };
  const stateRef = { current: state };
  const capturedStateRef = { current: { ...DEFAULT_STATE } } as { current: SliderState | null };
  const capturedDualRangesRef = { current: null } as { current: Record<string, { min: number; max: number }> | null };
  const capturedSliderModesRef = { current: null } as { current: Record<string, SliderMode> | null };
  const capturedDualConfigsRef = { current: null } as { current: Record<string, DualSliderConfig> | null };
  const capturedStartRootRef = { current: null } as { current: number | null };
  const directionRef = { current: null } as { current: 'toA' | 'toB' | null };
  const lastEndpointRef = { current: 0 as 0 | 100 };
  const overridesRef = { current: {} } as { current: Record<string, { value: number; morphPosition: number }> };
  const startGate = deferred();
  let replacementGate: Deferred | null = null;
  let pendingReplacementPair: ProductAutoCycleEndpointPair | null = null;
  let initialStartPair: ProductAutoCycleEndpointPair | null = null;
  let confirmedPair: ProductAutoCycleEndpointPair | null = null;
  let rejectNextReplacement = false;
  let projectionPosition = 0.25;
  const startCalls: unknown[] = [];
  const replaceCalls: Array<{ endpointA: Record<string, unknown>; endpointB: Record<string, unknown> }> = [];
  const stopCalls: boolean[] = [];
  const durationUpdates: Array<[number, number]> = [];
  let projectionReads = 0;
  let lastProjection = projection(0.25, null);
  const metadataTypes: string[] = [];
  const metadataMarkers: string[] = [];
  let dualRuntimeApplications = 0;
  let walkResets = 0;
  const morphPlayPhrasesRef = { current: 4 };
  const morphTransitionPhrasesRef = { current: 2 };
  const setMorphCountdown = () => undefined;

  const productAutoCycleRuntime: ProductAutoCycleRuntimeSurface = {
    start: (options) => {
      startCalls.push(options);
      initialStartPair = { endpointA: options.endpointA, endpointB: options.endpointB };
      confirmedPair = null;
      return startGate.promise;
    },
    replace: (options) => {
      replaceCalls.push(options);
      if (rejectNextReplacement) {
        rejectNextReplacement = false;
        return Promise.reject(new Error('not-ready'));
      }
      pendingReplacementPair = options;
      replacementGate ??= deferred();
      return replacementGate.promise;
    },
    stop: (clearAssets) => {
      stopCalls.push(clearAssets);
    },
    updateDurations: (playPhrases, transitionPhrases) => {
      durationUpdates.push([playPhrases, transitionPhrases]);
    },
    readProjection: () => {
      projectionReads += 1;
      lastProjection = projection(projectionPosition, confirmedPair);
      return lastProjection;
    },
  };

  const setState = (next: React.SetStateAction<SliderState>): void => {
    state = typeof next === 'function' ? next(state) : next;
    stateRef.current = state;
    metadataTypes.push(state.modulationSourceA.type);
    metadataMarkers.push(JSON.stringify(state.modulationSourceA));
  };
  const lerpPresets = (
    left: TestPreset,
    right: TestPreset,
    position: number,
  ) => {
    const endpointStateA = { ...DEFAULT_STATE, ...left.state };
    const endpointStateB = { ...DEFAULT_STATE, ...right.state };
    return {
      state: position < 50 ? endpointStateA : endpointStateB,
      endpointStateA,
      endpointStateB,
      dualRanges: {},
      dualModes: {},
      dualConfigs: {},
    };
  };

  function Probe() {
    useMorphPositionRuntimeSurface({
      morphPresetA: presetA,
      morphPresetB: presetB,
      morphMode: 'auto',
      morphPosition: 0,
      currentCofStep: 0,
      state,
      stateRef,
      morphPlayPhrases: 4,
      morphTransitionPhrases: 2,
      morphPlayPhrasesRef,
      morphTransitionPhrasesRef,
      morphCapturedStateRef: capturedStateRef,
      morphCapturedDualRangesRef: capturedDualRangesRef,
      morphCapturedSliderModesRef: capturedSliderModesRef,
      morphCapturedDualConfigsRef: capturedDualConfigsRef,
      morphCapturedStartRootRef: capturedStartRootRef,
      morphDirectionRef: directionRef,
      lastMorphEndpointRef: lastEndpointRef,
      morphManualOverridesRef: overridesRef,
      setMorphPosition: () => undefined,
      setState,
      dualConfigs: {},
      setDualSliderConfigs: () => {
        dualRuntimeApplications += 1;
      },
      setMorphCoFViz: () => undefined,
      setMorphCountdown,
      lerpPresets,
      resetCofDrift: () => undefined,
      resetRuntimeWalkPositionsForModes: () => {
        walkResets += 1;
      },
      scheduleProductRuntimeParamUpdate: () => undefined,
      isEngineRunning: true,
      productRuntimeActive: true,
      productAutoCycleRuntime,
    });
    return null;
  }

  const root = createRoot(container);
  const render = async (): Promise<void> => {
    await act(async () => root.render(React.createElement(Probe)));
  };
  const flushMicrotasks = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const runProjectionFrame = async (now: number): Promise<void> => {
    const entry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(entry, 'projection read loop did not schedule a frame');
    rafCallbacks.delete(entry[0]);
    await act(async () => entry[1](now));
  };
  const resolveReplacement = async (): Promise<void> => {
    const gate = replacementGate;
    assert.ok(gate, 'replacement was not pending');
    assert.ok(pendingReplacementPair, 'replacement pair was not captured');
    confirmedPair = pendingReplacementPair;
    pendingReplacementPair = null;
    replacementGate = null;
    gate.resolve();
    await flushMicrotasks();
  };
  const rejectReplacement = async (): Promise<void> => {
    const gate = replacementGate;
    assert.ok(gate, 'replacement was not pending');
    replacementGate = null;
    pendingReplacementPair = null;
    gate.reject(new Error('not-ready-latest'));
    await flushMicrotasks();
  };
  const latestMetadataType = (): string | undefined => metadataTypes[metadataTypes.length - 1];
  const latestMetadataMarker = (): string | undefined => metadataMarkers[metadataMarkers.length - 1];

  try {
    await render();
    assert.equal(startCalls.length, 1, 'initial auto start was not installed');
    assert.deepEqual(durationUpdates, [[4, 2]], 'initial durations were not forwarded');
    await runProjectionFrame(200);
    assert.ok(projectionReads > 0, 'projection reads stopped while start was unresolved');
    assert.equal(metadataTypes.length, 0, 'unadopted start changed modulation metadata');

    assert.ok(initialStartPair);
    confirmedPair = initialStartPair;
    startGate.resolve();
    await flushMicrotasks();
    assert.equal(latestMetadataType(), 'sampleHold', 'initial A metadata was not adopted');

    projectionPosition = 0.75;
    await runProjectionFrame(400);
    assert.equal(latestMetadataType(), 'walk', 'authoritative B projection did not refresh metadata');

    presetA = preset('a-adopted', { type: 'shape', shape: { shape: 'triangle', timing: { mode: 'free', speed: 1 } } });
    await render();
    assert.equal(replaceCalls.length, 1, 'A edit did not use replacement');
    const metadataBeforePendingA = metadataTypes.length;
    projectionPosition = 0.25;
    await runProjectionFrame(600);
    assert.equal(metadataTypes.length, metadataBeforePendingA + 1, 'pending A crossing did not use installed metadata');
    assert.equal(latestMetadataType(), 'sampleHold', 'pending A crossing used draft metadata');
    await resolveReplacement();
    assert.equal(latestMetadataType(), 'shape', 'adopted A edit did not refresh same-side metadata');

    presetB = preset('b-adopted', { type: 'sampleHold' });
    await render();
    assert.equal(replaceCalls.length, 2, 'B edit did not use replacement');
    projectionPosition = 0.75;
    const metadataBeforePendingB = metadataTypes.length;
    await runProjectionFrame(800);
    assert.equal(metadataTypes.length, metadataBeforePendingB + 1, 'pending B crossing did not use installed metadata');
    assert.equal(latestMetadataType(), 'walk', 'pending B crossing used draft metadata');
    await resolveReplacement();
    assert.equal(latestMetadataType(), 'sampleHold', 'adopted B edit did not refresh metadata');

    presetA = preset('a-pending-old', { type: 'walk', walk: { relationship: 'link', speed: 3 } });
    await render();
    presetA = preset('a-pending-latest', { type: 'shape', shape: { shape: 'square', timing: { mode: 'free', speed: 2 } } });
    await render();
    assert.equal(replaceCalls.length, 4, 'two pending endpoint edits were not serialized');
    const metadataBeforeLatest = metadataTypes.length;
    projectionPosition = 0.25;
    await runProjectionFrame(1000);
    assert.equal(metadataTypes.length, metadataBeforeLatest + 1, 'latest pending crossing did not use confirmed metadata');
    assert.match(latestMetadataMarker() ?? '', /triangle/);
    await resolveReplacement();
    assert.equal(latestMetadataType(), 'shape', 'latest pending endpoint was not the adopted pair');
    assert.match(latestMetadataMarker() ?? '', /square/);

    rejectNextReplacement = true;
    presetB = preset('b-rejected', { type: 'walk', walk: { relationship: 'free', speed: 4 } });
    await render();
    await flushMicrotasks();
    projectionPosition = 0.75;
    await runProjectionFrame(1200);
    assert.equal(latestMetadataType(), 'sampleHold', 'not-ready draft changed installed metadata');
    assert.equal(latestMetadataMarker(), JSON.stringify({ type: 'sampleHold' }), 'rejected draft replaced confirmed B metadata');

    presetA = null;
    capturedStateRef.current = {
      ...DEFAULT_STATE,
      modulationSourceA: { type: 'sampleHold' },
    };
    await render();
    assert.equal(replaceCalls.length, 6, 'fallback content change did not use replacement');
    projectionPosition = 0.25;
    await resolveReplacement();
    assert.equal(latestMetadataType(), 'sampleHold', 'adopted fallback content did not refresh metadata');

    // Candidate X is uploaded first; Y queues behind the same serialized
    // transaction. A fresh projection can acknowledge X before Y admission
    // settles, and a later Y failure must not replace X's complete metadata.
    presetA = preset('x-a', { type: 'shape', shape: { shape: 'triangle', timing: { mode: 'free', speed: 1 } } });
    presetB = preset('x-b', { type: 'walk', walk: { relationship: 'link', speed: 3 } });
    await render();
    const xCall = replaceCalls[replaceCalls.length - 1]!;
    presetA = preset('y-a', { type: 'sampleHold' });
    presetB = preset('y-b', { type: 'shape', shape: { shape: 'square', timing: { mode: 'free', speed: 2 } } });
    await render();
    assert.equal(replaceCalls.length, 8, 'Y did not queue behind candidate X');
    confirmedPair = { endpointA: xCall.endpointA, endpointB: xCall.endpointB };
    projectionPosition = 0.25;
    const metadataBeforeXAdoption = metadataMarkers.length;
    const dualApplicationsBeforeXAdoption = dualRuntimeApplications;
    await runProjectionFrame(1400);
    const xProjection = lastProjection;
    assert.equal(xProjection.confirmedEndpointA, xCall.endpointA, 'fresh X adoption did not publish confirmed X A');
    assert.equal(xProjection.confirmedEndpointB, xCall.endpointB, 'fresh X adoption did not publish confirmed X B');
    assert.equal(metadataMarkers.length, metadataBeforeXAdoption + 1, 'fresh X adoption did not apply metadata immediately');
    assert.match(latestMetadataMarker() ?? '', /triangle/, 'fresh X adoption did not apply complete X A metadata');
    assert.ok(dualRuntimeApplications > dualApplicationsBeforeXAdoption, 'fresh X adoption did not apply complete dual metadata');
    await rejectReplacement();
    projectionPosition = 0.75;
    await runProjectionFrame(1600);
    assert.match(latestMetadataMarker() ?? '', /link/, 'Y rejection replaced confirmed X B metadata');

    const metadataBeforeStop = metadataTypes.length;
    presetB = preset('b-after-unmount', { type: 'walk', walk: { relationship: 'free', speed: 5 } });
    await render();
    assert.equal(replaceCalls.length, 9);
    await act(async () => root.unmount());
    assert.ok(stopCalls.length >= 1, 'unmount did not stop Product auto');
    await resolveReplacement();
    assert.equal(metadataTypes.length, metadataBeforeStop, 'late replacement changed metadata after unmount');
    assert.equal(startCalls.length, 1, 'endpoint edits restarted Product auto');
    assert.equal(dualRuntimeApplications > 0, true, 'adopted metadata did not refresh dual runtime');
    assert.equal(walkResets > 0, true, 'adopted metadata did not reset runtime walk positions');
  } finally {
    await act(async () => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as { document?: unknown }).document;
    if (previousRequestAnimationFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', previousRequestAnimationFrame);
    else delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    if (previousCancelAnimationFrame) Object.defineProperty(globalThis, 'cancelAnimationFrame', previousCancelAnimationFrame);
    else delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    else delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT;
  }
});
