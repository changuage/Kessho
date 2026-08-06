import assert from 'node:assert/strict';

import { DEFAULT_STATE, type SliderState } from '../state';
import {
  captureRoutingMuteGroupSlot,
  collectSequencerMuteBooleanKeys,
  createEmptyRoutingMuteGroupsState,
  createRoutingMuteGroupTransitionController,
  normalizeRoutingMuteGroupRandomSettings,
  normalizeRoutingMuteGroupSceneRefSlot,
  normalizeRoutingMuteGroupSlot,
  normalizeRoutingMuteGroupsState,
  normalizeRoutingMuteGroupsStorageState,
  ROUTING_MUTE_GROUP_SCENE_SCHEMA_VERSION,
  ROUTING_MUTE_GROUP_SCHEMA_VERSION,
  routingMuteGroupSlotColor,
  routingMuteGroupSlotFromScenePayload,
  routingMuteGroupSlotScenePayload,
  ROUTING_MUTE_GROUP_SOURCE_IDS,
  routingMuteGroupSlotMuteCount,
  routingMuteGroupSlotPhraseRange,
  setRoutingMuteGroupRandomSettings,
  setRoutingMuteGroupSlot,
  setRoutingMuteGroupSlotPhraseRange,
  type RoutingMuteGroupRuntimeLevelPatch,
  type RoutingMuteGroupScheduler,
} from './routingMuteGroups';
import {
  ROUTING_MATRIX_ROW_IDS,
  ROUTING_SOURCE_IDS,
  routingSourceIsEnabled,
} from './routingSourceRegistry';

type LogEntry =
  | { type: 'runtime-patch'; patch: RoutingMuteGroupRuntimeLevelPatch }
  | { type: 'runtime-level'; key: keyof SliderState; value: number | null }
  | { type: 'boolean'; key: keyof SliderState; value: boolean }
  | { type: 'active'; value: number | null };

type ExpandedLogEntry = Exclude<LogEntry, { type: 'runtime-patch' }>;

type ScheduledTask = {
  id: number;
  due: number;
  callback: () => void;
};

class FakeScheduler implements RoutingMuteGroupScheduler {
  private now = 0;
  private nextId = 1;
  private tasks: ScheduledTask[] = [];

  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const task = {
      id: this.nextId,
      due: this.now + delayMs,
      callback,
    };
    this.nextId += 1;
    this.tasks.push(task);
    return task.id as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    const id = handle as unknown as number;
    this.tasks = this.tasks.filter((task) => task.id !== id);
  }

  advanceBy(ms: number): void {
    const target = this.now + ms;
    while (true) {
      const ready = this.tasks
        .filter((task) => task.due <= target)
        .sort((left, right) => left.due - right.due || left.id - right.id)[0];
      if (!ready) break;
      this.tasks = this.tasks.filter((task) => task.id !== ready.id);
      this.now = ready.due;
      ready.callback();
    }
    this.now = target;
  }
}

function makeState(patch: Partial<SliderState> = {}): SliderState {
  return {
    ...DEFAULT_STATE,
    ...patch,
  };
}

function makeHarness(initialState: SliderState) {
  let state = initialState;
  const scheduler = new FakeScheduler();
  const log: LogEntry[] = [];
  const controller = createRoutingMuteGroupTransitionController({
    getState: () => state,
    fadeDownMs: 10,
    fadeUpMs: 10,
    enableSettleMs: 2,
    scheduler,
    onRuntimeLevelPatchChange: (patch) => {
      log.push({ type: 'runtime-patch', patch });
      for (const [rawKey, value] of Object.entries(patch)) {
        log.push({ type: 'runtime-level', key: rawKey as keyof SliderState, value: value ?? null });
      }
    },
    onBooleanParamChange: (key, value) => {
      log.push({ type: 'boolean', key, value });
      state = { ...state, [key]: value };
    },
    onActiveSlotChange: (value) => {
      log.push({ type: 'active', value });
    },
  });

  return {
    controller,
    scheduler,
    log,
    getState: () => state,
  };
}

function expandedLog(log: LogEntry[]): ExpandedLogEntry[] {
  return log.filter((entry): entry is ExpandedLogEntry => entry.type !== 'runtime-patch');
}

