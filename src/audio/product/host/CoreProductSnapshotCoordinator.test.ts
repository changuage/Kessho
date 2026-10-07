import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoreProductEvent } from '../../coreProductEvents';
import { createCoreProductSnapshot } from '../../coreProductSnapshot';
import { applyCoreProductSnapshotUpdate, loadCoreProductSnapshot } from './CoreProductSnapshotCoordinator';

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

test('snapshot acknowledgements wait for the audio boundary before afterLoad', async () => {
  const snapshot = createCoreProductSnapshot({});
  type Receipt = { revision: number; applied: true; encodedSnapshotHash: string };
  let resolveReceipt: ((value: Receipt) => void) | undefined;
  const receiptPromise = new Promise<Receipt>((resolve) => { resolveReceipt = resolve; });
  let afterLoad = false;
  const pending = loadCoreProductSnapshot({
    runtime: {
      postEvent: () => undefined,
      loadSnapshot: () => receiptPromise,
    },
    snapshot,
    reason: 'product-patch',
    awaitAudioThreadAck: true,
    nowMs: () => 0,
    afterLoad: () => { afterLoad = true; },
  });
  await Promise.resolve();
  assert.equal(afterLoad, false);
  resolveReceipt?.({ revision: 0, applied: true, encodedSnapshotHash: '' });
  await pending;
  assert.equal(afterLoad, true);
});

test('snapshot acknowledgement rejection does not run afterLoad', async () => {
  const snapshot = createCoreProductSnapshot({});
  let afterLoad = false;
  await assert.rejects(
    loadCoreProductSnapshot({
      runtime: {
        postEvent: () => undefined,
        loadSnapshot: async () => { throw new Error('audio boundary rejected'); },
      },
      snapshot,
      reason: 'product-patch',
      awaitAudioThreadAck: true,
      nowMs: () => 0,
      afterLoad: () => { afterLoad = true; },
    }),
    /audio boundary rejected/,
  );
  assert.equal(afterLoad, false);
});
