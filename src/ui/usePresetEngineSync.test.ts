import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPresetEngineUpdateOptions,
  createProductPresetSyncOptions,
} from './usePresetEngineSync';
import type { SliderState } from './state';

const state = {} as SliderState;
const metadata = { presetId: 'preset-1', presetName: 'Preset 1' };

test('Product preset loads disable reference engine side effects', () => {
  const referenceUpdates: Array<{ state: SliderState; metadata: typeof metadata }> = [];
  let resetCount = 0;
  const options = createPresetEngineUpdateOptions(
    true,
    () => { resetCount += 1; },
    (nextState, nextMetadata) => referenceUpdates.push({ state: nextState, metadata: nextMetadata }),
  );

  assert.equal(options.updateEngine, false);
  assert.equal(options.resetCofDrift, false);
  options.onUpdateEngine?.(state, metadata);
  options.onResetCofDrift?.();
  assert.deepEqual(referenceUpdates, []);
  assert.equal(resetCount, 0);
});

test('reference preset loads retain reference engine side effects', () => {
  const referenceUpdates: Array<{ state: SliderState; metadata: typeof metadata }> = [];
  let resetCount = 0;
  const options = createPresetEngineUpdateOptions(
    false,
    () => { resetCount += 1; },
    (nextState, nextMetadata) => referenceUpdates.push({ state: nextState, metadata: nextMetadata }),
  );

  assert.equal(options.updateEngine, true);
  assert.equal(options.resetCofDrift, true);
  options.onUpdateEngine?.(state, metadata);
  options.onResetCofDrift?.();
  assert.deepEqual(referenceUpdates, [{ state, metadata }]);
  assert.equal(resetCount, 1);
});

test('Product preset sync requests one trigger-critical full snapshot', () => {
  assert.deepEqual(createProductPresetSyncOptions(), {
    immediate: true,
    reason: 'preset-load',
    forceFullSnapshot: true,
    triggerCritical: true,
  });
});
