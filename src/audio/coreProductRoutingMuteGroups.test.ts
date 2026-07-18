import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { createCoreProductRoutingMuteGroupEvents } from './coreProductEvents';
import { DEFAULT_STATE } from '../ui/state';

test('compiles all routing rows and quarter-phrase ranges', () => {
  const events = createCoreProductRoutingMuteGroupEvents({
    slots: [{
      mutedSourceIds: ['pad1', 'nature', 'reverb'],
      phraseRange: { min: 0.25, max: 1.25 },
    }, null, null, null, null, null, null, null],
    random: {
      enabled: true,
      defaultMinPhrases: 2,
      defaultMaxPhrases: 6,
      transitionPhrases: 0.5,
      avoidRepeat: true,
    },
  }, { sampleRate: 48_000, phraseSeconds: 8, seed: 17, state: DEFAULT_STATE });
  const slot = events.find((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot);
  assert.equal(slot?.targetId, (1 << 0) | (1 << 11) | (1 << 15));
  assert.equal(slot?.value, 1);
  assert.equal(slot?.value2, 5);
  assert.equal(slot?.value3, 192_000);
});

test('compiles eligibility and avoid-repeat settings deterministically', () => {
  const groups = {
    slots: Array.from({ length: 8 }, (_, index) => ({ mutedSourceIds: index === 0 ? ['drums' as const] : [] })),
    random: {
      enabled: true,
      defaultMinPhrases: 1,
      defaultMaxPhrases: 2,
      transitionPhrases: 1,
      avoidRepeat: false,
      eligibleSlotIndexes: [1, 3],
    },
  };
  const first = createCoreProductRoutingMuteGroupEvents(groups, { sampleRate: 1_000, phraseSeconds: 4, seed: 9, state: DEFAULT_STATE });
  const second = createCoreProductRoutingMuteGroupEvents(groups, { sampleRate: 1_000, phraseSeconds: 4, seed: 9, state: DEFAULT_STATE });
  assert.deepEqual(first, second);
  assert.equal(first[0]?.value3, 0);
  const slots = first.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot);
  assert.deepEqual(slots.map((event) => (event.flags ?? 0) & 1), [0, 1, 0, 1, 0, 0, 0, 0]);
});
