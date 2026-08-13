import assert from 'node:assert/strict';
import test from 'node:test';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import {
  KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT,
} from './generated/kesshoProductSchema';
import {
  CORE_PRODUCT_ROUTING_MUTE_MAX_SCENE_COMMANDS,
  CORE_PRODUCT_ROUTING_MUTE_ROW_BITS,
  CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX,
  CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG,
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE,
  CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE,
  createCoreProductRoutingMuteGroupEvents,
  routingMuteGroupSourceIdsFromMask,
} from './coreProductEvents';
import { SOUNDSCAPE_TEXTURE_PARAM_START, SOUNDSCAPE_TEXTURE_PARAM_STRIDE } from './coreProductSoundscapesSnapshot';
import { CORE_PRODUCT_SOUNDSCAPE_ASSETS } from './coreProductAssets';
import { DEFAULT_STATE } from '../ui/state';

function normalSlotEvents(events: readonly ReturnType<typeof createCoreProductRoutingMuteGroupEvents>[number][]) {
  return events.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot &&
    (event.flags ?? 0) !== CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG);
}

function sceneCommandEvents(events: readonly ReturnType<typeof createCoreProductRoutingMuteGroupEvents>[number][]) {
  return events.filter((event) => event.eventKind === KESSHO_PRODUCT_EVENT_IDS.SetRoutingMuteGroupSlot &&
    (event.flags ?? 0) === CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG);
}

function findCommand(
  commands: readonly ReturnType<typeof createCoreProductRoutingMuteGroupEvents>[number][],
  sceneIndex: number,
  nestedEventKind: number,
  nestedTargetId = 0,
  nestedParamId = 0,
) {
  return commands.find((event) => event.index === sceneIndex && event.value2 === nestedEventKind &&
    event.targetId === nestedTargetId && event.paramId === nestedParamId);
}

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
  const slot = normalSlotEvents(events)[0];
  assert.equal(slot?.targetId, (1 << 0) | (1 << 11) | (1 << 15));
  assert.equal(slot?.value, 1);
  assert.equal(slot?.value2, 5);
  assert.equal(slot?.value3, 192_000);
});

test('compiles and decodes every modular FX mute row', () => {
  const mutedSourceIds = [
    'delayAOut', 'delayBOut', 'granular', 'degrade', 'freezeOut',
    'reverb', 'eq1Out', 'eq2Out', 'sidechainOut', 'saturationOut',
  ] as const;
  const events = createCoreProductRoutingMuteGroupEvents({
    slots: [{ mutedSourceIds: [...mutedSourceIds] }, null, null, null, null, null, null, null],
  }, { sampleRate: 48_000, phraseSeconds: 8, seed: 17, state: DEFAULT_STATE });
  const mask = normalSlotEvents(events)[0]?.targetId ?? 0;
  const expectedMask = mutedSourceIds.reduce((result, id) => (
    result | CORE_PRODUCT_ROUTING_MUTE_ROW_BITS[id]
  ), 0);
  assert.equal(mask, expectedMask);
  assert.deepEqual(
    [...routingMuteGroupSourceIdsFromMask(mask)].sort(),
    [...mutedSourceIds].sort(),
  );
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
  const slots = normalSlotEvents(first);
  assert.deepEqual(slots.map((event) => (event.flags ?? 0) & 1), [0, 1, 0, 1, 0, 0, 0, 0]);
});

test('serializes baseline and slot engine state as bounded nested Product events', () => {
  const groups = {
    slots: [{
      mutedSourceIds: [],
      statePatch: {
        padEnabled: true,
        granularEnabled: true,
        granularDelayEnabled: true,
        driftEnabled: true,
        erosionEnabled: true,
        dynamicsSaturationEnabled: true,
        dynamicsBusEnabled: true,
        dynamicsEq1Enabled: true,
        dynamicsEq2Enabled: true,
        sidechainEnabled: true,
        spectralFreezeEnabled: true,
        spectralFreezeActive: true,
        reverbEnabled: false,
        waterEnabled: true,
        insectsMasterEnabled: true,
        insectsEnabled: true,
        insects2Enabled: true,
        natureMasterEnabled: true,
        nature1Enabled: true,
      },
    }, null, null, null, null, null, null, null],
    random: { enabled: false, defaultMinPhrases: 2, defaultMaxPhrases: 6, transitionPhrases: 1, avoidRepeat: true },
  };
  const state = {
    ...DEFAULT_STATE,
    padEnabled: false,
    reverbEnabled: true,
    reverbLevel: 0.42,
    soundscapeParityFixture: true,
  };
  const events = createCoreProductRoutingMuteGroupEvents(groups, {
    sampleRate: 48_000,
    phraseSeconds: 8,
    seed: 17,
    state,
  });
  const commands = sceneCommandEvents(events);
  const baseline = commands.filter((event) => event.index === CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX);
  const slot = commands.filter((event) => event.index === 0);
  assert.equal(baseline.length, slot.length);
  assert.ok(baseline.length <= CORE_PRODUCT_ROUTING_MUTE_MAX_SCENE_COMMANDS);
  assert.ok(baseline.length > 20, 'the scene should carry the supported engine families');
  assert.equal(commands.every((event) => (event.flags ?? 0) === CORE_PRODUCT_ROUTING_MUTE_SCENE_COMMAND_FLAG), true);

  const sourceEnabledKind = KESSHO_PRODUCT_EVENT_IDS.SetSourceEnabled;
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, sourceEnabledKind, CORE_PRODUCT_SOURCE_IDS.pad1)?.value, 0);
  assert.equal(findCommand(commands, 0, sourceEnabledKind, CORE_PRODUCT_SOURCE_IDS.pad1)?.value, 1);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxGranularEnabled)?.value, 0);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxGranularEnabled)?.value, 1);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnabled)?.value, 0);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDriftEnabled)?.value, 1);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeEnabled)?.value, 0);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive)?.value, 0);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeEnabled)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq1Enabled)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEq2Enabled)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSidechainEnabled)?.value, 1);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxReverbMix)?.value, 0.42);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxReverbMix)?.value, 0);

  const waterMasterTarget = CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT - 3;
  const waterActiveTarget = CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE;
  const natureMasterTarget = CORE_PRODUCT_SOUNDSCAPE_MODULE_PARAM_TARGET_BASE + KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT + 7;
  const nature1EnabledTarget = CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE + SOUNDSCAPE_TEXTURE_PARAM_START + 6;
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, waterMasterTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, waterActiveTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, natureMasterTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, nature1EnabledTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(events[0]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.BeginRoutingMuteGroups);
  assert.equal(events[events.length - 1]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.CommitRoutingMuteGroups);
  assert.equal(normalSlotEvents(events).length, 1);
  assert.equal(normalSlotEvents(events)[0]?.index, 0);
});

