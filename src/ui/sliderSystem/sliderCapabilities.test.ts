import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveCoreProductRangeTargets } from '../../audio/coreProductEvents';
import { DEFAULT_STATE, getParamInfo, type SliderState } from '../state';
import {
  getSliderCapability,
  SLIDER_CAPABILITIES,
  SINGLE_ONLY_SLIDER_KEYS,
  WALK_ONLY_DUAL_KEYS,
} from './sliderCapabilities';

const ROOT = process.cwd();

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
  }
  for (const [key, capability] of Object.entries(SLIDER_CAPABILITIES)) {
    if (WALK_ONLY_DUAL_KEYS.has(key)) assert.equal(capability, 'walk-only');
    if (SINGLE_ONLY_SLIDER_KEYS.has(key)) assert.equal(capability, 'single');
  }
});

test('dynamic audit families are classified', () => {
  const single = [
    'sample1MaxVoices', 'sample2MaxVoices',
    'granularV1Slice', 'granularV2Slice', 'granularV3Slice', 'granularV4Slice',
    'padTensionValue', 'leadTensionValue', 'synthEuclidTensionValue',
    'granularTensionValue', 'reverbTensionValue', 'drumTensionValue',
  ];
  for (const key of single) assert.equal(getSliderCapability(key), 'single', key);
  for (const key of ['lead1Attack', 'lead2Hold', 'sample1AttackMs', 'sample2ReleaseMs', 'granularV1Speed', 'granularV4Gain', 'granularNatureSend', 'drumKickDistance', 'earthLevel', 'oceanSampleLevel', 'nature4FilterCutoff', 'insectsLevel']) {
    assert.equal(getSliderCapability(key), 'dual', key);
  }
});

test('dynamic numeric families never advertise dual without a Product target', () => {
  const dynamicFamily = /^(?:sample[12]|(?:granular|degrade)Sample[12]|granularV[1-4]|lead[12](?:Attack|Decay|Sustain|Hold|Release)$|drum|dynamics)/;
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

test('generated Earth slider family remains classified and target-backed', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/ui/earth/EarthPage.tsx'), 'utf8');
  const start = source.indexOf('const EARTH_DUAL_KEYS');
  const end = source.indexOf('] as const;', start);
  assert.ok(start >= 0 && end > start, 'Earth dynamic inventory declaration missing');
  const keys = [...source.slice(start, end).matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((key): key is string => Boolean(key));
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
