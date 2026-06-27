import assert from 'node:assert/strict';
import { ProductDiagnosticsPublisher } from './ProductDiagnosticsPublisher';
import { EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS, type ProductRuntimeDiagnostics } from './ProductRuntimeDiagnostics';
import { ProductFrameScheduler } from './scheduling/ProductFrameScheduler';

function diagnosticsWithRevision(revision: number): ProductRuntimeDiagnostics {
  return {
    ...EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS,
    lastResolvedRevision: revision,
  };
}

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductFrameScheduler({
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
  const scheduler = new ProductFrameScheduler({
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
  const hiddenTimers: Array<{ callback: () => void; delayMs: number }> = [];
  const scheduler = new ProductFrameScheduler({
    hiddenIntervalMs: 250,
    isHidden: () => true,
    requestAnimationFrame: () => {
      throw new Error('hidden scheduler should not request animation frames');
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

  assert.equal(hiddenTimers.length, 1, 'hidden scheduler should use a low-rate timer');
  assert.equal(hiddenTimers[0]?.delayMs, 250);

  hiddenTimers[0]?.callback();

  assert.deepEqual(flushed, ['visuals']);
}

console.log('Product diagnostics publisher regression passed');
