import assert from 'node:assert/strict';
import test from 'node:test';

import { EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS } from '../ProductRuntimeDiagnostics';
import { enrichCoreProductHostTelemetry } from './CoreProductTelemetryAdapter';
import {
  CoreProductSonicAutonomyTracker,
  deriveCoreProductSonicAutonomyFingerprint,
} from './CoreProductSonicAutonomyFingerprint';

test('tracks autonomy changes monotonically across resetting native counters', () => {
  const tracker = new CoreProductSonicAutonomyTracker();
  const telemetry = enrichCoreProductHostTelemetry({
    schemaHash: 1,
    transportRunning: true,
    activeSources: 0,
    activeVoices: 0,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    scatterPulseCount: 11,
    routingMuteGroupTraceRevision: 7,
    autoCycleTransitionCount: 5,
    transportTransitionRevision: 3,
    synthSequencerHitCounts: [13, 17],
    drumSequencerHitCounts: [19],
  }, EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS, 0, 0, 0, tracker);

  assert.equal(telemetry.sonicAutonomyRevision, 0);
  assert.equal(telemetry.sonicAutonomyFingerprint, deriveCoreProductSonicAutonomyFingerprint(telemetry));
  const resetTelemetry = enrichCoreProductHostTelemetry({
    ...telemetry,
    scatterPulseCount: 0,
    routingMuteGroupTraceRevision: 0,
    autoCycleTransitionCount: 0,
    transportTransitionRevision: 0,
    synthSequencerHitCounts: [0, 0],
    drumSequencerHitCounts: [0],
  }, EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS, 0, 0, 0, tracker);
  assert.equal(resetTelemetry.sonicAutonomyRevision, 1);
  const repeatedTelemetry = enrichCoreProductHostTelemetry(
    resetTelemetry,
    EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS,
    0,
    0,
    0,
    tracker,
  );
  assert.equal(repeatedTelemetry.sonicAutonomyRevision, 1);
  assert.notEqual(
    deriveCoreProductSonicAutonomyFingerprint(telemetry),
    deriveCoreProductSonicAutonomyFingerprint({ ...telemetry, scatterPulseCount: 12 }),
  );
  assert.equal(
    deriveCoreProductSonicAutonomyFingerprint(telemetry),
    deriveCoreProductSonicAutonomyFingerprint({ ...telemetry, absoluteSampleTime: 480_000 }),
  );
});

test('fingerprints every completed sonic-autonomy workstream without hashing wall time', () => {
  const base = {
    schemaHash: 1,
    transportRunning: true,
    activeSources: 4,
    activeVoices: 8,
    activeAssets: 12,
    sequencerEventCount: 3,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    rngState: 17,
    sourceMorphAutomationEnabledMask: 1,
    sourceMorphValues: [0.25],
    autoStopEnabled: true,
    harmonyRootMidi: 60,
    harmonyScaleId: 1,
    harmonyTension: 0.35,
    harmonyChordDegree: 2,
    harmonyChordMidi: [60, 64, 67, 72],
    harmonyNotePoolMidi: [60, 62, 64],
    harmonyNextNotePoolMidi: [62, 64, 67],
    synthArpCurrentSteps: [1],
    synthArpCurrentMidis: [64],
    scatterPulseCount: 2,
    sceneProgramRevision: 3,
    scenePosition: 0.5,
    routingMuteGroupTraceRevision: 4,
    autoCycleTransitionCount: 5,
    synthSequencerHitCounts: [6],
    drumSequencerHitCounts: [7],
  };
  const fingerprint = deriveCoreProductSonicAutonomyFingerprint(base);
  const mutations = [
    { ...base, sourceMorphValues: [0.5] },
    { ...base, autoStopEnabled: false },
    { ...base, harmonyChordDegree: 3 },
    { ...base, harmonyChordMidi: [60, 63, 67, 72] },
    { ...base, harmonyNotePoolMidi: [60, 63, 64] },
    { ...base, synthArpCurrentSteps: [2] },
    { ...base, synthArpCurrentMidis: [67] },
    { ...base, scatterPulseCount: 3 },
    { ...base, scenePosition: 0.75 },
    { ...base, routingMuteGroupTraceRevision: 5 },
    { ...base, autoCycleTransitionCount: 6 },
    { ...base, synthSequencerHitCounts: [7] },
  ];
  for (const mutation of mutations) {
    assert.notEqual(deriveCoreProductSonicAutonomyFingerprint(mutation), fingerprint);
  }
  assert.equal(
    deriveCoreProductSonicAutonomyFingerprint({ ...base, absoluteSampleTime: 480_000 }),
    fingerprint,
  );
});
