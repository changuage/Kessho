import assert from 'node:assert/strict';
import { ProductRuntimeLifecycleController, type ProductLifecycleDelegate } from './ProductRuntimeLifecycleController';
import type { ProductEngineLifecycleState } from '../ProductEngineTypes';
import { CoreProductHostLifecycleCoordinator } from '../host/CoreProductHostLifecycleCoordinator';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createDelegate(overrides: Partial<ProductLifecycleDelegate> = {}) {
  const calls: string[] = [];
  const states: ProductEngineLifecycleState[] = [];
  const delegate: ProductLifecycleDelegate = {
    preloadRuntime: async () => { calls.push('preload'); },
    startRuntime: async () => { calls.push('start'); },
    stopRuntime: async () => { calls.push('stop'); },
    suspendRuntime: async () => { calls.push('suspend'); },
    resumeRuntime: async () => { calls.push('resume'); },
    disposeRuntime: async () => { calls.push('dispose'); },
    publishState: (state) => { states.push(state); },
    ...overrides,
  };
  return { calls, delegate, states };
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.start();

  assert.equal(controller.currentStatus, 'running');
  assert.deepEqual(calls, ['start']);
  assert.deepEqual(states, ['starting', 'running']);
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.start();
  await controller.start();

  assert.equal(controller.currentStatus, 'running');
  assert.equal(controller.lastRejectedTransitionReason, 'duplicate-start');
  assert.deepEqual(calls, ['start'], 'running -> start must no-op');
  assert.deepEqual(states, ['starting', 'running', 'running']);
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.start();
  await controller.suspend();
  await controller.resume();

  assert.equal(controller.currentStatus, 'running');
  assert.deepEqual(calls, ['start', 'suspend', 'resume']);
  assert.deepEqual(states, ['starting', 'running', 'suspending', 'suspended', 'starting', 'running']);
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.start();
  await controller.suspend();
  await controller.preload();

  assert.equal(controller.currentStatus, 'suspended');
  assert.equal(controller.lastRejectedTransitionReason, 'illegal-preload-while-suspended');
  assert.deepEqual(calls, ['start', 'suspend']);
  assert.deepEqual(states, ['starting', 'running', 'suspending', 'suspended', 'suspended']);
}

{
  const failure = new Error('start failed');
  const { delegate, states } = createDelegate({
    startRuntime: async () => { throw failure; },
  });
  const controller = new ProductRuntimeLifecycleController(delegate);

  await assert.rejects(() => controller.start(), failure);
  await controller.resume();

  assert.equal(controller.currentStatus, 'failed');
  assert.equal(controller.lastRejectedTransitionReason, 'illegal-resume-while-failed');
  assert.deepEqual(states, ['starting', 'failed', 'failed']);
}

{
  const gate = createDeferred();
  const { calls, delegate, states } = createDelegate({
    startRuntime: async () => { calls.push('start'); await gate.promise; },
    stopRuntime: async () => { calls.push('stop'); },
  });
  const controller = new ProductRuntimeLifecycleController(delegate);
  const start = controller.start();

  await Promise.resolve();
  const stop = controller.stop();
  assert.deepEqual(calls, ['start'], 'stop must serialize behind in-flight start');
  assert.equal(controller.currentStatus, 'starting');
  gate.resolve();
  await start;
  await stop;

  assert.equal(controller.currentStatus, 'stopped');
  assert.deepEqual(calls, ['start', 'stop']);
  assert.deepEqual(states, ['starting', 'stopping', 'stopped']);
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.start();
  await controller.dispose();
  await controller.start();

  assert.equal(controller.currentStatus, 'disposed');
  assert.equal(controller.lastRejectedTransitionReason, 'illegal-start-while-disposed');
  assert.deepEqual(calls, ['start', 'dispose']);
  assert.deepEqual(states, ['starting', 'running', 'disposed', 'disposed']);
}

{
  const calls: string[] = [];
  const snapshotGate = createDeferred();
  let latestState: Record<string, unknown> | null = null;
  const coordinator = new CoreProductHostLifecycleCoordinator({
    runtime: {
      ensureStarted: async () => { calls.push('ensureStarted'); },
      resume: async () => { calls.push('resume'); },
      suspend: async () => { calls.push('suspend'); },
    } as never,
    assetRegistrar: {
      ensureDefaultAssetsForState: async () => { calls.push('ensureAssets'); },
      clear: () => { calls.push('clearAssets'); },
    } as never,
    arrangementBridge: {
      start: () => { calls.push('arrangementStart'); },
      stop: () => { calls.push('arrangementStop'); },
    } as never,
    journeyMorphClock: {} as never,
    modulationRangeBridge: {
      flushModulationRanges: () => { calls.push('flushModulation'); },
    } as never,
    postSnapshotEvents: {
      clear: () => { calls.push('clearPostSnapshotEvents'); },
    } as never,
    realtimeTimestampMapper: {
      reset: () => { calls.push('resetTimestampMapper'); },
    } as never,
    sequencerChain: {
      start: () => { calls.push('sequencerStart'); },
      stop: () => { calls.push('sequencerStop'); },
    } as never,
    sequencerVisuals: {
      reset: () => { calls.push('resetSequencerVisuals'); },
    } as never,
    latestSliderState: () => latestState,
    setLatestSliderState: (state) => { latestState = state; calls.push('setLatestState'); },
    adapterState: () => ({}),
    setLatestProductSnapshotNull: () => { calls.push('snapshotNull'); },
    setRuntimeReady: (ready) => { calls.push(`runtimeReady:${ready}`); },
    setRunning: (running) => { calls.push(`running:${running}`); },
    resetSequencerEvolveState: () => { calls.push('resetEvolve'); },
    resetSynthNoteRangeOverrides: () => { calls.push('resetNoteRange'); },
    updateRuntimeTelemetryPolling: () => { calls.push('telemetryPolling'); },
    loadLatestSnapshot: async (reason, includeClockStartDelay, awaitAudioThreadAck) => {
      calls.push(`load:${reason}:${String(includeClockStartDelay)}:${String(awaitAudioThreadAck)}`);
      await snapshotGate.promise;
      calls.push('loadDone');
    },
    postRuntimeProductEvent: () => { calls.push('postStart'); },
    publishStateChange: (running) => { calls.push(`publish:${running}`); },
  });

  const start = coordinator.start({
    synthChordGeneratorEnabled: true,
    synthChordGeneratorSource: 'sample2',
  });
  for (let guard = 0; guard < 8 && !calls.includes('load:runtime-start:true:true'); guard += 1) {
    await Promise.resolve();
  }
  assert.deepEqual(
    calls,
    [
      'setLatestState',
      'ensureStarted',
      'runtimeReady:true',
      'ensureAssets',
      'resetEvolve',
      'resume',
      'load:runtime-start:true:true',
    ],
    'host lifecycle must resume the audio context before waiting for an acked runtime-start snapshot',
  );

  snapshotGate.resolve();
  await start;
  assert.deepEqual(
    calls.slice(calls.indexOf('loadDone')),
    [
      'loadDone',
      'running:true',
      'sequencerStart',
      'telemetryPolling',
      'postStart',
      'flushModulation',
      'arrangementStart',
      'publish:true',
    ],
    'arrangement scheduler must start only after the Product Core snapshot ack has arrived',
  );
}

console.log('Product runtime lifecycle controller regression passed');
