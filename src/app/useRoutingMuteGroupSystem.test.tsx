import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CORE_PRODUCT_ROUTING_MUTE_ROW_BITS,
  type CoreProductEvent,
} from '../audio/coreProductEvents';
import { KESSHO_PRODUCT_EVENT_IDS } from '../audio/generated/kesshoProductEvents';
import { productEngine } from '../audio/product/ProductEngineProxy';
import { WebProductEngine } from '../audio/product/WebProductEngine';
import type {
  ProductEvent,
  ProductTelemetrySnapshot,
} from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE } from '../ui/state';
import type { RoutingMuteGroupsController } from '../ui/routing';
import {
  useRoutingMuteGroupSystem,
} from './useRoutingMuteGroupSystem';
import type { RoutingMuteGroupsState } from '../ui/routing';

type IntervalEntry = {
  callback: () => void;
  delayMs: number;
};

function makeTelemetry(): ProductTelemetrySnapshot {
  return {
    schemaHash: 1,
    sampleRate: 48_000,
    transportRunning: false,
    absoluteSampleTime: 0,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    routingMuteGroupActiveSlot: 0,
    routingMuteGroupNextSlot: 1,
    routingMuteGroupMask: CORE_PRODUCT_ROUTING_MUTE_ROW_BITS.pad1,
    routingMuteGroupNextChangeFrame: 4_800,
    routingMuteGroupTransitionProgress: 0.5,
    routingMuteGroupsEnabled: true,
  };
}

