import assert from 'node:assert/strict';
import test from 'node:test';
import {
  publishProductInteractionSignalSnapshot,
  readProductInteractionVisualizerSignal,
  resetProductInteractionSignalSnapshot,
} from './productInteractionSignalStore';

function values(entries: Record<number, number>): number[] {
  const result = Array<number>(10).fill(0);
  for (const [index, value] of Object.entries(entries)) result[Number(index)] = value;
  return result;
}

test('maps canonical child sources into existing visualizer parent channels', () => {
  resetProductInteractionSignalSnapshot();
  publishProductInteractionSignalSnapshot({
    version: 1,
    revision: 1,
    demandMask: 30,
    sourceMask: 0x3ff,
    validSourceMask: 0x3ff,
    sampleFrame: 128,
    envelope: values({ 0: 0.2, 1: 0.4, 2: 0.7, 3: 0.5, 5: 0.8, 7: 0.6, 9: 0.3 }),
    peak: values({}),
    rms: values({ 1: 0.15, 2: 0.25 }),
    onsetStrength: values({ 5: 0.9 }),
  }, 100);
  assert.equal(readProductInteractionVisualizerSignal('global', 'level', 100), 0.2);
  assert.equal(readProductInteractionVisualizerSignal('synth', 'level', 100), 0.7);
  assert.equal(readProductInteractionVisualizerSignal('pad', 'density', 100), 0.25);
  assert.equal(readProductInteractionVisualizerSignal('drums', 'transient', 100), 0.9);
  assert.equal(readProductInteractionVisualizerSignal('earth', 'level', 100), 0.6);
  assert.equal(readProductInteractionVisualizerSignal('granular', 'level', 100), 0.3);
  assert.equal(readProductInteractionVisualizerSignal('sequencer', 'level', 100), null);
});

test('respects valid-source masks and releases stale snapshots', () => {
  resetProductInteractionSignalSnapshot();
  publishProductInteractionSignalSnapshot({
    version: 1,
    revision: 1,
    demandMask: 2,
    sourceMask: 1 << 1,
    validSourceMask: 1 << 1,
    sampleFrame: 128,
    envelope: values({ 1: 0.8, 2: 1 }),
    peak: values({}), rms: values({}), onsetStrength: values({}),
  }, 100);
  assert.equal(readProductInteractionVisualizerSignal('pad', 'level', 100), 0.8);
  assert.ok((readProductInteractionVisualizerSignal('pad', 'level', 800) ?? 0) < 0.8);
  assert.equal(readProductInteractionVisualizerSignal('pad', 'level', 1_800), null);
});
