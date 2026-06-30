#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const productSelection = read('src/audio/product/ProductAudioRuntimeSelection.ts');
const productProxy = read('src/audio/product/ProductEngineProxy.ts');
const productRuntimePolicy = read('src/audio/product/runtime/ProductRuntimePolicy.ts');
const productionEngineFactory = read('src/audio/product/runtime/createProductionProductEngine.ts');
const referenceRuntime = read('src/audio/referenceAudioRuntime.ts');
const referenceWebTs = read('src/audio/reference/webTs/engine.ts');
const selectedRuntime = read('src/audio/product/SelectedProductRuntime.ts');
const legacyCoreHost = read('src/audio/coreEngineHost.ts');

if (!productProxy.includes("return 'core-product';")) {
  failures.push('ProductEngineProxy must report core-product as the production runtime mode');
}
if (!productProxy.includes('new WebProductEngine()')) {
  failures.push('ProductEngineProxy must construct the Product Core backed WebProductEngine');
}
if (!productSelection.includes('if (!isDevRuntime()) return getProductionProductRuntimeMode();')) {
  failures.push('ProductAudioRuntimeSelection must force production runtime selection through Product Core');
}
if (!productSelection.includes("if (referenceMode && isReferenceRuntimeEnabled(params)) return referenceMode;")) {
  failures.push('Reference runtime selection must remain explicit and non-production gated');
}
if (!referenceRuntime.includes("throw new Error('web-ts reference runtime is unavailable in production builds')")) {
  failures.push('referenceAudioRuntime must fail closed in production builds');
}
if (!productRuntimePolicy.includes('allowReferenceRuntime: !isProduction && explicitReference')) {
  failures.push('ProductRuntimePolicy must forbid reference runtime in production');
}
if (!productRuntimePolicy.includes('failClosedOnProductCoreUnavailable: true')) {
  failures.push('ProductRuntimePolicy must fail closed when Product Core is unavailable');
}
if (!productionEngineFactory.includes('throw new ProductCoreUnavailableError(')) {
  failures.push('createProductionProductEngine must throw ProductCoreUnavailableError instead of falling back');
}
if (!selectedRuntime.includes("if (runtimeMode === 'core-product')")) {
  failures.push('SelectedProductRuntime must refuse pre-init reference dispatch for core-product mode');
}
if (legacyCoreHost.includes("source === 'piano' || source === 'sample1'")) {
  failures.push('legacy Core host must not translate Sample 1 into the Piano sample fallback');
}
if (!referenceWebTs.includes("if (randomSource === 'sample1' || randomSource === 'sample2') return false;")) {
  failures.push('web-ts reference runtime must not enable Sample 1/2 playback fallback');
}
if (/randomSource === 'sample1'[\s\S]{0,180}this\.playPianoNote\(frequency, velocity\);/.test(referenceWebTs)) {
  failures.push('web-ts reference runtime must not play Sample 1 through Piano fallback');
}
if (
  referenceWebTs.includes('sample1: { node: this.pianoSpatialChain') ||
  referenceWebTs.includes('sample2: { node: this.pianoSpatialChain')
) {
  failures.push('web-ts reference runtime must not expose Sample 1/2 as Piano recordable buses');
}

const allowedReferenceImports = new Set([
  'src/audio/coreEngineHost.ts',
  'src/audio/product/SelectedProductRuntime.ts',
  'src/audio/referenceAudioRuntime.ts',
  'src/audio/reference/ReferenceAudioEngineDebugCompat.ts',
]);

for (const file of walk('src')) {
  if (file.startsWith('src/audio/reference/') || file === 'src/audio/referenceAudioRuntime.ts' || /\.test\./.test(file)) continue;
  const source = read(file);
  if (/from ['"].*reference\/webTs/.test(source) && !allowedReferenceImports.has(file)) {
    failures.push(`${file}: imports web-ts reference runtime directly`);
  }
  if (/from ['"].*\.\.\/reference\/ReferenceSelectedRuntime/.test(source) && !allowedReferenceImports.has(file)) {
    failures.push(`${file}: reference runtime loading must stay centralized in SelectedProductRuntime`);
  }
  if (/fallback.*web[-_]?ts|web[-_]?ts.*fallback|rescue.*reference runtime/i.test(source)) {
    failures.push(`${file}: appears to implement a silent web-ts/reference fallback`);
  }
}

const productPort = [
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
if (/\bAudioNode\b|\bAudioContext\b|\bAudioWorkletNode\b|\bMediaStream\b/.test(productPort)) {
  failures.push('ProductEnginePort must not expose raw Web Audio/browser audio objects');
}

if (failures.length) {
  console.error('Product Core production-truth violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product Core production-truth checks passed');
