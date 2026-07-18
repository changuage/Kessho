import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import { autoCyclePhaseLabel, createCoreProductAutoCycleEvent } from './compileProductAutoCycle';

test('encodes bounded Product auto-cycle configuration', () => {
  assert.deepEqual(createCoreProductAutoCycleEvent({
    enabled: true,
    initialPosition: 0.42,
    playPhrases: 4,
    transitionPhrases: 2,
    revision: 19,
  }), {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ConfigureGlobalAutoCycle,
    value: 0.42,
    value2: 4,
    value3: 2,
    value4: 19,
    flags: 1,
  });
});

test('clamps invalid host values before crossing the ABI', () => {
  const event = createCoreProductAutoCycleEvent({
    enabled: false,
    initialPosition: 2,
    playPhrases: Number.NaN,
    transitionPhrases: -1,
    revision: Number.NaN,
  });
  assert.equal(event.value, 1);
  assert.equal(event.value2, 1);
  assert.equal(event.value3, 0);
  assert.equal(event.value4, 0);
  assert.equal(event.flags, 0);
});

test('encodes an in-place duration update without restarting the cycle', () => {
  const event = createCoreProductAutoCycleEvent({
    enabled: true,
    initialPosition: 0,
    playPhrases: 8,
    transitionPhrases: 3,
    revision: 19,
    preservePhase: true,
  });
  assert.equal(event.flags, 3);
  assert.equal(event.value2, 8);
  assert.equal(event.value3, 3);
});

test('projects all runtime phase labels without owning timing', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((phase) => autoCyclePhaseLabel(phase, phase === 2 ? 0.25 : 0)),
    ['Hold', 'Morph → A', 'Playing A', 'Morph A→B', 'Playing B', 'Morph B→A'],
  );
});
