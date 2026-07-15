import assert from 'node:assert/strict';
import {
  CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS,
  coreProductSequencerAudibilityFlags,
  nextSequencerResumeQuantization,
  sequencerResumeQuantizationForLane,
  sequencerResumeQuantizationLabel,
} from './sequencerResumeQuantization';
import {
  createSequencerResumeRuntimeState,
  updateSequencerResumeRuntimeLane,
} from './sequencerResumeRuntime';
import { decodeStateFromUrl, encodeStateToUrl, DEFAULT_STATE } from '../ui/state';

assert.equal(nextSequencerResumeQuantization('nextBeat'), 'nextBar');
assert.equal(nextSequencerResumeQuantization('nextBar'), 'immediate');
assert.equal(nextSequencerResumeQuantization('immediate'), 'nextBeat');
assert.equal(sequencerResumeQuantizationLabel(undefined), 'Next Beat');
assert.equal(sequencerResumeQuantizationForLane({}, 'synth', 1), 'nextBeat');
assert.equal(sequencerResumeQuantizationForLane({ drumEuclid4ResumeQuantization: 'nextBar' }, 'drum', 4), 'nextBar');
assert.equal(coreProductSequencerAudibilityFlags('immediate'), 0);
assert.equal(coreProductSequencerAudibilityFlags('nextBeat'), CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS.applyNextBeat);
assert.equal(coreProductSequencerAudibilityFlags('nextBar'), CORE_PRODUCT_SEQUENCER_AUDIBILITY_FLAGS.applyNextBar);

const persisted = decodeStateFromUrl(`?${encodeStateToUrl({
  ...DEFAULT_STATE,
  synthEuclid2ResumeQuantization: 'immediate',
  drumEuclid4ResumeQuantization: 'nextBar',
})}`);
assert.equal(persisted?.synthEuclid2ResumeQuantization, 'immediate');
assert.equal(persisted?.drumEuclid4ResumeQuantization, 'nextBar');

const runtime = createSequencerResumeRuntimeState(1);
let mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: true,
  policy: 'nextBeat',
  now: 0.2,
  nextBoundaryTime: () => 1,
});
assert.equal(mutedAt(0.9), true, 'initially muted lane must remain silent');

mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: false,
  policy: 'nextBeat',
  now: 0.25,
  nextBoundaryTime: () => 1,
});
assert.equal(mutedAt(0.999), true, 'next-beat resume must remain silent before its boundary');
assert.equal(mutedAt(1), false, 'next-beat resume must become audible exactly at its boundary');

mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: false,
  policy: 'nextBeat',
  now: 1,
  nextBoundaryTime: () => 2,
});
assert.equal(mutedAt(1), false, 'crossing the boundary must commit the audible state');

updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: true,
  policy: 'nextBar',
  now: 1.1,
  nextBoundaryTime: () => 4,
});
mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: false,
  policy: 'nextBar',
  now: 1.2,
  nextBoundaryTime: () => 4,
});
assert.equal(mutedAt(3.99), true);
assert.equal(mutedAt(4), false);

mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: true,
  policy: 'immediate',
  now: 4.1,
  nextBoundaryTime: () => 5,
});
assert.equal(mutedAt(4.1), true);
mutedAt = updateSequencerResumeRuntimeLane({
  state: runtime,
  laneIndex: 0,
  requestedMuted: false,
  policy: 'immediate',
  now: 4.2,
  nextBoundaryTime: () => 5,
});
assert.equal(mutedAt(4.2), false, 'immediate resume must not wait for a boundary');

console.log('sequencer resume quantization regression passed');
