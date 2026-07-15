import assert from 'node:assert/strict';
import { DEFAULT_STATE } from '../../../ui/state';
import { getChangedRuntimeWalkParameterKeys } from './runtimeWalkParameterDiff';

{
  const next = { ...DEFAULT_STATE, masterVolume: DEFAULT_STATE.masterVolume };
  assert.deepEqual(getChangedRuntimeWalkParameterKeys(DEFAULT_STATE, next, ['masterVolume']), []);
}

{
  const next = {
    ...DEFAULT_STATE,
    masterVolume: DEFAULT_STATE.masterVolume - 0.01,
    reverbLevel: DEFAULT_STATE.reverbLevel + 0.01,
  };
  assert.deepEqual(
    getChangedRuntimeWalkParameterKeys(DEFAULT_STATE, next, ['masterVolume', 'padLevel', 'reverbLevel']),
    ['masterVolume', 'reverbLevel'],
  );
}
