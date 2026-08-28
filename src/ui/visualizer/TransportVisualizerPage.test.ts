import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TransportImpulseRing,
  TRANSPORT_PULSE_RISE_DRUMS,
  createTransportPulseRiseState,
  createTransportPerformanceGovernorState,
  createDefaultTransportAssignments,
  createRandomTransportControls,
  createTransportVisualizerPresetData,
  createTransportTriggerCharacterState,
  fillTransportAssignmentSignals,
  filterTransportPresetSummaries,
  getTransportImpulseProfile,
  getTransportPulseActivity,
  markTransportFpsReported,
  resolveTransportFramePlan,
  resolveTransportGovernorTier,
  resolveTransportImpulsePosition,
  resolveTransportImpulseProfile,
  resolveTransportInteractionEventSource,
  resolveTransportNativeStep,
  resolveTransportPresetRequest,
  resolveTransportRippleCharacter,
  recordTransportTriggerCharacter,
  resolveTransportPresetLoadKind,
  transportAssignmentSignalSlot,
  shouldPublishTransportFps,
  updateTransportPerformanceGovernor,
  updateTransportPulseRiseState,
} from './TransportVisualizerPage';
import {
  TRANSPORT_ASSIGNMENT_MAX_ROUTES,
  sanitizeTransportAssignments,
} from './transportAssignments';
import type { TransportPerformanceGovernorInput } from './TransportVisualizerPage';
import type { PresetSummary } from '../../presets/types';
import type { TransportImpulse } from './TransportVisualizerRenderer';
import type { VisualizerPulseSnapshot } from './visualizerSignals';
import { publishVisualizerTelemetrySignal, resetVisualizerTelemetry } from './visualizerTelemetry';
import {
  getTransportControlDefinition,
  normalizeTransportControls,
  TRANSPORT_CONTROL_DEFINITIONS,
  TRANSPORT_DEFAULT_CONTROLS,
  TRANSPORT_PRESETS,
} from './visualizerTransportSchema';
import { PRODUCT_INTERACTION_EVENT, PRODUCT_INTERACTION_ORIGIN, PRODUCT_INTERACTION_PARENT, PRODUCT_INTERACTION_TAP } from '../../audio/productInteractionVocabulary';
import { DEFAULT_STATE } from '../state';

function pulseSnapshot(overrides: Partial<VisualizerPulseSnapshot> = {}): VisualizerPulseSnapshot {
  return {
    global: 0,
    synth: 0,
    pad: 0,
    lead: 0,
    drums: 0,
    earth: 0,
    granular: 0,
    delay: 0,
    reverb: 0,
    dynamics: 0,
    sequencer: 0,
    synthStepPhase: 0,
    drumStepPhase: 0,
    synthHitDensity: 0,
    drumHitDensity: 0,
    ...overrides,
  };
}

test('canonical Product events map to bounded Transport impulse families', () => {
  assert.equal(resolveTransportInteractionEventSource({
    type: PRODUCT_INTERACTION_EVENT.drumTriggered,
    parent: PRODUCT_INTERACTION_PARENT.drums,
    child: 5,
    origin: PRODUCT_INTERACTION_ORIGIN.sequencer,
    tap: PRODUCT_INTERACTION_TAP.postSource,
    flags: 0,
    sampleFrame: 128,
    value: 36,
    strength: 0.8,
  }), 'drums');
  assert.equal(resolveTransportInteractionEventSource({
    type: PRODUCT_INTERACTION_EVENT.transportBeat,
    parent: PRODUCT_INTERACTION_PARENT.transport,
    child: 0,
    origin: PRODUCT_INTERACTION_ORIGIN.system,
    tap: PRODUCT_INTERACTION_TAP.none,
    flags: 0,
    sampleFrame: 128,
    value: 1,
    strength: 1,
  }), null);
});

