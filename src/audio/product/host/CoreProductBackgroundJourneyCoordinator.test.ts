import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoreProductRuntime } from '../../coreProductRuntime';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';
import type { BackgroundJourneyPlan } from '../journey/compileBackgroundJourneyPlan';
import { ProductRuntimeScheduler } from '../scheduling/ProductRuntimeScheduler';
import { CoreProductTelemetryCallbackScheduler } from './CoreProductTelemetryCallbackScheduler';
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
const transitionPlan = {
  revision: 9,
  entries: [
    {
      fromNodeIndex: 0,
      toNodeIndex: 1,
      transitionProgramIndex: -1,
      holdFrames: 48_000n,
      morphFrames: 24_000n,
      flags: 1,
    },
    {
      fromNodeIndex: 1,
      toNodeIndex: 0,
      transitionProgramIndex: -1,
      holdFrames: 48_000n,
      morphFrames: 24_000n,
      flags: 1,
    },
  ],
  transitionPrograms: [],
  loopStartIndex: 0,
  totalFrames: 144_000n,
  rngStateAfterPlan: 1,
  referencedNodeMask: 3,
} as unknown as BackgroundJourneyPlan;

function coordinatorWith(options: {
  ensure: () => Promise<unknown>;
  onClear: () => void;
  prediction?: { complete: boolean; decodedBytes: number; largestPendingDecodeBytes: number; assetCount: number };
  visible?: boolean;
  isVisible?: () => boolean;
  waitForVisibleDelay?: (delayMs: number) => Promise<boolean>;
  onTelemetryRequest?: () => void;
  onPost?: (event: { value?: number }) => void;
  onUpload?: () => void;
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
    postEvents: () => options.onUpload?.(),
    requestTelemetryOnce: () => options.onTelemetryRequest?.(),
  } as unknown as CoreProductRuntime;
  return new CoreProductBackgroundJourneyCoordinator({
    assets,
    runtime,
    telemetry: options.telemetry ?? (() => null),
    isDocumentVisible: options.isVisible ?? (() => options.visible ?? true),
    waitForVisibleDelay: options.waitForVisibleDelay ?? (async () => options.isVisible?.() ?? options.visible ?? true),
    post: (event) => options.onPost?.(event),
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

test('hidden document cannot begin background journey preparation or upload', async () => {
  let ensureCalls = 0;
  let uploadCalls = 0;
  let clearCount = 0;
  const coordinator = coordinatorWith({
    ensure: async () => {
      ensureCalls += 1;
      return { status: 'ready' };
    },
    onClear: () => { clearCount += 1; },
    visible: false,
    onUpload: () => { uploadCalls += 1; },
  });

  assert.deepEqual(await coordinator.prepare(plan, [{}]), {
    status: 'not-ready',
    reason: 'document-hidden',
  });
  assert.equal(ensureCalls, 0);
  assert.equal(uploadCalls, 0);
  assert.equal(clearCount, 1);
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

test('started Product Journey keeps its schedule when the document becomes hidden', async () => {
  let visible = true;
  const posted: boolean[] = [];
  const coordinator = coordinatorWith({
    ensure: async () => ({ status: 'ready' }),
    onClear: () => {},
    isVisible: () => visible,
    waitForVisibleDelay: async () => true,
    onPost: (event) => posted.push((event.value ?? 0) >= 0.5),
    telemetry: () => ({
      journeyScheduleRevision: plan.revision,
      journeyPreparedTotalFrames: Number(plan.totalFrames),
    } as CoreProductTelemetrySnapshot),
  });
  assert.equal((await coordinator.prepare(plan, [{}])).status, 'ready');
  assert.equal(coordinator.start(plan.revision), true);
  visible = false;
  assert.deepEqual(posted, [true], 'hiding the document must not stop an already-started Product Journey');
});

test('running prepared Journey crosses a node transition while UI telemetry is parked', async () => {
  let visible = true;
  const posted: boolean[] = [];
  const frames: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => !visible,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  const telemetryScheduler = new CoreProductTelemetryCallbackScheduler(scheduler);
  let projectedTelemetry: CoreProductTelemetrySnapshot | null = null;
  let visualCallbackCount = 0;
  telemetryScheduler.setCallback((telemetry) => { projectedTelemetry = telemetry; }, null);
  const coordinator = coordinatorWith({
    ensure: async () => ({ status: 'ready' }),
    onClear: () => {},
    isVisible: () => visible,
    waitForVisibleDelay: async () => true,
    onPost: (event) => posted.push((event.value ?? 0) >= 0.5),
    telemetry: () => ({
      journeyScheduleRevision: transitionPlan.revision,
      journeyPreparedTotalFrames: Number(transitionPlan.totalFrames),
    } as CoreProductTelemetrySnapshot),
  });

  try {
    assert.equal((await coordinator.prepare(transitionPlan, [{}])).status, 'ready');
    assert.equal(coordinator.start(transitionPlan.revision), true);

    visible = false;
    scheduler.setDocumentHidden(true);
    scheduler.schedule('visible-visuals', () => { visualCallbackCount += 1; });
    telemetryScheduler.schedule({
      transportRunning: true,
      journeyScheduleRevision: transitionPlan.revision,
      journeySchedulePhase: 1,
      journeyScheduleRunning: true,
      journeyCurrentNodeIndex: 1,
      journeyNextNodeIndex: 0,
      journeyScheduleIndex: 1,
      journeyTransitionCount: 1,
    } as CoreProductTelemetrySnapshot);
    scheduler.flushNowForTests();

    assert.equal(frames.length, 0, 'parked UI polling must not schedule a hidden telemetry frame');
    assert.equal(projectedTelemetry, null, 'hidden UI must not project a stale pre-transition node');
    assert.equal(visualCallbackCount, 0, 'hidden UI must park visual/rAF callbacks');
    assert.deepEqual(posted, [true], 'hiding must not stop or restart the Product Journey');

    visible = true;
    scheduler.setDocumentHidden(false);
    assert.equal(frames.length, 1, 'foreground should request one consolidated telemetry refresh');
    frames[0]?.(16);
    assert.ok(projectedTelemetry);
    assert.equal(visualCallbackCount, 1, 'foreground should release the parked visual callback');
    const authoritativeTelemetry = projectedTelemetry as CoreProductTelemetrySnapshot;
    assert.equal(authoritativeTelemetry.journeyCurrentNodeIndex, 1);
    assert.equal(authoritativeTelemetry.journeyScheduleIndex, 1);
    assert.deepEqual(posted, [true], 'foreground reconciliation must not emit a duplicate start/resume command');
  } finally {
    scheduler.dispose();
  }
});
