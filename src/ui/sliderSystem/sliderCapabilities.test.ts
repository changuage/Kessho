import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveCoreProductRangeTargets } from '../../audio/coreProductEvents';
import { EARTH_RANGE_PARAM_KEYS } from '../../presets/ParamRegistry';
import * as dynamicsControlSchema from '../dynamics/dynamicsControlSchema';
import { EROSION_MOD_MATRIX_KEYS } from '../dynamics/dynamicsPresets';
import { ROUTING_SOURCE_REGISTRY } from '../routing/routingSourceRegistry';
import { DEFAULT_STATE, getParamInfo, getSliderNumericValue, type SliderState } from '../state';
import {
  getSliderCapability,
  isSliderModeAllowed,
  normalizeSliderMode,
  SLIDER_CAPABILITIES,
  SINGLE_ONLY_SLIDER_KEYS,
  WALK_ONLY_DUAL_KEYS,
} from './sliderCapabilities';

const ROOT = process.cwd();
const SLIDER_MODES = ['single', 'walk', 'sampleHold', 'shape'] as const;

function sharedLiteralKeys(): Set<string> {
  const keys = new Set<string>();
  const uiRoot = path.join(ROOT, 'src/ui');
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      if (!entry.isFile() || !/\.(?:tsx|ts)$/.test(entry.name)) continue;
      const source = fs.readFileSync(full, 'utf8');
      // These are the two literal forms used by shared Slider call sites.
      for (const match of source.matchAll(/sliderProps\(\s*['"]([^'"]+)['"]/g)) if (match[1]) keys.add(match[1]);
      for (const match of source.matchAll(/paramKey\s*=\s*(?:\{\s*)?['"]([^'"]+)['"]/g)) if (match[1]) keys.add(match[1]);
    }
  };
  visit(uiRoot);
  return keys;
}

test('shared literal slider inventory is explicitly classified', () => {
  const unclassified = [...sharedLiteralKeys()]
    .filter((key) => getParamInfo(key as keyof SliderState) && !getSliderCapability(key));
  assert.deepEqual(unclassified, [], `unclassified shared slider keys: ${unclassified.join(', ')}`);
});

test('every explicit dual Product key has a runtime range target', () => {
  const missingTargets = Object.entries(SLIDER_CAPABILITIES)
    .filter(([, capability]) => capability === 'dual')
    .map(([key]) => key)
    .filter((key) => resolveCoreProductRangeTargets(key).length === 0);
  assert.deepEqual(missingTargets, [], `dual keys without Product range targets: ${missingTargets.join(', ')}`);
});

test('capability sets stay disjoint and mode policy is stable', () => {
  for (const key of SINGLE_ONLY_SLIDER_KEYS) {
    assert.equal(getSliderCapability(key), 'single');
  }
  for (const key of WALK_ONLY_DUAL_KEYS) {
    assert.equal(getSliderCapability(key), 'walk-only');
    assert.equal(isSliderModeAllowed(key, 'sampleHold'), false, `${key} must reject Sample & Hold`);
    assert.equal(isSliderModeAllowed(key, 'walk'), true, `${key} must retain Random Walk`);
    assert.equal(isSliderModeAllowed(key, 'shape'), true, `${key} must allow Shape LFO`);
    assert.equal(normalizeSliderMode(key, 'sampleHold'), 'walk', `${key} legacy S&H must migrate to Walk`);
  }
  for (const [key, capability] of Object.entries(SLIDER_CAPABILITIES)) {
    if (WALK_ONLY_DUAL_KEYS.has(key)) assert.equal(capability, 'walk-only');
    if (SINGLE_ONLY_SLIDER_KEYS.has(key)) assert.equal(capability, 'single');
  }
});

