import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMorphEndpointStates } from './morphEndpointAssets';
import type { SavedPreset } from './state';

const preset = (name: string, state: Record<string, unknown>): SavedPreset => ({
  name,
  timestamp: '',
  state: state as unknown as SavedPreset['state'],
});

test('collectMorphEndpointStates keeps only available endpoint states in order', () => {
  const endpointA = preset('A', { nature1Enabled: true });
  const endpointB = preset('B', { nature1SampleId: 'taku-room-1' });

  assert.deepEqual(collectMorphEndpointStates(endpointA, null, endpointB), [
    endpointA.state,
    endpointB.state,
  ]);
});
