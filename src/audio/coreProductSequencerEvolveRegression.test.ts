import assert from 'node:assert/strict';

import { coreProductStepValueOverridesFromLane } from './CoreProductHostSequencerUiState';
import { createCoreProductSequencerEvolveClock } from './CoreProductHostSequencerEvolve';
import type { SequencerStepValueConfig } from './CoreProductHostSequencerAdapter';
import { coreProductSequencerHomePayload } from './CoreProductHostSequencerHome';
import { CORE_PRODUCT_DICE_FLAGS, CORE_PRODUCT_SEQUENCER_IDS, CORE_PRODUCT_STEP_VALUE_FIELDS, CORE_PRODUCT_SUBLANE_DIRECTIONS, type CoreProductEvent } from './coreProductEvents';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';

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
  };

  runWrap(clock, input);
  assert.equal(posted.length, 0, 'everyBars=2 should not evolve on the first wrapped bar');
  runWrap(clock, input);
  assert.equal(posted.length, 1, 'everyBars=2 should evolve on the second wrapped bar');
  assert.equal(posted[0]?.eventKind, KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane);
  assert.equal(posted[0]?.targetId, CORE_PRODUCT_SEQUENCER_IDS.synth);
  assert.equal(posted[0]?.index, 0);
  assert.equal(posted[0]?.value, 0.75);
  assert.equal(posted[0]?.value3, 2);
  assert.equal(posted[0]?.value4, 2);
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
