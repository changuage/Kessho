import assert from 'node:assert/strict';
import { applyPreset } from './presetUtils';
import { DEFAULT_STATE, type SavedPreset, type SliderState } from './state';

function normalize(state: SliderState): SliderState {
  return state;
}

function makePreset(state: Partial<SliderState>): SavedPreset {
  return {
    name: 'six-lane exact load',
    timestamp: '2026-06-20T00:00:00.000Z',
    state: {
      ...DEFAULT_STATE,
      ...state,
    },
  };
}

const maximalSixLanePreset = makePreset({
  drumEnabled: true,
  drumLevel: 0,
  drumReverbSend: 0,
  drumDelayASend: 0,
  drumDelayBSend: 0,
  granularDrumSend: 0,
  drumEuclidMasterEnabled: true,
  synthEuclideanMasterEnabled: true,
  drumEuclid5Enabled: true,
  drumEuclid5Steps: 17,
  drumEuclid5Hits: 5,
  drumEuclid5Rotation: 3,
  drumEuclid6Enabled: true,
  drumEuclid6Steps: 19,
  drumEuclid6Hits: 7,
  drumEuclid6Rotation: 4,
});

const exact = applyPreset(maximalSixLanePreset, { loadMode: 'exact-as-saved', normalize });
assert.equal(exact.state.drumEuclidMasterEnabled, maximalSixLanePreset.state.drumEuclidMasterEnabled);
assert.equal(exact.state.synthEuclideanMasterEnabled, maximalSixLanePreset.state.synthEuclideanMasterEnabled);
assert.equal(exact.state.drumEnabled, true);
assert.equal(exact.state.drumEuclid5Enabled, true);
assert.equal(exact.state.drumEuclid6Enabled, true);
assert.equal(exact.safeAuditionChanged, false);
assert.equal(exact.transportDisabledByLoadMode, false);

const safe = applyPreset(maximalSixLanePreset, { loadMode: 'safe-audition', normalize });
assert.equal(safe.transportDisabledByLoadMode, true);
assert.equal(safe.state.drumEuclidMasterEnabled, false);
assert.equal(safe.state.synthEuclideanMasterEnabled, false);
assert.equal(safe.state.drumEnabled, false);

const legacyRaw = makePreset({
  granularDelayEnabled: true,
} as Partial<SliderState>);
delete (legacyRaw.state as Partial<SliderState>).granularDelayBSend;
assert.throws(
  () => applyPreset(legacyRaw, { loadMode: 'exact-as-saved', normalize }),
  /missing canonical fields/,
  'legacy/missing current fields must be rejected instead of repaired',
);

console.log('preset exact load regression passed');
