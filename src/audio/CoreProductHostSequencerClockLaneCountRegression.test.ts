import assert from 'node:assert/strict';
import {
  coreProductSequencerClockRejoinMask,
  shouldRejoinCoreProductSequencerClocks,
} from './CoreProductHostSequencerClock';
import {
  DRUM_EUCLIDEAN_LANE_COUNT,
  SYNTH_EUCLIDEAN_LANE_COUNT,
  euclideanLaneCount,
} from './sequencerLaneCounts';

function baseState(): Record<string, unknown> {
  return {
    transportPrimaryClock: 'global',
    phraseLength: 16,
    sequencerMasterBPM: 120,
    transportBarsPerPhrase: 4,
    transportBeatsPerBar: 4,
    synthEuclideanMasterEnabled: true,
    drumEnabled: true,
    drumEuclidMasterEnabled: true,
    synthEuclidClockSource: 'transport',
    synthEuclidJoinPolicy: 'nextStep',
    drumEuclidClockSource: 'transport',
    drumEuclidJoinPolicy: 'nextStep',
  };
}

function withLane(state: Record<string, unknown>, kind: 'synth' | 'drum', lane: number, enabled: boolean): Record<string, unknown> {
  const prefix = kind === 'synth' ? 'synthEuclid' : 'drumEuclid';
  return { ...state, [`${prefix}${lane}Enabled`]: enabled };
}

assert.equal(SYNTH_EUCLIDEAN_LANE_COUNT, 4);
assert.equal(DRUM_EUCLIDEAN_LANE_COUNT, 6);
assert.equal(euclideanLaneCount('synth'), 4);
assert.equal(euclideanLaneCount('drum'), 6);

for (const lane of [1, 2, 3, 4, 5, 6]) {
  const previous = withLane(baseState(), 'drum', lane, false);
  const next = withLane(baseState(), 'drum', lane, true);
  assert.equal(
    shouldRejoinCoreProductSequencerClocks(previous, next),
    false,
    `unmuting drum lane ${lane} must preserve Product Core sequencer phase`,
  );
}

for (const lane of [1, 2, 3, 4]) {
  const previous = withLane(baseState(), 'synth', lane, false);
  const next = withLane(baseState(), 'synth', lane, true);
  assert.equal(
    shouldRejoinCoreProductSequencerClocks(previous, next),
    false,
    `unmuting synth lane ${lane} must preserve Product Core sequencer phase`,
  );
}

{
  const previous = { ...baseState(), drumEuclidMasterEnabled: false };
  const next = { ...previous, drumEuclidMasterEnabled: true };
  assert.deepEqual(
    coreProductSequencerClockRejoinMask(previous, next),
    { synth: 0, drum: 0b11_1111 },
    'starting Drum must arm only Drum lanes and leave every Synth clock untouched',
  );
}

{
  const previous = { ...baseState(), synthEuclideanMasterEnabled: false };
  const next = { ...previous, synthEuclideanMasterEnabled: true };
  assert.deepEqual(
    coreProductSequencerClockRejoinMask(previous, next),
    { synth: 0b1111, drum: 0 },
    'starting Synth must arm only Synth lanes and leave every Drum clock untouched',
  );
}

for (const lane of [5, 6]) {
  const previous = withLane(baseState(), 'synth', lane, false);
  const next = withLane(baseState(), 'synth', lane, true);
  assert.equal(
    shouldRejoinCoreProductSequencerClocks(previous, next),
    false,
    `synth lane ${lane} must not exist or trigger clock rejoin`,
  );
}

{
  const previous = baseState();
  const next = {
    ...previous,
    phraseLength: 32,
    sequencerMasterBPM: 30,
  };
  assert.equal(
    shouldRejoinCoreProductSequencerClocks(previous, next),
    false,
    'global transport timing changes must use the pending phrase transition instead of resetting lanes',
  );
}

console.log('Core Product sequencer lane-count regression passed');
