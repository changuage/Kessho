import assert from 'node:assert/strict';

import {
  DRUM_LANE_ENABLED_KEYS,
  MANUAL_SYNTH_SOURCE_ENABLED_KEYS,
  SYNTH_LANE_ENABLED_KEYS,
  applySequencerTransportPlan,
  manualSynthSourceForLaneSource,
  planDrumSequencerTransportToggle,
  planSynthSequencerTransportToggle,
  drumLaneEnableTouchedAfterPresetRestore,
  shouldAutoEnableDrumLaneOnTransportStart,
} from '../sequencer/sequencerTransportPolicy';
import { DEFAULT_STATE } from '../state';

assert.equal(
  shouldAutoEnableDrumLaneOnTransportStart({
    starting: true,
    anyLaneEnabled: false,
    laneEnableTouched: false,
  }),
  true,
  'untouched empty drum sequencer should auto-enable one lane on first start',
);

assert.equal(SYNTH_LANE_ENABLED_KEYS.length, 4, 'synth transport registry should cover every lane');
assert.equal(DRUM_LANE_ENABLED_KEYS.length, 6, 'drum transport registry should cover every lane');
assert.equal(MANUAL_SYNTH_SOURCE_ENABLED_KEYS.sample2, 'sample2Enabled');

assert.equal(manualSynthSourceForLaneSource('synth2', 0), 'pad1');
assert.equal(manualSynthSourceForLaneSource('synth2', 0b10), 'pad2');

const emptySynthStart = planSynthSequencerTransportToggle({
  ...DEFAULT_STATE,
  synthEuclideanMasterEnabled: false,
  synthEuclid3Source: 'sample2',
  sample2Enabled: false,
  synthEuclid1Enabled: false,
  synthEuclid2Enabled: false,
  synthEuclid3Enabled: false,
  synthEuclid4Enabled: false,
}, 2);
assert.deepEqual(emptySynthStart, {
  starting: true,
  patch: {
    synthEuclideanMasterEnabled: true,
    synthEuclid3Enabled: true,
    sample2Enabled: true,
  },
}, 'empty synth transport should enable the active lane and its source');

const synthStop = planSynthSequencerTransportToggle({
  ...DEFAULT_STATE,
  synthEuclideanMasterEnabled: true,
}, 0);
assert.deepEqual(synthStop, {
  starting: false,
  patch: { synthEuclideanMasterEnabled: false },
}, 'synth stop should only disable its master transport');

const untouchedDrumStart = planDrumSequencerTransportToggle({
  ...DEFAULT_STATE,
  drumEnabled: false,
  drumEuclidMasterEnabled: false,
  drumEuclid1Enabled: false,
  drumEuclid2Enabled: false,
  drumEuclid3Enabled: false,
  drumEuclid4Enabled: false,
  drumEuclid5Enabled: false,
  drumEuclid6Enabled: false,
}, 4, false);
assert.deepEqual(untouchedDrumStart, {
  starting: true,
  patch: {
    drumEuclidMasterEnabled: true,
    drumEnabled: true,
    drumEuclid5Enabled: true,
  },
}, 'untouched empty drum transport should enable the active lane');

const intentionalEmptyDrumStart = planDrumSequencerTransportToggle({
  ...DEFAULT_STATE,
  drumEnabled: true,
  drumEuclidMasterEnabled: false,
  drumEuclid1Enabled: false,
  drumEuclid2Enabled: false,
  drumEuclid3Enabled: false,
  drumEuclid4Enabled: false,
  drumEuclid5Enabled: false,
  drumEuclid6Enabled: false,
}, 4, true);
assert.deepEqual(intentionalEmptyDrumStart, {
  starting: true,
  patch: { drumEuclidMasterEnabled: true },
}, 'intentional all-muted drum transport should remain muted');

const appliedChanges: Array<[keyof typeof DEFAULT_STATE, unknown]> = [];
let playbackStartPatch: Partial<typeof DEFAULT_STATE> | undefined;
applySequencerTransportPlan(
  emptySynthStart,
  (key, value) => appliedChanges.push([key, value]),
  (patch) => { playbackStartPatch = patch; },
);
assert.deepEqual(appliedChanges, [
  ['synthEuclideanMasterEnabled', true],
  ['synthEuclid3Enabled', true],
  ['sample2Enabled', true],
], 'transport application should preserve the planner patch order');
assert.equal(playbackStartPatch, emptySynthStart.patch, 'starting transport should pass the exact patch to playback');

let stopPlaybackStarted = false;
applySequencerTransportPlan(synthStop, () => undefined, () => { stopPlaybackStarted = true; });
assert.equal(stopPlaybackStarted, false, 'stopping transport must not request playback start');

assert.equal(
  shouldAutoEnableDrumLaneOnTransportStart({
    starting: true,
    anyLaneEnabled: false,
    laneEnableTouched: true,
  }),
  false,
  'explicit all-muted drum sequencer should stay muted on start',
);

assert.equal(
  shouldAutoEnableDrumLaneOnTransportStart({
    starting: true,
    anyLaneEnabled: true,
    laneEnableTouched: true,
  }),
  false,
  'drum sequencer should not auto-enable an extra lane when any lane is already enabled',
);

assert.equal(
  shouldAutoEnableDrumLaneOnTransportStart({
    starting: false,
    anyLaneEnabled: false,
    laneEnableTouched: false,
  }),
  false,
  'stopping transport should never auto-enable a lane',
);

assert.equal(
  drumLaneEnableTouchedAfterPresetRestore({ anyLaneEnabled: false }),
  true,
  'all-muted preset restore should be treated as intentional',
);

assert.equal(
  drumLaneEnableTouchedAfterPresetRestore({ anyLaneEnabled: true }),
  false,
  'preset restore with enabled lanes should keep first-start auto-enable available after lanes are later cleared by preset replacement',
);

console.log('Drum sequencer transport policy tests passed');