function testNormalizeFiltersIneligibleSources(): void {
  const normalized = normalizeRoutingMuteGroupsState({
    slots: [
      { mutedSourceIds: ['pad1', 'delayAOut', 'pad1', 'reverb', 'drums', 'missing'] },
      { mutedSourceIds: ['nature', 'degrade', 'water'] },
    ],
  });

  assert.equal(normalized.schemaVersion, ROUTING_MUTE_GROUP_SCHEMA_VERSION);
  assert.equal(normalized.slots.length, 8);
  assert.deepStrictEqual(normalized.slots[0], { mutedSourceIds: ['pad1', 'drums', 'delayAOut', 'reverb'] });
  assert.deepStrictEqual(normalized.slots[1], { mutedSourceIds: ['water', 'nature', 'degrade'] });
  assert.equal(normalized.slots[2], null);
}

function testRandomSettingsAndSlotMetadataNormalization(): void {
  const normalized = normalizeRoutingMuteGroupsState({
    slots: [
      {
        mutedSourceIds: ['pad1'],
        phraseRange: { min: 9, max: 2 },
        color: '#a870e8',
      },
    ],
    random: {
      enabled: true,
      defaultMinPhrases: 0.1,
      defaultMaxPhrases: 125,
      transitionPhrases: 1.33,
      avoidRepeat: false,
      eligibleSlotIndexes: [7, 7, -2, 99, 2],
    },
  });

  assert.equal(normalized.schemaVersion, ROUTING_MUTE_GROUP_SCHEMA_VERSION);
  assert.deepStrictEqual(normalized.slots[0], {
    mutedSourceIds: ['pad1'],
    phraseRange: { min: 2, max: 9 },
  });
  assert.deepStrictEqual(normalized.random, {
    enabled: true,
    defaultMinPhrases: 0.25,
    defaultMaxPhrases: 100,
    transitionPhrases: 1.25,
    avoidRepeat: false,
    eligibleSlotIndexes: [0, 2, 7],
  });
  assert.equal(routingMuteGroupSlotColor(0, normalized.slots[0]), '#E07A84');
  assert.deepStrictEqual(
    routingMuteGroupSlotPhraseRange(normalized.slots[0], normalized.random ?? normalizeRoutingMuteGroupRandomSettings(undefined)),
    { min: 2, max: 9 },
  );

  const ranged = setRoutingMuteGroupSlotPhraseRange(normalized, 0, { min: 3, max: 1 });
  assert.deepStrictEqual(ranged.slots[0]?.phraseRange, { min: 1, max: 3 });

  const randomUpdated = setRoutingMuteGroupRandomSettings(ranged, {
    defaultMinPhrases: 4,
    defaultMaxPhrases: 2,
    transitionPhrases: 0,
  });
  assert.deepStrictEqual(randomUpdated.random, {
    enabled: true,
    defaultMinPhrases: 2,
    defaultMaxPhrases: 4,
    transitionPhrases: 0.25,
    avoidRepeat: false,
    eligibleSlotIndexes: [0, 2, 7],
  });
}

function testSourceEligibilityMatchesRoutingRegistry(): void {
  assert.deepStrictEqual(
    ROUTING_MATRIX_ROW_IDS,
    ROUTING_SOURCE_IDS.filter((sourceId) => sourceId !== 'waves'),
  );
  assert.deepStrictEqual(
    ROUTING_MUTE_GROUP_SOURCE_IDS,
    ROUTING_SOURCE_IDS.filter((sourceId) => sourceId !== 'waves'),
  );
  assert.ok(ROUTING_MUTE_GROUP_SOURCE_IDS.includes('delayAOut'));
  assert.ok(ROUTING_MUTE_GROUP_SOURCE_IDS.includes('delayBOut'));
  assert.ok(ROUTING_MUTE_GROUP_SOURCE_IDS.includes('degrade'));
  assert.ok(ROUTING_MUTE_GROUP_SOURCE_IDS.includes('reverb'));

  const normalized = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: ['delayAOut', 'delayBOut', 'degrade', 'reverb', 'unknown'],
    savedAt: '2026-06-27T00:00:00.000Z',
    revision: 4,
  });

  assert.deepStrictEqual(normalized, {
    mutedSourceIds: ['delayAOut', 'delayBOut', 'degrade', 'reverb'],
  });
}

