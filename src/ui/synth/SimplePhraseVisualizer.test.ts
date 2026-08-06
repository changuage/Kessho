import assert from 'node:assert/strict';
import test from 'node:test';
import type { TransportDebugSnapshot } from '../../audio/transport';
import type { SimpleSequencerPhrasePreview } from '../../audio/simpleSequencerRuntimePlan';
import { selectSimplePhraseRuntimePlan } from './SimplePhraseVisualizer';

function plan(key: string, midi: number): SimpleSequencerPhrasePreview {
  return {
    kind: 'padChord',
    enabled: true,
    phraseSeconds: 16,
    triggerIntervalSeconds: 4,
    notes: [{
      id: key,
      source: 'pad1',
      midi,
      label: 'C4',
      triggerSeconds: 0,
      velocity: 1,
      envelope: { attack: 1, decay: 1, sustain: 1, gateSeconds: 4, release: 1 },
    }],
    minMidi: midi - 1,
    maxMidi: midi + 1,
    key,
  };
}

test('never substitutes modeled chord notes for an authoritative native plan', () => {
  const modeled = plan('modeled', 60);
  const waiting = selectSimplePhraseRuntimePlan(
    'padChord',
    { simpleSequencerPlansAuthoritative: true } as TransportDebugSnapshot,
    modeled,
  );
  assert.equal(waiting, null);

  const native = plan('native', 67);
  const exact = selectSimplePhraseRuntimePlan(
    'padChord',
    { simpleSequencerPlansAuthoritative: true, padChordPlan: native } as TransportDebugSnapshot,
    modeled,
  );
  assert.equal(exact, native);
});