test('ripple hierarchy lets velocity lead while dark filters, high pitch, and distance reduce size', () => {
  const event = {
    type: PRODUCT_INTERACTION_EVENT.voiceTriggered,
    parent: PRODUCT_INTERACTION_PARENT.synths,
    child: 1,
    origin: PRODUCT_INTERACTION_ORIGIN.sequencer,
    tap: PRODUCT_INTERACTION_TAP.postSource,
    flags: 0,
    sampleFrame: 128,
    value: 84,
    strength: 1,
  } as const;
  const open = resolveTransportRippleCharacter(event, { ...DEFAULT_STATE, filterCutoff: 8000, padPostLPF: 18000, padDistance: 0 });
  const dark = resolveTransportRippleCharacter(event, { ...DEFAULT_STATE, filterCutoff: 1000, padPostLPF: 1000, padDistance: 0 });
  const soft = resolveTransportRippleCharacter({ ...event, strength: 0.2 }, { ...DEFAULT_STATE, filterCutoff: 8000, padPostLPF: 18000, padDistance: 0 });
  const far = resolveTransportRippleCharacter(event, { ...DEFAULT_STATE, filterCutoff: 8000, padPostLPF: 18000, padDistance: 1 });
  assert.ok(dark.size < open.size);
  assert.ok(soft.size < open.size);
  assert.ok(far.size < open.size);
  assert.ok(dark.strength < open.strength);
});

test('character hierarchy drives every transient assignment source through one decaying signal', () => {
  resetVisualizerTelemetry();
  const characters = createTransportTriggerCharacterState();
  recordTransportTriggerCharacter(characters, 'pad', 0.8, 100);
  const signals = new Float32Array(44);
  fillTransportAssignmentSignals(signals, 100, characters);
  assert.ok(Math.abs(signals[transportAssignmentSignalSlot('pad', 'transient')]! - 0.8) < 0.00001);
  assert.ok(Math.abs(signals[transportAssignmentSignalSlot('synth', 'transient')]! - 0.8) < 0.00001);
  assert.ok(Math.abs(signals[transportAssignmentSignalSlot('global', 'transient')]! - 0.256) < 0.00001);
  fillTransportAssignmentSignals(signals, 800, characters);
  assert.ok(signals[transportAssignmentSignalSlot('pad', 'transient')]! < 0.3);
});

test('Transport motion remains autonomous while genuinely settled scenes park', () => {
  const mobile = resolveTransportFramePlan({
    canAnimate: true,
    isPlaying: true,
    motion: 0.4,
    pulseActivity: 0,
    millisecondsSinceInteraction: 5000,
    qualityTargetFps: 30,
  });
  assert.equal(mobile.mode, 'active');
  assert.equal(mobile.fps, 30);

  const autonomous = resolveTransportFramePlan({
    canAnimate: true,
    isPlaying: false,
    motion: 0.4,
    pulseActivity: 0,
    millisecondsSinceInteraction: 2000,
    qualityTargetFps: 60,
  });
  assert.equal(autonomous.mode, 'active');
  assert.equal(autonomous.fps, 60);

  const parked = resolveTransportFramePlan({
    canAnimate: true,
    isPlaying: false,
    motion: 0,
    pulseActivity: 0,
    millisecondsSinceInteraction: 2000,
    qualityTargetFps: 60,
  });
  assert.equal(parked.mode, 'parked');
  assert.equal(parked.delayMs, null);
});

function governorInput(
  timeMs: number,
  overrides: Partial<TransportPerformanceGovernorInput> = {},
): TransportPerformanceGovernorInput {
  return {
    timeMs,
    isPlaying: true,
    active: true,
    requestedMode: 'auto',
    effectiveMode: 'desktopBeauty',
    targetFps: 60,
    ...overrides,
  };
}

test('performance governor maps quality modes to deterministic starting tiers', () => {
  assert.equal(resolveTransportGovernorTier('auto', 'desktopBeauty'), 'balanced');
  assert.equal(resolveTransportGovernorTier('desktopBeauty', 'desktopBeauty'), 'full');
  assert.equal(resolveTransportGovernorTier('mobileSafe', 'desktopBeauty'), 'minimum');
  assert.equal(resolveTransportGovernorTier('auto', 'mobileSafe'), 'minimum');
});