function testEarthFamilyRoutingPredicates(): void {
  assert.equal(routingSourceIsEnabled('insects', makeState({ insectsMasterEnabled: true })), false);
  assert.equal(routingSourceIsEnabled('insects', makeState({ insectsEnabled: true })), false);
  assert.equal(routingSourceIsEnabled('insects', makeState({ insectsMasterEnabled: true, insectsEnabled: true })), true);
  assert.equal(routingSourceIsEnabled('insects', makeState({ insectsMasterEnabled: true, insects2Enabled: true })), true);

  assert.equal(routingSourceIsEnabled('nature', makeState({ natureMasterEnabled: true })), false);
  assert.equal(routingSourceIsEnabled('nature', makeState({ nature1Enabled: true })), false);
  assert.equal(routingSourceIsEnabled('nature', makeState({ natureMasterEnabled: true, nature1Enabled: true })), true);
  assert.equal(routingSourceIsEnabled('nature', makeState({ natureMasterEnabled: true, nature4Enabled: true })), true);
  assert.equal(routingSourceIsEnabled('nature', makeState({
    natureMasterEnabled: true,
    birdsEnabled: true,
    birds2Enabled: true,
    frogsEnabled: true,
  })), false);
}

function testNormalizeFiltersSceneKeysAndDropsLevels(): void {
  const normalized = normalizeRoutingMuteGroupsState({
    slots: [
      {
        mutedSourceIds: [],
        statePatch: {
          drumEuclid1Enabled: false,
          synthEuclid2Solo: true,
          drumEuclid1Preset: true,
          waterEnabled: false,
          waterPreset: true,
          waterLayerSurf: 2,
          natureLevel: -1,
          waterReverbSend: 0.9,
        },
      },
    ],
  });

  assert.deepStrictEqual(normalized.slots[0], {
    mutedSourceIds: [],
    statePatch: {
      drumEuclid1Enabled: false,
      synthEuclid2Solo: true,
      waterEnabled: false,
    },
  });
}

