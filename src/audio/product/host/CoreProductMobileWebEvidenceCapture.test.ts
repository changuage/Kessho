import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error The release validator is an intentionally dependency-free Node module.
import { validateMobileWebAudioAcceptanceEvidence } from '../../../../scripts/lib/kesshoMobileWebAudioEvidence.mjs';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import {
  CoreProductMobileWebEvidenceCapture,
  type MobileWebEvidenceCaptureConfig,
  type MobileWebEvidenceExternalMeasurements,
} from './CoreProductMobileWebEvidenceCapture';

function telemetry(overrides: Partial<CoreProductTelemetrySnapshot> = {}): CoreProductTelemetrySnapshot {
  return {
    schemaHash: 1,
    transportRunning: true,
    activeSources: 2,
    activeVoices: 4,
    activeAssets: 3,
    sequencerEventCount: 5,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    sampleRate: 48_000,
    absoluteSampleTime: 1_000,
    sonicAutonomyRevision: 10,
    sonicAutonomyFingerprint: 'before',
    renderCpuPercent: 4,
    renderCpuPeakPercent: 7,
    renderP95Ms: 0.4,
    renderP99Ms: 0.6,
    missedQuantumCount: 0,
    wasmHeapBytes: 220 * 1024 * 1024,
    decodedAssetBytes: 150 * 1024 * 1024,
    assetAllocationBytes: 150 * 1024 * 1024,
    hostDecodedBytes: 8 * 1024 * 1024,
    inFlightDecodedBytes: 0,
    ...overrides,
  };
}

function config(browser: 'safari' | 'chrome' | 'home-screen' = 'safari'): MobileWebEvidenceCaptureConfig {
  return {
    device: { model: 'iPhone 11', os: '18.5', browser },
    scenario: {
      kind: 'screen-lock',
      presetId: 'default',
      output: 'speaker',
      durationMinutes: 15,
      lockedMinutes: 10,
      appSwitchedMinutes: 0,
      bundles: ['base-autonomy'],
    },
    initialAudibleGapCount: 2,
  };
}

function external(overrides: Partial<MobileWebEvidenceExternalMeasurements> = {}): MobileWebEvidenceExternalMeasurements {
  return {
    expectedTraceHash: 'after',
    afterAudibleGapCount: 2,
    processTerminated: false,
    warmedHeapFirstCycleBytes: 220 * 1024 * 1024,
    warmedHeapSecondCycleBytes: 220 * 1024 * 1024,
    assetAllocationFirstCycleBytes: 150 * 1024 * 1024,
    assetAllocationSecondCycleBytes: 150 * 1024 * 1024,
    thermalState: 'fair',
    sustainedThermalDropouts: false,
    maxAudibleGapMs: 0,
    repeatedGapPattern: false,
    outputCorrelation: 1,
    loudnessDeltaDb: 0,
    interruptionTested: false,
    interruptionRecoveryPass: false,
    lockScreenControlsPass: true,
    ...overrides,
  };
}

function acceptance(evidence: Record<string, unknown>): Record<string, unknown> {
  return evidence.acceptance as Record<string, unknown>;
}

test('builds pass evidence from one uninterrupted hidden render interval', () => {
  const capture = new CoreProductMobileWebEvidenceCapture(config(), telemetry());
  capture.observeVisibility(true, 1_000);
  capture.observeVisibility(false, 601_000);
  capture.observeTelemetry(telemetry({
    absoluteSampleTime: 28_801_000,
    sonicAutonomyRevision: 18,
    sonicAutonomyFingerprint: 'after',
    decodedAssetBytes: 155 * 1024 * 1024,
  }), false);

  const evidence = capture.finish(external());
  validateMobileWebAudioAcceptanceEvidence(evidence, 'browser capture compatibility test');
  const result = acceptance(evidence);
  assert.equal(result.milestone, 'base');
  assert.equal(result.runtimeClassification, 'pass');
  assert.equal((result.runtime as Record<string, unknown>).observedHiddenFrames, 28_800_000);
  assert.equal(result.maxDecodedAssetBytes, 155 * 1024 * 1024);
  assert.equal((result.hidden as Record<string, unknown>).hiddenUiCallbackCount, 0);
  assert.equal((result.hidden as Record<string, unknown>).foregroundRefreshCount, 1);
});

test('classifies near-zero Safari render coverage as browser policy suspension', () => {
  const capture = new CoreProductMobileWebEvidenceCapture(config('safari'), telemetry());
  capture.observeVisibility(true, 0);
  capture.observeVisibility(false, 600_000);
  capture.observeTelemetry(telemetry({ absoluteSampleTime: 1_128 }), false);
  assert.equal(acceptance(capture.finish(external())).runtimeClassification, 'browser-policy-suspension');
});

