import assert from 'node:assert/strict';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { normalizePresetForWeb } from './statePresetRuntime';
import {
  enforceProductCorePresetBoundaryState,
  validateProductCorePresetBoundaryState,
} from './productCorePresetBoundary';

{
  const normalized = normalizePresetForWeb({
    ...DEFAULT_STATE,
    masterVolume: Number.NaN,
    padEnabled: 'yes',
    reverbType: 'largeRoom',
  } as unknown as SliderState);

  assert.equal(normalized.masterVolume, DEFAULT_STATE.masterVolume, 'non-finite numeric materialized values should repair to defaults');
  assert.equal(normalized.padEnabled, DEFAULT_STATE.padEnabled, 'non-boolean materialized values should repair to defaults');
  assert.equal(normalized.reverbType, 'hall', 'iOS-only reverb materialized values should normalize for web/Product Core');
  assert.equal(validateProductCorePresetBoundaryState(normalized).valid, true);
}

{
  const invalid = {
    ...DEFAULT_STATE,
    chordProgressionPattern: 'not-an-array',
  } as unknown as SliderState;

  const validation = validateProductCorePresetBoundaryState(invalid);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues[0]?.key, 'chordProgressionPattern');
  assert.throws(() => enforceProductCorePresetBoundaryState(invalid), /Product Core preset boundary validation failed/);
}

console.log('Product Core preset boundary regression passed');
