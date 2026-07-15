import assert from 'node:assert/strict';

import {
  createCoreProductSequencerClockDivisionEvents,
  createCoreProductSequencerStepEvent,
} from '../audio/coreProductEvents';
import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type {
  ProductResolvedStateCommit,
  ProductResolvedStateCommitReceipt,
} from '../audio/product/ProductEngineTypes';
import { DEFAULT_STATE } from './state';
import { commitLiveSequencerTiming } from './commitLiveSequencerTiming';

const enqueuedBatches: ProductResolvedStateCommit['events'][] = [];
const commits: ProductResolvedStateCommit[] = [];
const pendingCommit = new Promise<ProductResolvedStateCommitReceipt>(() => {});

const engine = {
  enqueueEvents(events: ProductResolvedStateCommit['events']) {
    enqueuedBatches.push(events);
  },
  getCommittedStateRevision() {
    return 0;
  },
  commitResolvedState(commit: ProductResolvedStateCommit) {
    commits.push(commit);
    return pendingCommit;
  },
} as unknown as ProductEnginePort;

const events = createCoreProductSequencerClockDivisionEvents('synth', ['1/16']);
commitLiveSequencerTiming({
  engine,
  stateRef: { current: DEFAULT_STATE },
  patch: { synthEuclidClockDivs: ['1/16'] },
  events,
});

assert.equal(enqueuedBatches.length, 1, 'live lane timing must enqueue synchronously');
assert.equal(enqueuedBatches[0], events, 'the immediate path must preserve the timing event batch');
assert.equal(commits.length, 0, 'persistence must not gate immediate event delivery');

await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(commits.length, 1, 'live timing must still persist through ProductControl');
assert.equal(commits[0]?.triggerCritical, false, 'timing persistence must not wait for an audio-thread trigger acknowledgement');
assert.equal(commits[0]?.applyMode, 'event', 'timing persistence must avoid a snapshot reload');
assert.equal(commits[0]?.events, undefined, 'the persistence commit must not repost the already-live timing batch');

assert.throws(() => {
  commitLiveSequencerTiming({
    engine,
    stateRef: { current: DEFAULT_STATE },
    patch: {},
    events: [createCoreProductSequencerStepEvent('synth', 0, 0, true)],
  });
}, /only accept live lane timing events/, 'structural sequencer events must not bypass the ordered commit path');

console.log('Live sequencer timing commit regression passed');
