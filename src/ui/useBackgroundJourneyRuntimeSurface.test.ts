import assert from 'node:assert/strict';
import test from 'node:test';

import type { JourneyConfig } from '../audio/journeyTypes';
import type { CoreProductTelemetrySnapshot } from '../audio/coreProductTelemetry';
import {
  projectBackgroundJourneyMorph,
  projectBackgroundJourneyTelemetry,
  requestAndReadBackgroundJourneyTelemetry,
  shouldRefreshBackgroundJourneyTelemetry,
} from './backgroundJourneyRuntimeCoordinator';
import type { SavedPreset } from './state';

const playableNodes = [
  { id: 'node-a' },
  { id: 'node-b' },
] as JourneyConfig['nodes'];

const morphNodes = [
  { id: 'node-a' },
  { id: 'node-b' },
  { id: 'node-c' },
] as JourneyConfig['nodes'];

const morphPresets = new Map<string, SavedPreset>([
  ['node-a', { name: 'Preset A', timestamp: '', state: {} as SavedPreset['state'] }],
  ['node-b', { name: 'Preset B', timestamp: '', state: {} as SavedPreset['state'] }],
  ['node-c', { name: 'Preset C', timestamp: '', state: {} as SavedPreset['state'] }],
]);

test('background morph projection alternates A/B slots on even and odd transitions', () => {
  const forward = projectBackgroundJourneyMorph({
    journeyCurrentNodeIndex: 0,
    journeyNextNodeIndex: 1,
    journeyScheduleIndex: 0,
    journeyTransitionCount: 0,
    journeyMorphProgress: 0.25,
  }, morphNodes, morphPresets);
  assert.ok(forward);
  assert.equal(forward.morphPresetA.name, 'Preset A');
  assert.equal(forward.morphPresetB.name, 'Preset B');
  assert.equal(forward.morphSlotAName, 'Preset A');
  assert.equal(forward.morphSlotBName, 'Preset B');
  assert.equal(forward.morphPosition, 25);
  assert.equal(forward.morphDirection, 'toB');

  const reverse = projectBackgroundJourneyMorph({
    journeyCurrentNodeIndex: 1,
    journeyNextNodeIndex: 2,
    journeyScheduleIndex: 1,
    journeyTransitionCount: 1,
    journeyMorphProgress: 0.25,
  }, morphNodes, morphPresets);
  assert.ok(reverse);
  assert.equal(reverse.morphPresetA.name, 'Preset C');
  assert.equal(reverse.morphPresetB.name, 'Preset B');
  assert.equal(reverse.morphPosition, 75);
  assert.equal(reverse.morphDirection, 'toA');
});

test('background morph projection preserves alternating parity through loop restarts and self-loops', () => {
  const afterLoop = projectBackgroundJourneyMorph({
    journeyCurrentNodeIndex: 0,
    journeyNextNodeIndex: 1,
    journeyScheduleIndex: 0,
    journeyTransitionCount: 2,
    journeyMorphProgress: 0,
  }, morphNodes, morphPresets);
  assert.ok(afterLoop);
  assert.equal(afterLoop.morphPresetA.name, 'Preset A');
  assert.equal(afterLoop.morphPresetB.name, 'Preset B');
  assert.equal(afterLoop.morphPosition, 0);
  assert.equal(afterLoop.morphDirection, 'toB');

  const selfLoop = projectBackgroundJourneyMorph({
    journeyCurrentNodeIndex: 1,
    journeyNextNodeIndex: 1,
    journeyScheduleIndex: 1,
    journeyTransitionCount: 3,
    journeyMorphProgress: 0,
  }, morphNodes, morphPresets);
  assert.ok(selfLoop);
  assert.equal(selfLoop.morphPresetA.name, 'Preset B');
  assert.equal(selfLoop.morphPresetB.name, 'Preset B');
  assert.equal(selfLoop.morphPosition, 100);
  assert.equal(selfLoop.morphDirection, 'toA');
});

test('background morph projection declines incomplete telemetry or preset maps', () => {
  assert.equal(projectBackgroundJourneyMorph({
    journeyCurrentNodeIndex: 0,
    journeyNextNodeIndex: 99,
    journeyScheduleIndex: 0,
    journeyTransitionCount: 0,
    journeyMorphProgress: 0,
  }, morphNodes, morphPresets), null);
});

