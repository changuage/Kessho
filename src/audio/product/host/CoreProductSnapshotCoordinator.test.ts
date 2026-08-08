import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoreProductEvent } from '../../coreProductEvents';
import { createCoreProductSnapshot } from '../../coreProductSnapshot';
import { applyCoreProductSnapshotUpdate } from './CoreProductSnapshotCoordinator';

function changedSnapshots() {
  const previousSnapshot = createCoreProductSnapshot({});
  const nextSnapshot = {
    ...previousSnapshot,
    transport: {
      ...previousSnapshot.transport,
      bpm: previousSnapshot.transport.bpm + 1,
      swing: previousSnapshot.transport.swing + 0.1,
    },
  };
  return { previousSnapshot, nextSnapshot };
}

async function applyWithRuntime(runtime: {
  postEvent: (event: CoreProductEvent) => void;
  postEvents?: (events: readonly CoreProductEvent[]) => void;
  loadSnapshot: () => Promise<never>;
}) {
  const { previousSnapshot, nextSnapshot } = changedSnapshots();
  return applyCoreProductSnapshotUpdate({
    runtime,
    previousSnapshot,
    nextSnapshot,
    fallbackReloadReason: 'product-patch',
    pendingReloadReason: null,
    nowMs: () => 0,
  });
}

test('batches dirty-diff events once and preserves fallback order', async () => {
  const batchedEvents: CoreProductEvent[][] = [];
  const fallbackEvents: CoreProductEvent[] = [];
  const loadSnapshot = async (): Promise<never> => { throw new Error('unexpected full snapshot'); };
  const batchedResult = await applyWithRuntime({
    postEvent: () => { throw new Error('per-event fallback should not run when batching is available'); },
    postEvents: (events) => batchedEvents.push([...events]),
    loadSnapshot,
  });
  const fallbackResult = await applyWithRuntime({ postEvent: (event) => fallbackEvents.push(event), loadSnapshot });

  assert.equal(batchedResult.mode, 'dirty-diff');
  assert.equal(fallbackResult.mode, 'dirty-diff');
  assert.equal(batchedEvents.length, 1);
  assert.deepEqual(batchedEvents[0], fallbackEvents);
});
