import assert from 'node:assert/strict';
import '../../app/parameterCommands.test';
import '../../audio/reference/webTs/runtimeWalkParameterDiff.test';
import {
  CORE_PRODUCT_MODULATION_RANGE_FLAGS,
  CORE_PRODUCT_MODULATION_RANGE_MODE,
  createCoreProductModulationRangeEvent,
} from '../../audio/coreProductEvents';
import type { CoreProductTelemetrySnapshot } from '../../audio/coreProductTelemetry';
import { CoreProductModulationRangeBridge } from '../../audio/product/host/CoreProductModulationRangeBridge';
import {
  getRuntimeSliderPosition,
  mergeRuntimeWalkPositions,
  subscribeRuntimeSliderKey,
} from '../runtimeSliderState';
import {
  getRuntimeValue,
  mergeRuntimeValues,
  subscribeRuntimeValueKey,
} from '../runtimeValueState';
import { resolveDualSliderAutomation } from '../shared/dualSliderAutomation';
import {
  publishVisualizerIndicator,
  subscribeVisualizerIndicator,
} from '../visualizer/visualizerIndicatorStore';
import { advanceRandomWalk, type RandomWalkState } from './automationKernel';
import { resolveEffectiveSliderValue } from './effectiveValue';
import {
  dualConfigReducer,
  configForModulationSource,
  DEFAULT_MODULATION_SOURCE_A,
  DEFAULT_MODULATION_SOURCE_B,
  fromLegacyDualState,
  normalizeModulationSourceConfig,
  toLegacyDualState,
} from './dualConfigReducer';
import { createRafCoalescedEmitter } from './useRafCoalescedEmitter';
import { sequencerTriggerPatternSyncKey } from '../sequencer/sequencerTriggerPatternSyncKey';
import {
  axisToNormalized,
  getNearestRangeHandle,
  shiftRangePreservingWidth,
} from './matrixMath';
import {
  normToValue,
  normalizeSliderRange,
  quantizeToStep,
  valueToNorm,
  type SliderScaleSpec,
} from './scale';

const closeTo = (actual: number, expected: number, tolerance = 1e-9, message?: string) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, message ?? `${actual} was not within ${tolerance} of ${expected}`);
};

const linear: SliderScaleSpec = { min: 0, max: 100, step: 1, scale: 'linear' };
const originalTimingModel = [
  { trigger: { pattern: [true, false, true, false] }, clockDiv: '1/8', swing: 0 },
];
const changedTimingModel = [
  { trigger: { pattern: [true, false, true, false] }, clockDiv: '1/32', swing: 0.75 },
];
const changedPatternModel = [
  { trigger: { pattern: [false, true, false, true] }, clockDiv: '1/8', swing: 0 },
];
const triggerPatternSyncKey = sequencerTriggerPatternSyncKey(originalTimingModel);
assert.equal(
  sequencerTriggerPatternSyncKey(changedTimingModel),
  triggerPatternSyncKey,
  'sequencer timing-only model changes must not request a destructive step-payload rebuild',
);
assert.notEqual(
  sequencerTriggerPatternSyncKey(changedPatternModel),
  triggerPatternSyncKey,
  'authored trigger-pattern edits must still request a step-payload sync',
);
assert.equal(axisToNormalized(75, 50, 100), 0.25, 'axis gesture math should normalize against its track bounds');
assert.equal(axisToNormalized(25, 50, 100), 0, 'axis gesture math should clamp before the track');
assert.equal(axisToNormalized(175, 50, 100), 1, 'axis gesture math should clamp after the track');
const shiftedRange = shiftRangePreservingWidth({ min: 0.7, max: 0.9 }, 0.5);
closeTo(shiftedRange.min, 0.8, 1e-12, 'range shifting should clamp at the upper bound');
closeTo(shiftedRange.max - shiftedRange.min, 0.2, 1e-12, 'range shifting should preserve width');
assert.equal(getNearestRangeHandle(0.5, { min: 0.2, max: 0.8 }, 0.05), 'both', 'the range band should be draggable');
closeTo(valueToNorm(25, linear), 0.25, 1e-12, 'linear values should normalize into the unit interval');
assert.equal(normToValue(0.25, linear), 25, 'linear normalized values should map back to values');

const logarithmic: SliderScaleSpec = { min: 20, max: 20_000, step: 0.01, scale: 'log' };
closeTo(valueToNorm(200, logarithmic), 1 / 3, 1e-12, 'positive logarithmic values should use log-space');
closeTo(normToValue(1 / 3, logarithmic), 200, 0.005, 'positive logarithmic values should round-trip');

