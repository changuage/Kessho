import assert from 'node:assert/strict';

import { coreProductStepValueOverridesFromLane } from './CoreProductHostSequencerUiState';
import { createCoreProductSequencerEvolveClock } from './CoreProductHostSequencerEvolve';
import type { SequencerStepValueConfig } from './CoreProductHostSequencerAdapter';
import { coreProductSequencerHomePayload } from './CoreProductHostSequencerHome';
import { createCoreProductSequencerCacheState, selectCoreProductSequencerCache } from './product/host/CoreProductSequencerCacheBridge';
import {
  createCoreProductSequencerParityEvolveState,
  evolveCoreProductSequencerLaneWithSharedModel,
} from './product/host/CoreProductSequencerParityEvolveBridge';
import { applyCoreProductManualSynthDice, createCoreProductManualSynthDiceState } from './product/host/CoreProductManualSynthDiceBridge';
import { reconcileCoreProductSequencerUiState } from './product/host/CoreProductSequencerUiAdapter';
import { CoreProductSequencerEvolveRuntimeBridge } from './product/host/CoreProductSequencerEvolveRuntimeBridge';
import { CORE_PRODUCT_DICE_FLAGS, CORE_PRODUCT_EVOLVE_FLAGS, CORE_PRODUCT_SEQUENCER_IDS, CORE_PRODUCT_STEP_VALUE_FIELDS, CORE_PRODUCT_SUBLANE_DIRECTIONS, encodeCoreProductSequencerEvolveTension, type CoreProductEvent } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

const baseConfig = {
  enabled: true,
  evolution: 0.75,
  everyBars: 1,
  writeOffset: 2,
  mutationMode: 'strict',
  methods: {},
} as const;

function telemetry(synthStep: number, drumStep: number): CoreProductTelemetrySnapshot {
  return {
    schemaHash: 0,
    transportRunning: true,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    synthSequencerCurrentSteps: [synthStep, 0, 0, 0],
    drumSequencerCurrentSteps: [drumStep, 0, 0, 0],
  };
}

function telemetrySteps(
  synthSteps: number[],
  drumSteps: number[],
  transportRunning = true,
): CoreProductTelemetrySnapshot {
  return {
    ...telemetry(0, 0),
    transportRunning,
    synthSequencerCurrentSteps: synthSteps,
    drumSequencerCurrentSteps: drumSteps,
  };
}

function runWrap(clock: ReturnType<typeof createCoreProductSequencerEvolveClock>, input: Parameters<ReturnType<typeof createCoreProductSequencerEvolveClock>['tick']>[0]) {
  clock.tick({ ...input, telemetry: telemetry(0, 0) as typeof input.telemetry });
  clock.tick({ ...input, telemetry: telemetry(1, 1) as typeof input.telemetry });
  clock.tick({ ...input, telemetry: telemetry(0, 0) as typeof input.telemetry });
}

function hasUnsignedFlag(flags: number | undefined, flag: number): boolean {
  return Math.floor(((flags ?? 0) >>> 0) / flag) % 2 === 1;
}

{
  const cache = createCoreProductSequencerCacheState();
  const state = createCoreProductManualSynthDiceState();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; payload: unknown[] }> = [];
  let armed = 0;
  let captured = 0;

  const handled = applyCoreProductManualSynthDice({
    state,
    laneIndex: 0,
    intensity: 0.61,
    cache,
    adapterState: {
      synthEuclidEvolveConfigs: [{ ...baseConfig, enabledSubLanes: ['expression', 'morph'] }],
    },
    latestSliderState: { tension: 0.4, padTensionMode: 'follow', padTensionValue: 0.1 },
    latestProductSnapshot: null,
    latestTelemetry: { ...telemetry(0, 0), barIndex: 6 },
    armManualDice: () => { armed += 1; },
    post: (event) => { posted.push(event); },
    publish: (name, ...payload) => { published.push({ name, payload }); },
    captureHome: () => { captured += 1; },
  });

  assert.equal(handled, true, 'native manual synth dice bridge should handle synth dice');
  assert.equal(captured, 1, 'native manual synth dice should capture the pre-dice home once');
  assert.equal(armed, 1, 'native manual synth dice should arm UI-state manual dice reconciliation');
  assert.equal(posted.length, 1, 'native manual synth dice should post one Product Core dice event');
  const event = posted[0];
  assert(event, 'native manual synth dice should provide a posted event for assertions');
  assert.equal(event.eventKind, KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane, 'native manual synth dice should use Product Core dice event kind');
  assert.equal(event.targetId, CORE_PRODUCT_SEQUENCER_IDS.synth, 'native manual synth dice should target the synth sequencer');
  assert.equal(event.index, 0, 'native manual synth dice should preserve the lane index');
  assert.equal(event.value, 0.61, 'native manual synth dice should preserve requested intensity');
  assert.equal(event.value3, 0, 'native manual synth dice should write immediately by default');
  assert.equal(event.value4, 7, 'native manual synth dice should target the next Product Core bar');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_EVOLVE_FLAGS.modeParity), 'native manual synth dice should request parity evolve mode');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_EVOLVE_FLAGS.valueDrift), 'native manual synth dice should enable value drift');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_EVOLVE_FLAGS.valueScramble), 'native manual synth dice should enable value scramble');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_EVOLVE_FLAGS.manualCommit), 'native manual synth dice should request a committed Product Core mutation');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_EVOLVE_FLAGS.mutationStrict), 'native manual synth dice should preserve strict mutation mode');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_DICE_FLAGS.expression), 'native manual synth dice should include enabled expression field');
  assert(hasUnsignedFlag(event.flags, CORE_PRODUCT_DICE_FLAGS.morph), 'native manual synth dice should include enabled morph field');
  assert(!hasUnsignedFlag(event.flags, CORE_PRODUCT_DICE_FLAGS.distance), 'native manual synth dice should not evolve disabled distance field');
  assert(typeof state.baselineSignatures[0] === 'string', 'native manual synth dice should keep a baseline signature for UI-state change detection');
  assert(
    published.some((entry) => entry.name === 'synthEuclidEvolve' && entry.payload[0] === 0),
    'native manual synth dice should preserve the UI evolve trigger callback',
  );
}