test('auto performance governor downshifts on sustained low FPS and recovers slowly', () => {
  const state = createTransportPerformanceGovernorState();
  assert.equal(updateTransportPerformanceGovernor(state, governorInput(0)), 'balanced');
  for (let timeMs = 100; timeMs <= 1300; timeMs += 100) {
    updateTransportPerformanceGovernor(state, governorInput(timeMs));
  }
  assert.equal(state.tier, 'minimum');

  let recoveredToBalanced = false;
  for (let index = 1; index <= 420; index += 1) {
    const tier = updateTransportPerformanceGovernor(state, governorInput(1300 + index * (1000 / 60)));
    if (tier === 'balanced') {
      recoveredToBalanced = true;
      break;
    }
  }
  assert.equal(recoveredToBalanced, true);

  let recoveredToFull = false;
  const recoveryStartMs = state.lastFrameMs;
  for (let index = 1; index <= 600; index += 1) {
    const tier = updateTransportPerformanceGovernor(state, governorInput(recoveryStartMs + index * (1000 / 60)));
    if (tier === 'full') {
      recoveredToFull = true;
      break;
    }
  }
  assert.equal(recoveredToFull, true);
});

test('performance governor resets on discontinuity and never downshifts while stopped', () => {
  const state = createTransportPerformanceGovernorState();
  updateTransportPerformanceGovernor(state, governorInput(0));
  updateTransportPerformanceGovernor(state, governorInput(100));
  assert.ok(Number.isFinite(state.lowSinceMs));
  updateTransportPerformanceGovernor(state, governorInput(2200));
  assert.equal(state.emaFps, 0);
  assert.equal(Number.isNaN(state.lowSinceMs), true);

  const stopped = createTransportPerformanceGovernorState();
  for (let timeMs = 0; timeMs <= 3000; timeMs += 100) {
    updateTransportPerformanceGovernor(stopped, governorInput(timeMs, {
      isPlaying: false,
      active: false,
    }));
  }
  assert.equal(stopped.tier, 'balanced');
  assert.equal(stopped.emaFps, 0);
});

test('stopped pulse settling never feeds performance samples or FPS reporting', () => {
  const state = createTransportPerformanceGovernorState();
  for (let timeMs = 0; timeMs <= 3500; timeMs += 100) {
    updateTransportPerformanceGovernor(state, governorInput(timeMs, {
      isPlaying: false,
      active: true,
    }));
  }
  assert.equal(state.tier, 'balanced');
  assert.equal(state.emaFps, 0);
  assert.equal(state.reportedFps, 0);
  assert.equal(shouldPublishTransportFps(state, 3500, true), false);
});

test('performance FPS reporting is rate-limited to four updates per second', () => {
  const state = createTransportPerformanceGovernorState();
  updateTransportPerformanceGovernor(state, governorInput(0));
  state.emaFps = 59.4;
  assert.equal(shouldPublishTransportFps(state, 0, true), true);
  assert.equal(markTransportFpsReported(state, 0), 59);
  state.emaFps = 60.1;
  assert.equal(shouldPublishTransportFps(state, 200, true), false);
  assert.equal(shouldPublishTransportFps(state, 250, true), true);
  assert.equal(markTransportFpsReported(state, 250), 60);
  assert.equal(shouldPublishTransportFps(state, 500, false), false);
});

