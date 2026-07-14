import assert from 'node:assert/strict';
import { shouldRejoinCoreProductSequencerClocks } from './CoreProductHostSequencerClock';
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
    true,
    `enabling drum lane ${lane} must rejoin Product Core sequencer clocks`,
  );
}

for (const lane of [1, 2, 3, 4]) {
  const previous = withLane(baseState(), 'synth', lane, false);
  const next = withLane(baseState(), 'synth', lane, true);
  assert.equal(
    shouldRejoinCoreProductSequencerClocks(previous, next),
    true,
    `enabling synth lane ${lane} must rejoin Product Core sequencer clocks`,
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
