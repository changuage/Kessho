#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} is missing production interaction token: ${token}`);
  }
}

const browserRuntime = read('scripts/check-kessho-product-browser-runtime.mjs');
const appSource = read('src/App.tsx');
const packageJson = JSON.parse(read('package.json'));
const sampleHoldMatrix = read('docs/product-core/sample-hold-parity-matrix.md');

requireTokens('scripts/check-kessho-product-browser-runtime.mjs', [
  'captureEarthTextureProbe',
  'assertEarthTextureProbe',
  'earth-texture-ui',
  "const requiredKeys = ['waves', 'birds', 'birds2', 'frogs']",
  'textureParamsAvailable === true',
  'parityFixture === false',
  'slice.offset > 0',
  'slice.detuneCents',
  'slice.speedMultiplier',
  'captureRuntimeWalkProbe',
  'assertRuntimeWalkProbe',
  'runtime-walk-ui',
  "const key = 'lead1Density'",
  "activeTab: 'synth'",
  "leadRandomSource: 'piano'",
  "'runtime-walk piano random timing did not publish pianoDistance trigger animation'",
  'distinctPositions.length >= 3',
  'runtimeSliderDebug.walkIndicatorConsumeCount',
  'captureSampleHoldProbe',
  'assertSampleHoldProbe',
  'sample-hold-ui',
  'triggerStoreUpdateCount',
  'triggerFlashUpdateCount',
  'triggerIndicatorConsumeCount',
  'assertCleanProbeDiagnostics',
  'unsupportedControlCount === 0',
  'unsupportedGetterCount === 0',
  'runtimeFallbackDiagnosticCount === 0',
  'audioCriticalFallbackCount === 0',
  "reason === 'ui-control-change'",
  "reason === 'fx-control-change'",
  "reason === 'morph-control-change'",
]);

for (const token of [
  "const shouldMirrorRuntimeWalkPositions = productRuntimeMode === 'core-product'",
  'setProductRuntimeWalkPositionsCallback',
  'shouldMirrorRuntimeWalkPositions,',
]) {
  assert(appSource.includes(token), `App.tsx must keep product-core runtime-walk UI mirroring wired through product runtime coordination: ${token}`);
}

requireTokens('src/audio/coreProductEvents.ts', [
  'CORE_PRODUCT_CONTROL_ONLY_MODULATION_TARGET_ID',
  'CORE_PRODUCT_ARRANGEMENT_RUNTIME_WALK_KEYS',
  'CORE_PRODUCT_LIVE_TRIGGER_RUNTIME_WALK_KEYS',
  'isCoreProductRuntimeWalkStatePatchKey',
  "'lead1Density'",
  "'lead1Octave'",
  "'lead1OctaveRange'",
  'controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneProbability, key)',
  'controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, key)',
  'controlOnlyRangeTarget(KESSHO_PRODUCT_PARAM_IDS.SequencerLaneHoldSeconds, key)',
]);

requireTokens('src/audio/product/host/CoreProductModulationRangeBridge.ts', [
  'isCoreProductRuntimeWalkStatePatchKey',
  'applyRuntimeWalkStatePatch',
  'publishRuntimeWalkStatePatch',
]);

requireTokens('src/audio/product/host/CoreProductArrangementBridge.ts', [
  'runtimeWalkStatePatch',
  'setRuntimeWalkStatePatch',
  '...this.runtimeWalkStatePatch',
]);

requireTokens('src/audio/coreProductArrangementScheduler.ts', [
  'publishManualNoteTrigger',
  "this.publishTrigger('pianoDistance'",
  "this.publishTrigger('leadDistance'",
  "this.publishTrigger('padDistance'",
]);

requireTokens('cpp/KesshoCore/src/product/sources/SourceModulation.cpp', [
  'kProductControlOnlyModulationTarget',
  'control_only',
]);

for (const token of [
  'Delay A',
  'Delay B',
  'Granular',
  'Reverb',
  'UI flash/trigger indicator',
  '| pass |',
]) {
  assert(sampleHoldMatrix.includes(token), `sample-hold matrix missing ${token}`);
}

requireTokens('cpp/KesshoCore/tests/ProductAssetTests.cpp', [
  'makeTextureSoundscapeSnapshot',
  'normal soundscape texture mode did not schedule 20 slices',
  'soundscape texture recent-offset avoidance did not keep distinct offsets',
  'soundscape texture detune variation stayed neutral in normal mode',
  'soundscape texture speed variation stayed neutral in normal mode',
  'KESSHO_PRODUCT_EARTH_TEXTURE_REASON_PARITY_FIXTURE_ENABLED',
  'KESSHO_PRODUCT_EARTH_TEXTURE_REASON_ASSET_TOO_SHORT',
]);

requireTokens('cpp/KesshoCore/tests/ProductSampleHoldParityTests.cpp', [
  'requireTimedGlobalParam',
  'requireSourceTriggerRanges',
  'requireDrumTriggerRanges',
  'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_A',
  'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_DELAY_B',
  'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_GRANULAR',
  'KESSHO_PRODUCT_MODULATION_RANGE_TRIGGER_REVERB',
]);

assert(
  packageJson.scripts?.['core:product:production-interactions'] === 'node scripts/check-kessho-product-production-interactions.mjs',
  'package.json must expose core:product:production-interactions',
);

assert(
  !browserRuntime.includes('web-ts') && !browserRuntime.includes('referenceAudioRuntime'),
  'production interaction gate must not route through reference/web-ts runtime',
);

console.log('Kessho Product production interaction gate checks passed');