test('impulse ring is bounded, reusable, and profiles remain distinct', () => {
  const ring = new TransportImpulseRing(3);
  for (let index = 0; index < 5; index += 1) {
    ring.push({
      x: index,
      y: 0,
      timeMs: index,
      strength: 1,
      speed: 1,
      frequency: 1,
      decay: 1,
      tight: 1,
    });
  }
  const output: TransportImpulse[] = [];
  assert.equal(ring.writeTo(output), 3);
  assert.deepEqual(output.map((impulse) => impulse.x), [2, 3, 4]);
  assert.equal(resolveTransportImpulseProfile('drums'), 'drums');
  assert.equal(resolveTransportImpulseProfile('granular'), 'granular');
  assert.notEqual(getTransportImpulseProfile('drums').frequency, getTransportImpulseProfile('pad').frequency);
  assert.deepEqual(resolveTransportImpulsePosition('drums', 0.25, 17), resolveTransportImpulsePosition('drums', 0.25, 17));
});

test('pulse rises emit once and phase-like repeats do not extend activity', () => {
  const state = createTransportPulseRiseState();
  const first = updateTransportPulseRiseState(state, pulseSnapshot({ global: 0.6, drums: 0.6 }), 1000);
  assert.equal(first, TRANSPORT_PULSE_RISE_DRUMS);
  const firstActivityTimestamp = state.activityUpdatedAt;
  assert.ok(getTransportPulseActivity(state, 1100) < state.activity);

  const repeated = updateTransportPulseRiseState(state, pulseSnapshot({ global: 0.6, drums: 0.6 }), 1100);
  assert.equal(repeated, 0);
  assert.equal(state.activityUpdatedAt, firstActivityTimestamp);

  const decaying = updateTransportPulseRiseState(state, pulseSnapshot({ global: 0.48, drums: 0.48 }), 1200);
  assert.equal(decaying, 0);
  assert.equal(state.activityUpdatedAt, firstActivityTimestamp);

  const rise = updateTransportPulseRiseState(state, pulseSnapshot({ global: 0.8, drums: 0.8 }), 1300);
  assert.equal(rise, TRANSPORT_PULSE_RISE_DRUMS);
  assert.equal(state.activityUpdatedAt, 1300);

  const dormantState = createTransportPulseRiseState();
  assert.equal(updateTransportPulseRiseState(dormantState, pulseSnapshot({ global: 1, drums: 1 }), 1000), TRANSPORT_PULSE_RISE_DRUMS);
  assert.equal(updateTransportPulseRiseState(dormantState, pulseSnapshot({ global: 0.4, drums: 0.4 }), 3000), TRANSPORT_PULSE_RISE_DRUMS);
  assert.equal(updateTransportPulseRiseState(dormantState, pulseSnapshot({ global: 0.4, drums: 0.4 }), 3010), 0);
});

test('built-in Transport presets resolve by stable id and display name', () => {
  const preset = TRANSPORT_PRESETS[0];
  assert.ok(preset);
  assert.equal(resolveTransportPresetRequest(preset.id), preset);
  assert.equal(resolveTransportPresetRequest(preset.name), preset);
  assert.equal(resolveTransportPresetRequest('missing-transport-preset'), null);
});

test('random preset controls are deterministic, bounded, and keep expensive branch counts conservative', () => {
  const first = createRandomTransportControls(42);
  const second = createRandomTransportControls(42);
  assert.deepEqual(first, second);
  for (const definition of TRANSPORT_CONTROL_DEFINITIONS) {
    assert.ok(first[definition.key] >= definition.min);
    assert.ok(first[definition.key] <= definition.max);
  }
  assert.equal(first.sunTaps, TRANSPORT_DEFAULT_CONTROLS.sunTaps);
  assert.equal(first.octaves, TRANSPORT_DEFAULT_CONTROLS.octaves);
  assert.equal(first.layers, TRANSPORT_DEFAULT_CONTROLS.layers);
  assert.equal(first.leafTiers, TRANSPORT_DEFAULT_CONTROLS.leafTiers);

  let sawAperture = false;
  for (const seed of [42, 999]) {
    const controls = createRandomTransportControls(seed);
    assert.ok(controls.exposure >= 1.25);
    assert.ok(controls.albedo >= 0.5);
    assert.ok(controls.skyFill >= 0.18);
    assert.ok(controls.waterBrilliance >= 0.25);
    assert.ok(controls.contrast <= 0.75);
    assert.ok(controls.vignette <= 0.8);
    if (controls.apShape > 0) {
      sawAperture = true;
      assert.ok(controls.apSpill >= 0.12);
    }
  }
  assert.equal(sawAperture, true);
});

