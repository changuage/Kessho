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
  let hidden = true;
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const frames: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => hidden,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  let flushCount = 0;
  for (let index = 0; index < 600; index += 1) {
    scheduler.schedule('telemetry-hidden', () => { flushCount = index + 1; });
  }

  assert.equal(timers.length, 0, 'ten minutes of hidden dirty bursts must create zero timers');
  assert.equal(frames.length, 0, 'hidden dirty bursts must create zero animation frames');
  scheduler.flushNowForTests();
  assert.equal(flushCount, 0, 'hidden dirty bursts must invoke zero callbacks');
  hidden = false;
  scheduler.setDocumentHidden(false);
  assert.equal(frames.length, 1, 'foreground should schedule one consolidated refresh');
  frames[0]?.(16);
  assert.equal(flushCount, 600, 'foreground should publish only the latest channel state');
}

{
  let hidden = true;
  const frames: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => hidden,
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  let visualCallbackCount = 0;
  for (let index = 0; index < 120; index += 1) {
    scheduler.schedule('visible-visuals', () => { visualCallbackCount += 1; });
  }

  assert.equal(frames.length, 0, 'visual callbacks must not request animation frames while hidden');
  scheduler.flushNowForTests();
  assert.equal(visualCallbackCount, 0, 'visual callbacks must remain parked for the whole hidden interval');

  hidden = false;
  scheduler.setDocumentHidden(false);
  assert.equal(frames.length, 1, 'foreground should request one consolidated visual refresh');
  frames[0]?.(16);
  assert.equal(visualCallbackCount, 1, 'foreground should publish the latest visual callback once');
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
  scheduler.schedule('telemetry-hidden', () => undefined);
  assert.equal(timers.length, 0, 'hidden runtime scheduling must not depend on background timer cadence');
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
  assert.equal(publishes, 1, 'coalesced sample cache publish should retain one current callback');
}

{
  let hidden = true;
  const timers: Array<{ callback: () => void; delayMs: number }> = [];
  const frames: Array<(time: number) => void> = [];
  const scheduler = new ProductRuntimeScheduler({
    isDocumentHidden: () => hidden,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  let cachePublishes = 0;
  let decodePublishes = 0;
  scheduler.schedule('sample-cache-diagnostics', () => { cachePublishes += 1; });
  scheduler.schedule('sample-decode-progress', () => { decodePublishes += 1; });

  assert.equal(timers.length, 0, 'hidden sample diagnostics must not create timers');
  assert.equal(cachePublishes, 0);
  assert.equal(decodePublishes, 0);
  hidden = false;
  scheduler.setDocumentHidden(false);
  assert.equal(frames.length, 1);
  frames[0]?.(16);
  assert.equal(cachePublishes, 1);
  assert.equal(decodePublishes, 1, 'foreground should flush the latest decode progress once');
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
