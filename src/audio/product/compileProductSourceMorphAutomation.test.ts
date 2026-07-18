import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileProductSourceMorphAutomation,
  PRODUCT_MORPH_MODE_IDS,
  PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT,
} from './compileProductSourceMorphAutomation';

test('compiles all source morph targets in ABI order', () => {
  const compiled = compileProductSourceMorphAutomation({
    padMorphAuto: true,
    padMorphSpeed: 4,
    lead1MorphAuto: true,
    lead1MorphSpeed: 12,
    lead1MorphMode: 'random',
    drumSubMorphAuto: true,
    drumSubMorphSpeed: 16,
    drumSubMorphMode: 'linear',
    drumMembraneMorphAuto: true,
    drumMembraneMorphMode: 'random',
  }, 1234);

  assert.equal(compiled.length, PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT);
  assert.deepEqual(compiled[0], {
    enabled: true,
    mode: PRODUCT_MORPH_MODE_IDS.pingpong,
    phrasesPerCycle: 4,
    seed: compiled[0]?.seed,
  });
  assert.equal(compiled[2]?.mode, PRODUCT_MORPH_MODE_IDS.random);
  assert.equal(compiled[4]?.mode, PRODUCT_MORPH_MODE_IDS.linear);
  assert.equal(compiled[10]?.mode, PRODUCT_MORPH_MODE_IDS.random);
});

test('is deterministic and isolates target random streams', () => {
  const first = compileProductSourceMorphAutomation(undefined, 55);
  const second = compileProductSourceMorphAutomation(undefined, 55);
  const different = compileProductSourceMorphAutomation(undefined, 56);

  assert.deepEqual(first, second);
  assert.notDeepEqual(first.map(({ seed }) => seed), different.map(({ seed }) => seed));
  assert.equal(new Set(first.map(({ seed }) => seed)).size, PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT);
  assert.ok(first.every(({ enabled, phrasesPerCycle }) => !enabled && phrasesPerCycle === 8));
});

test('normalizes invalid mode and duration inputs', () => {
  const compiled = compileProductSourceMorphAutomation({
    lead2MorphAuto: true,
    lead2MorphMode: 'unsupported',
    lead2MorphSpeed: Number.POSITIVE_INFINITY,
    drumKickMorphSpeed: 9000,
  }, 1);

  assert.equal(compiled[3]?.mode, PRODUCT_MORPH_MODE_IDS.pingpong);
  assert.equal(compiled[3]?.phrasesPerCycle, 8);
  assert.equal(compiled[5]?.phrasesPerCycle, 4096);
});
