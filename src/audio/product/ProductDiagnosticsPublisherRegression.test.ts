import assert from 'node:assert/strict';
import './scheduling/ProductRuntimeScheduler.test';
import { ProductDiagnosticsPublisher } from './ProductDiagnosticsPublisher';
import { EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS, type ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import { ProductFrameScheduler } from './scheduling/ProductFrameScheduler';
import { ProductRuntimeScheduler } from './scheduling/ProductRuntimeScheduler';

function diagnosticsWithRevision(revision: number): ProductRuntimeDiagnostics {
  return {
    ...EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS,
    lastResolvedRevision: revision,
  };
}

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
  });
  let revision = 0;
  const published: number[] = [];
  const publisher = new ProductDiagnosticsPublisher(() => diagnosticsWithRevision(++revision), scheduler);

  publisher.setCallback((diagnostics) => {
    published.push(diagnostics.lastResolvedRevision);
  });
  publisher.schedule();
  publisher.schedule();
  publisher.schedule();

  assert.deepEqual(published, [1], 'callback registration should publish an initial snapshot immediately');
  assert.equal(frameCallbacks.length, 1, 'diagnostic bursts should schedule one frame flush');

  frameCallbacks[0]?.(16);

  assert.deepEqual(published, [1, 2], 'one frame flush should publish one coalesced diagnostic snapshot');
}

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
  });
  let revision = 0;
  const published: number[] = [];
  const publisher = new ProductDiagnosticsPublisher(() => diagnosticsWithRevision(++revision), scheduler);

  publisher.setCallback((diagnostics) => {
    published.push(diagnostics.lastResolvedRevision);
  });
  publisher.schedule();
  publisher.publish();
  frameCallbacks[0]?.(16);

  assert.deepEqual(published, [1, 2], 'immediate publish should invalidate the older scheduled frame publish');
}

{
  let hidden = true;
  const hiddenTimers: Array<{ callback: () => void; delayMs: number }> = [];
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductFrameScheduler({
    isHidden: () => hidden,
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
    setTimeout: (callback, delayMs) => {
      hiddenTimers.push({ callback, delayMs });
      return hiddenTimers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
  const flushed: string[] = [];

  scheduler.subscribe('visuals', () => {
    flushed.push('visuals');
  });
  scheduler.markDirty('visuals');

  assert.equal(hiddenTimers.length, 0, 'hidden scheduler must not create timers');
  assert.equal(frameCallbacks.length, 0, 'hidden scheduler must not request animation frames');
  assert.deepEqual(flushed, []);

  hidden = false;
  scheduler.setDocumentHidden(false);
  assert.equal(frameCallbacks.length, 1, 'foreground should schedule one consolidated refresh');
  frameCallbacks[0]?.(16);
  assert.deepEqual(flushed, ['visuals']);
}

console.log('Product diagnostics publisher regression passed');
