import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { BackgroundJourneyPlan } from '../journey/compileBackgroundJourneyPlan';
import type { CoreProductAssetRegistrar } from './CoreProductAssetRegistrar';
import { CoreProductBackgroundJourneyCoordinator } from './CoreProductBackgroundJourneyCoordinator';

const plan = {
  revision: 7,
  entries: [{
    fromNodeIndex: 0,
    toNodeIndex: 0,
    transitionProgramIndex: -1,
    holdFrames: 48_000n,
    morphFrames: 0n,
    flags: 1,
  }],
  transitionPrograms: [],
  loopStartIndex: 0,
  totalFrames: 48_000n,
  rngStateAfterPlan: 1,
  referencedNodeMask: 1,
} as unknown as BackgroundJourneyPlan;
const replacementPlan = { ...plan, revision: 8 } as BackgroundJourneyPlan;

function coordinatorWith(options: {
  ensure: () => Promise<unknown>;
  onClear: () => void;
  prediction?: { complete: boolean; decodedBytes: number; largestPendingDecodeBytes: number; assetCount: number };
  visible?: boolean;
  isVisible?: () => boolean;
  waitForVisibleDelay?: (delayMs: number) => Promise<boolean>;
  onTelemetryRequest?: () => void;
  telemetry?: () => CoreProductTelemetrySnapshot | null;
}) {
  const assets = {
    predictSceneAssetBytes: () => options.prediction ?? ({ complete: true, decodedBytes: 1024, largestPendingDecodeBytes: 512, assetCount: 1 }),
    registeredDecodedAssetByteLength: () => 0,
    ensureSceneAssets: options.ensure,
    clearSceneAssets: options.onClear,
    backgroundAssetClosure: () => ({
      ready: true,
      pendingRegistrationAssetIds: [],
      registeredDecodedBytes: 1024,
      readinessRevision: 3,
    }),
    hostDecodedBytes: () => 0,
  } as unknown as CoreProductAssetRegistrar;
  const runtime = {
    audioContext: { sampleRate: 48_000 },
    postEvents: () => {},
    requestTelemetryOnce: () => options.onTelemetryRequest?.(),
  } as unknown as CoreProductRuntime;
  return new CoreProductBackgroundJourneyCoordinator({
    assets,
    runtime,
    telemetry: options.telemetry ?? (() => null),
    isDocumentVisible: options.isVisible ?? (() => options.visible ?? true),
    waitForVisibleDelay: options.waitForVisibleDelay ?? (async () => options.isVisible?.() ?? options.visible ?? true),
    post: () => {},
    stopLegacyMorphClock: () => {},
  });
}

test('preserves asset admission diagnostics and releases failed scene closure', async () => {
  let clearCount = 0;
  const coordinator = coordinatorWith({
    ensure: async () => ({ status: 'not-ready', reason: 'hard-budget', requiredBytes: 200, hardBytes: 192 }),
    onClear: () => { clearCount += 1; },
  });
  const readiness = await coordinator.prepare(plan, [{}]);
  assert.deepEqual(readiness, {
    status: 'not-ready',
    reason: 'hard-budget',
    requiredBytes: 200,
    limitBytes: 192,
  });
  assert.equal(clearCount, 1);
});

test('pre-admission rejection releases any previously retained scene closure', async () => {
  let clearCount = 0;
  const coordinator = coordinatorWith({
    ensure: async () => ({ status: 'ready' }),
    onClear: () => { clearCount += 1; },
    prediction: { complete: false, decodedBytes: 0, largestPendingDecodeBytes: 0, assetCount: 1 },
  });
  assert.deepEqual(await coordinator.prepare(plan, [{}]), {
    status: 'not-ready',
    reason: 'asset-metadata-missing',
  });
  assert.equal(clearCount, 1);
});

test('discard during asset decoding prevents stale ready publication', async () => {
  let clearCount = 0;
  let resolveEnsure!: (value: unknown) => void;
  const ensure = new Promise((resolve) => { resolveEnsure = resolve; });
  const coordinator = coordinatorWith({
    ensure: () => ensure,
    onClear: () => { clearCount += 1; },
  });
  const preparing = coordinator.prepare(plan, [{}]);
  coordinator.discard();
  resolveEnsure({ status: 'ready' });
  assert.deepEqual(await preparing, { status: 'idle' });
  assert.deepEqual(coordinator.getReadiness(), { status: 'idle' });
  assert.equal(clearCount, 2);
});

test('visibility loss aborts the ACK loop before another telemetry request', async () => {
  let visible = true;
  let waitCount = 0;
  let telemetryRequests = 0;
  const coordinator = coordinatorWith({
    ensure: async () => ({ status: 'ready' }),
    onClear: () => {},
    isVisible: () => visible,
    waitForVisibleDelay: async () => {
      waitCount += 1;
      if (waitCount === 1) return true;
      visible = false;
      return false;
    },
    onTelemetryRequest: () => { telemetryRequests += 1; },
  });

  assert.deepEqual(await coordinator.prepare(plan, [{}]), {
    status: 'not-ready',
    reason: 'document-hidden',
    registeredAssetBytes: 1024,
  });
  assert.equal(telemetryRequests, 0);
});

test('replacement preparation waits for cancelled decode cleanup', async () => {
  let ensureCalls = 0;
  let clearCount = 0;
  let resolveFirst!: (value: unknown) => void;
  const firstEnsure = new Promise((resolve) => { resolveFirst = resolve; });
  const coordinator = coordinatorWith({
    ensure: () => {
      ensureCalls += 1;
      return ensureCalls === 1 ? firstEnsure : Promise.resolve({ status: 'ready' });
    },
    onClear: () => { clearCount += 1; },
    telemetry: () => ({
      journeyScheduleRevision: replacementPlan.revision,
      journeyPreparedTotalFrames: Number(replacementPlan.totalFrames),
    } as CoreProductTelemetrySnapshot),
  });

  const first = coordinator.prepare(plan, [{}]);
  await Promise.resolve();
  coordinator.discard();
  const replacement = coordinator.prepare(replacementPlan, [{}]);
  await Promise.resolve();
  assert.equal(ensureCalls, 1, 'replacement entered asset preparation before stale cleanup');

  resolveFirst({ status: 'ready' });
  assert.deepEqual(await first, { status: 'idle' });
  assert.deepEqual(await replacement, {
    status: 'ready',
    revision: replacementPlan.revision,
    preparedFrames: Number(replacementPlan.totalFrames),
    scheduleEntries: replacementPlan.entries.length,
    registeredAssetBytes: 1024,
  });
  assert.equal(ensureCalls, 2);
  assert.equal(clearCount, 2, 'replacement closure was cleared after it took ownership');
});

test('discard cancels a replacement queued behind stale cleanup', async () => {
  let ensureCalls = 0;
  let resolveFirst!: (value: unknown) => void;
  const firstEnsure = new Promise((resolve) => { resolveFirst = resolve; });
  const coordinator = coordinatorWith({
    ensure: () => {
      ensureCalls += 1;
      return firstEnsure;
    },
    onClear: () => {},
  });

  const first = coordinator.prepare(plan, [{}]);
  await Promise.resolve();
  coordinator.discard();
  const replacement = coordinator.prepare(replacementPlan, [{}]);
  coordinator.discard();
  resolveFirst({ status: 'ready' });

  assert.deepEqual(await first, { status: 'idle' });
  assert.deepEqual(await replacement, { status: 'idle' });
  assert.deepEqual(coordinator.getReadiness(), { status: 'idle' });
  assert.equal(ensureCalls, 1);
});
