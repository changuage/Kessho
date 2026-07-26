import assert from 'node:assert/strict';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { normalizePresetForWeb } from './statePresetRuntime';
import {
  enforceProductCorePresetBoundaryState,
  validateProductCorePresetBoundaryState,
} from './productCorePresetBoundary';

{
  const malformed = {
    ...DEFAULT_STATE,
    masterVolume: Number.NaN,
    padEnabled: 'yes',
    reverbType: 'largeRoom',
  } as unknown as SliderState;

  assert.throws(
    () => normalizePresetForWeb(malformed),
    /Product Core preset boundary validation failed/,
    'malformed current state must fail instead of being repaired with defaults',
  );
}

{
  const invalid = {
    ...DEFAULT_STATE,
    harmonyProgression: 'not-an-object',
  } as unknown as SliderState;

  const validation = validateProductCorePresetBoundaryState(invalid);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues[0]?.key, 'harmonyProgression');
  assert.throws(() => enforceProductCorePresetBoundaryState(invalid), /Product Core preset boundary validation failed/);
}

console.log('Product Core preset boundary regression passed');
