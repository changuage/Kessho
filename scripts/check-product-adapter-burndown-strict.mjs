import fs from 'node:fs';
import path from 'node:path';

const allowedSelectedRuntimeFiles = new Set([
  'src/audio/product/SelectedProductRuntime.ts',
  'src/audio/product/ReferenceRuntimeHarness.ts',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [
  ...walk('src/app'),
  ...walk('src/features'),
  ...walk('src/audio/product'),
  'src/App.tsx',
  'src/ui/synth/SynthPage.tsx',
].filter((file) => fs.existsSync(file));

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if ((file === 'src/App.tsx' || file === 'src/ui/synth/SynthPage.tsx' || file.includes('src/features/')) && text.includes('ProductEngineProxy')) {
    failures.push(`${file}: must not import/use ProductEngineProxy directly`);
  }
  if (text.includes('SelectedProductRuntime') && !allowedSelectedRuntimeFiles.has(file)) {
    failures.push(`${file}: SelectedProductRuntime is restricted to approved dev/reference harnesses`);
  }
  if (text.match(/from ['"].*web-ts|from ['"].*referenceAudioRuntime/)) {
    if (!file.includes('Reference') && !file.includes('reference')) {
      failures.push(`${file}: production-facing module imports reference/web-ts runtime`);
    }
  }
}

const productEnginePort = fs.existsSync('src/audio/product/ProductEnginePort.ts')
  ? fs.readFileSync('src/audio/product/ProductEnginePort.ts', 'utf8')
  : '';
for (const forbidden of ['sample1', 'sample2', 'SampleSlotRenderer', 'sample-cache-diagnostics']) {
  if (productEnginePort.includes(forbidden)) {
    failures.push(`src/audio/product/ProductEnginePort.ts: broad compatibility port must not grow sampler-specific surface ${forbidden}`);
  }
}

const webProductEngine = fs.existsSync('src/audio/product/WebProductEngine.ts')
  ? fs.readFileSync('src/audio/product/WebProductEngine.ts', 'utf8')
  : '';
for (const forbidden of ['sample1', 'sample2', 'SampleSlotRenderer']) {
  if (webProductEngine.includes(forbidden)) {
    failures.push(`src/audio/product/WebProductEngine.ts: must not gain sampler-specific logic (${forbidden})`);
  }
}

if (failures.length) {
  console.error('Product adapter burn-down strict guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product adapter burn-down strict guard passed.');