const zeroMinLogarithmic: SliderScaleSpec = { min: 0, max: 100, step: 1, scale: 'log' };
assert.equal(valueToNorm(0, zeroMinLogarithmic), 0, 'zero-min logarithmic sliders should reserve zero for the lower bound');
assert.equal(normToValue(0, zeroMinLogarithmic), 0, 'zero-min logarithmic sliders should map normalized zero to zero');
assert.equal(normToValue(0.5, zeroMinLogarithmic), 10, 'zero-min logarithmic sliders should use the step as their positive floor');
for (const spec of [linear, logarithmic, zeroMinLogarithmic]) {
  for (const norm of [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.99, 1]) {
    const value = normToValue(norm, spec);
    const roundTripValue = normToValue(valueToNorm(value, spec), spec);
    closeTo(
      roundTripValue,
      value,
      Math.max((spec.step ?? 0) * 0.5, 1e-9),
      `normalized/value conversion should round-trip within half a step for ${spec.scale ?? 'linear'} sliders`,
    );
  }
}

assert.deepEqual(normalizeSliderRange(8, 2), [2, 8], 'reversed ranges should be ordered');
assert.equal(valueToNorm(5, { min: 5, max: 5 }), 0, 'collapsed domains should normalize safely');
assert.equal(normToValue(0.8, { min: 5, max: 5 }), 5, 'collapsed domains should preserve their value');
closeTo(quantizeToStep(0.26, { min: 0, max: 1, step: 0.1 }), 0.3, 1e-12, 'values should quantize to the nearest step');

assert.equal(resolveEffectiveSliderValue({ authoredValue: 0.4, mode: 'single' }), 0.4, 'single mode should use the authored value');
closeTo(resolveEffectiveSliderValue({
  authoredValue: 0.4,
  mode: 'walk',
  range: [0.2, 0.8],
  runtimePosition: 0.25,
}), 0.35, 1e-12, 'walk mode should map its runtime position through the range');
closeTo(resolveEffectiveSliderValue({
  authoredValue: 0.4,
  mode: 'sampleHold',
  range: [0.8, 0.2],
  runtimePosition: 0.75,
}), 0.65, 1e-12, 'sample-and-hold mode should normalize reversed ranges');
assert.equal(resolveEffectiveSliderValue({
  authoredValue: 0.4,
  mode: 'walk',
  range: [0.2, 0.8],
  runtimePosition: 0.25,
  runtimeValue: 0.91,
}), 0.91, 'a finite direct runtime value should win');

const legacyDualState = fromLegacyDualState(
  { alpha: 'walk', beta: 'single', gamma: 'sampleHold' },
  { alpha: { min: 0.8, max: 0.2 }, beta: { min: 0, max: 1 } },
);
assert.deepEqual(legacyDualState, {
  alpha: { source: 'a', range: [0.2, 0.8] },
}, 'legacy adapters must omit single modes and modes without ranges');
assert.deepEqual(toLegacyDualState(legacyDualState), {
  sliderModes: { alpha: 'walk' },
  dualRanges: { alpha: { min: 0.2, max: 0.8 } },
}, 'dual configs must round-trip through the existing serialized shape');
const enabledDualState = dualConfigReducer({}, {
  type: 'setConfig',
  key: 'alpha',
  config: configForModulationSource('a', DEFAULT_MODULATION_SOURCE_A, [0.7, 0.3]),
});
assert.deepEqual(enabledDualState.alpha, {
  source: 'a',
  range: [0.3, 0.7],
}, 'assigning Mod A must store only the source and normalized range');
assert.equal(dualConfigReducer({}, {
  type: 'setRange', key: 'missing', range: [0.2, 0.8],
}).missing, undefined, 'a range cannot be created without an existing mode');
assert.deepEqual(
  dualConfigReducer(enabledDualState, {
  type: 'setConfig',
  key: 'alpha',
  config: configForModulationSource('b', DEFAULT_MODULATION_SOURCE_B, [0.3, 0.7]),
  }).alpha,
  { source: 'b', range: [0.3, 0.7] },
  'switching to Mod B must preserve the range without copying Mod B parameters',
);