test('native ranges preserve continuous baseline values and integer controls', () => {
  assert.equal(resolveTransportNativeStep(getTransportControlDefinition('sunAngle')), 'any');
  assert.equal(resolveTransportNativeStep(getTransportControlDefinition('octaves')), 1);
});

test('default Transport trigger assignments stay appearance-only', () => {
  const defaults = createDefaultTransportAssignments();
  assert.deepEqual(defaults.map(({ source, signal, target, amount, polarity, enabled }) => ({ source, signal, target, amount, polarity, enabled })), [
    { source: 'drums', signal: 'transient', target: 'bloom', amount: 0.18, polarity: 'unipolar', enabled: true },
    { source: 'synth', signal: 'transient', target: 'bloom', amount: 0.08, polarity: 'unipolar', enabled: true },
    { source: 'pad', signal: 'transient', target: 'exposure', amount: 0.02, polarity: 'unipolar', enabled: true },
    { source: 'granular', signal: 'transient', target: 'bloom', amount: 0.04, polarity: 'unipolar', enabled: true },
  ]);
});

test('assignment signal fill uses ordered source × signal slots', () => {
  resetVisualizerTelemetry();
  publishVisualizerTelemetrySignal('synth', 'level', 0.73, 100);
  publishVisualizerTelemetrySignal('drums', 'transient', 0.41, 100);
  const signals = new Float32Array(44);
  fillTransportAssignmentSignals(signals, 100);
  assert.equal(transportAssignmentSignalSlot('synth', 'level'), 4);
  assert.equal(transportAssignmentSignalSlot('drums', 'transient'), 17);
  assert.ok(Math.abs(signals[4]! - 0.73) < 0.00001);
  assert.ok(Math.abs(signals[17]! - 0.41) < 0.00001);
  assert.equal(signals[0], 0);
  resetVisualizerTelemetry();
});

test('Transport v3 payloads and saved-summary routing stay separate from built-ins', () => {
  const payload = createTransportVisualizerPresetData(
    normalizeTransportControls(TRANSPORT_DEFAULT_CONTROLS),
    createDefaultTransportAssignments(),
    'auto',
    42,
  );
  assert.equal(payload.formatVersion, 3);
  assert.equal(payload.renderer, 'transport');
  assert.equal(payload.assignments.length, 4);
  assert.equal(resolveTransportPresetLoadKind(TRANSPORT_PRESETS[0]!.id), 'built-in');
  assert.equal(resolveTransportPresetLoadKind('saved-transport'), 'saved');
  const summaries = filterTransportPresetSummaries([
    { name: 'legacy', tags: ['visualizer'] } as unknown as PresetSummary,
    { name: 'transport', tags: ['visualizer', 'transport'] } as unknown as PresetSummary,
  ]);
  assert.deepEqual(summaries.map((summary) => summary.name), ['transport']);
});

test('assignment edit sanitization remains capped at the route boundary', () => {
  const sanitized = sanitizeTransportAssignments(Array.from({ length: TRANSPORT_ASSIGNMENT_MAX_ROUTES + 3 }, (_, index) => ({
    id: index === 0 ? ' edited route ' : 'edited-route',
    source: 'drums',
    signal: 'transient',
    target: 'bloom',
    amount: index === 0 ? 9 : -9,
  })));
  assert.equal(sanitized.length, TRANSPORT_ASSIGNMENT_MAX_ROUTES);
  assert.equal(sanitized[0]!.id, 'edited-route');
  assert.equal(sanitized[0]!.amount, 1);
  assert.equal(sanitized[1]!.id, 'edited-route-2');
  assert.equal(sanitized[1]!.amount, -1);
});
