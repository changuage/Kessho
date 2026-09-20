import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STATE } from '../ui/state';
import { createRandomTimingPhrasePreview } from './simpleSequencerPhrasePreview';

test('random timing supports the full -4 to +4 octave offset', () => {
  const high = createRandomTimingPhrasePreview({
    ...DEFAULT_STATE,
    leadRandomEnabled: true,
    lead1Octave: 4,
    lead1OctaveRange: 4,
  });
  assert.equal(high.rangeMinMidi, 112);
  assert.equal(high.rangeMaxMidi, 127);

  const low = createRandomTimingPhrasePreview({
    ...DEFAULT_STATE,
    leadRandomEnabled: true,
    lead1Octave: -4,
    lead1OctaveRange: 4,
  });
  assert.equal(low.rangeMinMidi, 24);
  assert.equal(low.rangeMaxMidi, 64);
});
