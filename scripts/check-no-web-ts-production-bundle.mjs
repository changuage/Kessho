import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collectImportSpecifiers,
  collectSourceFiles,
  relativeSourcePath,
} from './lib/sourceArchitectureRules.mjs';

const root = process.cwd();
const distAssets = resolve(root, 'dist/assets');
const reportPath = resolve(root, 'docs/reports/kessho-product-no-web-ts-production-bundle-latest.json');

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const failures = [];
const sourceExceptions = new Set([
  'src/audio/referenceAudioRuntime.ts',
  'src/audio/referenceAudioRuntime.unavailable.ts',
  'src/audio/coreEngineHost.ts',
  'src/audio/reference/ReferenceAudioEngineDebugCompat.ts',
  'src/ui/audioEngineMediaSession.ts',
]);
const sourceFiles = collectSourceFiles(resolve(root, 'src'));
const allowedReferenceSelectionFiles = new Set([
  'src/ui/useProductRuntimeModeSession.ts',
  'src/ui/productRuntimeConstruction.ts',
]);

for (const filePath of sourceFiles) {
  const relativePath = relativeSourcePath(root, filePath);
  if (
    relativePath.startsWith('src/audio/reference/') ||
    relativePath.startsWith('src/ui/referenceRuntime/') ||
    relativePath.includes('.test.') ||
    relativePath.endsWith('/sonicParityHarness.ts')
  ) continue;
  for (const entry of collectImportSpecifiers(filePath)) {
    if (entry.isTypeOnly) continue;
    const forbiddenReferenceImport = /referenceAudioRuntime|reference\/webTs|coreEngineHost/.test(entry.specifier);
    if (forbiddenReferenceImport && !sourceExceptions.has(relativePath)) {
      failures.push(`${relativePath}: production source imports ${entry.specifier}`);
    }
    if (
      entry.kind === 'dynamic' &&
      entry.specifier.includes('referenceRuntime/') &&
      !allowedReferenceSelectionFiles.has(relativePath)
    ) {
      failures.push(`${relativePath}: reference runtime dynamic import crossed the construction boundary`);
    }
    if (/SelectedProductRuntime|useSelectedAudioEngine/.test(entry.specifier)) {
      failures.push(`${relativePath}: retired selected-runtime import ${entry.specifier}`);
    }
  }
}

assert(existsSync(distAssets), 'dist/assets is missing; run npm run build first', failures);
assert(!existsSync(resolve(root, 'src/audio/runtime.ts')), 'temporary src/audio/runtime.ts facade must be deleted', failures);
assert(!existsSync(resolve(root, 'src/audio/engine.ts')), 'legacy web-ts engine must remain outside the production audio root', failures);
assert(!existsSync(resolve(root, 'src/audio/product/SelectedProductRuntime.ts')), 'retired SelectedProductRuntime must stay deleted', failures);

const forbiddenBundleMarkers = [
  'reference/webTs',
  'referenceAudioRuntime',
  'ReferenceAudioEngineDebugCompat',
  'coreEngineHost',
  '__coreEngineHost',
  'MediaStreamAudioDestinationNode',
  'sendGranulatorRandomSequence',
];
const forbiddenAssetNameMarkers = ['reference-web-ts-engine', 'coreEngineHost', 'audio-engine'];
const scannedFiles = [];
if (existsSync(distAssets)) {
  for (const entry of readdirSync(distAssets)) {
    if (!entry.endsWith('.js')) continue;
    const assetPath = resolve(distAssets, entry);
    const source = readFileSync(assetPath, 'utf8');
    scannedFiles.push(`dist/assets/${entry}`);
    for (const marker of forbiddenBundleMarkers) {
      assert(!source.includes(marker), `dist/assets/${entry} contains forbidden reference-runtime marker ${marker}`, failures);
    }
    for (const marker of forbiddenAssetNameMarkers) {
      assert(!entry.includes(marker), `dist/assets/${entry} uses forbidden reference-runtime asset name marker ${marker}`, failures);
    }
  }
}

const report = {
  schemaVersion: 4,
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  sourceBoundary: {
    parser: 'typescript-ast',
    selectionBoundary: [...allowedReferenceSelectionFiles],
  },
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
