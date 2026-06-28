#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

const webProductEngine = 'src/audio/product/WebProductEngine.ts';
const webText = read(webProductEngine);
if (webText.includes('resolveSample(')) {
  fail(webProductEngine, 'WebProductEngine must not resolve sampler choices at note-trigger time');
}
if (webText.includes('decodeCoreProductAsset(') || webText.includes('fetch(')) {
  fail(webProductEngine, 'WebProductEngine must not fetch/decode sample assets directly');
}

const productPort = 'src/audio/product/ProductEnginePort.ts';
const portText = read(productPort);
for (const token of ['resolveSample', 'loadSampleLibrary', 'setSample1Renderer', 'setSample2Renderer']) {
  if (portText.includes(token)) fail(productPort, `broad ProductEnginePort must not gain sampler-specific method ${token}`);
}

const allowedResolverFiles = new Set([
  'src/audio/sampleLibraries/sampleResolver.ts',
  'src/audio/sampleLibraries/sampleResolver.test.ts',
  'src/audio/sampleLibraries/sampleAssetPredictor.ts',
  'src/audio/product/host/CoreProductSampleAssetResolver.ts',
]);
const allowedLegacyAliasFiles = new Set([
  'src/audio/coreEngineHost.ts',
  'src/audio/distanceMacro.ts',
  'src/audio/CoreProductHostMidi.ts',
  'src/audio/coreProductArrangementSchedulerUtils.ts',
  'src/audio/coreProductChordVoices.ts',
  'src/audio/coreProductSnapshotPadVoiceRouting.ts',
  'src/audio/coreProductSourceMapping.ts',
  'src/audio/simpleSequencerPhrasePreview.ts',
  'src/audio/product/host/CoreProductManualAuditionBridge.ts',
  'src/audio/product/host/CoreProductSampleAssetResolver.ts',
  'src/ui/useLazySequencerTransport.ts',
  'src/ui/state.ts',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'generated') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const file of walk(path.join(root, 'src')).map((file) => path.relative(root, file))) {
  const text = read(file);
  if (text.includes('resolveSample(') && !allowedResolverFiles.has(file)) {
    fail(file, 'TypeScript resolver must stay in tests, prediction, or host asset prefetch only');
  }
  if (text.includes("source: 'piano'") && !text.includes('ALLOW_PIANO_ALIAS_MIGRATION')) {
    if (allowedLegacyAliasFiles.has(file)) continue;
    fail(file, "new production source literals must not use source: 'piano'");
  }
  if (text.includes("case 'piano'") && !text.includes('ALLOW_PIANO_ALIAS_MIGRATION')) {
    if (allowedLegacyAliasFiles.has(file)) continue;
    const aliasAllowed = /sample1|legacy|compat|migration|alias/i.test(text);
    if (!aliasAllowed) fail(file, "case 'piano' requires explicit migration/alias context");
  }
}

if (failures.length) {
  console.error('Product sampler adapter burn-down failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product sampler adapter burn-down passed.');
