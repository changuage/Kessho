import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/kessho-product-docs-freshness-latest.json');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(source, token, label, failures) {
  if (!source.includes(token)) failures.push(`${label} is missing ${token}`);
}

function assertExcludes(source, token, label, failures) {
  if (source.includes(token)) failures.push(`${label} still contains obsolete text: ${token}`);
}

const files = new Map([
  ['README.md', read('README.md')],
  ['docs/kessho-product-core-migration-status.md', read('docs/kessho-product-core-migration-status.md')],
  ['docs/product-core/architecture.md', read('docs/product-core/architecture.md')],
  ['docs/product-core/product-engine-port.md', read('docs/product-core/product-engine-port.md')],
  ['docs/product-core/schema-and-codegen.md', read('docs/product-core/schema-and-codegen.md')],
  ['docs/product-core/host-diagnostics.md', read('docs/product-core/host-diagnostics.md')],
  ['docs/product-core/native-bridge.md', read('docs/product-core/native-bridge.md')],
  ['docs/product-core/reference-web-ts.md', read('docs/product-core/reference-web-ts.md')],
  ['docs/product-core/unsupported-surface.md', read('docs/product-core/unsupported-surface.md')],
  ['package.json', read('package.json')],
  ['scripts/run-kessho-product-ci.mjs', read('scripts/run-kessho-product-ci.mjs')],
]);

const failures = [];

for (const [path, source] of files) {
  assertIncludes(source, 'Product', path, failures);
}

for (const path of [
  'README.md',
  'docs/kessho-product-core-migration-status.md',
  'docs/product-core/architecture.md',
  'docs/product-core/native-bridge.md',
  'docs/product-core/reference-web-ts.md',
]) {
  const source = files.get(path);
  assertIncludes(source, 'core-product', path, failures);
  assertIncludes(source, 'web-ts', path, failures);
}

for (const path of [
  'README.md',
  'docs/product-core/architecture.md',
  'docs/product-core/product-engine-port.md',
]) {
  const source = files.get(path);
  assertIncludes(source, 'ProductEnginePort', path, failures);
}

for (const typeName of ['AudioNode', 'GainNode', 'AnalyserNode', 'MediaStream']) {
  assertIncludes(files.get('docs/product-core/product-engine-port.md'), typeName, 'docs/product-core/product-engine-port.md', failures);
}

for (const path of [
  'docs/product-core/schema-and-codegen.md',
  'docs/kessho-product-core-migration-status.md',
]) {
  assertIncludes(files.get(path), 'schema', path, failures);
  assertIncludes(files.get(path), 'generated', path, failures);
}

for (const counter of [
  'unsupportedControlCount',
  'unsupportedGetterCount',
  'runtimeFallbackDiagnosticCount',
  'audioCriticalFallbackCount',
]) {
  assertIncludes(files.get('docs/product-core/host-diagnostics.md'), counter, 'docs/product-core/host-diagnostics.md', failures);
}

assertIncludes(files.get('README.md'), 'Product Core', 'README.md', failures);
assertIncludes(files.get('README.md'), 'reference-only', 'README.md', failures);
assertIncludes(files.get('README.md'), 'npm run core:product:ci', 'README.md', failures);
assertIncludes(files.get('docs/product-core/reference-web-ts.md'), 'src/audio/reference/webTs/engine.ts', 'docs/product-core/reference-web-ts.md', failures);
assertIncludes(files.get('docs/product-core/reference-web-ts.md'), 'src/audio/reference/ReferenceSelectedRuntime.ts', 'docs/product-core/reference-web-ts.md', failures);
assertIncludes(files.get('docs/product-core/architecture.md'), 'src/audio/reference/webTs/engine.ts', 'docs/product-core/architecture.md', failures);
assertIncludes(files.get('docs/kessho-product-core-migration-status.md'), 'src/audio/reference/webTs/engine.ts', 'docs/kessho-product-core-migration-status.md', failures);
assertIncludes(files.get('docs/kessho-product-core-migration-status.md'), 'Web runtime default | `core-product`', 'docs/kessho-product-core-migration-status.md', failures);
assertIncludes(files.get('docs/kessho-product-core-migration-status.md'), 'Native bridge | Deferred for web default', 'docs/kessho-product-core-migration-status.md', failures);
assertIncludes(files.get('docs/product-core/native-bridge.md'), 'Native Product runtime is out of active web-default release scope', 'docs/product-core/native-bridge.md', failures);
assertIncludes(files.get('docs/product-core/native-bridge.md'), 'supports_native_bridge', 'docs/product-core/native-bridge.md', failures);
assertIncludes(files.get('docs/product-core/native-bridge.md'), 'native-product', 'docs/product-core/native-bridge.md', failures);
assertIncludes(files.get('docs/product-core/unsupported-surface.md'), 'zero production findings', 'docs/product-core/unsupported-surface.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '## Sequencer UI Patch Burn-down', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '`product-core-sequencer-evolve-config-events`', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '`product-core-sequencer-sub-lane-config-events`', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '`product-core-sequencer-step-override-events`', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '`product-core-sequencer-pitch-settings-events`', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/product-engine-port.md'), '`product-core-sequencer-home-capture-events`', 'docs/product-core/product-engine-port.md', failures);
assertIncludes(files.get('docs/product-core/architecture.md'), 'The remaining `applySequencerUiPatch` lane is an explicit temporary bridge', 'docs/product-core/architecture.md', failures);
assertIncludes(files.get('docs/product-core/unsupported-surface.md'), '`applySequencerUiPatch` is not an unsupported production getter or fallback', 'docs/product-core/unsupported-surface.md', failures);
assertIncludes(files.get('package.json'), '"migration:docs": "node scripts/check-product-docs-freshness.mjs"', 'package.json', failures);
assertIncludes(files.get('scripts/run-kessho-product-ci.mjs'), "'migration:docs'", 'scripts/run-kessho-product-ci.mjs', failures);

assertExcludes(files.get('README.md'), 'Modify `src/audio/engine.ts` to load and use ConvolverNode', 'README.md', failures);
assertExcludes(files.get('README.md'), 'engine.ts           # Audio graph, voice management, scheduling', 'README.md', failures);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  checkedFiles: [...files.keys()].filter((path) => path !== 'package.json' && !path.startsWith('scripts/')),
  failures,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Product Core docs freshness checks passed');