function makeGroups(): RoutingMuteGroupsState {
  return {
    schemaVersion: 4,
    slots: [
      { mutedSourceIds: ['pad1'] },
      { mutedSourceIds: ['drums'] },
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    random: {
      enabled: true,
      defaultMinPhrases: 2,
      defaultMaxPhrases: 6,
      transitionPhrases: 1,
      avoidRepeat: true,
    },
  };
}

function makeState() {
  return { ...DEFAULT_STATE };
}

test('Product routing projection is demand-gated, stable, and action-authoritative', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousSetTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  const previousClearTimeout = Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const originalGetTelemetry = WebProductEngine.prototype.getTelemetry;
  const originalEnqueueEvent = WebProductEngine.prototype.enqueueEvent;
  const originalEnqueueEvents = WebProductEngine.prototype.enqueueEvents;

  const visibilityListeners = new Set<() => void>();
  const intervals = new Map<number, IntervalEntry>();
  const timers = new Map<number, () => void>();
  let timerSerial = 0;
  const documentShim: any = {
    visibilityState: 'visible',
    activeElement: null,
    body: null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') {
        visibilityListeners.add(listener);
      }
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') {
        visibilityListeners.delete(listener);
      }
    },
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
    setInterval: (callback: () => void, delayMs: number) => {
      const id = ++timerSerial;
      intervals.set(id, { callback, delayMs });
      return id;
    },
    clearInterval: (id: number) => intervals.delete(id),
    setTimeout: (callback: () => void) => {
      const id = ++timerSerial;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    writable: true,
    value: (callback: () => void) => {
      const id = ++timerSerial;
      timers.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(globalThis, 'clearTimeout', {
    configurable: true,
    writable: true,
    value: (id: number) => timers.delete(id),
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  let telemetry: ProductTelemetrySnapshot | null = makeTelemetry();
  const recallEvents: ProductEvent[] = [];
  const configurationBatches: CoreProductEvent[][] = [];
  WebProductEngine.prototype.getTelemetry = function getTelemetryMock() {
    return telemetry;
  };
  WebProductEngine.prototype.enqueueEvent = function enqueueEventMock(event) {
    recallEvents.push(event);
  };
  WebProductEngine.prototype.enqueueEvents = function enqueueEventsMock(events) {
    configurationBatches.push([...events]);
  };
  productEngine.getTelemetry();
  const preexistingVisibilityListenerCount = visibilityListeners.size;

  let groups = makeGroups();
  let isRunning = false;
  let runtimeUiActive = false;
  let mutateTelemetryDuringGroupChange = false;
  let api: RoutingMuteGroupsController | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let lastSnapshot: RoutingMuteGroupsController['runtimeSnapshot'] | null = null;
  let snapshotIdentityChangeCount = 0;
  let reactCommitCount = 0;
  const requireApi = (): RoutingMuteGroupsController => {
    assert.ok(api);
    return api;
  };
  const onGroupsChange = (nextGroups: RoutingMuteGroupsState) => {
    groups = nextGroups;
    if (mutateTelemetryDuringGroupChange && telemetry) {
      telemetry = { ...telemetry, routingMuteGroupActiveSlot: 0 };
    }
  };
  function Probe() {
    React.useEffect(() => {
      reactCommitCount += 1;
    });
    const next = useRoutingMuteGroupSystem({
      state: makeState(),
      routingMuteGroups: groups,
      onRoutingMuteGroupsChange: onGroupsChange,
      onRuntimeLevelPatchChange: () => {},
      onBooleanParamChange: () => {},
      isRunning,
      phraseSeconds: 4,
      productRuntimeActive: true,
      runtimeUiActive,
    });
    api = next;
    if (next.runtimeSnapshot !== lastSnapshot) snapshotIdentityChangeCount += 1;
    lastSnapshot = next.runtimeSnapshot;
    return null;
  }
  const render = async () => {
    await act(async () => root!.render(React.createElement(Probe)));
  };
  const runInterval = async () => {
    const entry = intervals.values().next().value as IntervalEntry | undefined;
    assert.ok(entry, 'expected one Product projection interval');
    await act(async () => entry.callback());
  };
  const setVisibility = async (visibilityState: 'visible' | 'hidden') => {
    documentShim.visibilityState = visibilityState;
    await act(async () => {
      for (const listener of [...visibilityListeners]) listener();
    });
  };

  try {
    root = createRoot(container);
    await render();
    assert.equal(intervals.size, 0, 'inactive routing UI must not poll Product telemetry');
    const initialSnapshot = requireApi().runtimeSnapshot;
    assert.equal(initialSnapshot.activeSlotIndex, 0);
    assert.deepEqual(initialSnapshot.currentMutedSourceIds, ['pad1']);

    runtimeUiActive = true;
    await render();
    assert.equal(intervals.size, 1, 'enabling a visible routing consumer starts one interval');
    const activeInterval = intervals.values().next().value;
    assert.ok(activeInterval);
    assert.equal(activeInterval.delayMs, 100);
    assert.equal(requireApi().runtimeSnapshot.phase, 'transitioning');
    const settledSnapshot = requireApi().runtimeSnapshot;
    const settledIdentityChangeCount = snapshotIdentityChangeCount;
    const settledReactCommitCount = reactCommitCount;

    await runInterval();
    assert.equal(requireApi().runtimeSnapshot, settledSnapshot, 'unchanged telemetry reuses the snapshot object');
    assert.equal(snapshotIdentityChangeCount, settledIdentityChangeCount, 'unchanged telemetry reuses the snapshot identity');
    assert.equal(reactCommitCount, settledReactCommitCount, 'unchanged telemetry does not add a React commit');

    telemetry = { ...telemetry!, routingMuteGroupTransitionProgress: 0.6 };
    await runInterval();
    assert.notEqual(requireApi().runtimeSnapshot, settledSnapshot, 'a real progress change publishes');
    assert.equal(requireApi().runtimeSnapshot.transitionProgress, 0.6);
    const activeSnapshot = requireApi().runtimeSnapshot;

    await act(async () => requireApi().selectSlot(1));
    assert.equal(requireApi().selectedSlotIndex, 1);
    assert.equal(requireApi().runtimeSnapshot.activeSlotIndex, activeSnapshot.activeSlotIndex);
    assert.equal(requireApi().runtimeSnapshot.transitionProgress, activeSnapshot.transitionProgress);
    assert.deepEqual(requireApi().runtimeSnapshot.currentMutedSourceIds, activeSnapshot.currentMutedSourceIds);

    const recallCountBeforeEmptyPress = recallEvents.length;
    await act(async () => requireApi().pressSlot(2));
    assert.equal(requireApi().selectedSlotIndex, 2, 'pressing an empty slot still selects it');
    assert.equal(recallEvents.length, recallCountBeforeEmptyPress, 'pressing an empty Product slot emits no recall');

    await setVisibility('hidden');
    runtimeUiActive = false;
    await render();
    assert.equal(intervals.size, 0, 'hidden or inactive routing UI cancels polling');

    telemetry = { ...telemetry!, routingMuteGroupActiveSlot: 1 };
    await act(async () => requireApi().pressSlot(1));
    const pressRelease = recallEvents[recallEvents.length - 1];
    assert.ok(pressRelease);
    assert.equal(pressRelease.eventKind, KESSHO_PRODUCT_EVENT_IDS.RecallRoutingMuteGroup);
    assert.equal(pressRelease.index, 0xffffffff, 'pressing the telemetry-active slot releases even when the UI poll is paused');
    assert.equal(pressRelease.value, 0);

    const timersBeforeSave = timers.size;
    isRunning = true;
    await render();
    await act(async () => requireApi().saveSlot(1));
    assert.equal(timers.size, timersBeforeSave, 'Product save does not enter legacy random timers while running');

    const telemetryBeforeClear = telemetry;
    const recallCountBeforeClear = recallEvents.length;
    mutateTelemetryDuringGroupChange = true;
    await act(async () => requireApi().clearSlot(1));
    mutateTelemetryDuringGroupChange = false;
    assert.equal(recallEvents.length, recallCountBeforeClear + 1, 'clear emits exactly one release event');
    const clearRelease = recallEvents[recallEvents.length - 1];
    assert.ok(clearRelease);
    assert.equal(clearRelease.eventKind, KESSHO_PRODUCT_EVENT_IDS.RecallRoutingMuteGroup);
    assert.equal(clearRelease.index, 0xffffffff, 'clear captures the active Product slot before the groups callback');
    assert.equal(clearRelease.value, 0);
    assert.notEqual(telemetry, telemetryBeforeClear);
    assert.equal(timers.size, timersBeforeSave, 'Product clear does not restart legacy random timers while running');

    await setVisibility('visible');
    runtimeUiActive = true;
    telemetry = { ...telemetry!, routingMuteGroupActiveSlot: 0 };
    await render();
    assert.equal(intervals.size, 1, 'restoring demand and visibility starts one current interval');
    assert.equal(requireApi().runtimeSnapshot.activeSlotIndex, 0);

    await act(async () => root!.unmount());
    root = null;
    assert.equal(intervals.size, 0, 'unmount removes the Product interval');
    assert.equal(visibilityListeners.size, preexistingVisibilityListenerCount, 'unmount removes the hook visibility listener');
    assert.equal(timers.size, 0, 'unmount leaves no random timers');
    assert.ok(configurationBatches.length > 0, 'the Product configuration path remains active');
  } finally {
    if (root) await act(async () => root!.unmount());
    WebProductEngine.prototype.getTelemetry = originalGetTelemetry;
    WebProductEngine.prototype.enqueueEvent = originalEnqueueEvent;
    WebProductEngine.prototype.enqueueEvents = originalEnqueueEvents;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousSetTimeout) Object.defineProperty(globalThis, 'setTimeout', previousSetTimeout);
    else Reflect.deleteProperty(globalThis, 'setTimeout');
    if (previousClearTimeout) Object.defineProperty(globalThis, 'clearTimeout', previousClearTimeout);
    else Reflect.deleteProperty(globalThis, 'clearTimeout');
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
