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

{
  const missingCurrentControl = { ...DEFAULT_STATE } as Record<string, unknown>;
  delete missingCurrentControl.sidechainPad1Target;

  const validation = validateProductCorePresetBoundaryState(missingCurrentControl as unknown as SliderState);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues[0]?.key, 'sidechainPad1Target');
}

{
  const olderPreset = { ...DEFAULT_STATE } as Record<string, unknown>;
  delete olderPreset.detune;

  assert.equal(
    normalizePresetForWeb(olderPreset as unknown as SliderState).detune,
    DEFAULT_STATE.detune,
    'missing current controls must receive canonical defaults before boundary validation',
  );
}

{
  const currentContractOnly = { ...DEFAULT_STATE } as Record<string, unknown>;
  delete currentContractOnly.granularPreset;
  delete currentContractOnly.leadTimbre;

  assert.equal(
    validateProductCorePresetBoundaryState(currentContractOnly as unknown as SliderState).valid,
    true,
    'legacy and UI-only state must not be required at the Product Core preset boundary',
  );
}

{
  const legacyState = { ...DEFAULT_STATE } as Record<string, unknown>;
  delete legacyState.shapeLfoSpeed;
  delete legacyState.modulationSourceA;
  delete legacyState.modulationSourceB;

  const migrated = normalizePresetForWeb(legacyState as unknown as SliderState);
  assert.equal(
    migrated.shapeLfoSpeed,
    DEFAULT_STATE.shapeLfoSpeed,
    'presets saved before Shape LFO must receive the additive linked-speed default',
  );
  assert.deepEqual(migrated.modulationSourceA, {
    type: 'walk',
    walk: { relationship: 'free', speed: DEFAULT_STATE.randomWalkSpeed },
  }, 'old presets must assign Mod A to the sound-preserving Random Walk Free default');
  assert.deepEqual(
    migrated.modulationSourceB,
    { type: 'sampleHold' },
    'old presets must assign Mod B to Sample & Hold',
  );
}

console.log('Product Core preset boundary regression passed');
