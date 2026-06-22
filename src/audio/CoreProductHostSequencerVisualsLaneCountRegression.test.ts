import assert from 'node:assert/strict';
import { publishCoreProductSequencerVisuals } from './CoreProductHostSequencerVisuals';
import {
  DRUM_EUCLIDEAN_LANE_COUNT,
  SYNTH_EUCLIDEAN_LANE_COUNT,
} from './sequencerLaneCounts';

const diagnostics = { derivedVisualFallbackCount: 0 };
const published: Record<string, { steps: number[]; hitCounts: number[] }> = {};

publishCoreProductSequencerVisuals({
  telemetry: {
    transportRunning: true,
    sampleRate: 48000,
    absoluteSampleTime: 128,
    synthSequencerCurrentSteps: [0, 1, 2, 3],
    synthSequencerHitCounts: [1, 2, 3, 4],
    drumSequencerCurrentSteps: [0, 1, 2, 3, 4, 5],
    drumSequencerHitCounts: [1, 2, 3, 4, 5, 6],
  } as never,
  snapshot: {
    transport: { bpm: 120 },
  } as never,
  state: {
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: true,
    synthEuclid2Enabled: true,
    synthEuclid3Enabled: true,
    synthEuclid4Enabled: true,
    drumEnabled: true,
    drumEuclidMasterEnabled: true,
    drumEuclid1Enabled: true,
    drumEuclid2Enabled: true,
    drumEuclid3Enabled: true,
    drumEuclid4Enabled: true,
    drumEuclid5Enabled: true,
    drumEuclid6Enabled: true,
  },
  synthToggles: [[], [], [], []],
  drumToggles: [[], [], [], [], [], []],
  synthVisibleLaneCount: SYNTH_EUCLIDEAN_LANE_COUNT,
  drumVisibleLaneCount: DRUM_EUCLIDEAN_LANE_COUNT,
  sampleRate: 48000,
  diagnostics,
  publish: (name, steps, hitCounts) => {
    published[name] = { steps, hitCounts };
  },
});

assert.equal(published.drumStepPosition?.steps.length, 6);
assert.equal(published.drumStepPosition?.hitCounts.length, 6);
assert.equal(published.synthStepPosition?.steps.length, 4);
assert.equal(published.synthStepPosition?.hitCounts.length, 4);
assert.equal(diagnostics.derivedVisualFallbackCount, 0, 'authoritative Product telemetry must avoid derived visual fallback');

console.log('Core Product sequencer visual lane-count regression passed');