{
  const state = createCoreProductManualSynthDiceState();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; payload: unknown[] }> = [];
  let armed = 0;

  applyCoreProductManualSynthDice({
    state,
    laneIndex: 1,
    intensity: 0.5,
    cache: createCoreProductSequencerCacheState(),
    adapterState: {},
    latestSliderState: null,
    latestProductSnapshot: null,
    latestTelemetry: null,
    armManualDice: () => { armed += 1; },
    post: (event) => { posted.push(event); },
    publish: (name, ...payload) => { published.push({ name, payload }); },
    captureHome: () => {},
  });

  assert.equal(posted.length, 1, 'native manual synth dice should always create the compact Product Core dice event; host post callbacks own runtime readiness');
  assert.equal(posted[0]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane, 'cold-path manual synth dice should still use the native Product Core dice event kind');
  assert.equal(armed, 1, 'native manual synth dice should still arm UI reconciliation while runtime is cold');
  assert(
    published.some((entry) => entry.name === 'synthEuclidEvolve' && entry.payload[0] === 1),
    'native manual synth dice should preserve UI callback behavior while runtime is cold',
  );
}

{
  const posted: CoreProductEvent[] = [];
  const bridge = new CoreProductSequencerEvolveRuntimeBridge({
    adapterState: () => ({
      synthEuclidEvolveConfigs: [{ ...baseConfig, methods: { swingDrift: true } }],
      drumEuclidEvolveConfigs: [],
    }),
    latestSliderState: () => null,
    latestProductSnapshot: () => null,
    latestTelemetry: () => telemetry(0, 0),
    runtimeReady: () => true,
    postWithHomeCapture: (event) => posted.push(event),
  });

  bridge.syncLane('synth', 0);
  assert.equal(posted.length, 3, 'native scheduled evolve should synchronize two seed halves and one compact runtime config');
  const configEvent = posted[2];
  assert.equal(configEvent?.paramId, KESSHO_PRODUCT_PARAM_IDS.SequencerEvolveRuntimeConfig);
  assert.equal(configEvent?.targetId, CORE_PRODUCT_SEQUENCER_IDS.synth);
  assert.equal(configEvent?.value, 1, 'native scheduled evolve config should be enabled');
  assert.equal(configEvent?.value2, baseConfig.evolution);
  assert.equal(configEvent?.value3, baseConfig.everyBars);
  assert.equal(configEvent?.value4, baseConfig.writeOffset);
  assert(hasUnsignedFlag(configEvent?.flags, CORE_PRODUCT_EVOLVE_FLAGS.modeParity), 'native scheduled evolve must request parity mode');
  assert(hasUnsignedFlag(configEvent?.flags, CORE_PRODUCT_EVOLVE_FLAGS.swingDrift), 'native scheduled evolve must carry swingDrift into Product Core');
  assert(hasUnsignedFlag(configEvent?.flags, CORE_PRODUCT_EVOLVE_FLAGS.rngStream), 'native scheduled evolve must use the shared RNG stream seed');
  assert(hasUnsignedFlag(configEvent?.flags, CORE_PRODUCT_EVOLVE_FLAGS.mutationStrict), 'native scheduled evolve must preserve strict mutation mode');

  bridge.tick(telemetry(1, 1));
  bridge.tick(telemetry(0, 0));
  assert.equal(posted.length, 24, 'visible telemetry changes should only synchronize the remaining seven lane configs, not drive evolve cadence');
}

