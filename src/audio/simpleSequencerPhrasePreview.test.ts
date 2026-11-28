import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STATE, type SliderState } from '../ui/state';
import { createRandomTimingPhrasePreview } from './simpleSequencerPhrasePreview';

// The preview still reads the retired singleton Random Notes keys.
const legacyState = (extra: Record<string, unknown>): SliderState => ({ ...DEFAULT_STATE, ...extra }) as SliderState;

test('random timing supports the full -4 to +4 octave offset', () => {
  const high = createRandomTimingPhrasePreview(legacyState({
    leadRandomEnabled: true,
    lead1Octave: 4,
    lead1OctaveRange: 4,
  }));
  assert.equal(high.rangeMinMidi, 112);
  assert.equal(high.rangeMaxMidi, 127);

  const low = createRandomTimingPhrasePreview(legacyState({
    leadRandomEnabled: true,
    lead1Octave: -4,
    lead1OctaveRange: 4,
  }));
  assert.equal(low.rangeMinMidi, 24);
  assert.equal(low.rangeMaxMidi, 64);
});
