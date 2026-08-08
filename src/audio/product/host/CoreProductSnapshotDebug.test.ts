import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoreProductSnapshot } from '../../coreProductSnapshot';
import { logEncodedSnapshotForDebug } from './CoreProductSnapshotDebug';

test('skips snapshot hashing and source summaries when debug logging is disabled', () => {
  const encodedSnapshot = new ArrayBuffer(1);
  structuredClone(encodedSnapshot, { transfer: [encodedSnapshot] });
  const snapshot = {
    get sources(): never { throw new Error('source summary should not be evaluated'); },
  } as unknown as CoreProductSnapshot;

  assert.doesNotThrow(() => logEncodedSnapshotForDebug(snapshot, 'product-patch', encodedSnapshot));
});
