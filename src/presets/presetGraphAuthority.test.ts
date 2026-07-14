import assert from 'node:assert/strict';
import { DEFAULT_STATE } from '../ui/state';
import { preparePresetContentBatch } from './contentNodes';
import {
  applySequencerContentComponents,
  buildSequencerContentGroup,
  sequencerContentCandidates,
  type SequencerContentComponent,
} from './sequencerContent';
import {
  buildDrumDerivedEndpointInstances,
  buildGranularAndWaterDerivedEndpointInstances,
  buildPadDerivedEndpointInstances,
  derivedEndpointCandidates,
  hydrateDrumDerivedEndpointRefs,
  hydrateGranularAndWaterDerivedEndpointRefs,
  hydratePadDerivedEndpointRefs,
} from './derivedEndpointContent';
import { buildDerivedStatePresetData } from './statePresetOptimization';

export async function runPresetGraphAuthorityRegression(): Promise<void> {
  const source = {
    ...DEFAULT_STATE,
    synthEuclid1Steps: 11,
    synthEuclid1Hits: 7,
    synthEuclid1Rotation: 3,
    synthEuclid1Source: 'pad2',
    synthEuclid1VoiceMask: 37,
    synthEuclid1Level: 0.42,
    synthEuclid1Enabled: true,
  } as unknown as Record<string, unknown>;
  const metadata = {
    synthClockDivs: ['1/16'],
    synthSwings: [0.17],
    synthLinked: [true],
    synthStepOverrides: { probability: [[1, 0.4, 0.8]] },
  } as never;
  const group = buildSequencerContentGroup({ state: source, metadata, kind: 'synth', laneIndex: 0 });
  const batch = await preparePresetContentBatch(sequencerContentCandidates(group));
  assert.equal(batch.byId.size, group.components.length);

  const bindingOnly: Record<string, unknown> = {
    synthEuclid1Source: source.synthEuclid1Source,
    synthEuclid1VoiceMask: source.synthEuclid1VoiceMask,
    synthEuclid1Level: source.synthEuclid1Level,
    synthEuclid1Enabled: source.synthEuclid1Enabled,
  };
  const components = group.components.map((component): SequencerContentComponent => {
    const node = batch.byId.get(`synth.0.${component.componentSlot}`);
    assert.ok(node);
    return { componentSlot: component.componentSlot, contentType: node.envelope.contentType, content: node.envelope.content };
  });
  const hydrated = applySequencerContentComponents({
    state: bindingOnly,
    kind: 'synth',
    laneIndex: 0,
    components,
  });
  const restored = { ...bindingOnly, ...hydrated.statePatch };
  assert.equal(restored.synthEuclid1Steps, 11);
  assert.equal(restored.synthEuclid1Hits, 7);
  assert.equal(restored.synthEuclid1Rotation, 3);
  assert.equal(restored.synthEuclid1Source, 'pad2');
  assert.equal(restored.synthEuclid1VoiceMask, 37);
  assert.equal(restored.synthEuclid1Level, 0.42);
  assert.equal(hydrated.metadata.synthClockDivs?.[0], '1/16');
  assert.deepEqual(hydrated.metadata.synthStepOverrides?.probability?.[0], [1, 0.4, 0.8]);

  const withoutTrigger = components.filter(component => component.componentSlot !== 'trigger');
  const partial = applySequencerContentComponents({ state: bindingOnly, kind: 'synth', laneIndex: 0, components: withoutTrigger });
  assert.equal(partial.statePatch.synthEuclid1Steps, undefined);
  assert.equal(bindingOnly.synthEuclid1Source, 'pad2');

  const endpointInstances = [
    ...buildPadDerivedEndpointInstances(source),
    ...buildDrumDerivedEndpointInstances(source),
    ...buildGranularAndWaterDerivedEndpointInstances(source),
  ];
  const endpointBatch = await preparePresetContentBatch(derivedEndpointCandidates(endpointInstances));
  const endpointRefs = endpointInstances.map(instance => ({
    version_id: 'version',
    ref_slot: instance.refSlot,
    content_hash: endpointBatch.byId.get(instance.id)!.hash,
    content_type: instance.contentType,
    created_at: '',
  }));
  const endpointPayloads = new Map([...endpointBatch.byId.values()].map(node => [node.hash, node.envelope]));
  const unresolvedNames: Record<string, unknown> = {
    ...source,
    padPresetA: '__missing__',
    padPresetB: '__missing__',
    drumKickPresetA: '__missing__',
    drumKickPresetB: '__missing__',
    granularPreset: '__missing__',
  };
  for (const key of Object.keys(buildDerivedStatePresetData(source))) delete unresolvedNames[key];
  let pinned = hydratePadDerivedEndpointRefs(unresolvedNames, endpointRefs, endpointPayloads);
  pinned = hydrateDrumDerivedEndpointRefs(pinned, endpointRefs, endpointPayloads);
  pinned = hydrateGranularAndWaterDerivedEndpointRefs(pinned, endpointRefs, endpointPayloads);
  const expectedDerived = buildDerivedStatePresetData(source);
  for (const key of ['padOscAWave', 'drumKickFreq', 'waterIntensity']) {
    assert.deepEqual(pinned[key], expectedDerived[key], `pinned endpoints should restore ${key} without selector lookup`);
  }
  const granularEndpoint = endpointInstances.find(instance => instance.contentType === 'granularSelection');
  if (granularEndpoint?.content.granularV1Mode !== undefined) {
    assert.deepEqual(pinned.granularV1Mode, granularEndpoint.content.granularV1Mode);
  }
}

await runPresetGraphAuthorityRegression();
