import assert from 'node:assert/strict';
import test from 'node:test';

import { CoreProductStatePatchQueue } from './CoreProductStatePatchQueue';

test('accumulates queued patches with last-write-wins semantics', async () => {
  const applied: Array<{ state: Record<string, unknown>; reason: string }> = [];
  const queue = new CoreProductStatePatchQueue({
    latestSliderState: () => ({ base: true, shared: 0 }),
    applyProductState: async (state, reason) => {
      applied.push({ state, reason });
      return { applied: true, mode: 'dirty-diff' };
    },
  });

  const first = queue.apply({ first: true, shared: 1 }, 'product-patch');
  const second = queue.apply({ second: true, shared: 2 }, 'product-patch');

  assert.deepEqual(await Promise.all([first, second]), [
    { applied: true, mode: 'dirty-diff' },
    { applied: true, mode: 'dirty-diff' },
  ]);
  assert.deepEqual(applied, [{
    state: { base: true, shared: 2, first: true, second: true },
    reason: 'product-patch',
  }]);
});
