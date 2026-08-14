import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRuntimeModulationKeyEligible,
  selectEligibleRuntimeRanges,
  type RuntimeModulationState,
} from './runtimeModulationEligibility';

const enabledWaterState = (): RuntimeModulationState => ({
  waterEnabled: true,
  waterLayerHardDropsEnabled: true,
  waterLayerWaterDropsEnabled: true,
  waterLayerBubblingEnabled: true,
  waterLayerChannelsEnabled: true,
  waterLayerTurbulenceEnabled: true,
  waterLayerSurfEnabled: true,
});

test('Water child registrations follow their exact owner booleans', () => {
  const cases = [
    ['waterHardDropRate', 'waterLayerHardDropsEnabled'],
    ['waterWaterDropRate', 'waterLayerWaterDropsEnabled'],
    ['waterBubblingRate', 'waterLayerBubblingEnabled'],
    ['waterChannelsSpeed', 'waterLayerChannelsEnabled'],
    ['waterLayerTurbulence', 'waterLayerTurbulenceEnabled'],
    ['waterSurfDuration', 'waterLayerSurfEnabled'],
  ] as const;

  for (const [key, owner] of cases) {
    const state = enabledWaterState();
    const savedRangeMetadata = { min: 0.2, max: 0.8 };
    assert.equal(isRuntimeModulationKeyEligible(key, { ...state, [owner]: false }), false, `${key} must unregister while disabled`);
    // Eligibility is derived from live state; the caller's slider mode/range
    // metadata is intentionally untouched and becomes eligible again on re-enable.
    assert.deepEqual(savedRangeMetadata, { min: 0.2, max: 0.8 });
    assert.equal(isRuntimeModulationKeyEligible(key, { ...state, [owner]: true }), true, `${key} must reactivate on re-enable`);
  }
  assert.equal(isRuntimeModulationKeyEligible('waterSurfDuration', { ...enabledWaterState(), waterEnabled: false }), false);
});

test('disabled Water ranges are omitted without losing slider metadata', () => {
  const ranges = {
    waterSurfDuration: { min: 3, max: 7 },
    waterChannelsSpeed: { min: 0.1, max: 0.9 },
  };
  const sliderModes = { waterSurfDuration: 'sampleHold', waterChannelsSpeed: 'walk' } as const;
  const state = { ...enabledWaterState(), waterLayerSurfEnabled: false };
  const eligible = (key: string) => isRuntimeModulationKeyEligible(key, state);

  assert.deepEqual(
    selectEligibleRuntimeRanges(ranges, sliderModes, 'sampleHold', eligible),
    {},
    'disabled Water sample-and-hold ranges must not be registered',
  );
  assert.deepEqual(
    selectEligibleRuntimeRanges(ranges, sliderModes, 'walk', eligible),
    { waterChannelsSpeed: ranges.waterChannelsSpeed },
  );

  const reenabled = { ...state, waterLayerSurfEnabled: true };
  assert.deepEqual(
    selectEligibleRuntimeRanges(ranges, sliderModes, 'sampleHold', (key) => isRuntimeModulationKeyEligible(key, reenabled)),
    { waterSurfDuration: ranges.waterSurfDuration },
    'the preserved range becomes active again when the owner is re-enabled',
  );
  assert.deepEqual(ranges, {
    waterSurfDuration: { min: 3, max: 7 },
    waterChannelsSpeed: { min: 0.1, max: 0.9 },
  });
});

test('shared routing ownership gates source-local ranges without cross-gating unrelated sources', () => {
  assert.equal(isRuntimeModulationKeyEligible('pad2FilterCutoff', { pad2Enabled: false }), false);
  assert.equal(isRuntimeModulationKeyEligible('pad2FilterCutoff', { pad2Enabled: true }), true);
  assert.equal(isRuntimeModulationKeyEligible('lead2Morph', { lead2Enabled: false }), false);
  assert.equal(isRuntimeModulationKeyEligible('sample1Distance', { sample1Enabled: false }), false);
  assert.equal(isRuntimeModulationKeyEligible('drumKickFreq', { drumEnabled: false }), false);

  // Delay A owns these controls; a disabled drum source must not suppress them.
  assert.equal(isRuntimeModulationKeyEligible('drumDelayNoteL', { delayAEnabled: true, drumEnabled: false }), true);
  assert.equal(isRuntimeModulationKeyEligible('delayAMix', { delayAEnabled: true, padEnabled: false }), true);
  assert.equal(isRuntimeModulationKeyEligible('granularLevel', { granularEnabled: true, padEnabled: false }), true);
  assert.equal(
    isRuntimeModulationKeyEligible('granularDelayMix', { granularDelayEnabled: true, granularEnabled: false }),
    true,
    'Granular Delay B controls are owned by Delay B, not the Granular source',
  );
});

test('arrangement lead timing keys are independent of the Lead 1 source toggle', () => {
  for (const key of ['lead1Density', 'lead1Octave', 'lead1OctaveRange']) {
    assert.equal(isRuntimeModulationKeyEligible(key, { leadEnabled: false }), true, `${key} must remain available for arrangement timing`);
  }
});
