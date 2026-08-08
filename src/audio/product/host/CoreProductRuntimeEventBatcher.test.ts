import assert from 'node:assert/strict';
import test from 'node:test';
import type { CoreProductEvent } from '../../coreProductEvents';
import type { CoreProductRuntime } from '../../coreProductRuntime';
import { CoreProductRuntimeEventBatcher } from './CoreProductRuntimeEventBatcher';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('large event batches park while suspended and resume without polling', async () => {
  const posted: CoreProductEvent[][] = [];
  const audioContext = { state: 'suspended' };
  const runtime = {
    audioContext,
    postEvent: (event: CoreProductEvent) => posted.push([event]),
    postEvents: (events: readonly CoreProductEvent[]) => posted.push([...events]),
  } as unknown as CoreProductRuntime;
  const batcher = new CoreProductRuntimeEventBatcher(runtime);
  const events = Array.from({ length: 25 }, (_, index) => ({ eventKind: index + 1 } as CoreProductEvent));

  batcher.postMany(events);
  await wait(60);
  assert.equal(posted.length, 0);

  audioContext.state = 'running';
  batcher.flushWhenRuntimeRunning();
  assert.deepEqual(posted.map((batch) => batch.length), [24]);

  await wait(60);
  assert.deepEqual(posted.map((batch) => batch.length), [24, 1]);
  assert.deepEqual(posted.flat(), events);
  batcher.dispose();
});
