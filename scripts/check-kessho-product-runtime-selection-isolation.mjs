import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const referenceBoundaryFiles = new Set([
  'src/audio/coreEngineHost.ts',
  'src/audio/referenceAudioRuntime.ts',
  'src/audio/referenceAudioRuntime.unavailable.ts',
  'src/audio/product/ProductAudioRuntimeSelection.ts',
  'src/audio/product/SelectedProductRuntime.ts',
]);

const files = execFileSync('git', ['ls-files', 'src/**/*.ts', 'src/**/*.tsx'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((path) => existsSync(join(root, path)))
  .filter((path) => !path.startsWith('src/audio/reference/'))
  .filter((path) => !path.startsWith('src/ui/referenceRuntime/'))
  .filter((path) => !path.startsWith('src/ui/useSelectedAudioEngine'))
  .filter((path) => !referenceBoundaryFiles.has(path))
  .filter((path) => !path.includes('.test.'))
  .filter((path) => !path.includes('sonicParityHarness'))
  .filter((path) => !path.includes('RuntimeSwitch'));

const forbidden = [
  'ProductAudioEngineCompat',
  'ReferenceSelectedRuntime',
  'referenceAudioRuntime',
  'reference/webTs',
];

let failed = false;
const productEngineProxy = readFileSync(join(root, 'src/audio/product/ProductEngineProxy.ts'), 'utf8');
for (const token of ['URLSearchParams', 'window.location', 'native-product', 'test-product', 'web-ts', 'web-audio', 'core-smoke']) {
  if (productEngineProxy.includes(token)) {
    console.error(`ProductEngineProxy must be core-product only and must not contain runtime selection token ${token}`);
    failed = true;
  }
}
if (
  !productEngineProxy.includes("export function getProductEngineRuntimeMode(): 'core-product'") ||
  !productEngineProxy.includes("return 'core-product';") ||
  !productEngineProxy.includes('new WebProductEngine()')
) {
  console.error('ProductEngineProxy must expose a direct core-product WebProductEngine runtime.');
  failed = true;
}

for (const path of files) {
  const text = readFileSync(join(root, path), 'utf8');
  for (const token of forbidden) {
    if (text.includes(token)) {
      console.error(`runtime selection isolation violation: ${path} contains ${token}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('runtime selection isolation guard passed');
