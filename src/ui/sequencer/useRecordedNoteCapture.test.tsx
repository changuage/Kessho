import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  nextBarBeat,
  sourceForMode,
  useRecordedNoteCapture,
  type RecordedNoteCaptureApi,
} from './useRecordedNoteCapture';
import {
  recordedCaptureModeId,
  recordedCaptureModeMask,
  type RecordedNoteCaptureBatch,
  type RecordedNoteCaptureStartRequest,
} from './recordedNoteCaptureTypes';
import type { RecordedNoteSource } from './recordedNoteSession';

type Harness = {
  api: RecordedNoteCaptureApi;
  controls: RecordedNoteCaptureStartRequest[];
};

function mountHarness(getCaptureClockBeat?: () => number | null): Harness {
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
      getCaptureClockBeat,
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
  // The legacy tests below exercise the rolling (live replace/overdub) policy.
  harness.api.start({ policy: 'rolling', ...request });
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
    await act(async () => requireApi().start({ policy: 'rolling', durationBeats: 4, originBeat: 0 }));
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
    await act(async () => requireApi().start({ policy: 'rolling', durationBeats: 4, originBeat: 4 }));
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


type LiveHook = {
  api: () => RecordedNoteCaptureApi;
  controls: RecordedNoteCaptureStartRequest[];
  feed: (batch: RecordedNoteCaptureBatch) => Promise<void>;
  cleanup: () => Promise<void>;
};

/** Mounts the hook in a minimal DOM shim so the published view can be read back. */
async function mountLiveHook(): Promise<LiveHook> {
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    performance: Object.getOwnPropertyDescriptor(globalThis, 'performance'),
    act: Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
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
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  for (const name of ['HTMLIFrameElement', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
    windowShim[name] = class {};
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowShim });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentShim });
  Object.defineProperty(globalThis, 'performance', { configurable: true, writable: true, value: { now: () => 0 } });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });

  const controls: RecordedNoteCaptureStartRequest[] = [];
  let current: RecordedNoteCaptureApi | null = null;
  function Probe() {
    current = useRecordedNoteCapture({
      activeLaneIndex: 0,
      activeSource: 'keyboard',
      defaultDurationBeats: 4,
      defaultGridSteps: 16,
      setCaptureEnabled: (request) => controls.push(request),
    });
    return null;
  }
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Probe)));
  const restore = (name: string, descriptor: PropertyDescriptor | undefined) => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  };
  return {
    api: () => {
      assert.ok(current);
      return current;
    },
    controls,
    feed: async (batch) => {
      await act(async () => current!.ingestBatch(batch));
    },
    cleanup: async () => {
      await act(async () => root.unmount());
      restore('window', previous.window);
      restore('document', previous.document);
      restore('performance', previous.performance);
      restore('IS_REACT_ACT_ENVIRONMENT', previous.act);
    },
  };
}

function captureEvent(token: string, eventId: number, onsetBeats: number, pitch: number) {
  return {
    sessionToken: token,
    eventId,
    source: 'randomNotes' as const,
    onsetBeats,
    durationBeats: 0.5,
    pitch,
    velocity: 0.8,
    sourceId: 3,
  };
}

test('fixed capture keeps [origin, origin+duration), finishes by itself, and never sweeps', async () => {
  const live = await mountLiveHook();
  try {
    await act(async () => live.api().start({ durationBeats: 4, originBeat: 4 }));
    const start = live.controls[0]!;
    assert.equal(start.action, 'start');
    assert.equal(start.policy, 'fixed', 'Print defaults to the fixed window');
    const token = start.sessionToken;

    await live.feed(batch(token, 3.5, { originBeat: 4 }));
    await live.feed(batch(token, 5, { originBeat: 4, events: [captureEvent(token, 1, 1, 60)] }));
    assert.deepEqual(live.controls.map((control) => control.action), ['start'], 'still inside the window');

    // One note late in the window, one past its end, and the clock passes the end.
    await live.feed(batch(token, 8.2, {
      originBeat: 4,
      events: [captureEvent(token, 2, 3.75, 64), captureEvent(token, 3, 4.3, 67)],
    }));
    assert.deepEqual(
      live.controls.map((control) => control.action),
      ['start', 'finish'],
      'the clock passing origin + duration closes intake without a user Finish',
    );
    assert.equal(live.api().view?.recorder.phase, 'finishing', 'completion waits for the final drain');

    await live.feed(batch(token, 8.2, { originBeat: 4, phase: 'ready', finalEventId: 3 }));
    const view = live.api().view;
    assert.equal(view?.recorder.phase, 'ready');
    const notes = view?.recorder.draft?.notes ?? [];
    assert.deepEqual(notes.map((note) => note.pitch).sort(), [60, 64], 'the note after the window is excluded');
    assert.deepEqual(notes.map((note) => note.onsetBeats).sort(), [1, 3.75], 'onsets are not swept or looped');
    assert.deepEqual(notes.map((note) => note.sourceId), [3, 3], 'captured notes keep their destination source');
    assert.equal(view?.recorder.draft?.durationBeats, 4);
  } finally {
    await live.cleanup();
  }
});

