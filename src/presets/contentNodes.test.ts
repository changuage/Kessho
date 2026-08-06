import assert from 'node:assert/strict';

import {
  canonicalizePresetContentRefGroup,
  createPresetContentNode,
  hashPresetContentRefGroup,
  normalizePresetParameterBehavior,
  preparePresetContentBatch,
  presetContentRefSlot,
} from './contentNodes';
import { stableStringifyContent } from './contentCanonicalization';
import {
  buildHarmonyContentInstances,
  harmonyContentCandidates,
  hydrateHarmonyContentRef,
  stripHarmonyContentFromL4Override,
} from './harmonyContent';

const left = createPresetContentNode('sequencerSubLane', {
  values: [1, 2, 3],
  steps: 8,
  optional: undefined,
  negativeZero: -0,
  rounded: 0.123456789,
});
const right = createPresetContentNode('sequencerSubLane', {
  rounded: 0.123456788,
  negativeZero: 0,
  steps: 8,
  values: [1, 2, 3],
});
assert.equal(stableStringifyContent(left), stableStringifyContent(right));

assert.deepStrictEqual(normalizePresetParameterBehavior({
  mode: 'walk',
  range: { min: 0.8, max: 0.2 },
}), {
  mode: 'walk',
  range: { min: 0.2, max: 0.8 },
});
assert.deepStrictEqual(normalizePresetParameterBehavior({
  mode: 'single',
  range: { min: 0.2, max: 0.8 },
}), { mode: 'single' });

const batch = await preparePresetContentBatch([
  { id: 'pitch-a', contentType: 'sequencerSubLane', content: { kind: 'pitch', steps: 3, values: [0, 2, 4] } },
  { id: 'pitch-b', contentType: 'sequencerSubLane', content: { values: [0, 2, 4], steps: 3, kind: 'pitch' } },
  { id: 'pitch-c', contentType: 'sequencerSubLane', content: { kind: 'pitch', steps: 3, values: [0, 3, 4] } },
]);
assert.equal(batch.byId.size, 3);
assert.equal(batch.uniqueByHash.size, 2);
assert.equal(batch.byId.get('pitch-a')?.hash, batch.byId.get('pitch-b')?.hash);
assert.notEqual(batch.byId.get('pitch-a')?.hash, batch.byId.get('pitch-c')?.hash);

const triggerHash = batch.byId.get('pitch-a')?.hash;
const pitchHash = batch.byId.get('pitch-c')?.hash;
assert.ok(triggerHash);
assert.ok(pitchHash);

const groupA = {
  groupType: 'sequencer' as const,
  components: [
    { componentSlot: 'pitch', contentType: 'sequencerSubLane' as const, contentHash: pitchHash },
    { componentSlot: 'trigger', contentType: 'sequencerTrigger' as const, contentHash: triggerHash },
  ],
};
const groupB = {
  ...groupA,
  components: [...groupA.components].reverse(),
};
assert.deepStrictEqual(
  canonicalizePresetContentRefGroup(groupA),
  canonicalizePresetContentRefGroup(groupB),
);
assert.equal(await hashPresetContentRefGroup(groupA), await hashPresetContentRefGroup(groupB));
assert.equal(presetContentRefSlot('sequencer.synth.0', 'pitch'), 'sequencer.synth.0.pitch');

await assert.rejects(
  preparePresetContentBatch([
    { id: 'bad', contentType: 'sequencerSubLane', content: { values: [Number.NaN] } },
  ]),
  /finite number/,
);
assert.throws(
  () => canonicalizePresetContentRefGroup({
    ...groupA,
    components: [...groupA.components, groupA.components[0]!],
  }),
  /Duplicate content component slot/,
);

assert.equal(
  batch.byId.get('pitch-a')?.hash,
  'fc936451e963a8493fddbb7a57b46df22ae0740f1fec9b89e73590c70011628b',
);
assert.equal(
  await hashPresetContentRefGroup(groupA),
  'b1ee6a20ea3b8c3606f520a2000e3865acdba2cbe6c520a8a0473d814a104bad',
);

const activeChordSlots = [{ root: 60, quality: 'minor7' }];
const activeHarmonyInstances = buildHarmonyContentInstances({
  harmonyChordSlots: activeChordSlots,
  harmonyChordSlotsA: activeChordSlots,
});
const activeChordBank = activeHarmonyInstances.find(instance => (
  instance.refSlot === 'harmony.program.chord-bank-active'
));
assert.deepStrictEqual(activeChordBank?.content, { slots: activeChordSlots });
assert.deepStrictEqual(
  hydrateHarmonyContentRef(
    'harmony.program.chord-bank-active',
    'harmonyChordBank',
    activeChordBank?.content ?? {},
  ),
  { harmonyChordSlots: activeChordSlots },
);
const harmonyBatch = await preparePresetContentBatch(harmonyContentCandidates(activeHarmonyInstances));
assert.equal(
  harmonyBatch.byId.get('harmony.chord.active')?.hash,
  harmonyBatch.byId.get('harmony.chord.a')?.hash,
  'identical active and A chord banks should share one content node',
);
const strippedHarmonyOverride = stripHarmonyContentFromL4Override({
  harmonyChordSlots: activeChordSlots,
  rootNote: 60,
  untouched: true,
});
assert.equal('harmonyChordSlots' in strippedHarmonyOverride, false);
assert.equal(strippedHarmonyOverride.untouched, true);

console.log('preset content node regression passed');
