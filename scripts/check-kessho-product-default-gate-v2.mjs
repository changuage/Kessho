import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0, `missing start token ${startToken}`);
  assert(end > start, `missing end token ${endToken}`);
  return source.slice(start, end);
}

const app = read('src/App.tsx');
const globalPage = read('src/ui/global/GlobalPage.tsx');
const packageJson = readJson('package.json');
const workflow = read('.github/workflows/product-core-ci.yml');
const productCiRunner = read('scripts/run-kessho-product-ci.mjs');
const defaultGateDoc = read('docs/kessho-product-default-gate-v2.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const readinessReport = read('docs/reports/kessho-core-parity-readiness-latest.md');

const runtimeModeBody = sourceSlice(app, 'function getAudioEngineRuntimeMode()', 'function shouldShowAudioEngineSwitcher()');
assert(
  runtimeModeBody.includes("if (typeof window === 'undefined') return 'core-bridge';"),
  'server/runtime fallback must remain core-bridge while Product Default Gate v2 is blocked',
);
assert(
  runtimeModeBody.includes("if (mode === 'core-product') return 'core-product';"),
  'core-product must remain explicitly selectable for migration probes',
);
const coreProductReturnCount = runtimeModeBody.match(/return 'core-product';/g)?.length ?? 0;
assert(
  coreProductReturnCount === 1,
  'core-product return must only appear in the explicit runtime query-param branch',
);
assert(
  runtimeModeBody.includes(
    "if (mode === 'core-product') return 'core-product';\n    return 'core-bridge';\n  } catch {\n    return 'core-bridge';",
  ),
  'web default must not be core-product while Product Default Gate v2 is blocked',
);
assert(
  globalPage.includes("audioEngineMode = 'core-bridge'"),
  'GlobalPage default audioEngineMode must remain core-bridge while Product Default Gate v2 is blocked',
);

const requiredDocTokens = [
  'Kessho Product Default Gate v2',
  'Status: BLOCKED',
  'Decision: web-default-deferred',
  'Native decision: native-default-deferred',
  'core:product:ci',
  'core:readiness:browser',
  'core:product:native-release-smoke',
  'Product Core componentization complete',
  'Exact patch bridge classification and retirement path exists',
  'Snapshot adapter authority audit passes',
  'Host state reconciliation tests pass',
  'Dirty-diff/full-snapshot classification and telemetry pass',
  'Runtime fallback classification passes',
  'Required telemetry/getter placeholders are closed or explicitly unsupported',
  'Generated ABI hygiene gate passes',
  'WASM artifact integrity gate passes',
  'Product Core GitHub Actions workflow passes',
  'Behavioral test quality gates pass',
  'Pad preset family probes pass',
  'Broader Lead preset probes pass',
  'Drum source probes pass',
  'Piano and soundscape asset probes pass',
  'Representative scene/full-arrangement probes pass',
  'Sequencer dice/evolve/reset-home state exports to UI',
  'sequencer UI state copy API',
  'Deterministic music engine closure passes',
  'FX/dynamics/master depth closure passes',
  'Native release proof passes or native default is explicitly deferred with a signed-off blocker',
  'p95/p99 CPU, underrun, heap, and asset-memory gates pass',
  'local p95/p99 render-latency and bounded simulated-underrun gate',
  'decoded-byte and web worklet heap gates',
  'No required unsupported UI/control methods remain',
  'Product host method audit',
  '`core-product` range-key UI gating',
  'native-default-deferred',
  'web runtime default must stay `core-bridge`',
];
for (const token of requiredDocTokens) {
  assert(defaultGateDoc.includes(token), `Product Default Gate v2 doc is missing ${token}`);
}

for (const token of [
  'Product Default Gate v2',
  'web-default-deferred',
  'core:product:default-gate-v2',
]) {
  assert(statusDoc.includes(token), `migration status doc is missing ${token}`);
}

assert(
  packageJson.scripts?.['core:product:default-gate-v2'] ===
    'node scripts/check-kessho-product-default-gate-v2.mjs',
  'package.json must expose core:product:default-gate-v2',
);
assert(
  packageJson.scripts?.['core:product:workflow'] ===
    'node scripts/check-kessho-product-workflow.mjs',
  'package.json must expose core:product:workflow',
);
assert(
  packageJson.scripts?.['core:product:ci'] === 'node scripts/run-kessho-product-ci.mjs',
  'package.json must expose core:product:ci through the annotated Product Core CI runner',
);
assert(
  productCiRunner.includes("'core:product:default-gate-v2'"),
  'core:product:ci must include Product Default Gate v2 guard',
);
assert(
  productCiRunner.includes("'core:product:workflow'"),
  'core:product:ci must include Product Core workflow contract guard',
);

for (const token of [
  'npm run core:product:workflow',
  'npm run core:product:default-gate-v2',
  'npm run core:product:ci',
  'docs/kessho-product-default-gate-v2.md',
  'docs/kessho-product-native-release-proof.md',
  'docs/kessho-product-asset-manifest-decode-matrix.md',
  'KesshoNativeSwift/KesshoProductNativeReleaseSmoke/**',
]) {
  assert(workflow.includes(token), `Product Core workflow is missing ${token}`);
}

for (const token of [
  'Overall check status: **PASS**',
  'Objective slice coverage: **COMPLETE**',
]) {
  assert(readinessReport.includes(token), `readiness report is missing ${token}`);
}

console.log('Kessho Product Default Gate v2 guard passed: web default remains deferred');
