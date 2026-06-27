#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertIncludes(source, token, message) {
  if (!source.includes(token)) failures.push(message);
}

const port = [
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/ports/ProductLifecyclePort.ts',
  'src/audio/product/ports/ProductCommandPort.ts',
  'src/audio/product/ports/ProductControlPort.ts',
  'src/audio/product/ports/ProductAssetPort.ts',
  'src/audio/product/ports/ProductTelemetryPort.ts',
  'src/audio/product/ports/ProductSequencerPort.ts',
  'src/audio/product/ports/ProductModulationPort.ts',
  'src/audio/product/ports/ProductDiagnosticsPort.ts',
  'src/audio/product/ports/ProductEnginePorts.ts',
].map(read).join('\n');
const engine = read('src/audio/product/WebProductEngine.ts');
const proxy = read('src/audio/product/ProductEngineProxy.ts');
const host = read('src/audio/coreProductEngineHost.ts');
const app = read('src/App.tsx');

for (const token of [
  'ProductEngineLifecyclePort',
  'ProductEngineCommandPort',
  'ProductEngineControlPort',
  'ProductEngineAssetPort',
  'ProductEngineTelemetryPort',
  'ProductEngineSequencerPort',
  'ProductEngineModulationPort',
  'ProductEngineDiagnosticsPort',
]) {
  assertIncludes(port, token, `ProductEnginePort must keep narrow facet ${token}`);
}

assertIncludes(engine, 'TODO(product-core-web-adapter-burn-down)', 'WebProductEngine must keep its adapter burn-down marker');
assertIncludes(engine, "readonly mode = 'core-product' as const", 'WebProductEngine must stay Product Core backed');
assertIncludes(engine, "import { coreProductRuntimeHostPort } from './host/CoreProductRuntimeHostPort'", 'WebProductEngine must use CoreProductRuntimeHostPort');
assertIncludes(engine, 'ProductRuntimeLifecycleController', 'WebProductEngine lifecycle must be serialized by ProductRuntimeLifecycleController');
assertIncludes(proxy, 'new WebProductEngine()', 'ProductEngineProxy must not construct a reference runtime');

if (engine.includes('coreProductEngineHost')) {
  failures.push('WebProductEngine must not import coreProductEngineHost directly');
}
if (/\bAudioNode\b|\bAudioContext\b|\bAudioWorkletNode\b|\bMediaStream\b/.test(port)) {
  failures.push('ProductEnginePort must not expose raw Web Audio/browser audio types');
}
if (!host.includes('createCoreProductEngineHostProxy(host)')) {
  failures.push('coreProductEngineHost must stay behind the host fallback proxy');
}
if (app.includes('ProductEngineProxy')) {
  failures.push('App.tsx must not import ProductEngineProxy directly; use focused app/runtime hooks');
}

if (failures.length) {
  console.error('Product adapter burn-down violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product adapter burn-down checks passed');
