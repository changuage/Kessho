import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultProductPlayConfig } from '../audio/productPlaySequencer';
import { effectiveProductSynthPitchBindingModes } from './useSynthPageSequencerBridge';

test('effective runtime binding uses hit-count only for enabled chord lanes', () => {
  const arp = defaultProductPlayConfig();
  const chord = { ...defaultProductPlayConfig(), enabled: true, mode: 'chord' as const };
  const disabledChord = { ...chord, enabled: false };
  assert.deepEqual(
    effectiveProductSynthPitchBindingModes(['sequence', 'sequence', 'linked', 'polyrhythmic'], [chord, arp, disabledChord]),
    ['polyrhythmic', 'sequence', 'linked', 'polyrhythmic'],
  );
  assert.deepEqual(
    effectiveProductSynthPitchBindingModes(['sequence'], [{ ...chord, mode: 'arp' }]),
    ['sequence'],
  );
});