const randomWalkA = normalizeModulationSourceConfig({
  type: 'walk',
  walk: { relationship: 'free', speed: 0.3 },
}, DEFAULT_MODULATION_SOURCE_A);
const randomWalkB = normalizeModulationSourceConfig({
  type: 'walk',
  walk: { relationship: 'link', speed: 1.8 },
}, DEFAULT_MODULATION_SOURCE_B);
assert.deepEqual(randomWalkA, {
  type: 'walk', walk: { relationship: 'free', speed: 0.3 },
}, 'Mod A must retain its independent Random Walk configuration');
assert.deepEqual(randomWalkB, {
  type: 'walk', walk: { relationship: 'link', speed: 1.8 },
}, 'Mod B must independently retain a different linked Random Walk speed');
assert.deepEqual(normalizeModulationSourceConfig({
  type: 'shape',
  shape: { shape: 'square', timing: { mode: 'sync', reference: 'phrase', division: '1/4' } },
}, DEFAULT_MODULATION_SOURCE_A), {
  type: 'shape',
  shape: { shape: 'square', timing: { mode: 'sync', reference: 'phrase', division: '1/4' } },
}, 'Shape source timing must preserve waveform, Sync reference, and division');

const shapeEvent = createCoreProductModulationRangeEvent(
  { targetId: 0, paramId: 1, controlId: 17 },
  { min: 0.2, max: 0.8 },
  CORE_PRODUCT_MODULATION_RANGE_MODE.shapeLfo,
  0.5,
  {
    runtimeModulation: {
      mode: 'shape',
      source: 'b',
      shape: 'triangle',
      timing: { mode: 'sync', reference: 'phrase', division: '1/4' },
    },
  },
);
assert.equal(
  (shapeEvent.flags! & CORE_PRODUCT_MODULATION_RANGE_FLAGS.shapeMask) >> CORE_PRODUCT_MODULATION_RANGE_FLAGS.shapeShift,
  1,
  'Shape ABI flags must encode Triangle',
);
assert.equal(
  (shapeEvent.flags! & CORE_PRODUCT_MODULATION_RANGE_FLAGS.timingMask) >> CORE_PRODUCT_MODULATION_RANGE_FLAGS.timingShift,
  2,
  'Shape ABI flags must encode Sync timing',
);
assert.ok(
  (shapeEvent.flags! & CORE_PRODUCT_MODULATION_RANGE_FLAGS.syncReferencePhrase) !== 0,
  'Shape ABI flags must encode Phrase reference',
);
assert.equal(
  (shapeEvent.flags! & CORE_PRODUCT_MODULATION_RANGE_FLAGS.syncDivisionMask) >> CORE_PRODUCT_MODULATION_RANGE_FLAGS.syncDivisionShift,
  4,
  'Shape ABI flags must encode the 1/4 division',
);
assert.ok(
  (shapeEvent.flags! & CORE_PRODUCT_MODULATION_RANGE_FLAGS.modulationSourceB) !== 0,
  'Shape ABI flags must preserve the Mod B bus identity',
);

const walkKey = `slider-system:first-position:${Date.now()}`;
mergeRuntimeWalkPositions({ [walkKey]: 0.5 });
assert.equal(getRuntimeSliderPosition(walkKey, 'walk'), 0.5, 'the first default walk position must be inserted');

const valueKey = `slider-system:first-value:${Date.now()}`;
mergeRuntimeValues({ [valueKey]: 0 });
assert.equal(getRuntimeValue(valueKey), 0, 'the first zero runtime value must be inserted');

const keyedSliderA = `slider-system:keyed-slider-a:${Date.now()}`;
const keyedSliderB = `slider-system:keyed-slider-b:${Date.now()}`;
let keyedSliderANotifications = 0;
let keyedSliderBNotifications = 0;
const unsubscribeKeyedSliderA = subscribeRuntimeSliderKey(keyedSliderA, () => {
  keyedSliderANotifications += 1;
});
const unsubscribeKeyedSliderB = subscribeRuntimeSliderKey(keyedSliderB, () => {
  keyedSliderBNotifications += 1;
});
mergeRuntimeWalkPositions({ [keyedSliderA]: 0.25 });
assert.equal(keyedSliderANotifications, 1, 'runtime slider key A should notify its own listener');
assert.equal(keyedSliderBNotifications, 0, 'runtime slider key A must not notify key B');
unsubscribeKeyedSliderA();
unsubscribeKeyedSliderB();

