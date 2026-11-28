import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_STATE, type SliderState } from './state';
import { normalizeSynthSequencerFaceState } from './sequencer/sequencerModeTypes';
import { preserveRunningRandomSlots } from './useMorphPositionRuntimeSurface';

function withRandomSlots(state: SliderState, lanes: readonly number[]): SliderState {
  const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  for (const lane of lanes) faces.slots[lane - 1] = { ...faces.slots[lane - 1]!, mode: 'random' };
  return { ...state, synthSequencerFaces: faces };
}

test('whole-preset morphs keep running Random slots attached to their live sources', () => {
  const current = withRandomSlots({
    ...DEFAULT_STATE,
    synthEuclid5Enabled: true,
    synthEuclid5Source: 'pad2',
    synthEuclid6Enabled: true,
    synthEuclid6Source: 'lead2',
  }, [5, 6]);
  const next = {
    ...DEFAULT_STATE,
    synthEuclid5Enabled: false,
    synthEuclid5Source: 'pad1' as const,
    synthEuclid6Enabled: false,
    synthEuclid6Source: 'lead1' as const,
  };

  const preserved = preserveRunningRandomSlots(next, current);
  assert.equal(preserved.synthEuclid5Enabled, true);
  assert.equal(preserved.synthEuclid5Source, 'pad2');
  assert.equal(preserved.synthEuclid6Enabled, true);
  assert.equal(preserved.synthEuclid6Source, 'lead2');
});

test('whole-preset morphs leave Steps slots and stopped Random slots to the morph', () => {
  const current = withRandomSlots({
    ...DEFAULT_STATE,
    synthEuclid1Enabled: true,
    synthEuclid5Enabled: false,
  }, [5]);
  const next = { ...DEFAULT_STATE, synthEuclid1Enabled: false, synthEuclid5Enabled: true };

  const preserved = preserveRunningRandomSlots(next, current);
  assert.equal(preserved.synthEuclid1Enabled, false, 'a Steps slot is morphed, not preserved');
  assert.equal(preserved.synthEuclid5Enabled, true, 'a stopped Random slot takes the morph');
});
