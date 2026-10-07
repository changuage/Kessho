import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  useRecordedNoteCapture,
  type RecordedNoteCaptureApi,
} from './useRecordedNoteCapture';
import type {
  RecordedNoteCaptureBatch,
  RecordedNoteCaptureStartRequest,
} from './recordedNoteCaptureTypes';

type Harness = {
  api: RecordedNoteCaptureApi;
  controls: RecordedNoteCaptureStartRequest[];
};

function mountHarness(): Harness {
  const controls: RecordedNoteCaptureStartRequest[] = [];
  let api: RecordedNoteCaptureApi | null = null;
  function Probe() {
    api = useRecordedNoteCapture({
      activeLaneIndex: 0,
      activeSource: 'keyboard',
      defaultDurationBeats: 4,
      defaultGridSteps: 16,
      setCaptureEnabled: (request) => controls.push(request),
      subscribeCapture: () => () => undefined,
    });
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(api);
  return { api, controls };
}

function batch(
  token: string,
  clockBeat: number,
  overrides: Partial<RecordedNoteCaptureBatch> = {},
): RecordedNoteCaptureBatch {
  return {
    sessionToken: token,
    originBeat: 0,
    clockBeat,
    events: [],
    phase: 'recording',
    finalEventId: null,
    overflowCount: 0,
    ...overrides,
  };
}

function startToken(harness: Harness, request: Parameters<RecordedNoteCaptureApi['start']>[0] = {}): string {
  harness.api.start(request);
  const token = [...harness.controls].reverse().find((control) => control.action === 'start')?.sessionToken;
  assert.ok(token);
  return token;
}

function finishAndStop(harness: Harness, token: string, clockBeat: number, originBeat = 0): void {
  harness.api.ingestBatch(batch(token, clockBeat, { originBeat }));
  harness.api.stopNow();
  harness.api.ingestBatch(batch(token, clockBeat, { originBeat, phase: 'ready', finalEventId: 0 }));
}

test('hook retains a silence-only pass through stop and cancel', () => {
  const harness = mountHarness();
  const token = startToken(harness, { durationBeats: 2, gridSteps: 8 });
  harness.api.ingestBatch(batch(token, 2));
  finishAndStop(harness, token, 2);
  harness.api.cancel();

  assert.deepEqual(harness.controls.map((control) => control.action), ['start', 'stop', 'cancel']);
});

test('hook rebases an empty origin before ingesting the first runtime event', async () => {
  const harness = mountHarness();
  const token = startToken(harness, { durationBeats: 4, gridSteps: 16, originBeat: 10 });
  harness.api.ingestBatch(batch(token, 10, { originBeat: 100 }));
  harness.api.ingestBatch(batch(token, 101, {
    originBeat: 100,
    events: [{
      sessionToken: token,
      eventId: 1,
      source: 'keyboard',
      onsetBeats: 1,
      durationBeats: 0.5,
      pitch: 64,
      velocity: 0.8,
    }],
  }));
  finishAndStop(harness, token, 104, 100);

  assert.deepEqual(harness.controls.map((control) => control.action), ['start', 'stop']);
});

test('hook turns runtime overflow telemetry into a non-committable draft', async () => {
  const harness = mountHarness();
  const token = startToken(harness, { durationBeats: 2, gridSteps: 8 });
  harness.api.ingestBatch(batch(token, 1, { overflowCount: 1 }));
  finishAndStop(harness, token, 1);

  assert.deepEqual(harness.controls.map((control) => control.action), ['start', 'stop']);
});

test('hook coalesces silent previews across hidden resume and rapid re-arm', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  const visibilityListeners = new Set<() => void>();
  const documentShim: any = {
    visibilityState: 'visible',
    activeElement: null,
    body: null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.delete(listener);
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
  let clockMs = 0;
  let timerSerial = 0;
  const timers = new Map<number, () => void>();
  const timerDelays: number[] = [];
  const windowShim: any = {
    document: documentShim,
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++timerSerial;
      timerDelays.push(delay);
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
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    writable: true,
    value: { now: () => clockMs },
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  const controls: RecordedNoteCaptureStartRequest[] = [];
  let api: RecordedNoteCaptureApi | null = null;
  let lastView: RecordedNoteCaptureApi['view'] = null;
  let previewPublicationCount = 0;
  let root: ReturnType<typeof createRoot> | null = null;
  let messageCount = 0;
  let emptyMessageCount = 0;
  const requireApi = (): RecordedNoteCaptureApi => {
    assert.ok(api);
    return api;
  };
  function Probe() {
    const next = useRecordedNoteCapture({
      activeLaneIndex: 0,
      activeSource: 'keyboard',
      defaultDurationBeats: 4,
      defaultGridSteps: 16,
      setCaptureEnabled: (request) => controls.push(request),
    });
    api = next;
    if (next.view && next.view !== lastView) {
      previewPublicationCount += 1;
      lastView = next.view;
    }
    return null;
  }
  const flushPreview = async () => {
    const entry = timers.entries().next().value as [number, () => void] | undefined;
    assert.ok(entry, 'expected one pending preview timer');
    timers.delete(entry[0]);
    clockMs += 50;
    await act(async () => entry[1]());
  };
  const feed = async (next: RecordedNoteCaptureBatch) => {
    messageCount += 1;
    if (next.events.length === 0 && next.finalEventId === null) emptyMessageCount += 1;
    await act(async () => requireApi().ingestBatch(next));
  };
  try {
    root = createRoot(container);
    await act(async () => root!.render(React.createElement(Probe)));
    await act(async () => requireApi().start({ durationBeats: 4, originBeat: 0 }));
    const token = controls.find((control) => control.action === 'start')?.sessionToken;
    assert.ok(token);
    assert.equal(previewPublicationCount, 1, 'start should publish one immediate control preview');

    for (let index = 0; index < 8; index += 1) await feed(batch(token, index / 8));
    assert.equal(timers.size, 1, 'silent capture should keep one pending preview task');
    assert.equal(timerDelays[0], 50, 'silent previews should use the 20 Hz interval');
    await flushPreview();
    assert.equal(previewPublicationCount, 2);

    await feed(batch(token, 1, {
      events: [{ sessionToken: token, eventId: 1, source: 'orbit', onsetBeats: 1, durationBeats: 0.25, pitch: 60, velocity: 0.8 }],
    }));
    let noteId: number | null = null;
    await act(async () => {
      noteId = requireApi().recordNoteOn('keyboard-1', 64, 0.7, 1.25);
    });
    assert.ok(noteId);
    let noteClosed = false;
    await act(async () => {
      noteClosed = requireApi().recordNoteOff({ inputId: 'keyboard-1', clockBeat: 1.5 });
    });
    assert.equal(noteClosed, true);
    assert.equal(previewPublicationCount, 5, 'generated and keyboard notes should publish promptly');

    await act(async () => {
      documentShim.visibilityState = 'hidden';
      for (const listener of [...visibilityListeners]) listener();
    });
    assert.equal(timers.size, 0, 'hiding should cancel the pending preview task');
    const hiddenPreviewCount = previewPublicationCount;
    await feed(batch(token, 2));
    assert.equal(timers.size, 0, 'hidden silence should not schedule periodic previews');
    await feed(batch(token, 2.1, {
      events: [{ sessionToken: token, eventId: 2, source: 'orbit', onsetBeats: 2.1, durationBeats: 0.25, pitch: 67, velocity: 0.8 }],
    }));
    assert.ok(previewPublicationCount > hiddenPreviewCount, 'hidden note delivery should remain immediate');

    await act(async () => {
      documentShim.visibilityState = 'visible';
      for (const listener of [...visibilityListeners]) listener();
    });
    assert.equal(timers.size, 0, 'resume should publish one fresh anchor without a timer');

    await act(async () => requireApi().finishLoop());
    await feed(batch(token, 4, { phase: 'ready', finalEventId: 2 }));
    const oldView = requireApi().view;
    await act(async () => requireApi().start({ durationBeats: 4, originBeat: 4 }));
    const starts = controls.filter((control) => control.action === 'start');
    const nextToken = starts[starts.length - 1]?.sessionToken;
    assert.ok(nextToken && nextToken !== token);
    await feed(batch(token, 4.5, {
      events: [{ sessionToken: token, eventId: 99, source: 'orbit', onsetBeats: 4.5, durationBeats: 0.25, pitch: 72, velocity: 0.8 }],
    }));
    assert.equal(requireApi().view?.recorder.token, nextToken, 'stale old-session batches must not publish into a re-armed capture');
    assert.notEqual(requireApi().view, oldView, 'rapid re-arm should replace the old preview');
    assert.equal(messageCount, 13);
    assert.equal(emptyMessageCount, 9);
    assert.equal(previewPublicationCount, 10, 'only immediate event/control updates plus one resumed anchor should publish');
  } finally {
    if (root) await act(async () => root!.unmount());
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousPerformance) Object.defineProperty(globalThis, 'performance', previousPerformance);
    else Reflect.deleteProperty(globalThis, 'performance');
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
