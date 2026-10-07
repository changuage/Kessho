import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { loadProductEngine } from '../audio/product/ProductEngineProxy';
import { KESSHO_PRODUCT_EVENT_IDS } from '../audio/generated/kesshoProductEvents';
import type { ProductEvent, ProductTelemetrySnapshot } from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE } from './state';
import {
  productSceneRevisionOnWire,
  useProductRuntimeAutoCycleSurface,
} from './useProductRuntimeAutoCycleSurface';

function endpoint(marker: string, libraryKey: string, masterVolume: number): Record<string, unknown> {
  return {
    ...DEFAULT_STATE,
    marker,
    masterVolume,
    sample1Enabled: true,
    sample1LibraryKey: libraryKey,
  };
}

function stateMarkers(states: readonly Record<string, unknown>[]): string[] {
  return states.map((state) => String(state.marker));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise!(),
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  assert.fail('condition did not settle');
}

test('Product auto-cycle serializes replacement, fresh adoption, ownership and cancellation', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
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
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  const engine = await loadProductEngine();
  const originalMethods = new Map<string, PropertyDescriptor | undefined>();
  const prepareCalls: Array<Array<Record<string, unknown>>> = [];
  const uploadedBatches: ProductEvent[][] = [];
  const lifecycleEvents: ProductEvent[] = [];
  let activePrepareCount = 0;
  let maxPrepareCount = 0;
  let pendingPrepare: ReturnType<typeof deferred> | null = null;
  let activePrepareGate: ReturnType<typeof deferred> | null = null;
  let nextPrepareError: Error | null = null;
  let blockRestorationAfterError = false;
  let nextRestorationError: Error | null = null;
  let clearSceneAssetsCalls = 0;
  let uploadedRevision = 0;
  let telemetry: ProductTelemetrySnapshot = {
    schemaHash: 1,
    absoluteSampleTime: 100,
    sceneProgramRevision: 0,
    autoCycleEnabled: false,
    autoCycleRevision: 0,
  } as ProductTelemetrySnapshot;

  const replace = (name: string, value: unknown): void => {
    originalMethods.set(name, Object.getOwnPropertyDescriptor(engine, name));
    Object.defineProperty(engine, name, { configurable: true, writable: true, value });
  };
  replace('prepareSceneAssets', async (states: readonly Record<string, unknown>[]) => {
    prepareCalls.push(states.map((state) => ({ ...state })));
    activePrepareCount += 1;
    maxPrepareCount = Math.max(maxPrepareCount, activePrepareCount);
    try {
      if (nextPrepareError) {
        const error = nextPrepareError;
        nextPrepareError = null;
        if (blockRestorationAfterError) {
          blockRestorationAfterError = false;
          pendingPrepare = deferred();
        }
        throw error;
      }
      if (pendingPrepare) {
        const gate = pendingPrepare;
        pendingPrepare = null;
        activePrepareGate = gate;
        try {
          await gate.promise;
        } finally {
          activePrepareGate = null;
        }
        if (nextRestorationError) {
          const error = nextRestorationError;
          nextRestorationError = null;
          throw error;
        }
      }
    } finally {
      activePrepareCount -= 1;
    }
  });
  replace('enqueueEvents', (events: readonly ProductEvent[]) => {
    const batch = [...events];
    uploadedBatches.push(batch);
    const begin = batch.find((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.BeginSceneProgram);
    if (begin) {
      uploadedRevision = productSceneRevisionOnWire(begin.value3 ?? 0);
    }
  });
  replace('enqueueEvent', (event: ProductEvent) => {
    lifecycleEvents.push(event);
  });
  replace('clearSceneAssets', () => {
    clearSceneAssetsCalls += 1;
  });
  replace('getTelemetry', () => telemetry);

  const startSignal = new AbortController();
  const initialA = endpoint('initial-a', 'piano', 0.2);
  const initialB = endpoint('initial-b', 'strings', 0.8);
  const latestInitialA = endpoint('latest-initial-a', 'soft-string-spurs', 0.3);
  const latestInitialB = endpoint('latest-initial-b', 'vocal-air', 0.7);
  let surface: ReturnType<typeof useProductRuntimeAutoCycleSurface> | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  function Probe() {
    surface = useProductRuntimeAutoCycleSurface();
    return null;
  }

  const requireSurface = () => {
    assert.ok(surface);
    return surface;
  };
  const blockNextPrepare = (): void => {
    assert.equal(pendingPrepare, null);
    pendingPrepare = deferred();
  };
  const releasePrepare = (): void => {
    const gate = pendingPrepare ?? activePrepareGate;
    assert.ok(gate);
    if (pendingPrepare === gate) pendingPrepare = null;
    gate.resolve();
  };

  try {
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(Probe)));

    blockNextPrepare();
    const initialStart = requireSurface().start({
      endpointA: initialA,
      endpointB: initialB,
      initialPosition: 0,
      playPhrases: 4,
      transitionPhrases: 2,
      signal: startSignal.signal,
    });
    await waitFor(() => prepareCalls.length >= 1);
    const latestStart = requireSurface().start({
      endpointA: latestInitialA,
      endpointB: latestInitialB,
      initialPosition: 0.25,
      playPhrases: 7,
      transitionPhrases: 5,
      signal: startSignal.signal,
    });
    assert.equal(initialStart, latestStart, 'repeated start reuses the serialized transaction');
    requireSurface().updateDurations(8, 6);
    assert.deepEqual(stateMarkers(prepareCalls[0]!), ['initial-a', 'initial-b']);
    releasePrepare();
    await waitFor(() => prepareCalls.length >= 2);
    assert.deepEqual(stateMarkers(prepareCalls[1]!), ['latest-initial-a', 'latest-initial-b']);
    await waitFor(() => uploadedBatches.length === 1);
    const initialBatch = uploadedBatches[0]!;
    const initialAutoEvent = initialBatch.find((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ConfigureGlobalAutoCycle);
    assert.equal(initialAutoEvent?.value2, 8, 'duration edit during initial preparation is used');
    assert.equal(initialAutoEvent?.value3, 6, 'latest transition duration is used');
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    let initialSettled = false;
    void initialStart.then(() => { initialSettled = true; }, () => { initialSettled = true; });
    await Promise.resolve();
    requireSurface().readProjection();
    await Promise.resolve();
    assert.equal(initialSettled, false, 'matching stale telemetry does not acknowledge adoption');
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['latest-initial-a', 'latest-initial-b']);
    telemetry = {
      ...telemetry,
      absoluteSampleTime: (telemetry.absoluteSampleTime ?? 0) + 1,
      sceneProgramRevision: uploadedRevision,
    };
    const initialProjection = requireSurface().readProjection();
    assert.equal(initialProjection?.confirmedEndpointA, latestInitialA, 'fresh adoption did not publish the confirmed A endpoint');
    assert.equal(initialProjection?.confirmedEndpointB, latestInitialB, 'fresh adoption did not publish the confirmed B endpoint');
    await initialStart;
    assert.equal(maxPrepareCount, 1, 'preparation stays serialized');

    const installedB = latestInitialB;
    blockNextPrepare();
    const staleReplacement = requireSurface().replace({
      endpointA: endpoint('stale-a', 'piano', 0.4),
      endpointB: installedB,
    });
    await waitFor(() => prepareCalls.length >= 3);
    const latestA = endpoint('latest-a', 'strings', 0.5);
    const latestReplacement = requireSurface().replace({ endpointA: latestA, endpointB: installedB });
    assert.equal(uploadedBatches.length, 1, 'latest replacement waits for preparation');
    releasePrepare();
    await waitFor(() => uploadedBatches.length === 2);
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['latest-initial-a', 'latest-initial-b', 'latest-a']);
    let replacementSettled = false;
    void latestReplacement.then(() => { replacementSettled = true; }, () => { replacementSettled = true; });
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    requireSurface().readProjection();
    await Promise.resolve();
    assert.equal(replacementSettled, false, 'stale matching replacement telemetry leaves the transaction pending');
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['latest-initial-a', 'latest-initial-b', 'latest-a']);
    telemetry = {
      ...telemetry,
      absoluteSampleTime: (telemetry.absoluteSampleTime ?? 0) + 1,
      sceneProgramRevision: uploadedRevision,
    };
    const replacementProjection = requireSurface().readProjection();
    assert.equal(replacementProjection?.confirmedEndpointA, latestA, 'replacement adoption did not publish the confirmed A endpoint');
    assert.equal(replacementProjection?.confirmedEndpointB, installedB, 'replacement adoption did not publish the confirmed B endpoint');
    await Promise.all([staleReplacement, latestReplacement]);
    assert.equal(uploadedBatches.length, 2, 'only the latest pending replacement uploads');
    assert.equal(
      uploadedBatches[1]!.some((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ConfigureGlobalAutoCycle),
      false,
      'replacement does not disable or re-enable auto',
    );
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['latest-a', 'latest-initial-b']);

    nextPrepareError = new Error('not-ready');
    await assert.rejects(
      requireSurface().replace({ endpointA: endpoint('rejected-a', 'piano', 0.1), endpointB: installedB }),
      /not-ready/,
    );
    assert.equal(uploadedBatches.length, 2, 'not-ready admission retains the confirmed program');
    const rejectedProjection = requireSurface().readProjection();
    assert.equal(rejectedProjection?.confirmedEndpointA, latestA, 'rejected replacement overwrote the confirmed A endpoint');
    assert.equal(rejectedProjection?.confirmedEndpointB, installedB, 'rejected replacement overwrote the confirmed B endpoint');
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['latest-a', 'latest-initial-b']);

    blockRestorationAfterError = true;
    nextPrepareError = new Error('not-ready-with-newer-edit');
    nextRestorationError = new Error('restore-fail-with-newer-edit');
    const rejectedWithNewer = requireSurface().replace({
      endpointA: endpoint('rejected-again', 'soft-string-spurs', 0.15),
      endpointB: installedB,
    });
    await waitFor(() => prepareCalls.some((states) => stateMarkers(states).includes('rejected-again')));
    await waitFor(() => pendingPrepare !== null || activePrepareGate !== null);
    const newerAfterFailure = requireSurface().replace({
      endpointA: endpoint('newer-after-failure', 'vocal-air', 0.25),
      endpointB: installedB,
    });
    releasePrepare();
    await waitFor(() => uploadedBatches.length === 3);
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    requireSurface().readProjection();
    telemetry = {
      ...telemetry,
      absoluteSampleTime: (telemetry.absoluteSampleTime ?? 0) + 1,
      sceneProgramRevision: uploadedRevision,
    };
    requireSurface().readProjection();
    await Promise.all([rejectedWithNewer, newerAfterFailure]);
    assert.equal(uploadedBatches.length, 3, 'newer work is not stranded during restoration');
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['newer-after-failure', 'latest-initial-b']);

    const cancelledReplacement = requireSurface().replace({
      endpointA: endpoint('cancelled-before-stop', 'piano', 0.3),
      endpointB: installedB,
    });
    await waitFor(() => uploadedBatches.length === 4);
    let cancelledSettled = false;
    void cancelledReplacement.then(() => { cancelledSettled = true; }, () => { cancelledSettled = true; });
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    requireSurface().readProjection();
    await Promise.resolve();
    assert.equal(cancelledSettled, false, 'replacement remains pending on stale adoption telemetry');
    requireSurface().stop(true);
    await cancelledReplacement;
    assert.equal(cancelledSettled, true, 'stop settles the cancelable adoption waiter');
    await waitFor(() => clearSceneAssetsCalls === 1);

    const resumedA = endpoint('resumed-a', 'strings', 0.4);
    const resumedB = endpoint('resumed-b', 'vocal-air', 0.6);
    const resumed = requireSurface().start({
      endpointA: resumedA,
      endpointB: resumedB,
      initialPosition: 0.4,
      playPhrases: 2,
      transitionPhrases: 3,
      signal: new AbortController().signal,
    });
    await waitFor(() => uploadedBatches.length === 5);
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    requireSurface().readProjection();
    telemetry = {
      ...telemetry,
      absoluteSampleTime: (telemetry.absoluteSampleTime ?? 0) + 1,
      sceneProgramRevision: uploadedRevision,
    };
    requireSurface().readProjection();
    await resumed;

    blockNextPrepare();
    const oldPending = requireSurface().replace({
      endpointA: endpoint('old-before-stop', 'piano', 0.35),
      endpointB: resumedB,
    });
    await waitFor(() => prepareCalls.some((states) => stateMarkers(states).includes('old-before-stop')));
    const uploadsBeforeStop = uploadedBatches.length;
    requireSurface().stop(true);
    const restartedA = endpoint('restarted-a', 'strings', 0.45);
    const restartedB = endpoint('restarted-b', 'vocal-air', 0.55);
    const restarted = requireSurface().start({
      endpointA: restartedA,
      endpointB: restartedB,
      initialPosition: 0.5,
      playPhrases: 3,
      transitionPhrases: 4,
      signal: new AbortController().signal,
    });
    assert.equal(uploadedBatches.length, uploadsBeforeStop, 'restart waits behind unresolved stop work');
    releasePrepare();
    await oldPending;
    await waitFor(() => uploadedBatches.length === uploadsBeforeStop + 1);
    (telemetry as any).sceneProgramRevision = uploadedRevision;
    requireSurface().readProjection();
    telemetry = {
      ...telemetry,
      absoluteSampleTime: (telemetry.absoluteSampleTime ?? 0) + 1,
      sceneProgramRevision: uploadedRevision,
    };
    requireSurface().readProjection();
    await restarted;
    assert.equal(maxPrepareCount, 1, 'stop-to-start never overlaps preparation');
    assert.equal(uploadedBatches.length, uploadsBeforeStop + 1, 'restart uploads only after stale work settles');
    assert.deepEqual(stateMarkers(prepareCalls[prepareCalls.length - 1]!), ['restarted-a', 'restarted-b']);

    await act(async () => root!.unmount());
    await waitFor(() => clearSceneAssetsCalls >= 2);
    assert.equal(clearSceneAssetsCalls, 2, 'superseded stop does not clear restarted assets');
    assert.ok(lifecycleEvents.some((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ConfigureGlobalAutoCycle));
    assert.equal(activePrepareCount, 0);
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
