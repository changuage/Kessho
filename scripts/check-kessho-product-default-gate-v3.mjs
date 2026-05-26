import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const now = new Date();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(start >= 0, `missing start token ${startToken}`);
  assert(end > start, `missing end token ${endToken}`);
  return source.slice(start, end);
}

function parseRunCommands(workflow) {
  return workflow
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- run: '))
    .map((line) => line.slice('- run: '.length).trim());
}

function modifiedAfter(path, isoDate) {
  if (!existsSync(resolve(root, path))) return false;
  return statSync(resolve(root, path)).mtimeMs > Date.parse(isoDate) + 1000;
}

function requireFreshReport(path, generatedAt, inputs) {
  assert(existsSync(resolve(root, path)), `${path} is missing`);
  assert(Number.isFinite(Date.parse(generatedAt)), `${path} has invalid generatedAt`);
  const ageMs = now.getTime() - Date.parse(generatedAt);
  assert(ageMs >= 0, `${path} generatedAt is in the future`);
  assert(ageMs < 24 * 60 * 60 * 1000, `${path} is stale: generatedAt is older than 24 hours`);
  const staleInputs = inputs.filter((input) => modifiedAfter(input, generatedAt));
  assert(staleInputs.length === 0, `${path} is stale; rerun after changes to ${staleInputs.join(', ')}`);
}

function collectFiles(path, collected = []) {
  const fullPath = resolve(root, path);
  if (!existsSync(fullPath)) return collected;
  const stat = statSync(fullPath);
  if (stat.isFile()) {
    collected.push(relative(root, fullPath));
    return collected;
  }
  if (!stat.isDirectory()) return collected;
  for (const entry of readdirSync(fullPath, { withFileTypes: true })) {
    const child = resolve(fullPath, entry.name);
    const childRelative = relative(root, child);
    if (
      childRelative.startsWith('docs/reports') ||
      childRelative === 'dist' ||
      childRelative.startsWith('dist/') ||
      childRelative === 'build' ||
      childRelative.startsWith('build/') ||
      childRelative === 'src/audio/generated' ||
      childRelative.startsWith('src/audio/generated/') ||
      childRelative === 'cpp/KesshoCore/generated' ||
      childRelative.startsWith('cpp/KesshoCore/generated/') ||
      childRelative === 'archive' ||
      childRelative.startsWith('archive/') ||
      childRelative.includes('node_modules') ||
      childRelative.includes('/.git/')
    ) {
      continue;
    }
    if (entry.isDirectory()) collectFiles(childRelative, collected);
    else if (entry.isFile()) collected.push(childRelative);
  }
  return collected;
}

function stepByName(report, stepName) {
  return (report.steps ?? []).find((step) => step.step === stepName);
}

function assertStepPassed(report, stepName) {
  const step = stepByName(report, stepName);
  assert(step, `Product Core CI report is missing prerequisite step ${stepName}`);
  assert(step.status === 'pass', `Product Core CI prerequisite ${stepName} did not pass`);
  assert(Number.isFinite(Date.parse(step.startedAt)), `${stepName} is missing startedAt`);
  assert(Number.isFinite(Date.parse(step.finishedAt)), `${stepName} is missing finishedAt`);
  return step;
}

function writeGateReport(report) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# Kessho Product Default Gate v3',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Web default runtime: ${report.webDefaultRuntime}`,
    '',
    `Product browser runtime report: ${report.browserRuntime.report}`,
    '',
    '## Browser Runtime Cases',
    '',
    '| Case | RMS | Peak |',
    '| --- | ---: | ---: |',
    ...report.browserRuntime.cases.map((entry) => `| ${entry.id} | ${entry.rms.toFixed(6)} | ${entry.peak.toFixed(6)} |`),
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

