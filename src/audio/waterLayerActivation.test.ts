import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMissingWaterLayerEnabledFlags } from './waterLayerActivation';

test('legacy hydration derives only missing Water layer selections', () => {
  const state: Record<string, unknown> = {
    waterLayerHardDrops: 0.8,
    waterLayerHardDropsEnabled: false,
    waterLayerWaterDrops: 0.4,
  };

  deriveMissingWaterLayerEnabledFlags(state);

  assert.equal(state.waterLayerHardDropsEnabled, false);
  assert.equal(state.waterLayerWaterDropsEnabled, true);
});
