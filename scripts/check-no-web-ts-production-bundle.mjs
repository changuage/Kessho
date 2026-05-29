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

function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function assertNoForbiddenImports(file, forbidden, failures) {
  const source = read(file);
  for (const specifier of importSpecifiers(source)) {
    for (const forbiddenSpecifier of forbidden) {
      if (specifier.includes(forbiddenSpecifier)) {
        failures.push(`${file}: production path must not import ${specifier}`);
      }
    }
  }
}

const failures = [];

assert(existsSync(distAssets), 'dist/assets is missing; run npm run build first', failures);
assert(!existsSync(resolve(root, 'src/audio/runtime.ts')), 'temporary src/audio/runtime.ts facade must be deleted', failures);
assert(!existsSync(resolve(root, 'src/audio/engine.ts')), 'legacy web-ts engine must live under src/audio/reference/webTs/engine.ts, not the production audio root', failures);

const app = read('src/App.tsx');
const productEngineProxy = read('src/audio/product/ProductEngineProxy.ts');
const productAudioRuntimeSelection = read('src/audio/product/ProductAudioRuntimeSelection.ts');
const productRuntimeSwitch = read('src/ui/ProductRuntimeSwitch.tsx');
const selectedProductRuntime = read('src/audio/product/SelectedProductRuntime.ts');
const referenceSelectedRuntime = read('src/audio/reference/ReferenceSelectedRuntime.ts');
const unavailableRuntime = read('src/audio/referenceAudioRuntime.unavailable.ts');
const viteConfig = read('vite.config.ts');

assertNoForbiddenImports('src/App.tsx', [
  './audio/runtime',
  './audio/engine',
  './audio/coreProductEngineHost',
  './audio/referenceAudioRuntime',
  './audio/reference/webTs',
], failures);

for (const file of [
  'src/audio/product/ProductEngineProxy.ts',
  'src/audio/product/ProductEnginePort.ts',
  'src/audio/product/WebProductEngine.ts',
  'src/audio/product/ProductAudioRuntimeSelection.ts',
  'src/ui/ProductRuntimeSwitch.tsx',
]) {
  assertNoForbiddenImports(file, [
    'referenceAudioRuntime',
    'reference/webTs',
    '../coreProductEngineHost',
    '../../coreProductEngineHost',
    '../runtime',
    '../engine',
  ], failures);
}

assert(!app.includes("from './audio/runtime'"), 'App production shell must not statically import src/audio/runtime.ts', failures);
assert(!app.includes("from './audio/coreProductEngineHost'"), 'App production shell must not import coreProductEngineHost directly', failures);
assert(!app.includes("from './audio/referenceAudioRuntime'"), 'App production shell must not import the reference runtime wrapper directly', failures);

assert(!productEngineProxy.includes('referenceAudioRuntime'), 'ProductEngineProxy must not load the web-ts reference runtime', failures);
assert(!productEngineProxy.includes('reference/webTs'), 'ProductEngineProxy must not import the web-ts reference engine', failures);
assert(
  productEngineProxy.includes("requested === 'web-ts'") &&
    productEngineProxy.includes("requested === 'web-audio'") &&
    productEngineProxy.includes("requested === 'core-smoke'") &&
    productEngineProxy.includes("resolvedRuntimeMode = 'core-product'"),
  'ProductEngineProxy must resolve web-ts/web-audio/core-smoke production requests to core-product',
  failures,
);

assert(
  productAudioRuntimeSelection.includes("const PRODUCT_RUNTIME_MODES = ['core-product']"),
  'ProductAudioRuntimeSelection must expose only core-product in the normal product UI mode list',
  failures,
);
assert(
  productAudioRuntimeSelection.includes('if (!isDevRuntime()) return PRODUCT_RUNTIME_MODES') &&
    productAudioRuntimeSelection.includes('isReferenceRuntimeEnabled(params) ? REFERENCE_RUNTIME_MODES : PRODUCT_RUNTIME_MODES'),
  'ProductAudioRuntimeSelection must keep web-ts/core-smoke behind explicit dev/reference contexts',
  failures,
);
assert(!productAudioRuntimeSelection.includes('AudioEngineRuntimeMode'), 'ProductAudioRuntimeSelection must not export legacy AudioEngineRuntimeMode', failures);

assert(
  productRuntimeSwitch.includes("import { RuntimeModeSwitch } from './RuntimeModeSwitch'") &&
    !productRuntimeSwitch.includes("'web-ts'") &&
    !productRuntimeSwitch.includes("'core-smoke'"),
  'ProductRuntimeSwitch must be product-facing and must not hard-code reference runtime choices',
  failures,
);

assert(
  !selectedProductRuntime.includes("import('../referenceAudioRuntime')") &&
    !selectedProductRuntime.includes('loadReferenceAudioRuntime') &&
    selectedProductRuntime.includes("from '../reference/ReferenceSelectedRuntime'") &&
    referenceSelectedRuntime.includes("import('../referenceAudioRuntime')"),
  'SelectedProductRuntime must delegate reference runtime loading to ReferenceSelectedRuntime',
  failures,
);
assert(unavailableRuntime.includes('web-ts reference runtime is unavailable in production builds'), 'Production reference runtime wrapper must fail closed', failures);
assert(viteConfig.includes('referenceAudioRuntime.unavailable.ts'), 'Vite production config must alias the reference runtime wrapper to the fail-closed stub', failures);

const forbiddenBundleMarkers = [
  'reference/webTs',
  'coreEngineHost',
  '__coreEngineHost',
  'MediaStreamAudioDestinationNode',
  'sendGranulatorRandomSequence',
];

const forbiddenAssetNameMarkers = [
  'audio-engine',
  'reference-web-ts-engine',
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
  schemaVersion: 2,
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