{
  const rangeOverrides: Array<{ min: number; max: number } | null> = [null, null, null, null];
  const noteRangePubs: Array<{ laneIndex: number; noteMin: number; noteMax: number }> = [];
  const overridePubs: Array<{ name: string; laneIndex: number; payload?: Record<string, unknown> }> = [];
  const lane = {
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 0,
    swing: 0.2,
    baseMidiNote: 71,
    noteRangeMin: 65,
    noteRangeMax: 77,
    triggerToggles: [],
    probability: null,
    ratchet: null,
    trigCondition: null,
    midiNote: null,
    expression: null,
    morph: null,
    distance: null,
  };
  const revision = reconcileCoreProductSequencerUiState({
    telemetry: {
      ...telemetry(0, 0),
      sequencerUiStateRevision: 7,
      sequencerUiState: {
        schemaHash: 1,
        revision: 7,
        synthLaneCount: 4,
        drumLaneCount: 4,
        evolutionAmount: 0,
        evolutionState: 0,
        lastChangedTargetId: CORE_PRODUCT_SEQUENCER_IDS.synth,
        lastChangedLaneIndex: 0,
        lastChangeKind: 3,
        synthLanes: [lane],
        drumLanes: [],
      },
    },
    lastRevision: 0,
    visibleSynthLaneCount: 4,
    synthPitchSettings: [{ mode: 'noteRange', root: 60, scale: 'Major' }],
    synthBaseMidi: () => 60,
    drumBaseMidi: () => 36,
    hasManualSynthDice: () => false,
    manualSynthDiceChanged: () => false,
    completeManualSynthDice: () => {},
    consumeManualDrumDice: () => false,
    ensureLaneCache: () => {},
    getLaneState: () => ({ toggles: [], values: [], configs: [], swing: 0 }),
    captureLaneHome: () => {},
    setSynthLaneState: () => {},
    setDrumLaneState: () => {},
    setLaneSwing: () => {},
    setSynthNoteRangeOverride: (laneIndex, range) => { rangeOverrides[laneIndex] = range; },
    publishNoteRange: (laneIndex, noteMin, noteMax) => noteRangePubs.push({ laneIndex, noteMin, noteMax }),
    publish: (name, laneIndex, payload) => overridePubs.push({ name, laneIndex, payload }),
  });
  assert.equal(revision, 7, 'Product Core UI reconciliation should consume native noteRange evolve revisions');
  assert.deepEqual(rangeOverrides[0], { min: 65, max: 77 }, 'native noteRange evolve should refresh the host note-range override cache');
  assert.deepEqual(noteRangePubs, [{ laneIndex: 0, noteMin: 65, noteMax: 77 }], 'native noteRange evolve should publish the web-ts note-range callback payload');
  assert.equal(overridePubs[0]?.name, 'synthEvolveOverrides', 'native noteRange evolve should still publish synth evolve overrides');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      everyBars: 2,
      methods: { probDrift: true, valueDrift: true, pitchWalk: true },
      enabledSubLanes: ['probability', 'expression'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    getEffectiveTension: () => 0.72,
    getRngSeed: () => 123456789,
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'everyBars=2 should not evolve on the first wrapped bar');
  runWrap(clock, input);
  assert.equal(posted.length, 1, 'everyBars=2 should evolve on the second wrapped bar');
  assert.equal(posted[0]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane);
  assert.equal(posted[0]?.targetId, CORE_PRODUCT_SEQUENCER_IDS.synth);
  assert.equal(posted[0]?.index, 0);
  assert.equal(posted[0]?.value, 0.75);
  assert.equal(posted[0]?.paramId, 123456789, 'scheduled native parity evolve should carry the shared web-ts RNG stream seed in the exact integer event field');
  assert.equal(posted[0]?.value2, encodeCoreProductSequencerEvolveTension(0.72), 'scheduled native parity evolve should retain encoded effective tension when paramId carries the RNG stream seed');
  assert.equal(posted[0]?.value3, 2);
  assert.equal(posted[0]?.value4, 2);
  assert.equal((posted[0]?.flags ?? 0) & CORE_PRODUCT_EVOLVE_FLAGS.rngStream, CORE_PRODUCT_EVOLVE_FLAGS.rngStream);
  assert.equal((posted[0]?.flags ?? 0) & CORE_PRODUCT_DICE_FLAGS.probability, CORE_PRODUCT_DICE_FLAGS.probability);
  assert.equal((posted[0]?.flags ?? 0) & CORE_PRODUCT_DICE_FLAGS.expression, CORE_PRODUCT_DICE_FLAGS.expression);
  assert.equal((posted[0]?.flags ?? 0) & CORE_PRODUCT_DICE_FLAGS.midiNote, 0, 'enabledSubLanes should suppress disabled pitch dice');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 0 }]);
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const laneTwoConfig = {
    ...baseConfig,
    methods: { probDrift: true },
    enabledSubLanes: ['probability'],
  };
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [undefined, undefined, laneTwoConfig, undefined],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
  };

  clock.tick({ ...input, telemetry: telemetrySteps([0, 0, 0, 0], [0, 0, 0, 0]) });
  clock.tick({ ...input, telemetry: telemetrySteps([1, 0, 0, 0], [0, 0, 0, 0]) });
  clock.tick({ ...input, telemetry: telemetrySteps([0, 0, 0, 0], [0, 0, 0, 0]) });
  assert.equal(posted.length, 0, 'lane 2 evolve should not fire from a lane 0 wrap');
  assert.deepEqual(published, [], 'lane 2 evolve should not publish from a lane 0 wrap');

  clock.tick({ ...input, telemetry: telemetrySteps([0, 0, 1, 0], [0, 0, 0, 0]) });
  clock.tick({ ...input, telemetry: telemetrySteps([0, 0, 0, 0], [0, 0, 0, 0]) });
  assert.equal(posted.length, 1, 'lane 2 evolve should fire when lane 2 wraps');
  assert.equal(posted[0]?.targetId, CORE_PRODUCT_SEQUENCER_IDS.synth);
  assert.equal(posted[0]?.index, 2, 'scheduled synth evolve should post the wrapped lane index');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 2 }], 'scheduled synth evolve should publish the wrapped lane index');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const swingUpdates: Array<{ sequencer: string; laneIndex: number; swing: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [],
    drumConfigs: [{
      ...baseConfig,
      methods: { swingDrift: true },
    }],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    getSwing: () => 0.3,
    setSwing: (sequencer: 'synth' | 'drum', laneIndex: number, swing: number) => {
      swingUpdates.push({ sequencer, laneIndex, swing });
    },
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'host-only swing evolve should not post a dice event');
  assert.equal(swingUpdates.length, 1, 'host-only swing evolve should update lane swing');
  assert.equal(swingUpdates[0]?.sequencer, 'drum');
  assert.equal(swingUpdates[0]?.laneIndex, 0);
  assert.notEqual(swingUpdates[0]?.swing, 0.3);
  assert.deepEqual(published, [{ name: 'drumEuclidEvolve', laneIndex: 0 }]);
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{ ...baseConfig, methods: { valueDrift: true } }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: () => {},
  };

  runWrap(clock, input);
  assert.equal(posted.length, 1, 'first running wrap should evolve when everyBars=1');
  clock.tick({ ...input, telemetry: { ...telemetry(0, 0), transportRunning: false } });
  clock.tick({ ...input, telemetry: telemetry(0, 0) });
  clock.tick({ ...input, telemetry: telemetry(1, 0) });
  clock.tick({ ...input, telemetry: telemetry(0, 0) });
  assert.equal(posted.length, 2, 'transport stop should reset evolve cycle tracking before the next run');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const noteRangeCalls: Array<{ laneIndex: number; enabledSubLanes?: string[] }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      methods: { pitchWalk: true },
      enabledSubLanes: ['expression'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    evolveSynthNoteRange: (laneIndex: number, config: any) => {
      noteRangeCalls.push({ laneIndex, enabledSubLanes: config.enabledSubLanes });
      return { handled: true, changed: false };
    },
  };

  runWrap(clock, input);
  assert.deepEqual(noteRangeCalls, [{ laneIndex: 0, enabledSubLanes: ['expression'] }], 'pitchWalk noteRange evolve should receive the effective sub-lane filter');
  assert.equal(posted.length, 0, 'disabled pitchWalk noteRange evolve should not post a dice event');
  assert.deepEqual(published, [], 'disabled pitchWalk noteRange evolve should not publish a no-op flash');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      methods: { pitchWalk: true },
      enabledSubLanes: ['pitch'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    evolveSynthNoteRange: () => ({ handled: true, changed: false }),
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'unchanged noteRange pitchWalk should not post a dice event');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 0 }], 'unchanged scheduled noteRange pitchWalk should still publish evolve feedback like web-ts');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const swingUpdates: Array<{ sequencer: string; laneIndex: number; swing: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      methods: { swingDrift: true },
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    getSwing: () => 0,
    setSwing: (sequencer: 'synth' | 'drum', laneIndex: number, swing: number) => {
      swingUpdates.push({ sequencer, laneIndex, swing });
    },
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'host-only clamped swing evolve should not post a dice event');
  assert.equal(swingUpdates.length, 0, 'host-only clamped swing evolve should not write unchanged swing');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 0 }], 'host-only clamped swing evolve should still publish visible feedback');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      methods: { pitchWalk: true },
      enabledSubLanes: ['pitch'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    evolveSynthNoteRange: () => ({ handled: true, changed: true }),
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'handled noteRange pitchWalk should not also post MIDI-note dice');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 0 }], 'changed noteRange pitchWalk should publish evolve feedback');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const updates: Array<{
    sequencer: string;
    laneIndex: number;
    result: any;
  }> = [];
  const configs: SequencerStepValueConfig[] = [
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
    { field: CORE_PRODUCT_STEP_VALUE_FIELDS.distance, steps: 4, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward },
  ];
  const valueOverrides = [0, 1, 2, 3].map((step) => ({
    step,
    field: CORE_PRODUCT_STEP_VALUE_FIELDS.morph,
    value: 0.2 + step * 0.1,
  }));
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      evolution: 1,
      methods: { subLaneLengthDrift: true, subLaneDirectionFlip: true },
      enabledSubLanes: ['morph'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    getSubLaneConfigs: () => configs.map((entry) => ({ ...entry })),
    getStepValueOverrides: () => valueOverrides.map((entry) => ({ ...entry })),
    setSubLaneConfigs: (sequencer: string, laneIndex: number, result: any) => {
      updates.push({ sequencer, laneIndex, result });
    },
  };

  for (let attempt = 0; attempt < 80 && updates.length === 0; attempt += 1) {
    runWrap(clock, input);
  }
  assert.equal(posted.length, 0, 'host-side sub-lane evolve should not post a dice event when only length/direction methods are active');
  assert(updates.length > 0, 'subLaneLengthDrift/subLaneDirectionFlip should eventually produce a host-side sub-lane config update');
  assert.equal(updates[0]?.sequencer, 'synth');
  assert.equal(updates[0]?.laneIndex, 0);
  assert.deepEqual(
    Object.keys(updates[0]?.result?.subLaneStates ?? {}),
    ['morph'],
    'enabledSubLanes should restrict host-side sub-lane evolve payloads to the selected lane',
  );
  assert(
    updates[0]?.result?.directionPayloads?.morphDirection ||
      updates[0]?.result?.subLaneStates?.morph?.steps !== 4,
    'host-side sub-lane evolve should report either changed morph direction or changed morph length',
  );
  if (updates[0]?.result?.valueOverrides) {
    const morphValues = updates[0].result.valueOverrides.filter((entry: any) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.morph);
    assert.equal(
      morphValues.length,
      updates[0].result.subLaneStates.morph.steps,
      'host-side sub-lane length evolve should resize existing value overrides to the new step count',
    );
  }
  assert(published.some((entry) => entry.name === 'synthEuclidEvolve' && entry.laneIndex === 0), 'host-side sub-lane evolve should publish visible feedback');
}