const keyedValueA = `slider-system:keyed-value-a:${Date.now()}`;
const keyedValueB = `slider-system:keyed-value-b:${Date.now()}`;
let keyedValueANotifications = 0;
let keyedValueBNotifications = 0;
const unsubscribeKeyedValueA = subscribeRuntimeValueKey(keyedValueA, () => {
  keyedValueANotifications += 1;
});
const unsubscribeKeyedValueB = subscribeRuntimeValueKey(keyedValueB, () => {
  keyedValueBNotifications += 1;
});
mergeRuntimeValues({ [keyedValueA]: 0.75 });
assert.equal(keyedValueANotifications, 1, 'runtime value key A should notify its own listener');
assert.equal(keyedValueBNotifications, 0, 'runtime value key A must not notify key B');
unsubscribeKeyedValueA();
unsubscribeKeyedValueB();

function seededUnits(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function walkForOneSecond(fps: number): RandomWalkState {
  let state: RandomWalkState = { position: 0.5, velocity: 0, accumulatorSeconds: 0 };
  const random = seededUnits(42);
  for (let frame = 0; frame < fps; frame += 1) {
    state = advanceRandomWalk(state, 1 / fps, 1.25, random);
  }
  return state;
}

const referenceWalk = walkForOneSecond(15);
for (const fps of [30, 60, 120]) {
  const actual = walkForOneSecond(fps);
  closeTo(actual.position, referenceWalk.position, 1e-12, `${fps} FPS should produce the same walk position`);
  closeTo(actual.velocity, referenceWalk.velocity, 1e-12, `${fps} FPS should produce the same walk velocity`);
  closeTo(actual.accumulatorSeconds, referenceWalk.accumulatorSeconds, 1e-12, `${fps} FPS should preserve the same remainder`);
}

let stepCalls = 0;
const initialWalk: RandomWalkState = { position: 0.5, velocity: 0, accumulatorSeconds: 0 };
const shortFrame = advanceRandomWalk(initialWalk, 0.099, 1, () => { stepCalls += 1; return 0.75; });
assert.equal(stepCalls, 0, 'a frame shorter than 100 ms must not walk');
const oneTick = advanceRandomWalk(shortFrame, 0.001, 1, () => { stepCalls += 1; return 0.75; });
assert.equal(stepCalls, 1, 'an accumulated 100 ms interval must walk exactly once');
advanceRandomWalk(oneTick, 60, 1, () => { stepCalls += 1; return 0.75; });
assert.equal(stepCalls, 7, 'a hidden-tab stall must add no more than six catch-up steps');

const automationBase = {
  key: 'visualizer:test',
  baseValue: 0.5,
  minValue: 0,
  maxValue: 1,
  mode: 'walk' as const,
  lowerBound: 0.2,
  upperBound: 0.8,
  nowSeconds: 0,
  deltaSeconds: 0.016,
  triggerAmount: 0,
  seed: 123,
  state: undefined,
  walkMode: 'localBrownian' as const,
  walkSpeed: 1,
};
const firstAutomationFrame = resolveDualSliderAutomation(automationBase);
assert.equal(firstAutomationFrame.value, 0.5, 'the first visualizer frame below 100 ms must preserve its base value');
const firstAutomationTick = resolveDualSliderAutomation({
  ...automationBase,
  nowSeconds: 0.1,
  deltaSeconds: 0.084,
  state: firstAutomationFrame.state,
});
assert.equal(firstAutomationTick.state.stepIndex, 1, 'visualizer automation should take one deterministic step after 100 ms');

let visualizerKeyANotifications = 0;
let visualizerKeyBNotifications = 0;
const unsubscribeVisualizerA = subscribeVisualizerIndicator('motion', () => {
  visualizerKeyANotifications += 1;
});
const unsubscribeVisualizerB = subscribeVisualizerIndicator('brightness', () => {
  visualizerKeyBNotifications += 1;
});
publishVisualizerIndicator('motion', { automationPosition: 0.4, modulatedPosition: 0.6 });
publishVisualizerIndicator('motion', { automationPosition: 0.4005, modulatedPosition: 0.6005 });
assert.equal(visualizerKeyANotifications, 1, 'visualizer indicators should suppress visually equivalent snapshots');
assert.equal(visualizerKeyBNotifications, 0, 'visualizer indicator key A must not notify key B');
unsubscribeVisualizerA();
unsubscribeVisualizerB();

let nextFrameId = 1;
const scheduledFrames = new Map<number, FrameRequestCallback>();
const emittedValues: number[] = [];
const emitter = createRafCoalescedEmitter<number>(
  (value) => emittedValues.push(value),
  (callback) => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    scheduledFrames.set(frameId, callback);
    return frameId;
  },
  (frameId) => {
    scheduledFrames.delete(frameId);
  },
);
for (let value = 0; value < 50; value += 1) emitter.schedule(value);
assert.equal(scheduledFrames.size, 1, 'fifty pointer updates should schedule one animation frame');
assert.deepEqual(emittedValues, [], 'frame-coalesced updates should not emit before the animation frame');
const firstScheduledFrame = scheduledFrames.entries().next().value as [number, FrameRequestCallback];
scheduledFrames.delete(firstScheduledFrame[0]);
firstScheduledFrame[1](16);
assert.deepEqual(emittedValues, [49], 'the animation frame should emit only the newest pointer value');

