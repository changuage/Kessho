import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  auditPresetContentOwnership,
  getPresetContentOwner,
  getPresetMetadataOwner,
} from './contentOwnership';
import { PARAM_REGISTRY } from './ParamRegistry';
import { normalizeStatePresetPitchMetadata, preparePresetVersionMetadataForV2Storage } from './versionMetadataHelpers';
import type { PitchSettings } from '../ui/sequencer/useEuclideanSequencer';
import { preparePresetContentBatch } from './contentNodes';
import {
  buildParameterBehaviorInstances,
  hydrateParameterBehaviorRefs,
  parameterBehaviorCandidates,
  stripParameterBehaviorsFromV2Metadata,
} from './parameterBehaviorContent';
import { buildDerivedStatePresetData } from './statePresetOptimization';
import { DEFAULT_STATE } from '../ui/state';
import {
  getPresetLegacyContentReadCounters,
  recordPresetLegacyContentRead,
  resetPresetLegacyContentReadCounters,
} from './presetLegacyContentTelemetry';

const audit = auditPresetContentOwnership();

assert.deepStrictEqual(audit.unowned, []);
assert.deepStrictEqual(audit.duplicateMetadataKeys, []);
assert.equal(
  audit.entries.filter((entry) => entry.context === 'state-composition').length,
  Object.keys(PARAM_REGISTRY).length,
);

assert.equal(getPresetContentOwner('synthEuclid1Steps'), 'portable-content');
assert.equal(getPresetContentOwner('synthEuclid1Source'), 'slot-binding');
assert.equal(getPresetContentOwner('synthEuclid1ResumeQuantization'), 'slot-binding');
assert.equal(getPresetContentOwner('synthEuclid1NoteMin'), 'slot-binding');
assert.equal(getPresetContentOwner('synthEuclid1NoteMax'), 'slot-binding');
assert.equal(getPresetContentOwner('drumEuclid6TargetMembrane'), 'slot-binding');
assert.equal(getPresetContentOwner('drumEuclid6ResumeQuantization'), 'slot-binding');
assert.equal(getPresetContentOwner('synthSequencerChain'), 'arrangement-global');
assert.equal(getPresetContentOwner('harmonyChordSlotsA'), 'portable-content');
assert.equal(getPresetContentOwner('rootNote'), 'portable-content');
assert.equal(getPresetContentOwner('transportPrimaryClock'), 'arrangement-global');
assert.equal(getPresetContentOwner('sample1ReverbSend'), 'slot-binding');
assert.equal(getPresetContentOwner('granularV1Gain'), 'slot-binding');
assert.equal(getPresetContentOwner('granularV1Mode'), 'derived-runtime-cache');
assert.equal(getPresetContentOwner('granularV1Mode', 'named-leaf'), 'portable-content');
assert.equal(getPresetContentOwner('dynamicsEq1LowFreq'), 'portable-content');
assert.equal(getPresetMetadataOwner('presetPool'), 'user-preference');
assert.equal(getPresetMetadataOwner('refs'), 'identity-metadata');
assert.equal(getPresetMetadataOwner('drumPitchSettings'), 'portable-content');

const drumPitchSettings: PitchSettings[] = Array.from({ length: 6 }, (_, index) => ({
  mode: index % 2 === 0 ? 'notes' : 'semitones',
  root: 36 + index,
  scale: index % 2 === 0 ? 'Minor' : 'Major',
}));
const normalizedPitch = normalizeStatePresetPitchMetadata({ drumPitchSettings });
assert.equal(normalizedPitch.drumPitchSettings?.length, 6);
assert.deepStrictEqual(normalizedPitch.drumPitchSettings, drumPitchSettings);
assert.equal(normalizedPitch.synthPitchSettings?.length, 4);

const v2Metadata = preparePresetVersionMetadataForV2Storage({
  refs: { synth: { name: 'Sound', version: 'latest' } },
  presetPool: { version: 1, pools: { synth: ['a'] } },
  journeyPreview: { nodes: [], connections: [] },
}, true);
assert.equal(v2Metadata?.refs, undefined);
assert.equal(v2Metadata?.presetPool, undefined);
assert.ok(v2Metadata?.journeyPreview);

const behaviorMetadata = {
  sliderModes: {
    granularV1Blur: 'walk',
    granularV2Blur: 'walk',
    rootNote: 'single',
    delayAFeedback: 'sampleHold',
  },
  dualRanges: {
    granularV1Blur: { min: 0.8, max: 0.2 },
    granularV2Blur: { min: 0.2, max: 0.8 },
    delayAFeedback: { min: 0.1, max: 0.9 },
  },
} as const;
const behaviorInstances = buildParameterBehaviorInstances(behaviorMetadata as never);
assert.equal(behaviorInstances.length, 3, 'parameter behaviors should group by owning ParamRegistry scope');
assert.equal(behaviorInstances.some(instance => 'rootNote' in (instance.content.behaviors as object)), false);
const behaviorBatch = await preparePresetContentBatch(parameterBehaviorCandidates(behaviorInstances));
const behaviorRefs = behaviorInstances.map(instance => ({
  version_id: 'version',
  ref_slot: instance.refSlot,
  content_hash: behaviorBatch.byId.get(instance.id)!.hash,
  content_type: instance.contentType,
  created_at: '2026-07-12T00:00:00.000Z',
}));
const behaviorPayloads = new Map([...behaviorBatch.byId.values()].map(node => [node.hash, node.envelope]));
const hydratedBehaviors = hydrateParameterBehaviorRefs(undefined, behaviorRefs, behaviorPayloads);
assert.equal(hydratedBehaviors?.sliderModes?.granularV1Blur, 'walk');
assert.deepEqual(hydratedBehaviors?.dualRanges?.granularV1Blur, { min: 0.2, max: 0.8 });
assert.equal(stripParameterBehaviorsFromV2Metadata(behaviorMetadata as never), undefined);

const derivedWithPoolA = buildDerivedStatePresetData({
  ...DEFAULT_STATE,
  presetPool: { version: 1, pools: { pad: ['a'] } },
});
const derivedWithPoolB = buildDerivedStatePresetData({
  ...DEFAULT_STATE,
  presetPool: { version: 1, pools: { pad: ['b'], drumKick: ['x'] } },
});
assert.deepEqual(derivedWithPoolA, derivedWithPoolB, 'presetPool must not affect deterministic state hydration');

resetPresetLegacyContentReadCounters();
recordPresetLegacyContentRead({
  type: 'state',
  resolvedHash: 'a'.repeat(64),
  metadata: { synthClockDivs: ['1/8'] },
  refs: [{ version_id: 'v', ref_slot: 'euclideanPattern', target_preset_id: 'p', target_version_no: null, follow_latest: true, override_hash: null, created_at: '' }],
  contentRefs: [],
});
assert.deepEqual(getPresetLegacyContentReadCounters(), {
  flatSequencerMetadata: 1,
  combinedEuclideanChildren: 1,
  expandedStateSnapshots: 1,
});

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
const synthPageSource = fs.readFileSync('src/ui/synth/SynthPage.tsx', 'utf8');
assert.doesNotMatch(appSource, /normalizeSequencerPitchSettingsArray\([^\n]+,\s*4\)/);
assert.doesNotMatch(synthPageSource, /normalizeSequencerPitchBindingModes\([^\n]+,\s*4\)/);

console.log('preset content ownership regression passed');