{
  const clock = createCoreProductSequencerEvolveClock();
  const posted: CoreProductEvent[] = [];
  const published: Array<{ name: string; laneIndex: number }> = [];
  const handled: Array<{ laneIndex: number; bar: number }> = [];
  const input = {
    telemetry: telemetry(0, 0),
    synthConfigs: [{
      ...baseConfig,
      methods: { probDrift: true },
      enabledSubLanes: ['probability'],
    }],
    drumConfigs: [],
    post: (event: CoreProductEvent) => posted.push(event),
    publish: (name: string, laneIndex: number) => published.push({ name, laneIndex }),
    evolveLane: (_sequencer: string, laneIndex: number, _config: any, _seed: number, bar: number) => {
      handled.push({ laneIndex, bar });
      return { handled: true, changed: true };
    },
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'shared-model evolve handler should suppress legacy dice events');
  assert.deepEqual(handled, [{ laneIndex: 0, bar: 1 }], 'shared-model evolve handler should receive the wrapped bar');
  assert.deepEqual(published, [{ name: 'synthEuclidEvolve', laneIndex: 0 }], 'shared-model evolve handler should still publish evolve trigger feedback');
}

{
  const cache = createCoreProductSequencerCacheState();
  const state = createCoreProductSequencerParityEvolveState();
  const published: Array<{ name: string; laneIndex: number; payload: Record<string, unknown> }> = [];
  const uiLane = (swing: number, baseMidiNote = 60) => ({
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 0,
    swing,
    baseMidiNote,
    noteRangeMin: baseMidiNote - 12,
    noteRangeMax: baseMidiNote + 12,
    triggerToggles: [],
    probability: null,
    ratchet: null,
    trigCondition: null,
    midiNote: null,
    expression: null,
    morph: null,
    distance: null,
  });
  const telemetryWithSequencerUi = {
    ...telemetry(0, 0),
    sequencerUiState: {
      schemaHash: 1,
      revision: 1,
      synthLaneCount: 4,
      drumLaneCount: 4,
      evolutionAmount: 0,
      evolutionState: 0,
      lastChangedTargetId: 0,
      lastChangedLaneIndex: 0,
      lastChangeKind: 0,
      synthLanes: [uiLane(0.41)],
      drumLanes: [uiLane(0.52)],
    },
  } as CoreProductTelemetrySnapshot;
  const baseOptions = {
    state,
    cache,
    adapterState: {},
    latestSliderState: null,
    latestProductSnapshot: { synthLanes: [{ swing: 0.1 }], drumLanes: [{ swing: 0.2 }] } as any,
    telemetry: telemetryWithSequencerUi,
    synthSubLaneEnabled: [{ expression: true }, {}, {}, {}] as Record<string, boolean>[],
    drumSubLaneEnabled: [{ expression: true, distance: true }, {}, {}, {}] as Record<string, boolean>[],
    synthNoteRangeOverrides: [null, null, null, null],
    restoreHomeNoteRange: () => null,
    setSynthNoteRangeOverride: () => {},
    runtimeReady: false,
    fieldEnabled: () => true,
    post: () => {},
    publishOverrides: (name: 'synthEvolveOverrides' | 'drumEvolveOverrides', laneIndex: number, payload: Record<string, unknown>) => {
      published.push({ name, laneIndex, payload });
    },
    publishNoteRange: () => {},
  };
  const noDrumMethods = {
    rotateDrift: false,
    swingDrift: false,
    probDrift: false,
    ghostNotes: false,
    ratchetSpray: false,
    hitDrift: false,
    pitchWalk: false,
    valueDrift: false,
    valueScramble: false,
    valueWiden: false,
    subLaneLengthDrift: false,
    subLaneDirectionFlip: false,
  };

  const synthResult = evolveCoreProductSequencerLaneWithSharedModel({
    ...baseOptions,
    sequencer: 'synth',
    laneIndex: 0,
    config: { ...baseConfig, methods: {}, enabledSubLanes: ['expression'] },
    bar: 1,
    seed: 123,
  });
  const synthValues = selectCoreProductSequencerCache(cache, 'synth').values[0] ?? [];
  assert.equal(synthResult.handled, true, 'shared-model synth evolve should handle product-core synth lanes');
  assert.equal(synthResult.changed, true, 'shared-model synth evolve should apply web-ts auto-init semantics');
  assert(synthValues.some((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.expression), 'shared-model synth evolve should write evolved expression values into product cache');
  assert.equal(
    published.find((entry) => entry.name === 'synthEvolveOverrides')?.payload.swing,
    0.41,
    'shared-model synth evolve should start from Product Core telemetry swing instead of stale snapshot swing',
  );
  assert.equal(
    (synthResult.adapterState as any)?.synthEuclid1Swing,
    0.41,
    'shared-model synth evolve should patch the host adapter with Product Core telemetry swing',
  );

  const drumResult = evolveCoreProductSequencerLaneWithSharedModel({
    ...baseOptions,
    sequencer: 'drum',
    laneIndex: 0,
    config: { ...baseConfig, methods: noDrumMethods, enabledSubLanes: ['expression', 'distance'] },
    bar: 1,
    seed: 456,
  });
  const drumCache = selectCoreProductSequencerCache(cache, 'drum');
  assert.equal(drumResult.handled, true, 'shared-model drum evolve should handle product-core drum lanes');
  assert.equal(drumResult.changed, true, 'shared-model drum evolve should mirror web-ts drum evolve object-update semantics');
  assert((drumCache.toggles[0] ?? []).length > 0, 'shared-model drum evolve should write the evolved trigger pattern into product cache');
  assert.equal(
    published.find((entry) => entry.name === 'drumEvolveOverrides')?.payload.swing,
    0.52,
    'shared-model drum evolve should start from Product Core telemetry swing instead of stale snapshot swing',
  );
  assert.equal(
    (drumResult.adapterState as any)?.drumEuclid1Swing,
    0.52,
    'shared-model drum evolve should patch the host adapter with Product Core telemetry swing',
  );
  assert(published.some((entry) => entry.name === 'synthEvolveOverrides'), 'shared-model synth evolve should publish web-ts-shaped override payloads');
  assert(published.some((entry) => entry.name === 'drumEvolveOverrides'), 'shared-model drum evolve should publish web-ts-shaped override payloads');
}

{
  const cache = createCoreProductSequencerCacheState();
  const state = createCoreProductSequencerParityEvolveState();
  const published: Array<{ name: string; laneIndex: number; payload: Record<string, unknown> }> = [];
  const drumLane = {
    enabled: true,
    targetSourceId: 5,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 0,
    swing: 0,
    baseMidiNote: 37,
    noteRangeMin: 25,
    noteRangeMax: 49,
    triggerToggles: [],
    probability: null,
    ratchet: null,
    trigCondition: null,
    midiNote: null,
    expression: null,
    morph: null,
    distance: null,
  };
  const noDrumMethods = {
    rotateDrift: false,
    swingDrift: false,
    probDrift: false,
    ghostNotes: false,
    ratchetSpray: false,
    hitDrift: false,
    pitchWalk: false,
    valueDrift: false,
    valueScramble: false,
    valueWiden: false,
    subLaneLengthDrift: false,
    subLaneDirectionFlip: false,
  };
  const result = evolveCoreProductSequencerLaneWithSharedModel({
    state,
    cache,
    adapterState: {
      drumPitchSettings: [{ mode: 'notes', root: 57, scale: 'Minor' }],
    },
    latestSliderState: {
      drumEuclid1PitchMode: 'semitones',
      drumEuclid1PitchRoot: 60,
      drumEuclid1PitchScale: 'Major',
    },
    latestProductSnapshot: { synthLanes: [], drumLanes: [{ midiNote: 36, swing: 0 }] } as any,
    telemetry: {
      ...telemetry(0, 0),
      sequencerUiState: {
        schemaHash: 1,
        revision: 1,
        synthLaneCount: 4,
        drumLaneCount: 4,
        evolutionAmount: 0,
        evolutionState: 0,
        lastChangedTargetId: 0,
        lastChangedLaneIndex: 0,
        lastChangeKind: 0,
        synthLanes: [],
        drumLanes: [drumLane],
      },
    } as CoreProductTelemetrySnapshot,
    synthSubLaneEnabled: [{}, {}, {}, {}] as Record<string, boolean>[],
    drumSubLaneEnabled: [{ pitch: true }, {}, {}, {}] as Record<string, boolean>[],
    synthNoteRangeOverrides: [null, null, null, null],
    restoreHomeNoteRange: () => null,
    restoreHomePitchSettings: () => null,
    setSynthNoteRangeOverride: () => {},
    runtimeReady: false,
    fieldEnabled: () => true,
    post: () => {},
    publishOverrides: (name: 'synthEvolveOverrides' | 'drumEvolveOverrides', laneIndex: number, payload: Record<string, unknown>) => {
      published.push({ name, laneIndex, payload });
    },
    publishNoteRange: () => {},
    sequencer: 'drum',
    laneIndex: 0,
    config: { ...baseConfig, methods: noDrumMethods, enabledSubLanes: ['pitch'] },
    bar: 1,
    seed: 2468,
  });

  assert.equal(result.handled, true, 'shared-model drum evolve should handle explicit Product drum pitch settings');
  assert.deepEqual(
    (published.find((entry) => entry.name === 'drumEvolveOverrides')?.payload.pitchSettings as unknown[] | undefined)?.[0],
    { mode: 'notes', root: 57, scale: 'Minor' },
    'shared-model drum evolve should prefer explicit Product adapter pitch settings over stale slider-state pitch settings',
  );
}

{
  const cache = createCoreProductSequencerCacheState();
  const state = createCoreProductSequencerParityEvolveState();
  const published: Array<{ name: string; laneIndex: number; payload: Record<string, unknown> }> = [];
  const lane = {
    enabled: true,
    targetSourceId: 1,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    mutationFlags: 0,
    swing: 0,
    baseMidiNote: 72,
    noteRangeMin: 60,
    noteRangeMax: 84,
    triggerToggles: [],
    probability: null,
    ratchet: null,
    trigCondition: null,
    midiNote: null,
    expression: null,
    morph: null,
    distance: null,
  };
  const synthCache = selectCoreProductSequencerCache(cache, 'synth');
  synthCache.values[0] = [{ field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, step: 0, value: 74 }];
  synthCache.configs[0] = [{ field: CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote, steps: 1, direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.forward }];

  const result = evolveCoreProductSequencerLaneWithSharedModel({
    state,
    cache,
    adapterState: {},
    latestSliderState: null,
    latestProductSnapshot: { synthLanes: [{ midiNote: 60, swing: 0 }], drumLanes: [] } as any,
    telemetry: {
      ...telemetry(0, 0),
      sequencerUiState: {
        schemaHash: 1,
        revision: 1,
        synthLaneCount: 4,
        drumLaneCount: 4,
        evolutionAmount: 0,
        evolutionState: 0,
        lastChangedTargetId: 0,
        lastChangedLaneIndex: 0,
        lastChangeKind: 0,
        synthLanes: [lane],
        drumLanes: [],
      },
    } as CoreProductTelemetrySnapshot,
    synthSubLaneEnabled: [{ pitch: true }, {}, {}, {}] as Record<string, boolean>[],
    drumSubLaneEnabled: [{}, {}, {}, {}] as Record<string, boolean>[],
    synthNoteRangeOverrides: [null, null, null, null],
    restoreHomeNoteRange: () => null,
    setSynthNoteRangeOverride: () => {},
    runtimeReady: false,
    fieldEnabled: () => true,
    post: () => {},
    publishOverrides: (name: 'synthEvolveOverrides' | 'drumEvolveOverrides', laneIndex: number, payload: Record<string, unknown>) => {
      published.push({ name, laneIndex, payload });
    },
    publishNoteRange: () => {},
    sequencer: 'synth',
    laneIndex: 0,
    config: { ...baseConfig, methods: {}, enabledSubLanes: ['pitch'] },
    bar: 1,
    seed: 789,
  });

  assert.equal(result.handled, true, 'shared-model synth evolve should handle telemetry-backed base MIDI parity cases');
  assert.deepEqual(
    published.find((entry) => entry.name === 'synthEvolveOverrides')?.payload.pitch,
    [1],
    'shared-model synth evolve should convert MIDI overrides to scale degrees against live Product Core base MIDI, not stale snapshot MIDI',
  );
  assert.deepEqual(
    selectCoreProductSequencerCache(cache, 'synth').values[0]?.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote).map((entry) => entry.value),
    [74],
    'shared-model synth evolve should store absolute MIDI back into Product cache after live-base conversion',
  );
}