function testCaptureUsesRegistryAudibilityAndEligibility(): void {
  const state = makeState({
    padEnabled: false,
    synthLevel: 0.8,
    drumEnabled: true,
    drumLevel: 0,
    delayAEnabled: false,
    delayAMix: 0,
    granularDelayEnabled: false,
    granularDelayMix: 0.5,
    degradeEnabled: false,
    driftEnabled: false,
    erosionEnabled: false,
    dynamicsSaturationEnabled: false,
    degradeLevel: 0.5,
    reverbEnabled: false,
    reverbLevel: 0,
  });

  const slot = captureRoutingMuteGroupSlot(state);

  assert.ok(slot.mutedSourceIds.includes('pad1'));
  assert.ok(slot.mutedSourceIds.includes('drums'));
  assert.ok(slot.mutedSourceIds.includes('delayAOut'));
  assert.ok(slot.mutedSourceIds.includes('delayBOut'));
  assert.ok(slot.mutedSourceIds.includes('degrade'));
  assert.ok(slot.mutedSourceIds.includes('reverb'));
  assert.equal(Object.prototype.hasOwnProperty.call(slot, 'revision'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(slot, 'savedAt'), false);
}

function testCaptureIncludesPerformanceMuteSceneWithoutSends(): void {
  const slot = captureRoutingMuteGroupSlot(makeState({
    granularEnabled: true,
    granularLevel: 0.64,
    drumEuclid1Enabled: true,
    drumEuclid1Solo: true,
    drumEuclid2Enabled: false,
    synthEuclid3Enabled: false,
    synthEuclid2Solo: true,
    granularV2Enabled: false,
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.52,
    waterEnabled: true,
    waterLayerSurf: 0,
    natureLevel: 0.42,
    waterReverbSend: 0.77,
  }));

  assert.equal(slot.statePatch?.granularEnabled, true);
  assert.equal(slot.statePatch?.drumEuclid1Enabled, true);
  assert.equal(slot.statePatch?.drumEuclid1Solo, true);
  assert.equal(slot.statePatch?.drumEuclid2Enabled, false);
  assert.equal(slot.statePatch?.synthEuclid3Enabled, false);
  assert.equal(slot.statePatch?.synthEuclid2Solo, true);
  assert.equal(slot.statePatch?.granularV2Enabled, false);
  assert.equal(slot.statePatch?.oceanSampleEnabled, true);
  assert.equal(slot.statePatch?.waterEnabled, true);
  assert.equal('granularLevel' in (slot.statePatch ?? {}), false);
  assert.equal('oceanSampleLevel' in (slot.statePatch ?? {}), false);
  assert.equal('waterLayerSurf' in (slot.statePatch ?? {}), false);
  assert.equal('natureLevel' in (slot.statePatch ?? {}), false);
  assert.equal('waterReverbSend' in (slot.statePatch ?? {}), false);
}

function testCollectSequencerMuteBooleanKeysFromStateShape(): void {
  const keys = collectSequencerMuteBooleanKeys(makeState({
    drumEuclid1Enabled: true,
    drumEuclid1Solo: true,
    synthEuclid4Enabled: false,
    synthEuclid4Solo: true,
    granularV3Enabled: false,
  }));

  assert.ok(keys.includes('drumEuclid1Enabled'));
  assert.ok(keys.includes('drumEuclid1Solo'));
  assert.ok(keys.includes('synthEuclid4Enabled'));
  assert.ok(keys.includes('synthEuclid4Solo'));
  assert.ok(keys.includes('granularV3Enabled'));
  assert.equal(keys.includes('drumEuclid1Preset' as keyof SliderState), false);
}

function testClearSlot(): void {
  const initial = createEmptyRoutingMuteGroupsState();
  const saved = setRoutingMuteGroupSlot(initial, 3, { mutedSourceIds: ['pad2'] });
  const cleared = setRoutingMuteGroupSlot(saved, 3, null);

  assert.deepStrictEqual(saved.slots[3], { mutedSourceIds: ['pad2'] });
  assert.equal(cleared.slots[3], null);
}

function testSlotScenePayloadAndStoredEmptyScenes(): void {
  const storedEmpty = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: [],
    statePatch: { drumEuclid1Enabled: true },
    savedAt: '2026-06-27T00:00:00.000Z',
    revision: 0,
  });

  assert.deepStrictEqual(storedEmpty, {
    mutedSourceIds: [],
    statePatch: { drumEuclid1Enabled: true },
  });
  assert.equal(routingMuteGroupSlotMuteCount(storedEmpty), 0);

  const scene = routingMuteGroupSlotScenePayload({
    mutedSourceIds: ['delayBOut', 'pad1'],
    statePatch: { waterEnabled: false },
    phraseRange: { min: 2, max: 4 },
  });
  assert.deepStrictEqual(scene, {
    schemaVersion: ROUTING_MUTE_GROUP_SCENE_SCHEMA_VERSION,
    mutedSourceIds: ['pad1', 'delayBOut'],
    statePatch: { waterEnabled: false },
  });
  assert.deepStrictEqual(
    routingMuteGroupSlotFromScenePayload(scene, { phraseRange: { min: 4, max: 2 } }),
    {
      mutedSourceIds: ['pad1', 'delayBOut'],
      statePatch: { waterEnabled: false },
      phraseRange: { min: 2, max: 4 },
    },
  );

  assert.deepStrictEqual(
    normalizeRoutingMuteGroupSceneRefSlot({ sceneHash: ' scene-a ', phraseRange: { min: 7, max: 3 } }),
    { sceneHash: 'scene-a', phraseRange: { min: 3, max: 7 } },
  );
  assert.deepStrictEqual(
    normalizeRoutingMuteGroupsStorageState({
      slots: [{ sceneHash: 'scene-a' }],
      random: { enabled: true, defaultMinPhrases: 1, defaultMaxPhrases: 3 },
    }),
    {
      schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION,
      slots: [
        { sceneHash: 'scene-a' },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      random: {
        enabled: true,
        defaultMinPhrases: 1,
        defaultMaxPhrases: 3,
        transitionPhrases: 1,
        avoidRepeat: true,
      },
    },
  );
}

