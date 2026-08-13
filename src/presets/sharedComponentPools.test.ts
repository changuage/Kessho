import assert from 'node:assert/strict';
import { DEFAULT_STATE } from '../ui/state';
import { preparePresetContentBatch } from './contentNodes';
import {
  buildDynamicsEqPoolInstance,
  buildGranularVoicePoolInstance,
  buildSampleVoicePoolInstance,
  buildPadVoicePoolInstance,
  buildSaturatorPoolInstance,
  extractSaturatorContent,
  hydrateSaturatorContent,
  hydrateSharedComponentRef,
  sharedComponentPoolCandidates,
  stripSharedComponentContentFromParent,
} from './sharedComponentPools';
import { PAD1_TO_PAD2_KEY, PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';

const state = { ...DEFAULT_STATE } as unknown as Record<string, unknown>;

export async function runSharedComponentPoolRegression(): Promise<void> {
  for (let lane = 2; lane <= 4; lane += 1) {
    for (const key of Object.keys(state).filter(key => key.startsWith('granularV1'))) {
      state[key.replace('granularV1', `granularV${lane}`)] = state[key];
    }
  }
  for (const key of Object.keys(state).filter(key => key.startsWith('dynamicsEq1'))) {
    state[key.replace('dynamicsEq1', 'dynamicsEq2')] = state[key];
  }

  const granular = Array.from({ length: 4 }, (_, index) => buildGranularVoicePoolInstance(state, index));
  const eq = Array.from({ length: 2 }, (_, index) => buildDynamicsEqPoolInstance(state, index));
  const batch = await preparePresetContentBatch(sharedComponentPoolCandidates([...granular, ...eq]));
  assert.equal(new Set(granular.map(item => batch.byId.get(item.id)?.hash)).size, 1);
  assert.equal(new Set(eq.map(item => batch.byId.get(item.id)?.hash)).size, 1);
  assert.equal(batch.uniqueByHash.size, 2);
  assert.equal(eq[0]?.content.inputGain, state.dynamicsEq1InputGain);
  assert.equal('dynamicsEq1InputGain' in (eq[0]?.content ?? {}), false);

  state.masterSaturationMode = state.dynamicsSaturationMode;
  state.masterSaturationQuality = state.dynamicsSaturationQuality;
  state.masterSaturationDrive = state.dynamicsSaturationDrive;
  state.masterSaturationTone = state.dynamicsSaturationTone;
  state.masterSaturationBias = state.dynamicsSaturationBias;
  const saturators = [
    buildSaturatorPoolInstance(state, 'dynamics'),
    buildSaturatorPoolInstance(state, 'master'),
    buildSaturatorPoolInstance(extractSaturatorContent(state, 'dynamics'), 'neutral'),
  ];
  const saturationBatch = await preparePresetContentBatch(sharedComponentPoolCandidates(saturators));
  assert.equal(new Set(saturators.map(item => saturationBatch.byId.get(item.id)?.hash)).size, 1);
  assert.equal('dynamicsSaturationDrive' in saturators[0]!.content, false);
  assert.equal('masterSaturationDrive' in saturators[1]!.content, false);
  assert.equal(saturators[0]!.content.drive, state.dynamicsSaturationDrive);
  const hydratedMasterSaturation = hydrateSaturatorContent(saturators[0]!.content, 'master');
  assert.equal(hydratedMasterSaturation.masterSaturationDrive, state.masterSaturationDrive);

  const masterParent = { ...state };
  const strippedMasterParent = stripSharedComponentContentFromParent(masterParent, 'source', 'masterFx');
  assert.equal(strippedMasterParent.masterSaturationEnabled, masterParent.masterSaturationEnabled);
  assert.equal('masterSaturationDrive' in strippedMasterParent, false);
  assert.deepStrictEqual(
    { ...strippedMasterParent, ...hydrateSharedComponentRef(
      saturators[1]!.refSlot,
      saturators[1]!.contentType,
      saturators[1]!.content,
    ) },
    masterParent,
  );

  state.granularV1Enabled = false;
  state.granularV1Gain = 0.1;
  const bindingChanged = await preparePresetContentBatch(sharedComponentPoolCandidates([
    buildGranularVoicePoolInstance(state, 0),
  ]));
  assert.equal(bindingChanged.byId.get('granular.0')?.hash, batch.byId.get('granular.0')?.hash);

  const hydrated = hydrateSharedComponentRef('granular.voice.4.content', 'granularVoice', granular[0]!.content);
  assert.equal(hydrated?.granularV4Mode, state.granularV1Mode);
  assert.equal('granularV4Enabled' in (hydrated ?? {}), false);

  for (const key of Object.keys(state).filter(key => key.startsWith('sample1'))) {
    state[key.replace('sample1', 'sample2')] = state[key];
  }
  const samples = [buildSampleVoicePoolInstance(state, 0), buildSampleVoicePoolInstance(state, 1)];
  const sampleBatch = await preparePresetContentBatch(sharedComponentPoolCandidates(samples));
  assert.equal(sampleBatch.byId.get('sample.0')?.hash, sampleBatch.byId.get('sample.1')?.hash);
  assert.equal('Enabled' in samples[0]!.content, false);
  assert.equal('ReverbSend' in samples[0]!.content, false);
  const sampleParentSnapshot = { ...state };
  const strippedSampleParentSnapshot = stripSharedComponentContentFromParent(
    sampleParentSnapshot,
    'source',
    'synth',
  );
  assert.equal('sample1Articulation' in strippedSampleParentSnapshot, false);
  assert.equal(strippedSampleParentSnapshot.sample1Enabled, sampleParentSnapshot.sample1Enabled);
  const rehydratedSampleParentSnapshot = samples.reduce<Record<string, unknown>>(
    (snapshot, instance) => ({
      ...snapshot,
      ...(hydrateSharedComponentRef(instance.refSlot, instance.contentType, instance.content) ?? {}),
    }),
    strippedSampleParentSnapshot,
  );
  assert.deepStrictEqual(
    rehydratedSampleParentSnapshot,
    sampleParentSnapshot,
    'a stripped source snapshot must exactly round-trip through its content refs',
  );

  for (const key of PAD_PRESET_PARAM_KEYS) {
    const pad2Key = PAD1_TO_PAD2_KEY[key];
    if (pad2Key) state[pad2Key] = state[key];
  }
  state.padOscAPitch = 0;
  const pads = [buildPadVoicePoolInstance(state, 0), buildPadVoicePoolInstance(state, 1)];
  const padBatch = await preparePresetContentBatch(sharedComponentPoolCandidates(pads));
  assert.equal(padBatch.byId.get('pad.0')?.hash, padBatch.byId.get('pad.1')?.hash);
  state.padOscAPitch = 0.25;
  const extendedPad = await preparePresetContentBatch(sharedComponentPoolCandidates([
    buildPadVoicePoolInstance(state, 0),
  ]));
  assert.notEqual(extendedPad.byId.get('pad.0')?.hash, padBatch.byId.get('pad.0')?.hash);
}

await runSharedComponentPoolRegression();
