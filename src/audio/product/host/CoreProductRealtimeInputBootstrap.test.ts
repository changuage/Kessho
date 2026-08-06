import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreProductEvent } from '../../coreProductEvents';
import { CoreProductRealtimeInputBootstrap } from './CoreProductRealtimeInputBootstrap';

test('awaitable live input resolves only after resume, snapshot, and event post', async () => {
  let runtimeReady = false;
  let resumeRuntime!: () => void;
  const order: string[] = [];
  const runtime = {
    audioContext: null,
    ensureStarted: async () => undefined,
    resume: () => new Promise<void>((resolve) => {
      resumeRuntime = () => {
        order.push('resume');
        resolve();
      };
    }),
  };
  const bootstrap = new CoreProductRealtimeInputBootstrap({
    runtime,
    runtimeReady: () => runtimeReady,
    setRuntimeReady: (ready) => { runtimeReady = ready; },
    loadLatestSnapshot: async () => { order.push('snapshot'); },
    post: () => { order.push('post'); },
  });

  const pending = bootstrap.postWhenReadyAsync({ eventKind: 1 } as CoreProductEvent);
  await Promise.resolve();
  assert.deepEqual(order, [], 'event must not post before audio startup finishes');
  resumeRuntime();
  await pending;
  assert.deepEqual(order, ['resume', 'snapshot', 'post']);
  assert.equal(runtimeReady, true);
});

test('related realtime events are posted as one ordered batch', async () => {
  const events = [{ eventKind: 1 }, { eventKind: 2 }] as CoreProductEvent[];
  const batches: (readonly CoreProductEvent[])[] = [];
  const bootstrap = new CoreProductRealtimeInputBootstrap({
    runtime: {
      audioContext: { state: 'running' } as AudioContext,
      ensureStarted: async () => undefined,
      resume: async () => undefined,
    },
    runtimeReady: () => true,
    setRuntimeReady: () => undefined,
    loadLatestSnapshot: async () => undefined,
    post: () => assert.fail('the scalar event path should not be used'),
    postMany: (batch) => { batches.push(batch); },
  });

  await bootstrap.postManyWhenReadyAsync(events);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], events);
});

test('events arriving during cold bootstrap stay behind snapshot ordering', async () => {
  let runtimeReady = false;
  let resolveResume!: () => void;
  let resolveSnapshot!: () => void;
  const order: string[] = [];
  const runtime = {
    audioContext: null,
    ensureStarted: async () => undefined,
    resume: () => new Promise<void>((resolve) => { resolveResume = resolve; }),
  };
  const bootstrap = new CoreProductRealtimeInputBootstrap({
    runtime,
    runtimeReady: () => runtimeReady,
    setRuntimeReady: (ready) => { runtimeReady = ready; },
    loadLatestSnapshot: () => new Promise<void>((resolve) => {
      order.push('snapshot-start');
      resolveSnapshot = () => { order.push('snapshot-done'); resolve(); };
    }),
    post: (event) => { order.push(`post-${event.eventKind}`); },
  });

  const first = bootstrap.postWhenReadyAsync({ eventKind: 1 } as CoreProductEvent);
  const second = bootstrap.postWhenReadyAsync({ eventKind: 2 } as CoreProductEvent);
  resolveResume();
  await Promise.resolve();
  assert.deepEqual(order, ['snapshot-start']);
  resolveSnapshot();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['snapshot-start', 'snapshot-done', 'post-1', 'post-2']);
});
