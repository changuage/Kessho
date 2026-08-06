import assert from 'node:assert/strict';
import { normalizeVisualizerPresetData } from './visualizerPresetStore';

const legacy = normalizeVisualizerPresetData({
  format: 'kessho-visualizer-preset',
  formatVersion: 1,
  mode: 'auto',
  controls: { motion: 0.2 },
  reactiveRanges: {
    motion: { min: 0.8, max: -0.4 },
    stale: { min: 0, max: 1 },
    bad: { min: Number.NaN, max: 0 },
  },
  reaction: { reactionAmount: 0.5, morphAroundPreset: 0.5, afterglow: 0.5, mode: 'auto' },
  seed: 0.25,
});

assert.ok(legacy);
assert.equal(legacy?.formatVersion, 2);
assert.deepEqual(legacy?.reactiveRanges, { motion: { min: -0.4, max: 0.8 } });
assert.deepEqual(legacy?.vizSliderModes, {});

const v2 = normalizeVisualizerPresetData({
  ...legacy,
  formatVersion: 2,
  vizSliderModes: { motion: 'sampleHold', stale: 'walk', frameRate: 'single' },
});
assert.deepEqual(v2?.vizSliderModes, { motion: 'sampleHold' });

console.log('visualizer preset store regression passed');