function testTransitionOrderAndSendPreservation(): void {
  const harness = makeHarness(makeState({
    padEnabled: true,
    synthLevel: 0.7,
    pad1DelayASend: 0.44,
  }));

  harness.controller.recall({ mutedSourceIds: ['pad1'] }, 0);
  harness.scheduler.advanceBy(10);

  const levelIndex = harness.log.findIndex((entry) => entry.type === 'runtime-level' && entry.key === 'synthLevel' && entry.value === 0);
  const disableIndex = harness.log.findIndex((entry) => entry.type === 'boolean' && entry.key === 'padEnabled' && entry.value === false);
  assert.ok(levelIndex >= 0, 'fade-down should set runtime level to zero');
  assert.ok(disableIndex > levelIndex, 'disable should happen after runtime fade-down reaches zero');
  assert.equal(harness.getState().padEnabled, false);
  assert.equal(harness.getState().synthLevel, 0.7);
  assert.equal(harness.getState().pad1DelayASend, 0.44);

  const releaseStart = expandedLog(harness.log).length;
  harness.controller.release();
  const releaseExpandedLog = expandedLog(harness.log);
  assert.deepStrictEqual(releaseExpandedLog.slice(releaseStart, releaseStart + 2), [
    { type: 'runtime-level', key: 'synthLevel', value: 0 },
    { type: 'boolean', key: 'padEnabled', value: true },
  ]);
  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().synthLevel, 0.7);
  assert.equal(harness.getState().padEnabled, true);
  assert.equal(harness.getState().pad1DelayASend, 0.44);
  assert.deepStrictEqual(expandedLog(harness.log).slice(-1), [
    { type: 'runtime-level', key: 'synthLevel', value: null },
  ]);
}

function testRuntimeRampUpdatesAreBatchedByStep(): void {
  const harness = makeHarness(makeState({
    padEnabled: true,
    synthLevel: 0.8,
    drumEnabled: true,
    drumLevel: 0.9,
  }));

  harness.controller.recall({ mutedSourceIds: ['pad1', 'drums'] }, 0);
  harness.scheduler.advanceBy(10);

  const runtimePatches = harness.log.filter((entry) => entry.type === 'runtime-patch');
  assert.equal(runtimePatches.length, 1);
  assert.deepStrictEqual(runtimePatches[0], {
    type: 'runtime-patch',
    patch: {
      synthLevel: 0,
      drumLevel: 0,
    },
  });
  assert.equal(harness.getState().synthLevel, 0.8);
  assert.equal(harness.getState().drumLevel, 0.9);
}

function testFxReturnTransitionOrder(): void {
  const harness = makeHarness(makeState({
    delayAEnabled: true,
    delayAMix: 0.66,
    delayAToBSend: 0.4,
    granularDelayEnabled: true,
    granularDelayMix: 0.58,
    delayBToASend: 0.25,
  }));

  harness.controller.recall({ mutedSourceIds: ['delayAOut'] }, 0);
  assert.deepStrictEqual(harness.controller.getEffectiveMutedSourceIds(), ['delayAOut']);
  harness.scheduler.advanceBy(10);

  const levelIndex = harness.log.findIndex((entry) => entry.type === 'runtime-level' && entry.key === 'delayAMix' && entry.value === 0);
  const disableIndex = harness.log.findIndex((entry) => entry.type === 'boolean' && entry.key === 'delayAEnabled' && entry.value === false);
  assert.ok(levelIndex >= 0, 'Delay A fade-down should reach zero');
  assert.ok(disableIndex > levelIndex, 'Delay A disable should happen after fade-down');
  assert.equal(harness.getState().delayAMix, 0.66);
  assert.equal(harness.getState().delayAToBSend, 0.4);

  const releaseStart = expandedLog(harness.log).length;
  harness.controller.release();
  assert.deepStrictEqual(harness.controller.getEffectiveMutedSourceIds(), []);
  const releaseExpandedLog = expandedLog(harness.log);
  assert.deepStrictEqual(releaseExpandedLog.slice(releaseStart, releaseStart + 2), [
    { type: 'runtime-level', key: 'delayAMix', value: 0 },
    { type: 'boolean', key: 'delayAEnabled', value: true },
  ]);
  harness.scheduler.advanceBy(13);
  assert.deepStrictEqual(expandedLog(harness.log).slice(-1), [
    { type: 'runtime-level', key: 'delayAMix', value: null },
  ]);
  assert.equal(harness.getState().delayAMix, 0.66);
  assert.equal(harness.getState().delayAToBSend, 0.4);

  harness.controller.recall({ mutedSourceIds: ['delayBOut'] }, 1);
  assert.deepStrictEqual(harness.controller.getEffectiveMutedSourceIds(), ['delayBOut']);
  harness.scheduler.advanceBy(10);

  const delayBLevelIndex = harness.log.findIndex((entry) => entry.type === 'runtime-level' && entry.key === 'granularDelayMix' && entry.value === 0);
  const delayBDisableIndex = harness.log.findIndex((entry) => entry.type === 'boolean' && entry.key === 'granularDelayEnabled' && entry.value === false);
  assert.ok(delayBLevelIndex >= 0, 'Delay B fade-down should reach zero');
  assert.ok(delayBDisableIndex > delayBLevelIndex, 'Delay B disable should happen after fade-down');
  assert.equal(harness.getState().granularDelayMix, 0.58);
  assert.equal(harness.getState().delayBToASend, 0.25);
}

