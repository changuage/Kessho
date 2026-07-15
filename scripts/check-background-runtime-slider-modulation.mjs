#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = (file) => readFileSync(resolve(root, file), 'utf8');

const checks = [];
function assert(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

const render = read('cpp/KesshoCore/src/product/KesshoProductRender.cpp');
const modulationRuntime = read('cpp/KesshoCore/src/product/sources/SourceModulationRuntime.cpp');
const telemetry = read('cpp/KesshoCore/src/product/KesshoProductTelemetry.cpp');
const runtime = read('src/audio/coreProductRuntime.ts');
const host = read('src/audio/coreProductEngineHost.ts');
const bridge = read('src/audio/product/host/CoreProductModulationRangeBridge.ts');
const runtimeWalkPositionSync = read('src/ui/runtimeWalkPositionSync.ts');
const runtimeSliderState = read('src/ui/runtimeSliderState.ts');

assert(
  render.includes('advanceModulationRanges(frames)'),
  'Product Core render must advance modulation ranges from rendered audio frames.',
);

assert(
  modulationRuntime.includes('void KesshoProductEngine::advanceModulationRanges(uint32_t frames)') &&
    modulationRuntime.includes('range.mode == KESSHO_PRODUCT_MODULATION_RANGE_SAMPLE_HOLD') &&
    modulationRuntime.includes('range.mode != KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK') &&
    modulationRuntime.includes('static_cast<float>(frames)') &&
    modulationRuntime.includes('applyRuntimeWalkValue(range)'),
  'Product Core must own sample-hold/random-walk advancement in the render-frame path.',
);

assert(
  telemetry.includes('range.mode == KESSHO_PRODUCT_MODULATION_RANGE_RANDOM_WALK') &&
    telemetry.includes('range.random_walk_counter') &&
    telemetry.includes('range.sample_hold_counter'),
  'Product telemetry must expose Product Core-owned runtime walk/sample-hold state.',
);

assert(
  runtime.includes('syncTelemetryLoop') &&
    runtime.includes('shouldPollTelemetry') &&
    runtime.includes('requestTelemetryOnce') &&
    runtime.includes('visibility-resume') &&
    runtime.includes('this.syncTelemetryLoop();') &&
    runtime.includes("type: 'request-telemetry'"),
  'Runtime must stop hidden recurring telemetry and request one telemetry sync on visible resume.',
);

assert(
  runtime.includes('const CORE_PRODUCT_TELEMETRY_DESKTOP_INTERVAL_MS = 250') &&
    runtime.includes('const CORE_PRODUCT_TELEMETRY_MOBILE_INTERVAL_MS = 500') &&
    runtime.includes('const CORE_PRODUCT_VISUAL_TELEMETRY_DESKTOP_INTERVAL_MS = 33') &&
    runtime.includes('const CORE_PRODUCT_VISUAL_TELEMETRY_MOBILE_INTERVAL_MS = 67'),
  'Runtime must keep explicit desktop/mobile telemetry cadences for visible polling.',
);

assert(
  runtime.includes('return this.telemetryPollingEnabled && this.transportRunningForTelemetry && this.isDocumentVisible();'),
  'Runtime recurring telemetry must require callback registration, running transport, and visible document.',
);

assert(
  runtime.includes("document.addEventListener('visibilitychange', this.handleVisibilityChange)") &&
    runtime.includes("document.removeEventListener('visibilitychange', this.handleVisibilityChange)"),
  'Runtime must bind and unbind the visibility resume telemetry sync listener.',
);

assert(
  host.includes('setTelemetryTransportRunning') &&
    host.includes('setTelemetryPollingEnabled') &&
    host.includes('this.telemetryCallbackScheduler.hasCallback()') &&
    host.includes('this.running'),
  'Host must wire transport/callback state into runtime telemetry polling.',
);

assert(
  bridge.includes('publishRuntimeWalkPositions') &&
    bridge.includes('options.publish === false') &&
    host.includes('updateRuntimeWalkPositions(hostTelemetry, {') &&
    host.includes('publish: documentVisible'),
  'Runtime walk telemetry must update the host cache while allowing hidden UI publish suppression.',
);

assert(
  host.includes('if (documentVisible) this.modulationRangeBridge.updateSampleHoldTriggerFeedback(hostTelemetry)'),
  'Sample-hold UI trigger feedback must not publish from hidden telemetry.',
);

assert(
  !runtimeWalkPositionSync.includes('requestAnimationFrame(') &&
    !runtimeWalkPositionSync.includes('setInterval(') &&
    !runtimeWalkPositionSync.includes('setTimeout('),
  'runtimeWalkPositionSync must remain display state plumbing, not a UI timer-driven walk engine.',
);

assert(
  !runtimeSliderState.includes('Math.random()') &&
    !runtimeSliderState.includes('Date.now()') &&
    !runtimeSliderState.includes('performance.now()'),
  'runtimeSliderState must remain a mirror store, not a random-walk clock/source.',
);

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  for (const failure of failed) {
    console.error(`Background runtime slider modulation check failed: ${failure.message}`);
  }
  process.exit(1);
}

console.log('Background runtime slider modulation checks passed');