{
	  const lane = {
	    mutationFlags: 1,
	    triggerToggles: [],
	    probabilityOverrideSetLow: 0b01,
	    probabilityOverrideSetHigh: 0,
	    probability: [0.8, 0.4],
	    ratchetOverrideSetLow: 0b10,
	    ratchetOverrideSetHigh: 0,
	    ratchet: [1, 3],
	    trigConditionOverrideSetLow: 0b10,
	    trigConditionOverrideSetHigh: 0,
	    trigCondition: [[1, 1], [1, 2]],
	    expressionOverrideSetLow: 1,
	    expressionOverrideSetHigh: 0,
	    expression: [0.2, 0.83],
	  };
	  const masked = coreProductStepValueOverridesFromLane(lane as any, true);
	  const dense = coreProductStepValueOverridesFromLane(lane as any, true, true);
	  assert.deepEqual(
	    masked.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.probability).map((entry) => entry.value),
	    [0.8],
	    'masked Product UI capture should honor probability override masks',
	  );
	  assert.deepEqual(
	    masked.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet).map((entry) => entry.value),
	    [3],
	    'masked Product UI capture should honor ratchet override masks',
	  );
	  assert.deepEqual(
	    masked
	      .filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition)
	      .map((entry) => [entry.value, entry.value2]),
	    [[1, 2]],
	    'masked Product UI capture should honor trig-condition override masks',
	  );
	  assert.deepEqual(
	    masked.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.expression).map((entry) => entry.value),
	    [0.2],
	    'masked Product UI capture should honor explicit override masks',
	  );
	  assert.deepEqual(
	    dense.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.probability).map((entry) => entry.value),
	    [0.8, 0.4],
	    'manual dice home capture should preserve dense trigger probabilities',
	  );
	  assert.deepEqual(
	    dense.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet).map((entry) => entry.value),
	    [1, 3],
	    'manual dice home capture should preserve dense trigger ratchets',
	  );
	  assert.deepEqual(
	    dense.filter((entry) => entry.field === CORE_PRODUCT_STEP_VALUE_FIELDS.expression).map((entry) => entry.value),
	    [0.2, 0.83],
    'manual synth dice home capture should preserve the dense values shown in the UI',
  );
}

