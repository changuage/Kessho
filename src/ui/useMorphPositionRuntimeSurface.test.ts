import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STATE } from './state';
import { preserveRunningSimpleSequencers } from './useMorphPositionRuntimeSurface';

test('whole-preset morphs keep running chord and random sequencers attached to their live sources', () => {
  const current = {
    ...DEFAULT_STATE,
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'pad2' as const,
    leadRandomEnabled: true,
    leadRandomSource: 'lead2' as const,
  };
  const next = {
    ...DEFAULT_STATE,
    synthChordGeneratorEnabled: false,
    synthChordGeneratorSource: 'pad1' as const,
    leadRandomEnabled: false,
    leadRandomSource: 'lead1' as const,
  };

  const preserved = preserveRunningSimpleSequencers(next, current);
  assert.equal(preserved.synthChordGeneratorEnabled, true);
  assert.equal(preserved.synthChordGeneratorSource, 'pad2');
  assert.equal(preserved.leadRandomEnabled, true);
  assert.equal(preserved.leadRandomSource, 'lead2');
});
