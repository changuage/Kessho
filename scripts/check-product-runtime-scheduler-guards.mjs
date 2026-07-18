import fs from 'node:fs';

const filesThatMustNotConstructFrameSchedulers = [
  'src/audio/product/host/CoreProductTelemetryCallbackScheduler.ts',
  'src/audio/product/ProductDiagnosticsPublisher.ts',
];

const failures = [];
for (const file of filesThatMustNotConstructFrameSchedulers) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('new ProductFrameScheduler')) {
    failures.push(`${file}: must receive ProductRuntimeScheduler instead of constructing ProductFrameScheduler`);
  }
}

const runtimeScheduler = 'src/audio/product/scheduling/ProductRuntimeScheduler.ts';
const runtimeSchedulerTest = 'src/audio/product/scheduling/ProductRuntimeScheduler.test.ts';
if (!fs.existsSync(runtimeScheduler)) {
  failures.push(`${runtimeScheduler} missing`);
} else {
  const text = fs.readFileSync(runtimeScheduler, 'utf8');
  for (const token of [
    'sample-cache-diagnostics',
    'sample-asset-miss-diagnostics',
    'sample-decode-progress',
    'sample-voice-telemetry',
    'diagnostics-hidden',
    'telemetry-hidden',
    'perf-overlay',
    'sample-decode-progress',
  ]) {
    if (!text.includes(token)) failures.push(`${runtimeScheduler}: missing channel ${token}`);
  }
  if (!text.includes('if (this.documentHidden) return;')) {
    failures.push(`${runtimeScheduler}: all UI and diagnostic scheduling must be disabled while hidden`);
  }
  if (!text.includes("channel === 'sample-asset-miss-diagnostics'")) {
    failures.push(`${runtimeScheduler}: sampler asset miss diagnostics must use a first-miss/throttled path`);
  }
  if (!text.includes("'sample-cache-diagnostics': 500") || !text.includes("'sample-decode-progress': 250")) {
    failures.push(`${runtimeScheduler}: visible sampler diagnostics must retain bounded low-rate publishing`);
  }
}

if (!fs.existsSync(runtimeSchedulerTest)) {
  failures.push(`${runtimeSchedulerTest} missing`);
} else {
  const text = fs.readFileSync(runtimeSchedulerTest, 'utf8');
  for (const token of [
    'hidden sample diagnostics must not create timers',
    'hidden dirty bursts must create zero timers',
    'perf overlay should not publish while hidden',
    'sample voice telemetry should publish on the visible animation frame',
  ]) {
    if (!text.includes(token)) failures.push(`${runtimeSchedulerTest}: missing policy fixture ${token}`);
  }
}

const webProductEngine = fs.existsSync('src/audio/product/WebProductEngine.ts')
  ? fs.readFileSync('src/audio/product/WebProductEngine.ts', 'utf8')
  : '';
if (!webProductEngine.includes('new ProductRuntimeScheduler()') || !webProductEngine.includes('new ProductDiagnosticsPublisher(() => this.getDiagnostics(), this.runtimeScheduler)')) {
  failures.push('src/audio/product/WebProductEngine.ts: diagnostics publisher must receive the runtime-scoped scheduler');
}

const coreHost = fs.existsSync('src/audio/coreProductEngineHost.ts')
  ? fs.readFileSync('src/audio/coreProductEngineHost.ts', 'utf8')
  : '';
if (!coreHost.includes('new CoreProductTelemetryCallbackScheduler()')) {
  failures.push('src/audio/coreProductEngineHost.ts: telemetry callback scheduler must stay owned by the runtime host');
}

if (failures.length) {
  console.error('Product runtime scheduler guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product runtime scheduler guard passed.');
