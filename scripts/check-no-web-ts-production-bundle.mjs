import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distAssets = resolve(root, 'dist/assets');
const reportPath = resolve(root, 'docs/reports/kessho-product-no-web-ts-production-bundle-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const failures = [];

assert(existsSync(distAssets), 'dist/assets is missing; run npm run build first', failures);

const app = read('src/App.tsx');
const viteConfig = read('vite.config.ts');
const unavailableRuntime = read('src/audio/referenceAudioRuntime.unavailable.ts');
assert(!app.includes("from './audio/runtime'"), 'App production shell must not statically import src/audio/runtime.ts', failures);
assert(app.includes("if (!isDevRuntime()) return 'core-product';"), 'App runtime selection must force core-product outside dev builds', failures);
assert(app.includes("from './audio/referenceAudioRuntime'"), 'App must load reference runtime only through the production-aliased wrapper', failures);
assert(
  unavailableRuntime.includes('web-ts reference runtime is unavailable in production builds'),
  'Production reference runtime wrapper must fail closed',
  failures,
);
assert(
  viteConfig.includes('referenceAudioRuntime.unavailable.ts'),
  'Vite production config must alias the reference runtime wrapper to the fail-closed stub',
  failures,
);

const forbiddenBundleMarkers = [
  'coreEngineHost',
  '__coreEngineHost',
  'MediaStreamAudioDestinationNode',
  'sendGranulatorRandomSequence',
];

const forbiddenAssetNameMarkers = [
  'audio-engine',
  'coreEngineHost',
  'runtime-',
];

const scannedFiles = [];
if (existsSync(distAssets)) {
  for (const entry of readdirSync(distAssets)) {
    if (!entry.endsWith('.js')) continue;
    for (const marker of forbiddenAssetNameMarkers) {
      if (entry.includes(marker)) {
        failures.push(`dist/assets/${entry} uses forbidden web-ts asset name marker ${marker}`);
      }
    }
    const path = resolve(distAssets, entry);
    const source = readFileSync(path, 'utf8');
    scannedFiles.push(`dist/assets/${entry}`);
    for (const marker of forbiddenBundleMarkers) {
      if (source.includes(marker)) {
        failures.push(`dist/assets/${entry} contains forbidden web-ts marker ${marker}`);
      }
    }
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  scannedFiles,
  forbiddenBundleMarkers,
  forbiddenAssetNameMarkers,
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`No web-ts production bundle markers found (${scannedFiles.length} JS assets scanned)`);
