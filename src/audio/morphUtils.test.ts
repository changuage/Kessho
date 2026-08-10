import assert from 'node:assert/strict';
import test from 'node:test';
import { selectDiscreteMorphEndpoint } from './morphUtils';

test('discrete morph settings switch atomically to preset B at 50%', () => {
  const presetA = {
    type: 'walk',
    walk: { relationship: 'free', speed: 0.75 },
  } as const;
  const presetB = {
    type: 'shape',
    shape: { shape: 'triangle', timing: { mode: 'sync', reference: 'phrase', division: '1/4' } },
  } as const;

  assert.equal(selectDiscreteMorphEndpoint(presetA, presetB, 0.499), presetA);
  assert.equal(selectDiscreteMorphEndpoint(presetA, presetB, 0.5), presetB);
  assert.equal(selectDiscreteMorphEndpoint(presetA, presetB, 1), presetB);
});