test('every classified parameter supports exactly its slider modes and runtime range policy', () => {
  const failures: string[] = [];
  const counts = { single: 0, 'walk-only': 0, dual: 0 };

  for (const key of Object.keys(DEFAULT_STATE)) {
    const info = getParamInfo(key as keyof SliderState);
    const capability = getSliderCapability(key);
    if (!info || !capability) continue;
    counts[capability] += 1;

    const value = getSliderNumericValue(key as keyof SliderState, DEFAULT_STATE[key as keyof SliderState]);
    if (!Number.isFinite(info.min) || !Number.isFinite(info.max) || !Number.isFinite(info.step)
      || info.min >= info.max || info.step <= 0) failures.push(`${key}: invalid slider range`);
    if (value === null || value < info.min || value > info.max) failures.push(`${key}: default outside slider range`);
    if (capability !== 'single' && resolveCoreProductRangeTargets(key).length === 0) {
      failures.push(`${key}: missing Product modulation target`);
    }

    for (const mode of SLIDER_MODES) {
      const allowed = capability === 'dual'
        || mode === 'single'
        || (capability === 'walk-only' && (mode === 'walk' || mode === 'shape'));
      if (isSliderModeAllowed(key, mode) !== allowed) failures.push(`${key}: incorrect ${mode} policy`);

      const expectedNormalized = mode === 'single'
        ? 'single'
        : capability === 'single'
          ? undefined
          : capability === 'walk-only' && mode === 'sampleHold' ? 'walk' : mode;
      if (normalizeSliderMode(key, mode) !== expectedNormalized) failures.push(`${key}: incorrect ${mode} migration`);
    }
  }

  assert.ok(counts.single > 0 && counts['walk-only'] > 0 && counts.dual > 0, 'all slider capability families must be exercised');
  assert.deepEqual(failures, []);
});

test('dynamic audit families are classified', () => {
  const single = [
    'sample1MaxVoices', 'sample2MaxVoices',
    'granularV1Slice', 'granularV2Slice', 'granularV3Slice', 'granularV4Slice',
    'padTensionValue', 'leadTensionValue', 'synthEuclidTensionValue',
    'granularTensionValue', 'reverbTensionValue', 'drumTensionValue',
    'sidechainSample1Target', 'sidechainSample2Target', 'driftWetHp',
  ];
  for (const key of single) assert.equal(getSliderCapability(key), 'single', key);
  for (const key of ['lead1Attack', 'lead2Hold', 'sample1AttackMs', 'sample2ReleaseMs', 'granularV1Speed', 'granularV4Gain', 'granularNatureSend', 'drumKickDistance', 'earthLevel', 'oceanSampleLevel', 'nature4FilterCutoff', 'insectsLevel']) {
    assert.equal(getSliderCapability(key), 'dual', key);
  }
  for (const key of [
    'driftDepth', 'driftRate', 'driftStereo',
    'degradeHp', 'degradeLp',
    'erosionAge', 'erosionWow', 'erosionFlutter',
    'masterSaturationDrive',
    'endCompThreshold', 'endCompRatio', 'endCompKnee', 'endCompMix',
    'sidechainThreshold', 'driftMix', 'erosionCorrosion', 'masterSaturationTone',
  ]) {
    assert.equal(getSliderCapability(key), 'dual', key);
    assert.notEqual(resolveCoreProductRangeTargets(key).length, 0, `${key} should resolve a Product range target`);
  }
});

test('routing Freeze sends support dual sliders', () => {
  const keys = [
    'spectralFreezePad1Send', 'spectralFreezePad2Send',
    'spectralFreezeLead1Send', 'spectralFreezeLead2Send',
    'spectralFreezeSample1Send', 'spectralFreezeSample2Send',
    'spectralFreezeDrumSend', 'spectralFreezeWavesSend',
    'spectralFreezeNatureSend', 'spectralFreezeWaterSend', 'spectralFreezeInsectsSend',
  ];
  for (const key of keys) {
    assert.equal(getSliderCapability(key), 'dual', key);
    assert.notEqual(resolveCoreProductRangeTargets(key).length, 0, `${key} should resolve a Product range target`);
  }
});