emitter.schedule(50);
emitter.flush(51);
assert.deepEqual(emittedValues, [49, 51], 'pointer up should flush the exact final value');
assert.equal(scheduledFrames.size, 0, 'flushing should cancel the pending frame');

emitter.schedule(52);
emitter.cancel();
assert.deepEqual(emittedValues, [49, 51], 'pointer cancel should discard its pending value');
assert.equal(scheduledFrames.size, 0, 'pointer cancel should clear the pending frame');

let bridgeState: Record<string, unknown> = { randomWalkMode: 'localBrownian', randomWalkSpeed: 1 };
let postedRangeEvents = 0;
const rangeBridge = new CoreProductModulationRangeBridge({
  isRuntimeReady: () => true,
  latestProductSnapshot: () => null,
  latestSliderState: () => bridgeState,
  post: () => { postedRangeEvents += 1; },
  publish: () => undefined,
  reportUnsupportedRangeKey: (key) => { throw new Error(`unexpected unsupported range key: ${key}`); },
});
const initialBridgeRanges = {
  synthLevel: { min: 0.2, max: 0.8 },
  pad2Level: { min: 0.1, max: 0.7 },
};
rangeBridge.setRuntimeWalkRanges(initialBridgeRanges);
assert.equal(postedRangeEvents, 3, 'initial ranges should publish each resolved product target once');
rangeBridge.setRuntimeWalkRanges(initialBridgeRanges);
assert.equal(postedRangeEvents, 3, 'unchanged ranges should publish zero events');
rangeBridge.setRuntimeWalkRanges({
  ...initialBridgeRanges,
  pad2Level: { min: 0.15, max: 0.75 },
});
assert.equal(postedRangeEvents, 4, 'one changed range should publish only that range target');
bridgeState = { randomWalkMode: 'localBrownian', randomWalkSpeed: 2 };
rangeBridge.setRuntimeWalkRanges({
  ...initialBridgeRanges,
  pad2Level: { min: 0.15, max: 0.75 },
});
assert.equal(postedRangeEvents, 7, 'walk-speed changes should refresh every affected walk target once');
rangeBridge.setRuntimeWalkRanges({ synthLevel: initialBridgeRanges.synthLevel });
assert.equal(postedRangeEvents, 7, 'removing a shared range should not disable a target still owned by another range');