function testFxReturnSavedBooleanStateRecall(): void {
  const harness = makeHarness(makeState({
    delayAEnabled: true,
    delayAMix: 0.7,
    granularDelayEnabled: true,
    granularDelayMix: 0.8,
  }));

  const offSlot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: [],
    statePatch: {
      delayAEnabled: false,
      granularDelayEnabled: false,
    },
  });
  assert.ok(offSlot);
  harness.controller.recall(offSlot, 0);
  assert.equal(harness.getState().delayAEnabled, false);
  assert.equal(harness.getState().granularDelayEnabled, false);

  const onSlot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: [],
    statePatch: {
      delayAEnabled: true,
      granularDelayEnabled: true,
    },
  });
  assert.ok(onSlot);
  harness.controller.recall(onSlot, 1);
  assert.equal(harness.getState().delayAEnabled, true);
  assert.equal(harness.getState().granularDelayEnabled, true);
}

function testImmediateSlotSwitchKeepsEarthLifecycleIndependent(): void {
  const harness = makeHarness(makeState({
    delayAEnabled: false,
    delayAMix: 0.7,
    granularDelayEnabled: false,
    granularDelayMix: 0.8,
    padEnabled: false,
    synthLevel: 0.64,
    waterEnabled: false,
    waterLevel: 0.52,
  }));

  const onSlot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: [],
    statePatch: {
      delayAEnabled: true,
      granularDelayEnabled: true,
      padEnabled: true,
      waterEnabled: true,
    },
  });
  assert.ok(onSlot);
  harness.controller.recall(onSlot, 0, { transitionMs: 0 });
  assert.equal(harness.getState().delayAEnabled, true);
  assert.equal(harness.getState().granularDelayEnabled, true);
  assert.equal(harness.getState().padEnabled, true);
  assert.equal(harness.getState().waterEnabled, true);

  const offSlot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: ['delayAOut', 'delayBOut', 'pad1', 'water'],
    statePatch: {
      delayAEnabled: false,
      granularDelayEnabled: false,
      padEnabled: false,
      waterEnabled: false,
    },
  });
  assert.ok(offSlot);
  harness.controller.recall(offSlot, 1, { transitionMs: 0 });
  harness.scheduler.advanceBy(0);

  assert.equal(harness.getState().delayAEnabled, false);
  assert.equal(harness.getState().granularDelayEnabled, false);
  assert.equal(harness.getState().padEnabled, false);
  assert.equal(harness.getState().waterEnabled, true);
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'delayAMix' && entry.value === 0));
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'granularDelayMix' && entry.value === 0));
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'synthLevel' && entry.value === 0));
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'waterLevel' && entry.value === 0));
}

