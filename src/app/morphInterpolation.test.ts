import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMorphPairPreparer,
  evaluatePreparedMorphPair,
  prepareMorphPair,
  type MorphInterpolationPreset,
} from './morphInterpolation';
import { DEFAULT_STATE, type SliderState } from '../ui/state';

function makePreset(overrides: Partial<SliderState>, extras: Partial<MorphInterpolationPreset> = {}): MorphInterpolationPreset {
  return {
    state: { ...DEFAULT_STATE, ...overrides },
    ...extras,
  };
}

test('prepared morphs preserve endpoint direction, off-side fades, dual ranges and CoF drift', () => {
  const presetA = makePreset({
    padEnabled: false,
    synthLevel: 0.2,
    rootNote: 4,
    cofDriftEnabled: true,
  }, {
    dualRanges: { delayATime: { min: 100, max: 200 } },
    sliderModes: { delayATime: 'walk' },
    dualSliderConfigs: { delayATime: { source: 'a', range: [100, 200] } },
  });
  const presetB = makePreset({
    padEnabled: true,
    synthLevel: 0.8,
    rootNote: 7,
    cofDriftEnabled: true,
  }, {
    dualRanges: { delayATime: { min: 300, max: 500 } },
    sliderModes: { delayATime: 'sampleHold' },
    dualSliderConfigs: { delayATime: { source: 'b', range: [300, 500] } },
  });
  const prepared = prepareMorphPair(presetA, presetB);

  const atA = evaluatePreparedMorphPair(prepared, 0, 1, undefined, 'toB');
  const nearA = evaluatePreparedMorphPair(prepared, 1, 1, undefined, 'toB');
  const middle = evaluatePreparedMorphPair(prepared, 50, 1, undefined, 'toB');
  const nearB = evaluatePreparedMorphPair(prepared, 99, 1, undefined, 'toA');
  const atB = evaluatePreparedMorphPair(prepared, 100, 1, undefined, 'toA');
  const reverseNearA = evaluatePreparedMorphPair(prepared, 1, 1, undefined, 'toA');
  const reverseMiddle = evaluatePreparedMorphPair(prepared, 50, 1, undefined, 'toA');
  const reverseAtA = evaluatePreparedMorphPair(prepared, 0, 1, undefined, 'toA');

  assert.equal(atA.state.synthLevel, atA.endpointStateA.synthLevel);
  assert.equal(atB.state.synthLevel, atB.endpointStateB.synthLevel);
  assert.equal(nearA.state.synthLevel, 0.8 * 0.01);
  assert.equal(nearB.state.synthLevel, 0.8 * 0.99);
  assert.equal(middle.state.synthLevel, 0.8 * 0.5);
  assert.equal(reverseNearA.state.synthLevel, 0.8 * 0.01);
  assert.equal(reverseMiddle.state.synthLevel, middle.state.synthLevel);
  assert.equal(reverseAtA.state.synthLevel, reverseAtA.endpointStateA.synthLevel);
  assert.deepEqual(middle.dualRanges.delayATime, { min: 200, max: 350 });
  assert.equal(middle.dualModes.delayATime, 'sampleHold');
  assert.deepEqual(middle.dualConfigs.delayATime, { source: 'b', range: [200, 350] });
  assert.ok(middle.morphCoFInfo);
  assert.notEqual(middle.morphCoFInfo.startRoot, presetA.state.rootNote);
  assert.equal(reverseAtA.morphCoFInfo?.targetRoot, presetA.state.rootNote);
});

test('same-name drafts interpolate and preparation keys use endpoint content references', () => {
  const stateA = { ...DEFAULT_STATE, synthLevel: 0.1 };
  const stateB = { ...DEFAULT_STATE, synthLevel: 0.9 };
  const presetA = { name: 'same', state: stateA } as MorphInterpolationPreset;
  const presetB = { name: 'same', state: stateB } as MorphInterpolationPreset;
  const prepared = prepareMorphPair(presetA, presetB);
  const middle = evaluatePreparedMorphPair(prepared, 50);
  assert.equal(middle.state.synthLevel, 0.5);

  let preparationCount = 0;
  const preparer = createMorphPairPreparer((left, right) => {
    preparationCount += 1;
    return prepareMorphPair(left, right);
  });
  const fallbackState = { ...DEFAULT_STATE, synthLevel: 0.2 };
  const fallbackRanges = { delayATime: { min: 10, max: 20 } };
  const fallbackModes = { delayATime: 'walk' as const };
  const fallbackConfigs = { delayATime: { source: 'a' as const, range: [10, 20] as [number, number] } };
  const fallbackA = {
    name: 'Current',
    state: fallbackState,
    dualRanges: fallbackRanges,
    sliderModes: fallbackModes,
    dualSliderConfigs: fallbackConfigs,
  } as MorphInterpolationPreset;
  const fallbackBRanges = { delayATime: { min: 30, max: 40 } };
  const fallbackBModes = { delayATime: 'sampleHold' as const };
  const fallbackBConfigs = { delayATime: { source: 'b' as const, range: [30, 40] as [number, number] } };
  const fallbackB = {
    name: 'same',
    state: stateB,
    dualRanges: fallbackBRanges,
    sliderModes: fallbackBModes,
    dualSliderConfigs: fallbackBConfigs,
  } as MorphInterpolationPreset;

  let currentA = fallbackA;
  let currentB = fallbackB;
  const initialPrepared = preparer.get(currentA, currentB);
  evaluatePreparedMorphPair(initialPrepared, 0);
  evaluatePreparedMorphPair(initialPrepared, 50);
  preparer.get(
    { ...fallbackA, name: 'new wrapper' } as MorphInterpolationPreset,
    { ...fallbackB, name: 'new wrapper' } as MorphInterpolationPreset,
  );
  assert.equal(preparationCount, 1, 'repeated evaluation and wrapper/name changes do not invalidate the pair');

  currentA = { ...currentA, state: { ...currentA.state, synthLevel: 0.3 } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 2, 'state replacement invalidates preparation');
  currentA = { ...currentA, dualRanges: { delayATime: { min: 20, max: 30 } } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 3, 'range replacement invalidates preparation');
  currentA = { ...currentA, sliderModes: { delayATime: 'sampleHold' } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 4, 'mode replacement invalidates preparation');
  currentA = { ...currentA, dualSliderConfigs: { delayATime: { source: 'b', range: [0, 1] } } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 5, 'config replacement invalidates preparation');
  currentB = { ...currentB, state: { ...currentB.state, synthLevel: 0.8 } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 6, 'B-side state replacement invalidates preparation');
  currentB = { ...currentB, dualRanges: { delayATime: { min: 40, max: 50 } } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 7, 'B-side range replacement invalidates preparation');
  currentB = { ...currentB, sliderModes: { delayATime: 'walk' } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 8, 'B-side mode replacement invalidates preparation');
  currentB = { ...currentB, dualSliderConfigs: { delayATime: { source: 'a', range: [40, 50] } } };
  preparer.get(currentA, currentB);
  assert.equal(preparationCount, 9, 'B-side config replacement invalidates preparation');
});