{
  let bridgeState: Record<string, unknown> = {
    chordRate: 0.25,
    randomWalkMode: 'localBrownian',
    randomWalkSpeed: 1,
  };
  const events: Array<{ value4?: number; value3?: number; targetId?: number; paramId?: number; index?: number }> = [];
  const publishedPositions: Record<string, number>[] = [];
  const statePatches: Record<string, number>[] = [];
  const bridge = new CoreProductModulationRangeBridge({
    isRuntimeReady: () => true,
    latestProductSnapshot: () => null,
    latestSliderState: () => bridgeState,
    post: (event) => events.push(event),
    hasCallback: () => true,
    publish: (name, payload) => {
      if (name === 'runtimeWalkPositions' && payload && typeof payload === 'object') {
        publishedPositions.push({ ...(payload as Record<string, number>) });
      }
    },
    reportUnsupportedRangeKey: (key) => { throw new Error(`unexpected unsupported range key: ${key}`); },
    applyRuntimeWalkStatePatch: (patch) => statePatches.push({ ...patch }),
  });

  bridge.setRuntimeWalkRanges({ chordRate: { min: 2, max: 8 } });
  assert.equal(events[0]?.value4, 5, 'a new random walk must seed from its range midpoint');
  assert.deepEqual(bridge.getRuntimeWalkPositions(), { chordRate: 0.5 }, 'new random walk activation must own a normalized midpoint');
  assert.deepEqual(publishedPositions[publishedPositions.length - 1], { chordRate: 0.5 }, 'walk midpoint must be published to the UI at activation');
  assert.deepEqual(statePatches[statePatches.length - 1], { chordRate: 5 }, 'walk midpoint must patch the raw slider state at activation');

  bridge.updateRuntimeWalkPositions({ runtimeWalkValues: { [events[0]!.index!]: 7 } } as CoreProductTelemetrySnapshot, { publish: false });
  bridgeState = { ...bridgeState, chordRate: 0.25 };
  bridge.setRuntimeWalkRanges({ chordRate: { min: 4, max: 10 } });
  assert.equal(events[events.length - 1]?.value4, 7, 'endpoint edits must preserve the running random-walk value instead of the scalar state');
  assert.deepEqual(bridge.getRuntimeWalkPositions(), { chordRate: 0.5 }, 'preserved walk values must be renormalized into edited endpoints');
  assert.deepEqual(statePatches[statePatches.length - 1], { chordRate: 7 }, 'endpoint edits must keep the state patch aligned with the running value');

  bridge.setRuntimeWalkRanges({});
  assert.deepEqual(bridge.getRuntimeWalkPositions(), {}, 'removing a walk must clear its stale normalized position');
  assert.deepEqual(publishedPositions[publishedPositions.length - 1], {}, 'walk removal must publish stale-position cleanup');

  bridgeState = { ...bridgeState, chordRate: 3 };
  bridge.setRuntimeWalkRanges({ chordRate: { min: 2, max: 6 } });
  assert.equal(events[events.length - 1]?.value4, 4, 're-enabling a walk must not reuse a stale prior current value, even when the scalar is inside the range');

  const sampleHoldEvents: Array<{ value4?: number }> = [];
  const sampleHoldBridge = new CoreProductModulationRangeBridge({
    isRuntimeReady: () => true,
    latestProductSnapshot: () => null,
    latestSliderState: () => ({ synthAttack: 0.95 }),
    post: (event) => sampleHoldEvents.push(event),
    publish: () => undefined,
    reportUnsupportedRangeKey: (key) => { throw new Error(`unexpected unsupported range key: ${key}`); },
  });
  sampleHoldBridge.setSampleHoldRanges({ synthAttack: { min: 0.2, max: 0.8 } });
  assert.equal(sampleHoldEvents[0]?.value4, 0.5, 'a new sample-and-hold range must seed from its range midpoint');

  const modeSwitchEvents: Array<{ value3?: number; value4?: number; index?: number }> = [];
  const modeSwitchBridge = new CoreProductModulationRangeBridge({
    isRuntimeReady: () => true,
    latestProductSnapshot: () => null,
    latestSliderState: () => ({ delayAMix: 0.1, randomWalkMode: 'localBrownian', randomWalkSpeed: 1 }),
    post: (event) => modeSwitchEvents.push(event),
    publish: () => undefined,
    reportUnsupportedRangeKey: (key) => { throw new Error(`unexpected unsupported range key: ${key}`); },
  });
  modeSwitchBridge.setRuntimeWalkRanges({ delayAMix: { min: 0.2, max: 0.8 } });
  modeSwitchBridge.updateRuntimeWalkPositions({ runtimeWalkValues: { [modeSwitchEvents[0]!.index!]: 0.68 } } as CoreProductTelemetrySnapshot, { publish: false });
  modeSwitchBridge.setSampleHoldRanges({ delayAMix: { min: 0.2, max: 0.8 } });
  assert.equal(modeSwitchEvents[modeSwitchEvents.length - 1]?.value4, 0.68, 'mode switches must transfer the running walk current into sample-and-hold');
  modeSwitchBridge.setRuntimeWalkRanges({});
  assert.equal(
    modeSwitchEvents[modeSwitchEvents.length - 1]?.value3,
    CORE_PRODUCT_MODULATION_RANGE_MODE.sampleHold,
    'walk-to-sample-and-hold removal must not trail the active sample-and-hold event with an off event',
  );
  assert.equal(modeSwitchBridge.getRuntimeWalkDebugState().activeControlNameCount, 0, 'walk metadata must be cleared after mode switch');
  assert.deepEqual(modeSwitchBridge.getRuntimeWalkPositions(), {}, 'mode switch must clear stale walk positions');
}
