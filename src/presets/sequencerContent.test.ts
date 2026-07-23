import assert from 'node:assert/strict';

import { DEFAULT_STATE } from '../ui/state';
import type { PresetVersionMetadata } from './types';
import {
  buildSequencerContentGroup,
  applySequencerContentComponents,
  sequencerContentCandidates,
  stripSequencerStateFromSoundContent,
} from './sequencerContent';
import {
  hashPresetContentRefGroup,
  preparePresetContentBatch,
  type PresetContentComponentRef,
} from './contentNodes';
import { normalizeProductPlayConfig } from '../audio/productPlaySequencer';

function metadataFixture(): PresetVersionMetadata {
  return {
    synthStepOverrides: {
      triggerToggles: [[{ step: 3, value: true }], [], [], []],
      pitch: [[0, 2, 4, 7], null, null, null],
      expression: [[0.5, 0.8], null, null, null],
      pitchDirection: ['reverse', null, null, null],
      expressionDirection: ['forward', null, null, null],
    },
    synthSubLaneStates: [{
      pitch: { enabled: true, steps: 4, direction: 'reverse', valueMode: 'sequence' },
      expression: { enabled: true, steps: 2, direction: 'forward', valueMode: 'sequence' },
      morph: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence' },
    }],
    synthClockDivs: ['1/16', '1/8', '1/8', '1/8'],
    synthSwings: [0.2, 0, 0, 0],
    synthLinked: [true, false, false, false],
    synthPitchSettings: [
      { mode: 'notes', root: 57, scale: 'Minor' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ],
    synthPitchBindingModes: ['sequence', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'],
  };
}

async function preparedRefs(
  group: ReturnType<typeof buildSequencerContentGroup>,
): Promise<PresetContentComponentRef[]> {
  const batch = await preparePresetContentBatch(sequencerContentCandidates(group));
  return group.components.map((component) => {
    const prepared = batch.byId.get(`${group.kind}.${group.laneIndex}.${component.componentSlot}`);
    assert.ok(prepared);
    return {
      componentSlot: component.componentSlot,
      contentType: component.contentType,
      contentHash: prepared.hash,
    };
  });
}

const state = {
  ...DEFAULT_STATE,
  synthEuclid1Enabled: true,
  synthEuclid1Solo: true,
  synthEuclid1Level: 0.42,
  synthEuclid1Source: 'pad2' as const,
  synthEuclid1VoiceMask: 17,
  synthEuclid1Preset: 'custom',
  synthEuclid1Steps: 8,
  synthEuclid1Hits: 3,
  synthEuclid1Rotation: 2,
  synthEuclid1Probability: 0.75,
  synthEuclid1NoteMin: 48,
  synthEuclid1NoteMax: 72,
};
const metadata = metadataFixture();
const group = buildSequencerContentGroup({ state, metadata, kind: 'synth', laneIndex: 0 });
assert.deepStrictEqual(group.components.map((component) => component.componentSlot), [
  'trigger',
  'pitch',
  'expression',
  'control',
]);
assert.deepStrictEqual(group.binding, {
  kind: 'synth',
  enabled: true,
  solo: true,
  level: 0.42,
  source: 'pad2',
  voiceMask: 17,
});

const sourceChanged = buildSequencerContentGroup({
  state: { ...state, synthEuclid1Source: 'lead2', synthEuclid1VoiceMask: 255, synthEuclid1Level: 0.9 },
  metadata,
  kind: 'synth',
  laneIndex: 0,
});
const baseRefs = await preparedRefs(group);
const sourceChangedRefs = await preparedRefs(sourceChanged);
assert.deepStrictEqual(sourceChangedRefs, baseRefs);

const pitchChangedMetadata = metadataFixture();
pitchChangedMetadata.synthStepOverrides!.pitch![0] = [0, 3, 4, 7];
const pitchChanged = buildSequencerContentGroup({
  state,
  metadata: pitchChangedMetadata,
  kind: 'synth',
  laneIndex: 0,
});
const pitchChangedRefs = await preparedRefs(pitchChanged);
for (const ref of baseRefs) {
  const changed = pitchChangedRefs.find((candidate) => candidate.componentSlot === ref.componentSlot);
  assert.ok(changed);
  if (ref.componentSlot === 'pitch') assert.notEqual(changed.contentHash, ref.contentHash);
  else assert.equal(changed.contentHash, ref.contentHash);
}
assert.notEqual(
  await hashPresetContentRefGroup({ groupType: 'sequencer', components: baseRefs }),
  await hashPresetContentRefGroup({ groupType: 'sequencer', components: pitchChangedRefs }),
);

const targetState = {
  ...DEFAULT_STATE,
  synthEuclid2Enabled: false,
  synthEuclid2Solo: false,
  synthEuclid2Level: 0.91,
  synthEuclid2Source: 'sample2' as const,
  synthEuclid2VoiceMask: 201,
};
const applied = applySequencerContentComponents({
  state: targetState,
  metadata: {},
  kind: 'synth',
  laneIndex: 1,
  components: group.components,
});
const merged = { ...targetState, ...applied.statePatch };
assert.equal(merged.synthEuclid2Source, 'sample2');
assert.equal(merged.synthEuclid2VoiceMask, 201);
assert.equal(merged.synthEuclid2Level, 0.91);
assert.equal(merged.synthEuclid2Enabled, false);
assert.equal(merged.synthEuclid2Steps, 8);
assert.equal(merged.synthEuclid2Hits, 3);
assert.equal(merged.synthEuclid2NoteMin, 48);
assert.equal(merged.synthEuclid2NoteMax, 72);
assert.deepStrictEqual(applied.metadata.synthStepOverrides?.pitch?.[1], [0, 2, 4, 7]);
assert.deepStrictEqual(applied.metadata.synthPitchSettings?.[1], { mode: 'notes', root: 57, scale: 'Minor' });

const legacyPlayConfigs: PresetVersionMetadata = {
  synthArpConfigs: [
    normalizeProductPlayConfig({ mode: 'arp', arp: { enabled: true, length: 3 } }),
    normalizeProductPlayConfig({ mode: 'chord', chord: { length: 2, flow: 'reverse' } }),
  ],
};
const legacyGroup = buildSequencerContentGroup({ state, metadata: legacyPlayConfigs, kind: 'synth', laneIndex: 0 });
const legacyControl = legacyGroup.components.find((component) => component.componentSlot === 'control');
assert.ok(legacyControl);
const canonicalizedLegacy = applySequencerContentComponents({
  state,
  metadata: legacyPlayConfigs,
  kind: 'synth',
  laneIndex: 0,
  components: [legacyControl!],
});
assert.deepStrictEqual(canonicalizedLegacy.metadata.synthPlayConfigs?.slice(0, 2), legacyPlayConfigs.synthArpConfigs);
assert.equal(canonicalizedLegacy.metadata.synthArpConfigs, undefined);

const drumState = {
  ...DEFAULT_STATE,
  drumEuclid1Preset: 'custom',
  drumEuclid1Steps: 8,
  drumEuclid1Hits: 3,
  drumEuclid1Rotation: 2,
  drumEuclid1Probability: 0.75,
  drumEuclid1VelocityMin: 0.5,
  drumEuclid1VelocityMax: 1,
};
const drumMetadata: PresetVersionMetadata = {
  drumStepOverrides: {
    triggerToggles: [[{ step: 3, value: true }], [], [], [], [], []],
  },
};
const drumGroup = buildSequencerContentGroup({
  state: drumState,
  metadata: drumMetadata,
  kind: 'drum',
  laneIndex: 0,
});
const synthTriggerHash = baseRefs.find((ref) => ref.componentSlot === 'trigger')?.contentHash;
const drumRefs = await preparedRefs(drumGroup);
assert.equal(drumRefs.find((ref) => ref.componentSlot === 'trigger')?.contentHash, synthTriggerHash);

assert.deepStrictEqual(
  stripSequencerStateFromSoundContent({
    padEnabled: true,
    synthEuclid1Steps: 8,
    synthEuclid1Source: 'pad2',
    drumEuclid1Hits: 4,
  }),
  { padEnabled: true },
);

console.log('preset sequencer component regression passed');
