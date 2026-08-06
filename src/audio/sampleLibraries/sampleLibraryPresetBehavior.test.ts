import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMPLE_SLOT_LIBRARY_DEFAULT_NUMERIC_KEYS } from './sampleSlotState';

test('sample library changes clear behavior only for values replaced by the library', () => {
  assert.deepEqual(SAMPLE_SLOT_LIBRARY_DEFAULT_NUMERIC_KEYS.sample1, [
    'sample1Level',
    'sample1AttackMs',
    'sample1DecayMs',
    'sample1Sustain',
    'sample1HoldMs',
    'sample1ReleaseMs',
    'sample1MaxVoices',
  ]);
  assert.deepEqual(SAMPLE_SLOT_LIBRARY_DEFAULT_NUMERIC_KEYS.sample2, [
    'sample2Level',
    'sample2AttackMs',
    'sample2DecayMs',
    'sample2Sustain',
    'sample2HoldMs',
    'sample2ReleaseMs',
    'sample2MaxVoices',
  ]);
  assert.equal(SAMPLE_SLOT_LIBRARY_DEFAULT_NUMERIC_KEYS.sample1.includes('sample1Distance'), false);
});
