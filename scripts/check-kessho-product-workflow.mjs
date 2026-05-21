import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workflowPath = '.github/workflows/product-core-ci.yml';
const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
const browserRuntime = readFileSync(resolve(root, 'scripts/check-kessho-product-browser-runtime.mjs'), 'utf8');

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
  'scripts/build-kessho-core-wasm.mjs',
  'scripts/generate-kessho-product-bindings.mjs',
  'scripts/run-kessho-product-ci.mjs',
  'docs/kessho-product-core-migration-status.md',
  'docs/kessho-product-default-gate-v3.md',
];

const archivedNativeSwiftPaths = [
  'Kessho' + 'NativeSwift/',
  'docs/kessho-native-swift/',
  'docs/kessho-product-' + 'native' + '-release-proof.md',
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

const forbiddenGeneratedReportTriggers = [
  'docs/reports/kessho-product-*.json',
  'docs/reports/kessho-product-*.md',
];

for (const forbiddenPath of forbiddenGeneratedReportTriggers) {
  const quoted = `- '${forbiddenPath}'`;
  assert(
    !pullRequestSection.includes(quoted),
    `Product Core workflow pull_request trigger must not include generated report output: ${forbiddenPath}`,
  );
  assert(
    !pushSection.includes(quoted),
    `Product Core workflow push trigger must not include generated report output: ${forbiddenPath}`,
  );
}

for (const archivedPath of archivedNativeSwiftPaths) {
  assert(
    !pullRequestSection.includes(archivedPath),
    `Product Core workflow pull_request trigger must not include archived Swift path: ${archivedPath}`,
  );
  assert(
    !pushSection.includes(archivedPath),
    `Product Core workflow push trigger must not include archived Swift path: ${archivedPath}`,
  );
}

const requiredCommands = [
  'npx playwright install chromium',
  'npm run core:product:ci:prereqs',
  'npm run core:product:default-gate-v3',
];

for (const command of requiredCommands) {
  assert(workflow.includes(command), `Product Core workflow is missing command: ${command}`);
}

const runCommands = workflow
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('- run: '))
  .map((line) => line.slice('- run: '.length).trim());
assert(
  runCommands.at(-1) === 'npm run core:product:default-gate-v3',
  'Product Default Gate v3 must be the final Product Core workflow command',
);
assert(
  !runCommands.includes('npm run core:product:default-gate-v2'),
  'Product Core workflow must not run Product Default Gate v2',
);

for (const token of [
  'startPreview',
  "spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'",
  '--strictPort',
  'Timed out waiting for',
  'await vite.stop();',
  'default-pad-note',
  'default-lead-note',
  'default-sample-and-synth',
  "capture?.engine === 'core-product'",
  'kessho-product-browser-runtime-latest.json',
]) {
  assert(browserRuntime.includes(token), `Product browser runtime proof is missing token: ${token}`);
}

assert(
  /runs-on:\s+macos-14/.test(workflow),
  'Product Core workflow must run on macOS for local Emscripten/Homebrew parity with developer machines',
);
assert(
  /actions\/checkout@v[56]/.test(workflow) &&
    /actions\/setup-node@v[56]/.test(workflow) &&
    workflow.includes('node-version: 24'),
  'Product Core workflow must use Node 24-backed actions and pin the Node version used by local Product Core scripts',
);
assert(
  workflow.includes('brew install emscripten'),
  'Product Core workflow must install Emscripten before running WASM build checks on macOS',
);

console.log('Kessho Product workflow contract checks passed');
