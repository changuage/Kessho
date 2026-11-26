import assert from 'node:assert/strict';
import { createCoreProductGeneratedSequencerCaptureEvent } from '../../audio/coreProductEvents';
import type { CoreProductTelemetrySnapshot } from '../../audio/coreProductTelemetry';
import { CoreProductGeneratedSequencerCaptureTelemetryHistory } from '../../audio/product/host/CoreProductGeneratedSequencerCaptureTelemetryHistory';

function testGeneratedCaptureHistorySurvivesDisable(): void {
  const history = new CoreProductGeneratedSequencerCaptureTelemetryHistory();
  const telemetry = {
    generatedSequencerCaptureEvents: [{
      eventId: 1,
      absoluteSample: 128,
      sourceLaneIndex: 0,
      sourceMode: 'orbit',
      targetSourceId: 1,
      midiNote: 60,
      velocity: 0.75,
      gateSeconds: 0.2,
      sourceStepIndex: 1,
      sourceLayerIndex: null,
      sourceNoteIndex: null,
      targetStepIndex: 1,
      targetStepFloat: 1.15,
      nudge: 0.15,
    }],
    generatedSequencerCaptureOverflowCount: 2,
  } as CoreProductTelemetrySnapshot;

  const captured = history.withHistory(telemetry);
  const afterDisable = history.clearForEvent(
    createCoreProductGeneratedSequencerCaptureEvent({
      enabled: false,
      sourceLaneIndex: 0,
      targetLaneIndex: 0,
      sourceMode: 'orbit',
    }),
    captured,
  );
  assert.equal(
    afterDisable?.generatedSequencerCaptureEvents?.length,
    1,
    'disabling Product capture must not erase events before the UI commit flush reads them',
  );
  assert.equal(afterDisable?.generatedSequencerCaptureOverflowCount, 2);

  const afterEnable = history.clearForEvent(
    createCoreProductGeneratedSequencerCaptureEvent({
      enabled: true,
      sourceLaneIndex: 0,
      targetLaneIndex: 0,
      sourceMode: 'orbit',
    }),
    captured,
  );
  assert.equal(afterEnable?.generatedSequencerCaptureEvents?.length, 0);
  assert.equal(afterEnable?.generatedSequencerCaptureOverflowCount, 0);
}

function testGeneratedCaptureHiddenForegroundUsesAuthoritativePosition(): void {
  const events = [1.25, 3.25, 4.25].map((targetStepFloat, index) => ({
    eventId: index + 1,
    absoluteSample: [90_000, 100, 200][index]!,
    sourceLaneIndex: 0,
    sourceMode: 'orbit' as const,
    targetSourceId: 1,
    midiNote: 60 + index,
    velocity: 0.8,
    gateSeconds: 0.2,
    sourceStepIndex: Math.round(targetStepFloat) % 4,
    sourceLayerIndex: null,
    sourceNoteIndex: null,
    targetStepIndex: Math.round(targetStepFloat) % 4,
    targetStepFloat,
    nudge: 0,
  }));
  const history = new CoreProductGeneratedSequencerCaptureTelemetryHistory();
  history.withHistory({ generatedSequencerCaptureEvents: [events[0]] } as CoreProductTelemetrySnapshot);
  history.withHistory({ generatedSequencerCaptureEvents: [events[1]] } as CoreProductTelemetrySnapshot);
  const foregroundTelemetry = history.withHistory({ generatedSequencerCaptureEvents: [events[2]] } as CoreProductTelemetrySnapshot);

  assert.deepEqual(
    foregroundTelemetry.generatedSequencerCaptureEvents?.map((event) => event.eventId),
    [1, 2, 3],
    'Product capture history must retain hidden-interval events until the foreground reconciliation read',
  );
}

testGeneratedCaptureHistorySurvivesDisable();
testGeneratedCaptureHiddenForegroundUsesAuthoritativePosition();