{
  const home = {
    toggles: [],
	    values: [
	      {
	        step: 0,
	        field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression,
	        value: 0.25,
	        value2: 0.85,
	        range: true,
	      },
	      {
	        step: 1,
	        field: CORE_PRODUCT_STEP_VALUE_FIELDS.probability,
	        value: 0.8,
	      },
	      {
	        step: 1,
	        field: CORE_PRODUCT_STEP_VALUE_FIELDS.ratchet,
	        value: 3,
	      },
	      {
	        step: 1,
	        field: CORE_PRODUCT_STEP_VALUE_FIELDS.trigCondition,
	        value: 1,
	        value2: 2,
	      },
	    ],
    configs: [{
      field: CORE_PRODUCT_STEP_VALUE_FIELDS.expression,
      steps: 3,
      direction: CORE_PRODUCT_SUBLANE_DIRECTIONS.reverse,
    }],
    swing: 0.2,
  };
  const synthPayload = coreProductSequencerHomePayload('synth', 0, home, 60);
  assert.deepEqual(
    synthPayload.expressionRanges,
    { min: 0.25, max: 0.85 },
    'synth reset-home payload should preserve expression range bounds',
  );
	  assert.deepEqual(
	    synthPayload.expression,
	    [0.55, 0.55, 0.55],
	    'synth reset-home payload should synthesize midpoint values without losing range mode',
	  );
	  assert.deepEqual(
	    synthPayload.probability,
	    [0.8],
	    'synth reset-home payload should preserve trigger probability',
	  );
	  assert.deepEqual(
	    synthPayload.ratchet,
	    [3],
	    'synth reset-home payload should preserve trigger ratchet',
	  );
	  assert.deepEqual(
	    synthPayload.trigCondition,
	    [[1, 2]],
	    'synth reset-home payload should preserve trigger condition',
	  );
	  assert.deepEqual(
	    (synthPayload.subLaneStates as any).expression,
	    { enabled: true, steps: 3, direction: 'reverse', valueMode: 'range', rangeMin: 0.25, rangeMax: 0.85 },
    'synth reset-home payload should restore expression as range mode, not sequence mode',
  );

  const drumPayload = coreProductSequencerHomePayload('drum', 2, home, 37);
  assert.deepEqual(
    drumPayload.expressionRanges,
    [null, null, { min: 0.25, max: 0.85 }, null],
    'drum reset-home payload should preserve lane-scoped expression range bounds',
  );
	  assert.deepEqual(
	    drumPayload.expression,
	    [null, null, [0.55, 0.55, 0.55], null],
	    'drum reset-home payload should synthesize lane-scoped midpoint values without losing range mode',
	  );
	  assert.deepEqual(
	    drumPayload.probability,
	    [null, null, [0.8], null],
	    'drum reset-home payload should preserve lane-scoped trigger probability',
	  );
	  assert.deepEqual(
	    drumPayload.ratchet,
	    [null, null, [3], null],
	    'drum reset-home payload should preserve lane-scoped trigger ratchet',
	  );
	  assert.deepEqual(
	    drumPayload.trigCondition,
	    [null, null, [[1, 2]], null],
	    'drum reset-home payload should preserve lane-scoped trigger condition',
	  );
	  assert.deepEqual(
	    (drumPayload.subLaneStates as any).expression,
	    { enabled: true, steps: 3, direction: 'reverse', valueMode: 'range', rangeMin: 0.25, rangeMax: 0.85 },
    'drum reset-home payload should restore expression as range mode, not sequence mode',
  );
}

console.log('core product sequencer evolve regression checks passed');
