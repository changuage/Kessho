import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoreProductSnapshot } from '../../coreProductSnapshot';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';
import {
  compileProductSceneProgram,
  createCoreProductScenePositionEvent,
  createCoreProductSceneProgramEvents,
  evaluateProductSceneEntry,
} from './compileProductSceneProgram';

test('compiles paired snapshot diffs into bounded scene entries', () => {
  const endpointA = createCoreProductSnapshot({
    padEnabled: false,
    synthLevel: 0.2,
    reverbMix: 0.1,
  });
  const endpointB = createCoreProductSnapshot({
    padEnabled: true,
    synthLevel: 0.8,
    reverbMix: 0.7,
  });
  endpointA.assetRefs = [7, 3, 9];
  endpointB.assetRefs = [7, 3, 9];
  const program = compileProductSceneProgram(endpointA, endpointB);
  assert.deepEqual(program.unsupportedKeys, []);
  assert.deepEqual(program.requiredAssetIds, [3, 7, 9]);
  const level = program.entries.find((entry) => entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLevel && entry.targetId === 1);
  assert.ok(level);
  assert.equal(level.interpolation, 'linear');
  assert.equal(level.valueA, 0);
  assert.ok(Math.abs(level.valueB - endpointB.sources[0]!.level) < 1e-7);
  const enabled = program.entries.find((entry) => entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceEnabled && entry.targetId === 1);
  assert.equal(enabled?.interpolation, 'enable-gate');
  const upload = createCoreProductSceneProgramEvents(program);
  assert.equal(upload.length, 2 + program.entries.length + program.boundaryCommands.length * 2);
  assert.ok(program.revision > 0);
});

test('compiles asset-reference changes into a preloaded union and gain entries', () => {
  const endpointA = createCoreProductSnapshot({ sample1Library: 'piano' });
  const endpointB = createCoreProductSnapshot({ sample1Library: 'strings' });
  endpointA.assetRefs = [1001];
  endpointB.assetRefs = [2001];
  endpointA.assetRefLevels = [0.8];
  endpointB.assetRefLevels = [0.6];
  const program = compileProductSceneProgram(endpointA, endpointB);
  assert.deepEqual(program.unsupportedKeys, []);
  assert.deepEqual(program.requiredAssetIds, [1001, 2001]);
  assert.ok(program.entries.some((entry) => entry.targetId === 0x51000000 + 1001 && entry.valueA === 0.8 && entry.valueB === 0));
  assert.ok(program.entries.some((entry) => entry.targetId === 0x51000000 + 2001 && entry.valueA === 0 && entry.valueB === 0.6));
  assert.doesNotThrow(() => createCoreProductSceneProgramEvents(program));
});

test('switches categorical uint parameters without interpolating through invalid enum values', () => {
  const endpointA = createCoreProductSnapshot({
    sample1Enabled: true,
    sample1LibraryKey: 'piano',
    sample1DynamicMode: 'velocity',
  });
  const endpointB = createCoreProductSnapshot({
    sample1Enabled: true,
    sample1LibraryKey: 'soft-string-spurs',
    sample1DynamicMode: 'fixed',
  });
  endpointA.synthLanes[0]!.stepCount = 8;
  endpointB.synthLanes[0]!.stepCount = 12;
  const program = compileProductSceneProgram(endpointA, endpointB);
  assert.deepEqual(program.unsupportedKeys, []);
  assert.equal(
    program.entries.find((entry) => entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceSampleLibraryId)?.interpolation,
    'discrete-a',
  );
  assert.equal(
    program.entries.find((entry) => entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceSampleDynamicMode)?.interpolation,
    'discrete-a',
  );
  assert.equal(
    program.entries.find((entry) => entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SequencerLaneStepCount)?.interpolation,
    'linear',
  );
});

test('validates scene position at the host boundary', () => {
  assert.equal(createCoreProductScenePositionEvent(0.375).value, 0.375);
  assert.throws(() => createCoreProductScenePositionEvent(1.01), RangeError);
});

test('matches the production morph oracle at seven boundary-focused positions', () => {
  const endpointA = createCoreProductSnapshot({
    padEnabled: false,
    synthLevel: 0.2,
    pad1ReverbSend: 0.4,
    sample1LibraryKey: 'piano',
  });
  const endpointB = createCoreProductSnapshot({
    padEnabled: true,
    synthLevel: 0.8,
    pad1ReverbSend: 0.6,
    sample1LibraryKey: 'soft-string-spurs',
  });
  const program = compileProductSceneProgram(endpointA, endpointB);
  assert.deepEqual(program.unsupportedKeys, []);
  const sourceLevel = program.entries.find((entry) => (
    entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceLevel && entry.targetId === 1
  ));
  const sourceEnabled = program.entries.find((entry) => (
    entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceEnabled && entry.targetId === 1
  ));
  const sampleLibrary = program.entries.find((entry) => (
    entry.paramId === KESSHO_PRODUCT_PARAM_IDS.SourceSampleLibraryId
  ));
  assert.ok(sourceLevel && sourceEnabled && sampleLibrary);
  const positions = [0, 0.25, 0.49, 0.5, 0.51, 0.75, 1];
  for (const position of positions) {
    assert.ok(Math.abs(evaluateProductSceneEntry(sourceLevel, position) - 0.8 * position) < 1e-6);
    assert.equal(evaluateProductSceneEntry(sourceEnabled, position), position === 0 ? 0 : 1);
    assert.equal(
      evaluateProductSceneEntry(sampleLibrary, position),
      position < 0.5 ? sampleLibrary.valueA : sampleLibrary.valueB,
    );
  }
});
