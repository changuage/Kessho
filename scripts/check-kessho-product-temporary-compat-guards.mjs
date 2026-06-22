import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function assertExistingFileDoesNotMatch(relPath, pattern, message) {
  const fullPath = join(root, relPath);
  if (!existsSync(fullPath)) return;
  const source = read(relPath);
  if (pattern.test(source)) {
    console.error(`${message}\nFile: ${relPath}\nPattern: ${pattern}`);
    process.exit(1);
  }
}

function gitGrep(pattern, paths) {
  const result = spawnSync('git', ['grep', '-nE', pattern, '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status === 1) return '';
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const productHookFiles = [
  'src/ui/useProductRuntimeSequencerControls.ts',
  'src/ui/useProductRuntimeSequencerCallbacks.ts',
  'src/ui/useProductRuntimeTelemetry.ts',
  'src/ui/useProductRuntimeStateRuntime.ts',
  'src/ui/useProductRuntimeMacRecovery.ts',
  'src/ui/useProductRuntimeGlobalSurface.ts',
  'src/ui/useProductRuntimeModulationRanges.ts',
  'src/ui/useProductRuntimeMorphRuntimeSurface.ts',
  'src/ui/useProductRuntimeRecordingRuntime.ts',
];

for (const relPath of productHookFiles) {
  assertExistingFileDoesNotMatch(
    relPath,
    /useSelectedAudioEngine|SelectedAudioEngine|SelectedProductRuntime|selectedProductRuntime|ProductAudioEngineCompat|referenceAudioEngineDebug/,
    'Product runtime hooks must not delegate to selected/reference compatibility surfaces.',
  );
}

assertExistingFileDoesNotMatch(
  'src/audio/product/ProductEngineProxy.ts',
  /web-ts|web-audio|core-smoke|native-product|test-product/,
  'ProductEngineProxy must be core-product only. Reference/native/test mode handling belongs outside product engine creation.',
);

const compatHits = gitGrep('ProductAudioEngineCompat', ['src/audio/product', 'src/ui', 'src/App.tsx']);
if (compatHits) {
  console.error('Deprecated ProductAudioEngineCompat is still imported from production/product code:\n');
  console.error(compatHits);
  process.exit(1);
}

const invalidFallbackTodos = gitGrep('TODO\\((product-runtime-compat|product-fallback|fallback)', ['src/audio', 'src/ui'])
  .split('\n')
  .filter(Boolean)
  .filter((line) => !line.includes('TODO(product-fallback-retire:'));

if (invalidFallbackTodos.length) {
  console.error('Fallback TODOs must use TODO(product-fallback-retire:<id>): owner=..., remove-by=..., guard=...');
  console.error(invalidFallbackTodos.join('\n'));
  process.exit(1);
}

console.log('Product temporary compatibility guard passed');