test('uses individual lane enabled bits while retaining solo mute masks', () => {
  const state = {
    ...DEFAULT_STATE,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid2Enabled: false,
    synthEuclid3Enabled: true,
    synthEuclid4Enabled: true,
    synthEuclid2Solo: true,
    drumEnabled: true,
    drumEuclidMasterEnabled: true,
    drumEuclid1Enabled: true,
    drumEuclid2Enabled: false,
    drumEuclid3Enabled: true,
    drumEuclid4Enabled: false,
    drumEuclid5Enabled: true,
    drumEuclid6Enabled: true,
  };
  const events = createCoreProductRoutingMuteGroupEvents({
    slots: [{ mutedSourceIds: [] }, null, null, null, null, null, null, null],
    random: { enabled: false, defaultMinPhrases: 2, defaultMaxPhrases: 6, transitionPhrases: 1, avoidRepeat: true },
  }, { sampleRate: 1_000, phraseSeconds: 4, seed: 9, state });
  const slot = normalSlotEvents(events)[0]!;
  assert.equal(slot.paramId, 0b1101 | (0b1111 << 16));
  assert.equal(slot.value4, 0b110101 | (0b001010 << 16));
  assert.equal((slot.flags ?? 0) >>> 8, 0b0001);
});

test('keeps canonical Waves audible when Earth scenes refresh during an active freeze', () => {
  const events = createCoreProductRoutingMuteGroupEvents({
    slots: [null, null, null, null, null, null, null, null],
    random: { enabled: false, defaultMinPhrases: 2, defaultMaxPhrases: 6, transitionPhrases: 1, avoidRepeat: true },
  }, {
    sampleRate: 48_000,
    phraseSeconds: 16,
    seed: 9,
    state: {
      ...DEFAULT_STATE,
      waterEnabled: true,
      natureMasterEnabled: true,
      nature1Enabled: true,
      nature1SampleId: 'ghetary-waves',
      nature1Level: 0.81,
      oceanSampleEnabled: false,
      oceanSampleLevel: 0,
      spectralFreezeEnabled: true,
      spectralFreezeActive: true,
    },
  });
  const commands = sceneCommandEvents(events);
  const oceanLevelTarget = CORE_PRODUCT_SOUNDSCAPE_ASSET_LEVEL_TARGET_BASE + CORE_PRODUCT_SOUNDSCAPE_ASSETS.ocean.assetId;

  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, oceanLevelTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(findCommand(commands, CORE_PRODUCT_ROUTING_MUTE_SCENE_BASELINE_INDEX, KESSHO_PRODUCT_EVENT_IDS.SetParam, 0, KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeActive)?.value, 1);
});

test('migrates legacy nature aliases while canonical patch keys win', () => {
  const groups = {
    slots: [
      { mutedSourceIds: [], statePatch: { birdsEnabled: true } },
      { mutedSourceIds: [], statePatch: { birdsEnabled: true, nature2Enabled: false } },
      null, null, null, null, null, null,
    ],
    random: { enabled: false, defaultMinPhrases: 2, defaultMaxPhrases: 6, transitionPhrases: 1, avoidRepeat: true },
  };
  const events = createCoreProductRoutingMuteGroupEvents(groups, {
    sampleRate: 1_000,
    phraseSeconds: 4,
    seed: 9,
    state: { ...DEFAULT_STATE, natureMasterEnabled: true },
  });
  const nature2EnabledTarget = CORE_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_TARGET_BASE +
    SOUNDSCAPE_TEXTURE_PARAM_START + SOUNDSCAPE_TEXTURE_PARAM_STRIDE + 6;
  const commands = sceneCommandEvents(events);
  assert.equal(findCommand(commands, 0, KESSHO_PRODUCT_EVENT_IDS.SetParam, nature2EnabledTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 1);
  assert.equal(findCommand(commands, 1, KESSHO_PRODUCT_EVENT_IDS.SetParam, nature2EnabledTarget, KESSHO_PRODUCT_PARAM_IDS.SourceLevel)?.value, 0);
});
