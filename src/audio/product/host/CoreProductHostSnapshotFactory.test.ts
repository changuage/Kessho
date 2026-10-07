import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoreProductSnapshot } from '../../coreProductSnapshot';
import { createCoreProductHostSnapshot } from './CoreProductHostSnapshotFactory';
import { DEFAULT_STATE } from '../../../ui/state';

test('host full snapshots carry live transport state independently of slider state', () => {
  const hostState = {
    adapterState: {},
    journeyMorphClockRunning: false,
    latestTelemetry: null,
    running: true,
  };

  const sliderExplicitlyFalse = { ...DEFAULT_STATE, running: false } as Record<string, unknown>;
  const sliderOmitted = { ...DEFAULT_STATE } as Record<string, unknown>;

  assert.equal(createCoreProductSnapshot(sliderExplicitlyFalse).transport.running, false);
  assert.equal(createCoreProductHostSnapshot({ ...hostState, latestSliderState: sliderExplicitlyFalse }).transport.running, true);
  assert.equal(createCoreProductHostSnapshot({ ...hostState, latestSliderState: sliderOmitted }).transport.running, true);
});
