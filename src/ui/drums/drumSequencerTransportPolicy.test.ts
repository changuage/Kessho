import assert from 'node:assert/strict';

import {
  drumLaneEnableTouchedAfterPresetRestore,
  shouldAutoEnableDrumLaneOnTransportStart,
} from './drumSequencerTransportPolicy';

assert.equal(
  shouldAutoEnableDrumLaneOnTransportStart({
    starting: true,
    anyLaneEnabled: false,
    laneEnableTouched: false,
  }),
  true,
  'untouched empty drum sequencer should auto-enable one lane on first start',
);

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
