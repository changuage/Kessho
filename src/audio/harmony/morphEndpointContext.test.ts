import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCoreProductSnapshot } from '../coreProductSnapshot';

test('Product snapshot morph endpoint context follows the effective frame', () => {
  const snapshot = createCoreProductSnapshot({
    rootMidi: 60,
    rootNote: 0,
    scaleMode: 'manual',
    manualScale: 'Major (Ionian)',
    tension: 0.35,
    harmonyMorphPercent: 50,
  });

  assert.deepEqual(snapshot.harmony.morphEndpointRootMidi, [60, 60]);
  assert.deepEqual(snapshot.harmony.morphEndpointScaleId, [1, 1]);
  assert.deepEqual(snapshot.harmony.morphEndpointTension, [0.35, 0.35]);
});
