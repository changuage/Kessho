import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOOLEAN_MORPH_KEYS,
  DISCRETE_MORPH_KEYS,
  ENGINE_TOGGLE_KEYS,
  NUMERIC_MORPH_KEYS,
  PARENT_CHILD_MAP,
  ROUTER_MATRIX_BY_ENGINE,
} from './morphRoutingTables';

const countKey = (keys: readonly string[], key: string): number => keys.filter((candidate) => candidate === key).length;

test('canonical Nature fields are covered by one morph bucket each', () => {
  const layers = [1, 2, 3, 4];
  const numericKeys = [
    ...layers.flatMap((layer) => [
      `nature${layer}Level`,
      `nature${layer}SliceDuration`,
      `nature${layer}SliceDensity`,
      `nature${layer}FilterCutoff`,
      `nature${layer}FilterResonance`,
    ]),
    'natureLevel',
    'natureReverbSend',
    'natureDelayASend',
    'natureDelayBSend',
    'granularNatureSend',
    'degradeNatureSend',
    'spectralFreezeNatureSend',
  ];
  const discreteKeys = layers.flatMap((layer) => [
    `nature${layer}SampleId`,
    `nature${layer}FilterType`,
  ]);

  for (const key of numericKeys) {
    assert.equal(countKey(NUMERIC_MORPH_KEYS, key), 1, `${key} should be numeric exactly once`);
  }
  for (const key of discreteKeys) {
    assert.equal(countKey(DISCRETE_MORPH_KEYS, key), 1, `${key} should be discrete exactly once`);
  }
});

test('canonical Nature toggles use engine lifecycle semantics', () => {
  const toggleKeys = ['natureMasterEnabled', 1, 2, 3, 4].map((layer) =>
    typeof layer === 'number' ? `nature${layer}Enabled` : layer,
  );

  for (const key of toggleKeys) {
    assert.equal(countKey(ENGINE_TOGGLE_KEYS, key), 1, `${key} should be an engine toggle exactly once`);
    assert.equal(countKey(BOOLEAN_MORPH_KEYS, key), 0, `${key} must not use midpoint-only boolean morphing`);
  }

  for (const layer of [1, 2, 3, 4]) {
    assert.deepEqual(PARENT_CHILD_MAP[`nature${layer}Enabled`], [
      `nature${layer}Level`,
      `nature${layer}SliceDuration`,
      `nature${layer}SliceDensity`,
      `nature${layer}FilterCutoff`,
      `nature${layer}FilterResonance`,
    ]);
  }
});

test('Nature router is active only with the master and an enabled layer', () => {
  const natureRouter = ROUTER_MATRIX_BY_ENGINE.find(({ keys }) => keys.includes('natureLevel'));
  assert.ok(natureRouter);
  const state = (overrides: Record<string, boolean>) => overrides as unknown as Parameters<typeof natureRouter.isOn>[0];

  assert.equal(natureRouter.isOn(state({ natureMasterEnabled: false, nature1Enabled: true })), false);
  assert.equal(natureRouter.isOn(state({ natureMasterEnabled: true, nature1Enabled: false })), false);
  assert.equal(natureRouter.isOn(state({ natureMasterEnabled: true, nature3Enabled: true })), true);
});