function testCaptureUsesEffectiveMutedSourcesDuringFade(): void {
  const harness = makeHarness(makeState({
    delayAEnabled: true,
    delayAMix: 0.72,
  }));

  harness.controller.recall({ mutedSourceIds: ['delayAOut'] }, 0);
  const slot = captureRoutingMuteGroupSlot(harness.getState(), {
    effectiveMutedSourceIds: harness.controller.getEffectiveMutedSourceIds(),
  });

  assert.ok(slot.mutedSourceIds.includes('delayAOut'));
  assert.equal(harness.getState().delayAEnabled, true);
  assert.equal(harness.getState().delayAMix, 0.72);
}

function testMultiEnabledKeyRowsRestoreSnapshots(): void {
  const harness = makeHarness(makeState({
    natureLevel: 0.6,
    natureMasterEnabled: true,
    birdsEnabled: true,
    birds2Enabled: false,
    frogsEnabled: true,
  }));

  harness.controller.recall({ mutedSourceIds: ['nature'] }, 1);
  harness.scheduler.advanceBy(10);
  assert.equal(harness.getState().natureMasterEnabled, true);
  assert.equal(harness.getState().birdsEnabled, true);
  assert.equal(harness.getState().birds2Enabled, false);
  assert.equal(harness.getState().frogsEnabled, true);
  assert.equal(harness.getState().natureLevel, 0.6);

  harness.controller.release();
  assert.equal(harness.getState().natureMasterEnabled, true);
  assert.equal(harness.getState().birdsEnabled, true);
  assert.equal(harness.getState().birds2Enabled, false);
  assert.equal(harness.getState().frogsEnabled, true);
  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().natureLevel, 0.6);
}

function testPerformanceMuteSceneRecallAndRelease(): void {
  const harness = makeHarness(makeState({
    drumEuclid1Enabled: true,
    drumEuclid1Solo: false,
    drumEuclid2Enabled: true,
    drumEuclid2Solo: false,
    synthEuclid1Enabled: true,
    granularV2Enabled: true,
    waterEnabled: true,
    waterLayerSurf: 0.4,
    natureLevel: 0.8,
    waterReverbSend: 0.77,
  }));

  const normalizedSlot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: [],
    statePatch: {
      drumEuclid1Enabled: false,
      drumEuclid1Solo: true,
      drumEuclid2Enabled: false,
      synthEuclid1Enabled: false,
      granularV2Enabled: false,
      waterEnabled: false,
      waterLayerSurf: 0,
      natureLevel: 0.25,
    },
  });
  assert.ok(normalizedSlot);
  harness.controller.recall(normalizedSlot, 2);

  assert.equal(harness.getState().drumEuclid1Enabled, false);
  assert.equal(harness.getState().drumEuclid1Solo, true);
  assert.equal(harness.getState().drumEuclid2Enabled, false);
  assert.equal(harness.getState().synthEuclid1Enabled, false);
  assert.equal(harness.getState().granularV2Enabled, false);
  assert.equal(harness.getState().waterEnabled, false);
  assert.equal(harness.getState().waterLayerSurf, 0.4);
  assert.equal(harness.getState().natureLevel, 0.8);
  assert.equal(harness.getState().waterReverbSend, 0.77);

  harness.scheduler.advanceBy(10);
  assert.equal(harness.getState().waterLayerSurf, 0.4);
  assert.equal(harness.getState().natureLevel, 0.8);

  harness.controller.release();
  assert.equal(harness.getState().drumEuclid1Enabled, true);
  assert.equal(harness.getState().drumEuclid1Solo, false);
  assert.equal(harness.getState().drumEuclid2Enabled, true);
  assert.equal(harness.getState().synthEuclid1Enabled, true);
  assert.equal(harness.getState().granularV2Enabled, true);
  assert.equal(harness.getState().waterEnabled, true);
  assert.equal(harness.getState().waterLayerSurf, 0.4);
  harness.scheduler.advanceBy(10);
  assert.equal(harness.getState().natureLevel, 0.8);
  assert.equal(harness.getState().waterReverbSend, 0.77);
}

