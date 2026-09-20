import assert from 'node:assert/strict';
import { normalizeTransportVisualizerPresetData } from './visualizerPresetStore';

const v3 = normalizeTransportVisualizerPresetData({
  format: 'kessho-visualizer-preset',
  formatVersion: 3,
  renderer: 'transport',
  controls: { motion: 99, sunTaps: 3.6 },
  assignments: [
    { id: 'drums-motion', source: 'drums', signal: 'transient', target: 'motion', amount: 4 },
    { id: 'invalid', source: 'missing', signal: 'level', target: 'motion', amount: 1 },
  ],
  qualityMode: 'invalid',
  seed: Number.NaN,
});
assert.ok(v3);
assert.equal(v3?.controls.motion, 1.5);
assert.equal(v3?.controls.sunTaps, 4);
assert.equal(v3?.assignments.length, 1);
assert.equal(v3?.assignments[0]?.amount, 1);
assert.equal(v3?.assignments[0]?.enabled, true);
assert.equal(v3?.qualityMode, 'auto');
assert.equal(v3?.seed, 0);
assert.equal(normalizeTransportVisualizerPresetData({
  format: 'kessho-visualizer-preset',
  formatVersion: 2,
  controls: {},
}), null);

console.log('visualizer preset store regression passed');
