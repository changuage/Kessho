import assert from 'node:assert/strict';
import { resolveCanAnimate } from '../hooks/useAnimationVisibility';

import {
  resolveVisualizerFramePlan,
  visualizerPulseActivity,
  type VisualizerFrameActivity,
} from './visualizerFrameScheduler';

const BASE_ACTIVITY: VisualizerFrameActivity = {
  canAnimate: true,
  isPlaying: false,
  hasAutomation: false,
  pulseActivity: 0,
  millisecondsSinceInteraction: 5000,
  requestedFps: 60,
  qualityTargetFps: 60,
};

assert.equal(resolveCanAnimate(true, false, true), false, 'hidden documents must suspend animation demand');
assert.equal(resolveCanAnimate(true, true, false), false, 'off-screen canvases must suspend animation demand');
assert.equal(resolveCanAnimate(true, true, true), true, 'visible canvases should be eligible to animate');

assert.deepEqual(
  resolveVisualizerFramePlan({ ...BASE_ACTIVITY, canAnimate: false }),
  { mode: 'parked', fps: 0, delayMs: null },
  'hidden visualizers must never schedule frames',
);

assert.equal(
  resolveVisualizerFramePlan(BASE_ACTIVITY).mode,
  'parked',
  'stopped and settled visualizers should park instead of rendering indefinitely',
);

assert.deepEqual(
  resolveVisualizerFramePlan({ ...BASE_ACTIVITY, isPlaying: true }),
  { mode: 'ambient', fps: 15, delayMs: 1000 / 15 },
  'quiet playback should retain low-rate ambient motion',
);

assert.equal(
  resolveVisualizerFramePlan({ ...BASE_ACTIVITY, pulseActivity: 0.6 }).mode,
  'active',
  'musical pulses should immediately restore the requested cadence',
);

assert.equal(
  resolveVisualizerFramePlan({ ...BASE_ACTIVITY, hasAutomation: true }).mode,
  'active',
  'visual automation should remain smooth even without audio pulses',
);

assert.equal(
  resolveVisualizerFramePlan({ ...BASE_ACTIVITY, millisecondsSinceInteraction: 200 }).mode,
  'settling',
  'control edits should receive a short settling window before parking',
);

assert.equal(
  resolveVisualizerFramePlan({
    ...BASE_ACTIVITY,
    isPlaying: true,
    requestedFps: 60,
    qualityTargetFps: 30,
    pulseActivity: 0.5,
  }).fps,
  30,
  'quality mode must cap active rendering',
);

assert.equal(
  visualizerPulseActivity({ drums: 0.2, synth: 0.8, phase: 1.4 }),
  1,
  'pulse activity should clamp the strongest scalar signal',
);