test('every target-backed routing matrix control supports dual sliders', () => {
  const keys = [...new Set(ROUTING_SOURCE_REGISTRY.flatMap((source) => [
    source.levelKey,
    ...Object.values(source.sends),
  ]))];
  const scalar = keys
    .filter((key) => resolveCoreProductRangeTargets(key).length > 0)
    .filter((key) => getSliderCapability(key) !== 'dual');
  assert.deepEqual(scalar, [], `target-backed routing controls without dual sliders: ${scalar.join(', ')}`);
});

test('every data-driven Dynamics slider supports dual ranges', () => {
  const keys = new Set<string>(EROSION_MOD_MATRIX_KEYS);
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(collect);
    if (!value || typeof value !== 'object') return;
    const entry = value as Record<string, unknown>;
    if (entry.kind === 'slider' && typeof entry.key === 'string') keys.add(entry.key);
    else Object.values(entry).forEach(collect);
  };
  collect(dynamicsControlSchema);
  const invalid = [...keys].filter((key) => (
    getSliderCapability(key) !== 'dual' || resolveCoreProductRangeTargets(key).length === 0
  ));
  assert.deepEqual(invalid, [], `Dynamics sliders without dual Product ranges: ${invalid.join(', ')}`);
});

test('dynamic numeric families never advertise dual without a Product target', () => {
  const dynamicFamily = /^(?:sample[12]|(?:granular|degrade)Sample[12]|granularV[1-4]|lead[12](?:Attack|Decay|Sustain|Hold|Release)$|drum|dynamics|sidechain|drift|erosion|endComp|masterSaturation)/;
  const missingTargets = Object.keys(DEFAULT_STATE)
    .filter((key) => dynamicFamily.test(key))
    .filter((key) => getParamInfo(key as keyof SliderState))
    .filter((key) => getSliderCapability(key) === 'dual')
    .filter((key) => resolveCoreProductRangeTargets(key).length === 0);
  assert.deepEqual(missingTargets, [], `dynamic dual keys without Product targets: ${missingTargets.join(', ')}`);
});

test('the tension family is an explicit single-only custom architecture', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/ui/global/GlobalPage.tsx'), 'utf8');
  for (const key of [
    'padTensionValue', 'leadTensionValue', 'synthEuclidTensionValue',
    'granularTensionValue', 'reverbTensionValue', 'drumTensionValue',
  ]) {
    assert.equal(getSliderCapability(key), 'single', key);
  }
  const tensionBlock = source.slice(source.indexOf("['pad', 'Pad'"), source.indexOf('{/* Tension Arc */}'));
  assert.match(tensionBlock, /paramKey=\{valueKey\}/);
  assert.doesNotMatch(tensionBlock, /sliderProps\(valueKey\)/);
});

test('parameter-library Earth slider family remains classified and target-backed', () => {
  const keys = [...EARTH_RANGE_PARAM_KEYS];
  const unclassified = keys.filter((key) => !getSliderCapability(key));
  assert.deepEqual(unclassified, [], `unclassified Earth slider keys: ${unclassified.join(', ')}`);
  const missingTargets = keys.filter((key) => getSliderCapability(key) !== 'single' && resolveCoreProductRangeTargets(key).length === 0);
  assert.deepEqual(missingTargets, [], `Earth dual keys without Product targets: ${missingTargets.join(', ')}`);
});

test('generated Delay B tape-head slider family remains dual and target-backed', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/ui/delay/DelayPage.tsx'), 'utf8');
  const start = source.indexOf('const TAPE_HEADS');
  const end = source.indexOf('] as const;', start);
  assert.ok(start >= 0 && end > start, 'Delay B tape-head inventory declaration missing');
  const keys = [...source.slice(start, end).matchAll(/(?:level|pan):\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((key): key is string => Boolean(key));
  assert.equal(keys.length, 8, 'all four tape-head level/pan pairs should be inventoried');
  for (const key of keys) {
    assert.equal(getSliderCapability(key), 'dual', key);
    assert.notEqual(resolveCoreProductRangeTargets(key).length, 0, `${key} should resolve a Product range target`);
  }
});