function testRecallRestoresPresetLoadedSourceState(): void {
  const onSlot = captureRoutingMuteGroupSlot(makeState({
    granularEnabled: true,
    granularLevel: 0.7,
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.6,
  }));
  const harness = makeHarness(makeState({
    granularEnabled: false,
    granularLevel: 0.7,
    oceanSampleEnabled: false,
    oceanSampleLevel: 0.6,
  }));

  harness.controller.recall(onSlot, 0);

  assert.equal(harness.getState().granularEnabled, true);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, true);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);
  const granularZeroIndex = harness.log.findIndex((entry) => entry.type === 'runtime-level' && entry.key === 'granularLevel' && entry.value === 0);
  const granularEnableIndex = harness.log.findIndex((entry) => entry.type === 'boolean' && entry.key === 'granularEnabled' && entry.value === true);
  const wavesZeroIndex = harness.log.findIndex((entry) => entry.type === 'runtime-level' && entry.key === 'oceanSampleLevel' && entry.value === 0);
  const wavesEnableIndex = harness.log.findIndex((entry) => entry.type === 'boolean' && entry.key === 'oceanSampleEnabled' && entry.value === true);
  assert.ok(granularZeroIndex >= 0 && granularEnableIndex > granularZeroIndex);
  assert.equal(wavesZeroIndex, -1);
  assert.ok(wavesEnableIndex >= 0);

  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().granularEnabled, true);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, true);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'granularLevel' && entry.value === null));
  assert.equal(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'oceanSampleLevel'), false);
}

function testSlotSwitchRestoresSavedOnSourceSnapshot(): void {
  const onSlot = captureRoutingMuteGroupSlot(makeState({
    granularEnabled: true,
    granularLevel: 0.7,
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.6,
  }));
  const offSlot = captureRoutingMuteGroupSlot(makeState({
    granularEnabled: false,
    granularLevel: 0.7,
    oceanSampleEnabled: false,
    oceanSampleLevel: 0.6,
  }));
  const harness = makeHarness(makeState({
    granularEnabled: true,
    granularLevel: 0.7,
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.6,
  }));

  harness.controller.recall(offSlot, 1);
  harness.scheduler.advanceBy(10);
  assert.equal(harness.getState().granularEnabled, false);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, false);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);

  harness.controller.recall(onSlot, 0);
  assert.equal(harness.getState().granularEnabled, true);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, true);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);

  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().granularEnabled, true);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, true);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);
}

function testCancellationPreventsStaleDisables(): void {
  const harness = makeHarness(makeState({
    padEnabled: true,
    synthLevel: 0.8,
    drumEnabled: true,
    drumLevel: 0.9,
  }));

  harness.controller.recall({ mutedSourceIds: ['pad1'] }, 0);
  harness.controller.recall({ mutedSourceIds: ['drums'] }, 1);
  harness.scheduler.advanceBy(10);

  assert.equal(harness.getState().padEnabled, true);
  assert.equal(harness.getState().synthLevel, 0.8);
  assert.equal(harness.getState().drumEnabled, false);
  assert.equal(harness.getState().drumLevel, 0.9);
  assert.equal(
    harness.log.some((entry) => entry.type === 'boolean' && entry.key === 'padEnabled' && entry.value === false),
    false,
  );
}

testNormalizeFiltersIneligibleSources();
testRandomSettingsAndSlotMetadataNormalization();
testSourceEligibilityMatchesRoutingRegistry();
testEarthFamilyRoutingPredicates();
testNormalizeFiltersSceneKeysAndDropsLevels();
testCaptureUsesRegistryAudibilityAndEligibility();
testCaptureIncludesPerformanceMuteSceneWithoutSends();
testCollectSequencerMuteBooleanKeysFromStateShape();
testClearSlot();
testSlotScenePayloadAndStoredEmptyScenes();
testTransitionOrderAndSendPreservation();
testRuntimeRampUpdatesAreBatchedByStep();
testFxReturnTransitionOrder();
testFxReturnSavedBooleanStateRecall();
testImmediateSlotSwitchKeepsEarthLifecycleIndependent();
testCaptureUsesEffectiveMutedSourcesDuringFade();
testMultiEnabledKeyRowsRestoreSnapshots();
testPerformanceMuteSceneRecallAndRelease();
testRecallRestoresPresetLoadedSourceState();
testSlotSwitchRestoresSavedOnSourceSnapshot();
testCancellationPreventsStaleDisables();