test('fixed capture waits for the watermark and ignores intake before the origin bar', async () => {
  const live = await mountLiveHook();
  try {
    await act(async () => live.api().start({ durationBeats: 2, originBeat: 8 }));
    const token = live.controls[0]!.sessionToken;
    // A note scheduled before the window opens (negative onset) is not part of the take.
    await live.feed(batch(token, 7, { originBeat: 8, events: [captureEvent(token, 1, -0.5, 50)] }));
    await live.feed(batch(token, 10.1, { originBeat: 8, phase: 'finishing' }));
    await live.feed(batch(token, 10.1, { originBeat: 8, phase: 'ready', finalEventId: 4 }));
    assert.equal(live.api().view?.recorder.phase, 'finishing', 'final event id 4 has not been drained yet');
    await live.feed(batch(token, 10.2, {
      originBeat: 8,
      phase: 'ready',
      finalEventId: 4,
      events: [captureEvent(token, 2, 0.5, 55), captureEvent(token, 3, 1.5, 57), captureEvent(token, 4, 2.5, 59)],
    }));
    const view = live.api().view;
    assert.equal(view?.recorder.phase, 'ready');
    assert.deepEqual((view?.recorder.draft?.notes ?? []).map((note) => note.pitch).sort(), [55, 57]);
  } finally {
    await live.cleanup();
  }
});

test('rolling capture keeps looping until Finish and never auto-finishes', async () => {
  const live = await mountLiveHook();
  try {
    await act(async () => live.api().start({ policy: 'rolling', durationBeats: 4, originBeat: 0 }));
    const token = live.controls[0]!.sessionToken;
    await live.feed(batch(token, 1, { events: [captureEvent(token, 1, 1, 60)] }));
    await live.feed(batch(token, 9, { events: [captureEvent(token, 2, 8.5, 62)] }));
    assert.deepEqual(live.controls.map((control) => control.action), ['start']);
    assert.equal(live.api().view?.policy, 'rolling');
    assert.equal(live.api().view?.recorder.phase, 'recording');
    await act(async () => live.api().finishLoop());
    assert.deepEqual(live.controls.map((control) => control.action), ['start', 'finish']);
  } finally {
    await live.cleanup();
  }
});

test('sources map to native mode ids and masks, and every source taps its own lane', () => {
  const expected: Array<[RecordedNoteSource, number]> = [
    ['keyboard', 0],
    ['walker', 1],
    ['orbit', 2],
    ['randomChords', 3],
    ['randomNotes', 4],
  ];
  for (const [source, mode] of expected) {
    assert.equal(recordedCaptureModeId(source), mode);
    assert.equal(recordedCaptureModeMask(source), 1 << mode);
  }

  for (const [source] of expected) {
    const harness = mountHarness();
    harness.api.start({ source, durationBeats: 2, originBeat: 0, sourceLaneIndex: 5, targetLaneIndex: 2 });
    const request = harness.controls[0]!;
    assert.equal(request.source, source);
    assert.equal(request.sourceLaneIndex, 5, 'a Random slot taps its own lane, not a shared producer lane');
    assert.equal(request.targetLaneIndex, 2);
  }
});

test('a slot type picks its capture source', () => {
  assert.equal(sourceForMode('euclid'), 'keyboard');
  assert.equal(sourceForMode('anchorWalker'), 'walker');
  assert.equal(sourceForMode('orbit'), 'orbit');
  assert.equal(sourceForMode('random', 'chords'), 'randomChords');
  assert.equal(sourceForMode('random', 'notes'), 'randomNotes');
});

test('fixed capture opens at the next bar boundary', () => {
  assert.equal(nextBarBeat(5.5, 4), 8);
  assert.equal(nextBarBeat(8, 4), 8);
  assert.equal(nextBarBeat(0, 4), 0);
  assert.equal(nextBarBeat(2.01, 3), 3);
  const harness = mountHarness(() => 5.5);
  harness.api.start({ durationBeats: 4 });
  assert.equal(harness.controls[0]!.policy, 'fixed');
  assert.equal(harness.controls[0]!.originBeat, 8);
  assert.equal(harness.controls[0]!.beatsPerBar, 4);
});
