import assert from 'node:assert/strict';

import { ProductRuntimeScheduler } from './ProductRuntimeScheduler';
import { ProductDiagnosticsPublisher } from '../ProductDiagnosticsPublisher';
import { EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS } from '../ProductRuntimeDiagnostics';
import { CoreProductTelemetryCallbackScheduler } from '../host/CoreProductTelemetryCallbackScheduler';
import type { CoreProductTelemetrySnapshot } from '../../coreProductTelemetry';

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
  });
  let flushCount = 0;
  const callback = () => { flushCount += 1; };

  scheduler.schedule('diagnostics-visible', callback);
  scheduler.schedule('diagnostics-visible', callback);
  scheduler.schedule('diagnostics-visible', callback);

  assert.equal(frameCallbacks.length, 1, 'same-channel callback bursts should schedule one frame');
  frameCallbacks[0]?.(16);
  assert.equal(flushCount, 1, 'same callback should be coalesced per channel');
}

{
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => true,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    requestAnimationFrame: () => {
      throw new Error('hidden scheduler should not request animation frames');
    },
  });
  let flushCount = 0;
  scheduler.schedule('telemetry-hidden', () => { flushCount += 1; });

  assert.equal(timers[0]?.delayMs, 1000, 'hidden desktop runtime scheduler should use 1000ms minimum');
  timers[0]?.callback();
  assert.equal(flushCount, 1);
}

{
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const scheduler = new ProductRuntimeScheduler({
    isMobile: () => true,
    isDocumentHidden: () => true,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
  scheduler.schedule('telemetry-hidden', () => undefined);
  assert.equal(timers[0]?.delayMs, 2500, 'mobile hidden runtime scheduler should use a longer delay');
}

{
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => true,
  });
  let flushCount = 0;
  scheduler.schedule('perf-overlay', () => { flushCount += 1; });
  scheduler.flushNowForTests();
  assert.equal(flushCount, 0, 'perf overlay should not publish while hidden');
}

{
  const scheduler = new ProductRuntimeScheduler();
  let flushCount = 0;
  scheduler.dispose();
  scheduler.schedule('diagnostics-visible', () => { flushCount += 1; });
  scheduler.flushNowForTests();
  assert.equal(flushCount, 0, 'dispose should prevent later publication');
}

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
  });
  const publisher = new ProductDiagnosticsPublisher(() => EMPTY_PRODUCT_RUNTIME_DIAGNOSTICS, scheduler);
  const telemetryScheduler = new CoreProductTelemetryCallbackScheduler(scheduler);
  let diagnosticsPublishes = 0;
  let telemetryPublishes = 0;

  publisher.setCallback(() => { diagnosticsPublishes += 1; });
  telemetryScheduler.setCallback(() => { telemetryPublishes += 1; }, null);
  publisher.schedule();
  telemetryScheduler.schedule({} as CoreProductTelemetrySnapshot);

  assert.equal(frameCallbacks.length, 1, 'diagnostics and telemetry should share one runtime scheduler frame');
  frameCallbacks[0]?.(16);
  assert.equal(diagnosticsPublishes, 2, 'diagnostics publishes initial plus scheduled snapshot');
  assert.equal(telemetryPublishes, 1);
}

{
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const scheduler = new ProductRuntimeScheduler({
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
  let publishes = 0;
  scheduler.schedule('sample-cache-diagnostics', () => { publishes += 1; });
  scheduler.schedule('sample-cache-diagnostics', () => { publishes += 1; });

  assert.equal(timers.length, 1, 'sample cache diagnostic bursts should coalesce into one timer');
  assert.equal(timers[0]?.delayMs, 500, 'sample cache diagnostics should publish at a low visible rate');
  timers[0]?.callback();
  assert.equal(publishes, 2, 'coalesced sample cache publish should run queued subscribers once');
}

{
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => true,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
  let cachePublishes = 0;
  let decodePublishes = 0;
  scheduler.schedule('sample-cache-diagnostics', () => { cachePublishes += 1; });
  scheduler.schedule('sample-decode-progress', () => { decodePublishes += 1; });

  assert.equal(timers[0]?.delayMs, 5000, 'hidden sample cache diagnostics should use the background interval');
  timers[0]?.callback();
  assert.equal(cachePublishes, 1);
  assert.equal(decodePublishes, 0, 'hidden decode progress should be suspended unless debug is enabled');
}

{
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  let now = 1000;
  const scheduler = new ProductRuntimeScheduler({
    now: () => now,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
  let publishes = 0;
  scheduler.schedule('sample-asset-miss-diagnostics', () => { publishes += 1; });
  scheduler.schedule('sample-asset-miss-diagnostics', () => { publishes += 1; });

  assert.equal(publishes, 1, 'first sample asset miss should publish immediately');
  assert.equal(timers[0]?.delayMs, 250, 'subsequent visible asset misses should be throttled');
  now += 250;
  timers[0]?.callback();
  assert.equal(publishes, 2);
}

{
  const frameCallbacks: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    requestAnimationFrame: (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
  });
  let publishes = 0;
  scheduler.schedule('sample-voice-telemetry', () => { publishes += 1; });

  assert.equal(frameCallbacks.length, 1, 'sample voice telemetry should publish on the visible animation frame');
  frameCallbacks[0]?.(16);
  assert.equal(publishes, 1);
  scheduler.dispose();
  scheduler.schedule('sample-voice-telemetry', () => { publishes += 1; });
  assert.equal(publishes, 1, 'dispose should clear pending sampler callbacks');
}