const app = read('src/App.tsx');
const runtime = read('src/audio/runtime.ts');
const globalPage = read('src/ui/global/GlobalPage.tsx');
const packageJson = readJson('package.json');
const workflow = read('.github/workflows/product-core-ci.yml');
const productCiRunner = read('scripts/run-kessho-product-ci.mjs');
const defaultGateDoc = read('docs/kessho-product-default-gate-v3.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const productCiReport = readJson('docs/reports/kessho-product-ci-latest.json');
const browserRuntimeReport = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const cpuReport = readJson('docs/reports/kessho-product-cpu-budget-latest.json');
const runtimeFallbackReport = readJson('docs/reports/kessho-product-runtime-fallbacks-latest.json');
const dirtyDiffReport = readJson('docs/reports/kessho-product-dirty-diff-classification-latest.json');
const hostReconciliationReport = readJson('docs/reports/kessho-product-host-reconciliation-latest.json');
const patchBridgeReport = readJson('docs/reports/kessho-product-patch-bridges.json');
const assetManifestReport = readJson('docs/reports/kessho-product-asset-manifest-latest.json');

const appRuntimeModeBody = sourceSlice(app, 'function getAudioEngineRuntimeMode()', 'function shouldShowAudioEngineSwitcher()');
const runtimeModeBody = sourceSlice(runtime, 'export function getAudioEngineRuntimeMode()', 'function isQueueableMethod');
for (const [label, body] of [['App', appRuntimeModeBody], ['runtime', runtimeModeBody]]) {
  assert(body.includes("return 'core-product';"), `${label} runtime selection must default to core-product`);
  assert(!body.includes("return 'core-bridge';"), `${label} runtime selection must not default to the old bridge`);
}
assert(globalPage.includes("audioEngineMode = 'core-product'"), 'GlobalPage default audioEngineMode must be Product Core');

assert(packageJson.scripts?.build === 'npm run core:product:wasm && tsc && vite build', 'main build must rebuild/verify Product Core WASM before Vite build');
assert(packageJson.scripts?.['core:product:browser-runtime'] === 'node scripts/check-kessho-product-browser-runtime.mjs', 'package.json must expose core:product:browser-runtime');
assert(packageJson.scripts?.['core:product:sequencer-evolve'] === 'node scripts/run-kessho-product-sequencer-evolve-regression.mjs', 'package.json must expose core:product:sequencer-evolve');
assert(packageJson.scripts?.['core:product:sequencer-ui'] === 'node scripts/check-kessho-product-sequencer-ui-parity.mjs', 'package.json must expose core:product:sequencer-ui');
assert(packageJson.scripts?.['core:product:default-gate-v3'] === 'node scripts/check-kessho-product-default-gate-v3.mjs', 'package.json must expose core:product:default-gate-v3');
assert(packageJson.scripts?.['core:product:ci'] === 'node scripts/run-kessho-product-ci.mjs', 'package.json must expose local Product Core CI');
assert(packageJson.scripts?.['core:product:ci:prereqs'] === 'node scripts/run-kessho-product-ci.mjs --skip-final-gate', 'package.json must expose Product Core prerequisite CI');

assert(productCiRunner.includes("'core:product:browser-runtime'"), 'Product Core CI runner must include browser-runtime proof');
assert(productCiRunner.includes("'core:product:sequencer-evolve'"), 'Product Core CI runner must include Product sequencer evolve proof');
assert(productCiRunner.includes("'core:product:harmony'"), 'Product Core CI runner must include harmony parity proof before sequencer UI parity');
assert(productCiRunner.includes("'core:product:sequencer-ui'"), 'Product Core CI runner must include Product/Web sequencer UI parity proof');
assert(productCiRunner.indexOf("'core:product:harmony'") < productCiRunner.indexOf("'core:product:sequencer-ui'"), 'Product Core CI runner must run harmony parity before Product/Web sequencer UI parity');
assert(!productCiRunner.includes("'core:readiness:browser'"), 'Product Core CI runner must not use the legacy Web-vs-Core readiness gate for product default promotion');
const archivedNativeStepPrefix = "'core:product:" + "native";
assert(!productCiRunner.includes(archivedNativeStepPrefix), 'Product Core CI runner must not depend on archived native Swift checks');
assert(productCiRunner.includes("const finalGateStep = 'core:product:default-gate-v3'"), 'Product Core CI runner must keep v3 final gate');

const workflowRunCommands = parseRunCommands(workflow);
assert(workflowRunCommands.at(-1) === 'npm run core:product:default-gate-v3', 'Product Default Gate v3 must be final GitHub command');
assert(workflowRunCommands.includes('npm run core:product:ci:prereqs'), 'GitHub Product Core CI must run prerequisite Product Core CI first');
assert(!workflow.includes('KESSHO_BROWSER_CORPUS_SONIC_RETRIES'), 'Product workflow must not carry the legacy browser parity retry knob');

for (const token of [
  'Status: PASS',
  'Decision: web-default-core-product',
  'Default Rule',
  'core-product is the web default',
  'core:product:browser-runtime',
]) {
  assert(defaultGateDoc.includes(token), `Product Default Gate v3 doc is missing ${token}`);
}
for (const forbidden of ['web-default-deferred', 'verified web default remains `core-bridge`', 'must remain selectable but not default']) {
  assert(!defaultGateDoc.includes(forbidden), `Product Default Gate v3 doc still contains obsolete blocker text: ${forbidden}`);
}
assert(statusDoc.includes('Web runtime default | `core-product`'), 'migration status doc must report core-product as web default');

const requiredPrerequisiteSteps = [
  'core:product:generate',
  'type-check',
  'build',
  'core:product:schema',
  'core:product:workflow',
  'core:product:architecture',
  'core:product:patch-bridges',
  'core:product:snapshot-authority',
  'core:product:host-reconciliation',
  'core:product:dirty-diff',
  'core:product:runtime-fallbacks',
  'core:product:getter-policies',
  'core:product:reference-isolation',
  'core:product:param-accounting',
  'core:product:abi',
  'core:build:wasm',
  'core:product:wasm',
  'core:product:determinism',
  'core:product:sequencer',
  'core:product:sequencer-evolve',
  'core:product:harmony',
  'core:product:graph',
  'core:product:fx',
  'core:product:fx-depth',
  'core:product:asset-manifest',
  'core:product:sources',
  'core:product:assets',
  'core:product:source-parity',
  'core:product:web-graph-parity:audit',
  'core:product:web-graph-capture-smoke:fast',
  'core:product:web-host',
  'core:product:sequencer-ui',
  'core:product:cpu',
  'core:product:browser-runtime',
];

assert(Array.isArray(productCiReport.prerequisiteSteps), 'Product Core CI report must list prerequisiteSteps');
assert(JSON.stringify(productCiReport.prerequisiteSteps) === JSON.stringify(requiredPrerequisiteSteps), 'Product Core CI prerequisite step list is stale; rerun local CI with the v3 runner');
for (const stepName of requiredPrerequisiteSteps) assertStepPassed(productCiReport, stepName);
assert(!stepByName(productCiReport, 'core:readiness:browser'), 'Product Core CI report must not include legacy browser readiness');
assert(!stepByName(productCiReport, 'core:product:default-gate-v2'), 'Product Core CI report must not include v2 default gate');

requireFreshReport('docs/reports/kessho-product-ci-latest.json', productCiReport.updatedAt ?? productCiReport.generatedAt, [
  'package.json',
  'scripts/run-kessho-product-ci.mjs',
  '.github/workflows/product-core-ci.yml',
  ...collectFiles('scripts'),
  ...collectFiles('src'),
  ...collectFiles('cpp/KesshoCore'),
  ...collectFiles('public/worklets'),
  'docs/kessho-product-core-migration-status.md',
  'docs/kessho-product-default-gate-v3.md',
]);
requireFreshReport('docs/reports/kessho-product-browser-runtime-latest.json', browserRuntimeReport.generatedAt, [
  'scripts/check-kessho-product-browser-runtime.mjs',
  'src/audio/runtime.ts',
  'src/audio/sonicParityHarness.ts',
  'src/audio/coreProductEngineHost.ts',
  'public/worklets/kessho-core-product.worklet.js',
  'public/worklets/kessho_core.wasm',
]);
requireFreshReport('docs/reports/kessho-product-cpu-budget-latest.json', cpuReport.generatedAt, [
  'scripts/check-kessho-product-cpu-budget.mjs',
  'cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp',
]);

assert(browserRuntimeReport.status === 'pass', 'Product browser-runtime report must pass');
assert(browserRuntimeReport.defaultRuntime === 'core-product', 'Product browser-runtime report must prove core-product default');
const browserCaseIds = new Set(browserRuntimeReport.cases.map((entry) => entry.id));
for (const caseId of ['default-pad-note', 'default-lead-note', 'default-sample-and-synth', 'string-waves-arrangement']) {
  assert(browserCaseIds.has(caseId), `Product browser-runtime report is missing ${caseId}`);
}
for (const entry of browserRuntimeReport.cases) {
  assert(entry.engine === 'core-product', `${entry.id} did not run on core-product`);
  assert(entry.rms > 0.0005, `${entry.id} RMS stayed silent`);
  assert(entry.peak > 0.001, `${entry.id} peak stayed silent`);
}
const coexistCase = browserRuntimeReport.cases.find((entry) => entry.id === 'default-sample-and-synth');
assert((coexistCase?.activeAssets ?? 0) > 0, 'sample+synth browser-runtime case did not register Product Core assets');
assert((coexistCase?.workletPadStemPeak ?? 0) > 0, 'sample+synth browser-runtime case did not report Pad stem output');
const stringWavesCase = browserRuntimeReport.cases.find((entry) => entry.id === 'string-waves-arrangement');
assert((stringWavesCase?.activeAssets ?? 0) > 0, 'String Waves browser-runtime case did not register Product Core soundscape assets');
assert((stringWavesCase?.activeVoices ?? 0) > 0, 'String Waves browser-runtime case did not leave Product Core synth voices active');
assert((stringWavesCase?.workletPadStemPeak ?? 0) > 0.00001, 'String Waves browser-runtime case did not report Pad stem output');
assert((stringWavesCase?.workletLeadStemPeak ?? 0) > 0.000001, 'String Waves browser-runtime case did not report Lead stem output');

assert(cpuReport.status === 'pass' && cpuReport.cpu?.status === 'pass' && cpuReport.heap?.status === 'pass', 'CPU/heap report must pass');
for (const [label, proofReport] of [
  ['runtime fallback', runtimeFallbackReport],
  ['dirty diff', dirtyDiffReport],
  ['host reconciliation', hostReconciliationReport],
]) {
  assert(proofReport.status === 'pass', `${label} behavioral proof report must pass`);
}
assert(patchBridgeReport.status === 'pass', 'patch bridge report must pass');
assert(assetManifestReport.status === 'pass', 'asset manifest report must pass');

const report = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  status: 'pass',
  defaultPromotionReady: true,
  webDefaultRuntime: 'core-product',
  localCi: {
    report: 'docs/reports/kessho-product-ci-latest.json',
    mode: productCiReport.mode,
    prerequisiteCount: requiredPrerequisiteSteps.length,
  },
  browserRuntime: {
    report: 'docs/reports/kessho-product-browser-runtime-latest.json',
    cases: browserRuntimeReport.cases,
  },
  cpu: {
    report: 'docs/reports/kessho-product-cpu-budget-latest.json',
    disabledFx: cpuReport.cpu?.scenarios?.disabledFx,
    activeFx: cpuReport.cpu?.scenarios?.activeFx,
    heap: cpuReport.heap,
  },
};

writeGateReport(report);
console.log('Kessho Product Default Gate v3 passed: core-product is the web default runtime');
