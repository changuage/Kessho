import assert from 'node:assert/strict';
import test from 'node:test';
import { harmonyAuditionVelocity } from './harmonyAuditionLevel';

test('Harmony audition compensates for the untrimmed Pad output', () => {
  assert.equal(harmonyAuditionVelocity('pad1', 0.85), 0.5015);
  assert.equal(harmonyAuditionVelocity('pad2', 1), 0.59);
  assert.equal(harmonyAuditionVelocity('lead1', 0.85), 0.85);
  assert.equal(harmonyAuditionVelocity('sample1', 0.85), 0.85);
});

test('Harmony audition velocity remains a finite normalized value', () => {
  assert.equal(harmonyAuditionVelocity('lead2', 2), 1);
  assert.equal(harmonyAuditionVelocity('sample2', -1), 0);
  assert.equal(harmonyAuditionVelocity('pad1', Number.NaN), 0);
});
