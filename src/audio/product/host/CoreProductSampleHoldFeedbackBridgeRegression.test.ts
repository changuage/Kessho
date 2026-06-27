import assert from 'node:assert/strict';
import {
  CORE_PRODUCT_SOURCE_IDS,
} from '../../coreProductEvents';
import type {
  CoreProductModulationDebugEntry,
  CoreProductTelemetrySnapshot,
} from '../../coreProductTelemetry';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';
import {
  createCoreProductSampleHoldDebugState,
  updateCoreProductSampleHoldTriggerFeedback,
} from './CoreProductSampleHoldFeedbackBridge';

type PublishedCall = [string, ...unknown[]];

const SAMPLE_HOLD_CONTROL_ID = 101;
const SAMPLE_HOLD_TRIGGER_KEY = [
  SAMPLE_HOLD_CONTROL_ID,
  CORE_PRODUCT_SOURCE_IDS.pad1,
  KESSHO_PRODUCT_PARAM_IDS.SourceMorph,
].join(':');

function sampleHoldEntry(triggerCounter: number): CoreProductModulationDebugEntry {
  return {
    controlId: SAMPLE_HOLD_CONTROL_ID,
    controlName: 'padMorph',
    targetId: CORE_PRODUCT_SOURCE_IDS.pad1,
    paramId: KESSHO_PRODUCT_PARAM_IDS.SourceMorph,
    mode: 'sampleHold',
    min: 0,
    max: 1,
    currentValue: 0.7,
    normalizedPosition: 0.7,
    speed: 0,
    randomWalkGlobal: false,
    triggerBus: 0,
    triggerCounter,
    lastTriggerFrame: triggerCounter * 128,
    lastTriggerSource: 0,
    seed: 42,
  };
}

function telemetryWithSampleHold(triggerCounter: number): CoreProductTelemetrySnapshot {
  return {
    schemaHash: 1,
    transportRunning: true,
    activeSources: 1,
    activeVoices: 1,
    activeAssets: 0,
    sequencerEventCount: 0,
    controlQueueDepth: 0,
    assetMissingCount: 0,
    lastErrorCode: 0,
    productModulationDebug: {
      randomWalk: [],
      sampleHold: [sampleHoldEntry(triggerCounter)],
    },
  };
}

{
  const triggerCounters = new Map<string, number>();
  const debugState = createCoreProductSampleHoldDebugState();
  const published: PublishedCall[] = [];
  const capturePublished = (name: string, ...payload: unknown[]): void => {
    published.push([name, ...payload]);
  };

  updateCoreProductSampleHoldTriggerFeedback({
    telemetry: telemetryWithSampleHold(1),
    triggerCounters,
    debugState,
    publish: capturePublished,
    publishFeedback: false,
  });

  assert.equal(published.length, 0, 'disabled feedback should not publish visual sample-hold payloads');
  assert.equal(triggerCounters.get(SAMPLE_HOLD_TRIGGER_KEY), 1, 'disabled feedback should still advance trigger counters');
  assert.equal(debugState.telemetryUpdateCount, 1);
  assert.equal(debugState.changedTriggerCount, 1);
  assert.equal(debugState.publishedSourceCount, 0);
  assert.deepEqual(debugState.lastKeys, ['padMorph']);

  updateCoreProductSampleHoldTriggerFeedback({
    telemetry: telemetryWithSampleHold(1),
    triggerCounters,
    debugState,
    publish: capturePublished,
    publishFeedback: true,
  });

  assert.equal(published.length, 0, 're-enabling feedback should not replay already-accounted triggers');

  updateCoreProductSampleHoldTriggerFeedback({
    telemetry: telemetryWithSampleHold(2),
    triggerCounters,
    debugState,
    publish: capturePublished,
    publishFeedback: true,
  });

  assert.deepEqual(
    published.map(([name]) => name),
    ['padMorph', 'granularSH'],
    'fresh triggers should publish source feedback and generic flash feedback when enabled',
  );
  assert.deepEqual(published[0], ['padMorph', 0.7]);
  assert.deepEqual(published[1], ['granularSH', { padMorph: 0.7 }]);
  assert.equal(debugState.changedTriggerCount, 2);
  assert.equal(debugState.publishedSourceCount, 1);
  assert.equal(debugState.publishedGenericCount, 1);
}

console.log('Product sample-hold feedback regression passed');
