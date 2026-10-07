import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { DualSliderConfig } from './sliderSystem/dualConfigReducer';
import { DEFAULT_STATE, type SliderMode, type SliderState } from './state';
import {
  useMorphPositionRuntimeSurface,
} from './useMorphPositionRuntimeSurface';
import type { ProductAutoCycleRuntimeSurface } from './useProductRuntimeAutoCycleSurface';
import type { ProductRuntimeParamUpdateOptions } from './useProductRuntimePresetSurface';

type TestPreset = {
  name: string;
  timestamp: string;
  state: SliderState;
};

function makePreset(masterVolume: number): TestPreset {
  return {
    name: 'same draft',
    timestamp: 'same timestamp',
    state: { ...DEFAULT_STATE, masterVolume },
  };
}

const productAutoCycleRuntime: ProductAutoCycleRuntimeSurface = {
  start: async () => undefined,
  replace: async () => undefined,
  stop: () => undefined,
  updateDurations: () => undefined,
  readProjection: () => null,
};

test('endpoint replacement cancels stale morph work and allows the same position to apply again', async () => {
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

  let presetA: TestPreset | null = makePreset(0.2);
  let presetB: TestPreset | null = makePreset(0.8);
  let state: SliderState = { ...DEFAULT_STATE };
  const stateRef = { current: state };
  const capturedStateRef = { current: null } as { current: SliderState | null };
  const capturedDualRangesRef = { current: null } as { current: Record<string, { min: number; max: number }> | null };
  const capturedSliderModesRef = { current: null } as { current: Record<string, SliderMode> | null };
  const capturedDualConfigsRef = { current: null } as { current: Record<string, DualSliderConfig> | null };
  const capturedStartRootRef = { current: null } as { current: number | null };
  const directionRef = { current: null } as { current: 'toA' | 'toB' | null };
  const lastEndpointRef = { current: 0 as 0 | 100 };
  const overridesRef = { current: {} } as { current: Record<string, { value: number; morphPosition: number }> };
  const appliedStates: SliderState[] = [];
  const submissions: Array<{ state: SliderState; options?: ProductRuntimeParamUpdateOptions }> = [];
  const lerpDirections: Array<'toA' | 'toB'> = [];
  let lerpCalls = 0;
  let dualRuntimeApplications = 0;
  let cofResets = 0;
  let api: { handleMorphPositionChange: (position: number, options?: { flush?: boolean }) => void } | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const setState = (next: React.SetStateAction<SliderState>): void => {
    state = typeof next === 'function' ? next(state) : next;
    stateRef.current = state;
    appliedStates.push(state);
  };
  const lerpPresets = (
    left: TestPreset,
    right: TestPreset,
    position: number,
    _currentCofStep = 0,
    _capturedStartRoot?: number,
    direction: 'toA' | 'toB' = 'toB',
  ) => {
    lerpCalls += 1;
    lerpDirections.push(direction);
    return {
      state: {
        ...DEFAULT_STATE,
        masterVolume: left.state.masterVolume + (right.state.masterVolume - left.state.masterVolume) * position / 100,
      },
      endpointStateA: { ...DEFAULT_STATE, ...left.state, masterVolume: left.state.masterVolume + 0.1 },
      endpointStateB: { ...DEFAULT_STATE, ...right.state, masterVolume: right.state.masterVolume + 0.1 },
      dualRanges: {},
      dualModes: {},
      dualConfigs: {},
    };
  };
  function Probe() {
    api = useMorphPositionRuntimeSurface({
      morphPresetA: presetA,
      morphPresetB: presetB,
      morphMode: 'manual',
      morphPosition: 50,
      currentCofStep: 0,
      state,
      stateRef,
      morphPlayPhrases: 1,
      morphTransitionPhrases: 1,
      morphPlayPhrasesRef: { current: 1 },
      morphTransitionPhrasesRef: { current: 1 },
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
      setMorphCountdown: () => undefined,
      lerpPresets,
      resetCofDrift: () => {
        cofResets += 1;
      },
      resetRuntimeWalkPositionsForModes: () => undefined,
      scheduleProductRuntimeParamUpdate: (nextState, options) => {
        appliedStates.push(nextState);
        submissions.push({ state: nextState, options });
      },
      isEngineRunning: false,
      productRuntimeActive: true,
      productAutoCycleRuntime,
    });
    return null;
  }

  const render = async () => {
    await act(async () => root!.render(React.createElement(Probe)));
  };
  const requireApi = () => {
    assert.ok(api);
    return api;
  };
  const latestSubmission = () => submissions[submissions.length - 1];

  try {
    root = createRoot(container);
    await render();

    requireApi().handleMorphPositionChange(50);
    const interiorEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(interiorEntry);
    rafCallbacks.delete(interiorEntry[0]);
    await act(async () => interiorEntry[1](16.7));
    assert.equal(latestSubmission()?.state.masterVolume, 0.5);
    assert.deepEqual(latestSubmission()?.options, { reason: 'morph-control-change' });

    const interiorLerpCalls = lerpCalls;
    const interiorDualApplications = dualRuntimeApplications;
    const interiorCofResets = cofResets;
    const interiorSubmissionCount = submissions.length;
    requireApi().handleMorphPositionChange(50, { flush: true });
    assert.equal(submissions.length, interiorSubmissionCount + 1, 'same-position release submits exactly once');
    assert.deepEqual(latestSubmission()?.options, {
      reason: 'morph-control-change',
      immediate: true,
    });
    assert.equal(lerpCalls, interiorLerpCalls, 'same-position release reuses the resolved interpolation');
    assert.equal(dualRuntimeApplications, interiorDualApplications, 'same-position release does not reapply dual runtime state');
    assert.equal(cofResets, interiorCofResets, 'same-position release does not reset CoF drift');

    requireApi().handleMorphPositionChange(50);
    assert.equal(rafCallbacks.size, 1, 'the initial position is pending in the RAF scheduler');
    const staleEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    const staleCallback = staleEntry?.[1];
    const appliedBeforeReplacement = appliedStates.length;
    const submissionsBeforeReplacement = submissions.length;

    presetA = makePreset(0.6);
    await render();
    assert.equal(rafCallbacks.size, 0, 'endpoint replacement cancels the stale RAF callback');
    await act(async () => staleCallback?.(16.7));
    assert.equal(appliedStates.length, appliedBeforeReplacement, 'cancelled endpoint work does not commit');
    assert.equal(submissions.length, submissionsBeforeReplacement, 'cancelled endpoint work does not submit');

    requireApi().handleMorphPositionChange(50);
    const pendingEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    const pending = pendingEntry?.[1];
    assert.ok(pending);
    if (pendingEntry) rafCallbacks.delete(pendingEntry[0]);
    await act(async () => pending(16.7));
    const latest = appliedStates[appliedStates.length - 1];
    assert.equal(latest?.masterVolume, 0.7, 'the unchanged position uses the replacement endpoint content');
    assert.deepEqual(latestSubmission()?.options, { reason: 'morph-control-change' });

    overridesRef.current = { masterVolume: { value: 0.2, morphPosition: 50 } };
    const beforeOverrideLerpCalls = lerpCalls;
    requireApi().handleMorphPositionChange(50, { flush: true });
    assert.equal(lerpCalls, beforeOverrideLerpCalls + 1, 'a new override invalidates the cached resolution');
    assert.equal(latestSubmission()?.state.masterVolume, 0.2);
    assert.deepEqual(latestSubmission()?.options, {
      reason: 'morph-control-change',
      immediate: true,
    });

    const masterVolumeOverride = overridesRef.current.masterVolume;
    assert.ok(masterVolumeOverride);
    masterVolumeOverride.value = 0.35;
    state = {
      ...state,
      reverbQuality: 'ultra',
      synthChordGeneratorEnabled: true,
      synthChordGeneratorSource: 'sample2',
      leadRandomEnabled: true,
      leadRandomSource: 'lead2',
    };
    stateRef.current = state;
    await render();
    const beforeLiveInputLerpCalls = lerpCalls;
    requireApi().handleMorphPositionChange(50, { flush: true });
    assert.equal(lerpCalls, beforeLiveInputLerpCalls + 1, 'in-place override and live inputs invalidate the cache');
    assert.equal(latestSubmission()?.state.masterVolume, 0.35);
    assert.equal(latestSubmission()?.state.reverbQuality, 'ultra');
    assert.equal(latestSubmission()?.state.synthChordGeneratorEnabled, true);
    assert.equal(latestSubmission()?.state.synthChordGeneratorSource, 'sample2');
    assert.equal(latestSubmission()?.state.leadRandomEnabled, true);
    assert.equal(latestSubmission()?.state.leadRandomSource, 'lead2');
    assert.deepEqual(latestSubmission()?.options, {
      reason: 'morph-control-change',
      immediate: true,
    });
    requireApi().handleMorphPositionChange(75);
    const overrideEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(overrideEntry);
    rafCallbacks.delete(overrideEntry[0]);
    await act(async () => overrideEntry[1](25.1));
    assert.equal(appliedStates[appliedStates.length - 1]?.masterVolume, 0.575, 'manual override returns toward the raw endpoint value');
    overridesRef.current = {};

    presetB = makePreset(0.4);
    lastEndpointRef.current = 100;
    directionRef.current = null;
    capturedStartRootRef.current = null;
    overridesRef.current = {};
    await render();
    const beforeReverseLerpCalls = lerpCalls;
    requireApi().handleMorphPositionChange(50, { flush: true });
    assert.equal(lerpCalls, beforeReverseLerpCalls + 1);
    assert.equal(lerpDirections[lerpDirections.length - 1], 'toA', 'reverse endpoint departure keeps its direction');
    assert.equal(latestSubmission()?.state.masterVolume, 0.5, 'the same-name B-side draft is used in the reverse direction');
    assert.deepEqual(latestSubmission()?.options, {
      reason: 'morph-control-change',
      immediate: true,
    });

    const beforeEndpointLerpCalls = lerpCalls;
    const beforeEndpointDualApplications = dualRuntimeApplications;
    const beforeEndpointCofResets = cofResets;
    requireApi().handleMorphPositionChange(0, { flush: true });
    assert.equal(lerpCalls, beforeEndpointLerpCalls + 1);
    assert.equal(latestSubmission()?.state.masterVolume, 0.6);
    assert.deepEqual(latestSubmission()?.options, {
      reason: 'morph-control-change',
      immediate: true,
    });
    assert.equal(dualRuntimeApplications, beforeEndpointDualApplications + 1, 'endpoint flush applies dual runtime state once');
    assert.equal(cofResets, beforeEndpointCofResets + 1, 'endpoint flush resets CoF drift once');

    presetA = null;
    capturedStateRef.current = { ...DEFAULT_STATE, masterVolume: 0.1 };
    lastEndpointRef.current = 0;
    directionRef.current = null;
    capturedStartRootRef.current = null;
    await render();
    requireApi().handleMorphPositionChange(50);
    const fallbackEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(fallbackEntry);
    rafCallbacks.delete(fallbackEntry[0]);
    await act(async () => fallbackEntry[1](50.1));
    assert.equal(appliedStates[appliedStates.length - 1]?.masterVolume, 0.25, 'the captured fallback is used when endpoint A is empty');

    capturedStateRef.current = { ...DEFAULT_STATE, masterVolume: 0.9 };
    await render();
    requireApi().handleMorphPositionChange(50);
    const replacedFallbackEntry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    assert.ok(replacedFallbackEntry);
    rafCallbacks.delete(replacedFallbackEntry[0]);
    await act(async () => replacedFallbackEntry[1](66.8));
    assert.equal(appliedStates[appliedStates.length - 1]?.masterVolume, 0.65, 'fallback replacement is used at the unchanged position');

    await act(async () => root!.unmount());
    root = null;
    assert.equal(rafCallbacks.size, 0);
  } finally {
    if (root) await act(async () => root!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousRequestAnimationFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', previousRequestAnimationFrame);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (previousCancelAnimationFrame) Object.defineProperty(globalThis, 'cancelAnimationFrame', previousCancelAnimationFrame);
    else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
