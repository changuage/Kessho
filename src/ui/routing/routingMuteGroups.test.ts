import assert from 'node:assert/strict';

import { DEFAULT_STATE, type SliderState } from '../state';
import {
  captureRoutingMuteGroupSlot,
  createEmptyRoutingMuteGroupsState,
  createRoutingMuteGroupTransitionController,
  normalizeRoutingMuteGroupsState,
  setRoutingMuteGroupSlot,
  type RoutingMuteGroupScheduler,
} from './routingMuteGroups';

type LogEntry =
  | { type: 'runtime-level'; key: keyof SliderState; value: number | null }
  | { type: 'boolean'; key: keyof SliderState; value: boolean }
  | { type: 'active'; value: number | null };

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
    onRuntimeLevelChange: (key, value) => {
      log.push({ type: 'runtime-level', key, value });
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

function testNormalizeFiltersIneligibleSources(): void {
  const normalized = normalizeRoutingMuteGroupsState({
    slots: [
      { mutedSourceIds: ['pad1', 'delayAOut', 'pad1', 'reverb', 'drums', 'missing'] },
      { mutedSourceIds: ['nature', 'degrade', 'water'] },
    ],
  });

  assert.equal(normalized.slots.length, 8);
  assert.deepStrictEqual(normalized.slots[0], { mutedSourceIds: ['pad1', 'drums'] });
  assert.deepStrictEqual(normalized.slots[1], { mutedSourceIds: ['water', 'nature'] });
  assert.equal(normalized.slots[2], null);
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
    reverbEnabled: false,
    reverbLevel: 0,
  });

  const slot = captureRoutingMuteGroupSlot(state);

  assert.ok(slot.mutedSourceIds.includes('pad1'));
  assert.ok(slot.mutedSourceIds.includes('drums'));
  assert.ok(!slot.mutedSourceIds.includes('delayAOut' as never));
  assert.ok(!slot.mutedSourceIds.includes('reverb' as never));
}

function testCaptureIncludesPerformanceMuteSceneWithoutSends(): void {
  const slot = captureRoutingMuteGroupSlot(makeState({
    granularEnabled: true,
    granularLevel: 0.64,
    drumEuclid1Enabled: true,
    drumEuclid1Solo: true,
    drumEuclid2Enabled: false,
    synthEuclid3Enabled: false,
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
  assert.equal(slot.statePatch?.granularV2Enabled, false);
  assert.equal(slot.statePatch?.oceanSampleEnabled, true);
  assert.equal(slot.statePatch?.waterEnabled, true);
  assert.equal('granularLevel' in (slot.statePatch ?? {}), false);
  assert.equal('oceanSampleLevel' in (slot.statePatch ?? {}), false);
  assert.equal('waterLayerSurf' in (slot.statePatch ?? {}), false);
  assert.equal('natureLevel' in (slot.statePatch ?? {}), false);
  assert.equal('waterReverbSend' in (slot.statePatch ?? {}), false);
}

function testClearSlot(): void {
  const initial = createEmptyRoutingMuteGroupsState();
  const saved = setRoutingMuteGroupSlot(initial, 3, { mutedSourceIds: ['pad2'] });
  const cleared = setRoutingMuteGroupSlot(saved, 3, null);

  assert.deepStrictEqual(saved.slots[3], { mutedSourceIds: ['pad2'] });
  assert.equal(cleared.slots[3], null);
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

  const releaseStart = harness.log.length;
  harness.controller.release();
  assert.deepStrictEqual(harness.log.slice(releaseStart, releaseStart + 2), [
    { type: 'runtime-level', key: 'synthLevel', value: 0 },
    { type: 'boolean', key: 'padEnabled', value: true },
  ]);
  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().synthLevel, 0.7);
  assert.equal(harness.getState().padEnabled, true);
  assert.equal(harness.getState().pad1DelayASend, 0.44);
  assert.deepStrictEqual(harness.log.slice(-1), [
    { type: 'runtime-level', key: 'synthLevel', value: null },
  ]);
}

function testMultiEnabledKeyRowsRestoreSnapshots(): void {
  const harness = makeHarness(makeState({
    natureLevel: 0.6,
    birdsEnabled: true,
    birds2Enabled: false,
    frogsEnabled: true,
  }));

  harness.controller.recall({ mutedSourceIds: ['nature'] }, 1);
  harness.scheduler.advanceBy(10);
  assert.equal(harness.getState().birdsEnabled, false);
  assert.equal(harness.getState().birds2Enabled, false);
  assert.equal(harness.getState().frogsEnabled, false);
  assert.equal(harness.getState().natureLevel, 0.6);

  harness.controller.release();
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

  harness.controller.recall({
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
  }, 2);

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
  assert.ok(wavesZeroIndex >= 0 && wavesEnableIndex > wavesZeroIndex);

  harness.scheduler.advanceBy(13);
  assert.equal(harness.getState().granularEnabled, true);
  assert.equal(harness.getState().granularLevel, 0.7);
  assert.equal(harness.getState().oceanSampleEnabled, true);
  assert.equal(harness.getState().oceanSampleLevel, 0.6);
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'granularLevel' && entry.value === null));
  assert.ok(harness.log.some((entry) => entry.type === 'runtime-level' && entry.key === 'oceanSampleLevel' && entry.value === null));
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
testNormalizeFiltersSceneKeysAndDropsLevels();
testCaptureUsesRegistryAudibilityAndEligibility();
testCaptureIncludesPerformanceMuteSceneWithoutSends();
testClearSlot();
testTransitionOrderAndSendPreservation();
testMultiEnabledKeyRowsRestoreSnapshots();
testPerformanceMuteSceneRecallAndRelease();
testRecallRestoresPresetLoadedSourceState();
testSlotSwitchRestoresSavedOnSourceSnapshot();
testCancellationPreventsStaleDisables();
