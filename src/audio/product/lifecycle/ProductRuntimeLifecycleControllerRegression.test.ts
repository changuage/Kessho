import assert from 'node:assert/strict';
import { ProductRuntimeLifecycleController, type ProductLifecycleDelegate } from './ProductRuntimeLifecycleController';
import type { ProductEngineLifecycleState } from '../ProductEngineTypes';

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

console.log('Product runtime lifecycle controller regression passed');
