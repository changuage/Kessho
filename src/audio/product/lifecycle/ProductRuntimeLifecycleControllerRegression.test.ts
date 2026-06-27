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
    publishState: (state) => { states.push(state); },
    ...overrides,
  };
  return { calls, delegate, states };
}

{
  const startGate = createDeferred();
  const suspendGate = createDeferred();
  const { calls, delegate, states } = createDelegate({
    startRuntime: async () => { calls.push('start'); await startGate.promise; },
    suspendRuntime: async () => { calls.push('suspend'); await suspendGate.promise; },
  });
  const controller = new ProductRuntimeLifecycleController(delegate);
  const start = controller.start();
  const suspend = controller.suspend();
  await Promise.resolve();

  assert.deepEqual(calls, ['start'], 'suspend must wait behind in-flight start');
  startGate.resolve();
  await start;
  assert.equal(controller.currentStatus, 'loading', 'older operation must not publish a stale running state');
  await Promise.resolve();
  assert.deepEqual(calls, ['start', 'suspend'], 'suspend should run after start resolves');
  suspendGate.resolve();
  await suspend;
  assert.equal(controller.currentStatus, 'suspended');
  assert.deepEqual(states, ['loading', 'loading', 'suspended']);
}

{
  const failure = new Error('resume failed');
  const { delegate, states } = createDelegate({
    resumeRuntime: async () => { throw failure; },
  });
  const controller = new ProductRuntimeLifecycleController(delegate);

  await assert.rejects(() => controller.resume(), failure);
  await controller.stop();

  assert.equal(controller.currentStatus, 'stopped', 'controller should keep accepting operations after a rejected lifecycle call');
  assert.deepEqual(states, ['loading', 'failed', 'loading', 'stopped']);
}

{
  const { calls, delegate, states } = createDelegate();
  const controller = new ProductRuntimeLifecycleController(delegate);

  await controller.preload();
  await controller.preload();
  await controller.start();
  await controller.resume();
  await controller.suspend();
  await controller.suspend();

  assert.deepEqual(calls, ['preload', 'start', 'suspend'], 'redundant preload/resume/suspend calls should not duplicate runtime work');
  assert.deepEqual(states, ['loading', 'ready', 'loading', 'running', 'loading', 'suspended']);
}

console.log('Product runtime lifecycle controller regression passed');
