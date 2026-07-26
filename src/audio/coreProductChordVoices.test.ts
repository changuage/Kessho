import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { resolveCoreProductChordVoices } from './coreProductChordVoices';
import { isProductSourceMonophonic } from './productSourceCapabilities';

const enabledState = {
  leadEnabled: true,
  lead2Enabled: true,
  sample1Enabled: true,
  sample2Enabled: true,
  waveSpread: 0.5,
};

test('source capabilities classify leads as mono and samples as polyphonic', () => {
  assert.equal(isProductSourceMonophonic(CORE_PRODUCT_SOURCE_IDS.lead1), true);
  assert.equal(isProductSourceMonophonic(CORE_PRODUCT_SOURCE_IDS.lead2), true);
  assert.equal(isProductSourceMonophonic(CORE_PRODUCT_SOURCE_IDS.sample1), false);
  assert.equal(isProductSourceMonophonic(CORE_PRODUCT_SOURCE_IDS.sample2), false);
});

test('Core mono chord voices ascend and distribute over the authored gate', () => {
  const voices = resolveCoreProductChordVoices({
    state: enabledState,
    source: 'lead1',
    voiceCount: 4,
    chordMidi: [72, 64, 70, 67],
    octaveShift: 0,
    triggerIntervalSeconds: 0.5,
    gate: 0.8,
    rng: () => 0.9,
  });
  assert.deepEqual(voices.map((voice) => voice.midi), [64, 67, 70, 72]);
  assert.deepEqual(voices.map((voice) => voice.baseDelaySeconds), [0, 0.13333333333333333, 0.26666666666666666, 0.4]);
});

test('Core polyphonic sample voices retain wave-spread offsets', () => {
  const voices = resolveCoreProductChordVoices({
    state: enabledState,
    source: 'sample1',
    voiceCount: 3,
    chordMidi: [60, 64, 67],
    octaveShift: 0,
    triggerIntervalSeconds: 0.5,
    rng: () => 0.5,
  });
  assert.equal(voices.length, 3);
  assert(voices.every((voice) => voice.baseDelaySeconds > 0));
});

test('Core mono strum leaves timing to its deterministic spread/curve stage', () => {
  const voices = resolveCoreProductChordVoices({
    state: enabledState,
    source: 'lead1',
    voiceCount: 4,
    chordMidi: [60, 64, 67, 70],
    octaveShift: 0,
    triggerIntervalSeconds: 0.5,
    gate: 0.8,
    timingMode: 'strum',
    rng: () => 0.9,
  });
  assert.deepEqual(voices.map((voice) => voice.baseDelaySeconds), [0, 0, 0, 0]);
});
