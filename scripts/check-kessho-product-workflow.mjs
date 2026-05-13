import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workflowPath = '.github/workflows/product-core-ci.yml';
const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
const readiness = readFileSync(resolve(root, 'scripts/check-kessho-core-parity-readiness.mjs'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sectionBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert(start >= 0, `Workflow is missing ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(end > start, `Workflow is missing ${endToken} after ${startToken}`);
  return source.slice(start, end);
}

const pullRequestSection = sectionBetween(workflow, 'pull_request:', '  push:');
const pushSection = sectionBetween(workflow, 'push:', '\njobs:');

const requiredPaths = [
  'cpp/KesshoCore/**',
  'src/audio/CoreProduct*',
  'src/audio/coreProduct*',
  'src/audio/generated/**',
  'src/App.tsx',
  'public/worklets/kessho-core-product.worklet.js',
  'public/worklets/kessho_core.wasm',
  'public/samples/**',
  'scripts/check-kessho-product*',
  'scripts/check-kessho-core-parity-readiness.mjs',
  'scripts/check-web-core-sonic-parity.mjs',
  'scripts/profile-kessho-core-acceptance-corpus.mjs',
  'scripts/build-kessho-core-wasm.mjs',
  'scripts/generate-kessho-product-bindings.mjs',
  'scripts/run-kessho-product-ci.mjs',
  'KesshoNativeSwift/CoreBridge/**',
  'KesshoNativeSwift/Generated/**',
  'docs/kessho-product-core-migration-status.md',
  'docs/reports/kessho-core-acceptance-corpus.*',
  'docs/reports/kessho-core-parity-readiness-latest.*',
];

for (const requiredPath of requiredPaths) {
  const quoted = `- '${requiredPath}'`;
  assert(
    pullRequestSection.includes(quoted),
    `Product Core workflow pull_request trigger is missing ${requiredPath}`,
  );
  assert(
    pushSection.includes(quoted),
    `Product Core workflow push trigger is missing ${requiredPath}`,
  );
}

const requiredCommands = [
  'npx playwright install chromium',
  'npm run type-check',
  'npm run build',
  'npm run core:build:wasm',
  'npm run core:product:ci',
  'npm run core:readiness:browser',
  'swift build --package-path KesshoNativeSwift',
];

for (const command of requiredCommands) {
  assert(workflow.includes(command), `Product Core workflow is missing command: ${command}`);
}

for (const token of [
  'startManagedBrowserServer',
  "spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'",
  '--strictPort',
  'Timed out waiting for',
  'Vite output:',
  'await managedBrowserServer?.stop();',
]) {
  assert(readiness.includes(token), `browser readiness runner is missing managed-server token: ${token}`);
}

assert(
  /runs-on:\s+macos-14/.test(workflow),
  'Product Core workflow must run on macOS so Swift/native Product Core checks are available',
);
assert(
  workflow.includes('actions/setup-node@v4') && workflow.includes('node-version: 24'),
  'Product Core workflow must pin the Node version used by local Product Core scripts',
);
assert(
  workflow.includes('brew install emscripten'),
  'Product Core workflow must install Emscripten before running WASM build checks on macOS',
);

console.log('Kessho Product workflow contract checks passed');
