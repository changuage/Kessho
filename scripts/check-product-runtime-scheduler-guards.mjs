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
if (!fs.existsSync(runtimeScheduler)) {
  failures.push(`${runtimeScheduler} missing`);
} else {
  const text = fs.readFileSync(runtimeScheduler, 'utf8');
  for (const token of ['sample-cache-diagnostics', 'diagnostics-hidden', 'telemetry-hidden', 'perf-overlay']) {
    if (!text.includes(token)) failures.push(`${runtimeScheduler}: missing channel ${token}`);
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