test('foreground reconciliation waits for the fresh asynchronous host snapshot before projecting', () => {
  const staleSnapshot = {
    journeyCurrentNodeIndex: 0,
    journeyScheduleIndex: 0,
  } as CoreProductTelemetrySnapshot;
  const freshSnapshot = {
    journeySchedulePhase: 2,
    journeyScheduleRunning: true,
    journeyCurrentNodeIndex: 1,
    journeyNextNodeIndex: 0,
    journeyScheduleIndex: 1,
    journeyHoldProgress: 0.6,
    journeyMorphProgress: 0.25,
  } as CoreProductTelemetrySnapshot;
  let hostSnapshot: CoreProductTelemetrySnapshot | null = staleSnapshot;
  let requestCount = 0;
  let deliverFreshSnapshot!: () => void;
  const reads: Array<{ callback: () => void; cancelled: boolean }> = [];
  let projectedSnapshot: CoreProductTelemetrySnapshot | null = null;
  let projectedNodeId: string | null = null;
  let projectedScheduleIndex: number | null = null;
  let projectedPhraseProgress = 0;
  let projectedMorphProgress = 0;

  const cancel = requestAndReadBackgroundJourneyTelemetry(
    () => {
      requestCount += 1;
      deliverFreshSnapshot = () => { hostSnapshot = freshSnapshot; };
    },
    () => hostSnapshot,
    (callback) => {
      const read = { callback, cancelled: false };
      reads.push(read);
      return () => { read.cancelled = true; };
    },
    (telemetry) => {
      projectedSnapshot = telemetry;
      const projection = projectBackgroundJourneyTelemetry(telemetry, playableNodes);
      projectedNodeId = projection.currentNodeId;
      projectedScheduleIndex = projection.scheduleIndex;
      projectedPhraseProgress = projection.phraseProgress;
      projectedMorphProgress = projection.morphProgress;
    },
  );

  assert.equal(requestCount, 1, 'foreground should prompt one telemetry request');
  assert.equal(projectedSnapshot, null, 'the stale cache must not be projected immediately');
  assert.equal(reads.length, 1);

  deliverFreshSnapshot();
  reads.shift()?.callback();

  assert.equal(projectedSnapshot, freshSnapshot, 'the first fresh host response must be consumed immediately');
  assert.ok(projectedSnapshot);
  const authoritativeSnapshot = projectedSnapshot as CoreProductTelemetrySnapshot;
  assert.equal(authoritativeSnapshot.journeyCurrentNodeIndex, 1);
  assert.equal(authoritativeSnapshot.journeyScheduleIndex, 1);
  assert.equal(projectedNodeId, 'node-b');
  assert.equal(projectedScheduleIndex, 1);
  assert.equal(projectedPhraseProgress, 0.6);
  assert.equal(projectedMorphProgress, 0.25);
  cancel();
});

test('a telemetry read settles after its retry budget so the next poll can proceed', () => {
  const staleSnapshot = {} as CoreProductTelemetrySnapshot;
  const reads: Array<() => void> = [];
  let settled = 0;
  const cancel = requestAndReadBackgroundJourneyTelemetry(
    () => undefined,
    () => staleSnapshot,
    (callback) => {
      reads.push(callback);
      return () => undefined;
    },
    () => assert.fail('stale telemetry must not be projected'),
    2,
    () => { settled += 1; },
  );

  reads.shift()?.();
  reads.shift()?.();
  assert.equal(settled, 1);
  cancel();
  assert.equal(settled, 1, 'cancelling an already-settled read must not settle it twice');
});

test('authoritative foreground telemetry projects the current node and schedule step without resetting the journey', () => {
  const projection = projectBackgroundJourneyTelemetry({
    journeySchedulePhase: 2,
    journeyScheduleRunning: true,
    journeyCurrentNodeIndex: 1,
    journeyNextNodeIndex: 0,
    journeyScheduleIndex: 17,
    journeyHoldProgress: 0.75,
    journeyMorphProgress: 0.4,
  }, playableNodes);

  assert.deepEqual(projection, {
    phase: 'morphing',
    currentNodeId: 'node-b',
    nextNodeId: 'node-a',
    scheduleIndex: 17,
    phraseProgress: 0.75,
    morphProgress: 0.4,
  });
});

test('foreground re-entry refreshes an active runtime once without issuing a playback command', () => {
  assert.equal(shouldRefreshBackgroundJourneyTelemetry(
    { documentVisible: false, runtimeProjectionActive: true },
    { documentVisible: true, runtimeProjectionActive: true },
  ), true);
  assert.equal(shouldRefreshBackgroundJourneyTelemetry(
    { documentVisible: true, runtimeProjectionActive: true },
    { documentVisible: true, runtimeProjectionActive: true },
  ), false);
  assert.equal(shouldRefreshBackgroundJourneyTelemetry(
    { documentVisible: true, runtimeProjectionActive: false },
    { documentVisible: true, runtimeProjectionActive: true },
  ), true);
  assert.equal(shouldRefreshBackgroundJourneyTelemetry(
    { documentVisible: false, runtimeProjectionActive: false },
    { documentVisible: true, runtimeProjectionActive: false },
  ), false);
});