test('does not allow Home Screen render loss to pass as browser policy', () => {
  const capture = new CoreProductMobileWebEvidenceCapture(config('home-screen'), telemetry());
  capture.observeVisibility(true, 0);
  capture.observeVisibility(false, 600_000);
  capture.observeTelemetry(telemetry({ absoluteSampleTime: 1_128 }), false);
  assert.equal(acceptance(capture.finish(external())).runtimeClassification, 'engine-failure');
});

test('counts hidden telemetry callbacks and stale foreground reconciliation', () => {
  const capture = new CoreProductMobileWebEvidenceCapture(config(), telemetry());
  capture.observeVisibility(true, 0);
  capture.observeTelemetry(telemetry({ absoluteSampleTime: 1_100 }), true);
  capture.observeVisibility(false, 600_000);
  capture.observeTelemetry(telemetry({ absoluteSampleTime: 1_000 }), false);
  const hidden = acceptance(capture.finish(external())).hidden as Record<string, unknown>;
  assert.equal(hidden.hiddenUiCallbackCount, 1);
  assert.equal(hidden.staleForegroundEventCount, 1);
});

test('derives exact hidden Auto-Stop evidence from Product Core frames', () => {
  const baseConfig = config('home-screen');
  const autoStopConfig: MobileWebEvidenceCaptureConfig = {
    ...baseConfig,
    scenario: { ...baseConfig.scenario, bundles: ['auto-stop'] },
  };
  const capture = new CoreProductMobileWebEvidenceCapture(autoStopConfig, telemetry({
    autoStopEnabled: true,
    autoStopTargetSampleFrame: 5_761_000,
  }));
  capture.observeVisibility(true, 0);
  capture.observeVisibility(false, 180_000);
  capture.observeTelemetry(telemetry({
    absoluteSampleTime: 5_761_000,
    sonicAutonomyRevision: 11,
    sonicAutonomyFingerprint: 'after',
    autoStopEnabled: false,
    autoStopTargetSampleFrame: 5_761_000,
  }), false);
  const runtime = acceptance(capture.finish(external())).runtime as Record<string, unknown>;
  assert.equal(runtime.autoStopTargetFrame, 5_761_000);
  assert.equal(runtime.autoStopObservedFrame, 5_761_000);
  assert.equal(runtime.autoStopFiredWhileHidden, true);
});

test('projects advanced Journey readiness from Product Core telemetry', () => {
  const baseConfig = config('home-screen');
  const advancedConfig: MobileWebEvidenceCaptureConfig = {
    ...baseConfig,
    scenario: { ...baseConfig.scenario, bundles: ['base-max-cpu', 'advanced-parity'] },
  };
  const journeyTelemetry = {
    journeyScheduleRevision: 19,
    journeyPreparedTotalFrames: 48_000 * 7_200,
    journeyScheduleEntryCount: 300,
    journeyTransitionCount: 42,
  };
  const capture = new CoreProductMobileWebEvidenceCapture(advancedConfig, telemetry(journeyTelemetry));
  capture.observeVisibility(true, 1_000);
  capture.observeVisibility(false, 601_000);
  capture.observeTelemetry(telemetry({
    ...journeyTelemetry,
    absoluteSampleTime: 28_801_000,
    sonicAutonomyRevision: 18,
    sonicAutonomyFingerprint: 'after',
  }), false);
  const evidence = capture.finish(external());
  validateMobileWebAudioAcceptanceEvidence(evidence, 'advanced Journey capture test');
  const result = acceptance(evidence);
  const runtime = result.runtime as Record<string, unknown>;
  assert.equal(result.milestone, 'advanced');
  assert.equal(runtime.journeyReady, true);
  assert.equal(runtime.journeyPreparedDurationSeconds, 7_200);
  assert.equal(runtime.journeyScheduleEntries, 300);
  assert.equal(runtime.journeyTransitionCount, 42);
});

test('rejects a second hidden interval instead of producing ambiguous frame evidence', () => {
  const capture = new CoreProductMobileWebEvidenceCapture(config(), telemetry());
  capture.observeVisibility(true, 0);
  capture.observeVisibility(false, 1_000);
  capture.observeTelemetry(telemetry({ absoluteSampleTime: 49_000 }), false);
  assert.throws(() => capture.observeVisibility(true, 2_000), /one continuous hidden interval/);
});
