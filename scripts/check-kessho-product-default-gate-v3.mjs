import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const now = new Date();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.md');
const dynamicBlockers = [];

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

function tableRows(source, startToken, endToken) {
  return sourceSlice(source, startToken, endToken)
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.startsWith('| Requirement |') && !line.startsWith('| Item |'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function gateRow(requirement) {
  const row = tableRows(defaultGateDoc, '## Gate Matrix', '## Blocker Mapping')
    .find((cells) => cells[0] === requirement);
  assert(row, `Product Default Gate v3 matrix is missing ${requirement}`);
  return {
    requirement: row[0],
    status: row[1],
    quality: row[2],
    evidence: row[3],
    blocker: row[4],
  };
}

function parseRunCommands(workflow) {
  return workflow
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- run: '))
    .map((line) => line.slice('- run: '.length).trim());
}

function assertTextOrder(source, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    assert(index > cursor, `${label} is missing ordered token ${token}`);
    cursor = index;
  }
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
      childRelative === 'KesshoNativeSwift/.build' ||
      childRelative.startsWith('KesshoNativeSwift/.build/') ||
      childRelative === 'KesshoNativeSwift/Generated' ||
      childRelative.startsWith('KesshoNativeSwift/Generated/') ||
      childRelative.includes('node_modules') ||
      childRelative.includes('/.git/') ||
      childRelative.endsWith('check-kessho-product-default-gate-v3.mjs')
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      collectFiles(childRelative, collected);
    } else if (entry.isFile()) {
      collected.push(childRelative);
    }
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

function summarizeBrowserRetries(readinessReport) {
  const cases = readinessReport.slices.flatMap((slice) => slice.corpusCases ?? []);
  const attempts = cases.map((entry) => ({
    caseId: entry.caseId,
    engineMode: entry.engineMode ?? 'core-product-vs-web-reference',
    attemptCount: Number(entry.attemptCount ?? 1),
    maxRetries: Number(entry.maxRetries ?? 0),
    firstAttemptPassed: entry.firstAttemptPassed ?? entry.status === 'pass',
    finalAttemptPassed: entry.finalAttemptPassed ?? entry.status === 'pass',
    failureReasons: entry.failureReasons ?? (entry.failureSummary ? [entry.failureSummary] : []),
  }));
  const retryHistogram = {};
  for (const entry of attempts) {
    retryHistogram[String(entry.attemptCount)] = (retryHistogram[String(entry.attemptCount)] ?? 0) + 1;
  }
  const flakyCases = attempts.filter((entry) => entry.attemptCount > 1 || entry.firstAttemptPassed === false);
  return {
    caseCount: attempts.length,
    worstCaseRetries: Math.max(0, ...attempts.map((entry) => Math.max(0, entry.attemptCount - 1))),
    retryHistogram,
    flakyCaseCount: flakyCases.length,
    flakyCases,
  };
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
    `Default promotion ready: **${report.defaultPromotionReady ? 'YES' : 'NO'}**`,
    '',
    `Last local CI command: \`${report.localCi.lastCommand}\``,
    '',
    `Last GitHub CI command: \`${report.githubCi.lastCommand}\``,
    '',
    `Browser flaky cases: ${report.browserReadiness.flakyCaseCount}`,
    '',
    `Native default: ${report.native.defaultDisposition}`,
    '',
    '## Blockers',
    '',
    ...report.blockers.map((blocker) => `- ${blocker}`),
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

function blockIf(condition, message) {
  if (condition) {
    dynamicBlockers.push(message);
  }
}

const app = read('src/App.tsx');
const globalPage = read('src/ui/global/GlobalPage.tsx');
const packageJson = readJson('package.json');
const workflow = read('.github/workflows/product-core-ci.yml');
const productCiRunner = read('scripts/run-kessho-product-ci.mjs');
const defaultGateDoc = read('docs/kessho-product-default-gate-v3.md');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const nativeDoc = read('docs/kessho-product-native-release-proof.md');
const sourceParityDoc = read('docs/kessho-product-source-parity-broadening.md');
const deterministicDoc = read('docs/kessho-product-deterministic-music-closure.md');
const assetDoc = read('docs/kessho-product-asset-manifest-decode-matrix.md');
const readinessReport = readJson('docs/reports/kessho-core-parity-readiness-latest.json');
const productCiReport = readJson('docs/reports/kessho-product-ci-latest.json');
const cpuReport = readJson('docs/reports/kessho-product-cpu-budget-latest.json');
const runtimeFallbackReport = readJson('docs/reports/kessho-product-runtime-fallbacks-latest.json');
const dirtyDiffReport = readJson('docs/reports/kessho-product-dirty-diff-classification-latest.json');
const hostReconciliationReport = readJson('docs/reports/kessho-product-host-reconciliation-latest.json');
const patchBridgeReport = readJson('docs/reports/kessho-product-patch-bridges.json');
const nativeReleaseReport = readJson('docs/reports/kessho-product-native-release-proof-latest.json');
const assetManifestReport = readJson('docs/reports/kessho-product-asset-manifest-latest.json');

const runtimeModeBody = sourceSlice(app, 'function getAudioEngineRuntimeMode()', 'function shouldShowAudioEngineSwitcher()');
assert(runtimeModeBody.includes("if (typeof window === 'undefined') return 'core-bridge';"), 'server/runtime fallback must remain core-bridge while Product Default Gate v3 is blocked');
assert(runtimeModeBody.includes("if (mode === 'core-product') return 'core-product';"), 'core-product must remain explicitly selectable for migration probes');
assert((runtimeModeBody.match(/return 'core-product';/g)?.length ?? 0) === 1, 'core-product return must only appear in the explicit runtime query-param branch');
assert(runtimeModeBody.includes("return 'core-bridge';"), 'web default must remain core-bridge while Product Default Gate v3 is blocked');
assert(globalPage.includes("audioEngineMode = 'core-bridge'"), 'GlobalPage default audioEngineMode must remain core-bridge while Product Default Gate v3 is blocked');

assert(packageJson.scripts?.['core:product:default-gate-v3'] === 'node scripts/check-kessho-product-default-gate-v3.mjs', 'package.json must expose core:product:default-gate-v3');
assert(packageJson.scripts?.['core:product:ci'] === 'node scripts/run-kessho-product-ci.mjs', 'package.json must expose local Product Core CI');
assert(packageJson.scripts?.['core:product:ci:prereqs'] === 'node scripts/run-kessho-product-ci.mjs --skip-final-gate', 'package.json must expose Product Core prerequisite CI for GitHub');

assertTextOrder(productCiRunner, [
  "'core:product:generate'",
  "'type-check'",
  "'build'",
  "'core:product:cpu'",
  "'core:readiness:browser'",
  "'core:product:native-build'",
  "'core:product:native-release-smoke'",
  "const finalGateStep = 'core:product:default-gate-v3'",
  'const steps = skipFinalGate ? prerequisiteSteps : [...prerequisiteSteps, finalGateStep]',
], 'local Product Core CI runner');
assert(!productCiRunner.includes("'core:product:default-gate-v2'"), 'local Product Core CI runner must not invoke v2 default gate');

const workflowRunCommands = parseRunCommands(workflow);
assert(workflowRunCommands.at(-1) === 'npm run core:product:default-gate-v3', 'Product Default Gate v3 must be the final GitHub Product Core CI command');
assert(workflowRunCommands.includes('npm run core:product:ci:prereqs'), 'GitHub Product Core CI must run prerequisite Product Core CI before the final gate');
assert(!workflowRunCommands.includes('npm run core:product:default-gate-v2'), 'GitHub Product Core CI must not run Product Default Gate v2');

const requiredWorkflowTokens = [
  'docs/kessho-product-default-gate-v3.md',
  'docs/reports/kessho-product-*.json',
  'docs/reports/kessho-product-*.md',
  'KESSHO_BROWSER_CORPUS_SONIC_RETRIES: 5',
];
for (const token of requiredWorkflowTokens) {
  assert(workflow.includes(token), `Product Core workflow is missing ${token}`);
}

const requiredDocTokens = [
  'Kessho Product Default Gate v3',
  'Status: BLOCKED',
  'Decision: web-default-deferred',
  'Native decision: native-default-deferred',
  'core:product:default-gate-v3',
  'docs/reports/kessho-product-ci-latest.json',
  'docs/reports/kessho-product-default-gate-v3-latest.json',
  '| Requirement | Status | Quality | Evidence | Blocker |',
  'Runtime fallback behavioral proof passes',
  'Browser readiness retry/flakiness report passes',
  'Status/default-gate consistency lint passes',
  'Native release proof passes or native default is explicitly deferred with sign-off',
  'Patch bridge sunset status is accepted temporary debt or blocker',
  'Scene-level nature policy and release asset behavior are mapped',
  'core-product must remain selectable but not default',
];
for (const token of requiredDocTokens) {
  assert(defaultGateDoc.includes(token), `Product Default Gate v3 doc is missing ${token}`);
}

const allowedQualityTokens = new Set(['static', 'integration', 'audio-render', 'browser/worklet', 'native-device', 'production-readiness', 'machine-report']);
const allowedStatuses = new Set(['PASS', 'BLOCKED', 'DEFERRED_WITH_SIGNOFF', 'NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON', 'RESOLVED_WITH_REPORT_REFERENCE']);
const rows = tableRows(defaultGateDoc, '## Gate Matrix', '## Blocker Mapping');
assert(rows.length >= 34, 'Product Default Gate v3 matrix must classify every required gate row');
for (const row of rows) {
  assert(row.length === 5, `Product Default Gate v3 row must have five cells: ${row.join(' | ')}`);
  const [requirement, status, quality, evidence, blocker] = row;
  assert(requirement.length > 0, 'Product Default Gate v3 row is missing its requirement');
  assert(allowedStatuses.has(status), `${requirement} has invalid gate status ${status}`);
  assert(evidence !== '-', `${requirement} must list evidence`);
  if (status === 'BLOCKED' || status === 'DEFERRED_WITH_SIGNOFF') {
    assert(blocker !== '-', `${requirement} must explain mapped blocker/deferred status`);
  }
  for (const token of quality.split(',').map((part) => part.trim())) {
    assert(allowedQualityTokens.has(token), `${requirement} has unsupported gate quality token ${token}`);
  }
}

for (const requirement of [
  'build/typecheck passes',
  'WASM build passes',
  'Schema/generation/ABI checks pass',
  'WASM artifact integrity passes',
  'Architecture boundary checks pass',
  'Reference isolation passes',
  'Snapshot authority passes',
  'Patch bridge policy passes',
  'Patch bridge sunset status is accepted temporary debt or blocker',
  'Host reconciliation behavioral proof passes',
  'Dirty-diff/full-snapshot behavioral proof passes',
  'Runtime fallback behavioral proof passes',
  'Placeholder telemetry/getter truthfulness passes',
  'Source parity broadening passes',
  'Scene/full-arrangement parity passes',
  'Sequencer state export/UI sync passes',
  'Deterministic music closure passes',
  'FX/dynamics/master depth passes',
  'Asset manifest/decode matrix passes',
  'Browser readiness retry/flakiness report passes',
  'CPU p95/p99/underrun/heap reports pass',
  'Native release proof passes or native default is explicitly deferred with sign-off',
  'Status/default-gate consistency lint passes',
]) {
  gateRow(requirement);
}

const mappingRows = tableRows(defaultGateDoc, '## Blocker Mapping', '## Default Rule');
assert(mappingRows.length >= 6, 'Product Default Gate v3 must include blocker mapping rows');
for (const row of mappingRows) {
  assert(row.length >= 6, `Blocker mapping row must include item/status/owner/reason/follow-up/evidence: ${row.join(' | ')}`);
  const [item, status, owner, reason, followUp, evidence] = row;
  assert(item && owner && reason && followUp && evidence, `Blocker mapping row is incomplete: ${row.join(' | ')}`);
  assert(['BLOCKED', 'DEFERRED_WITH_SIGNOFF', 'NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON', 'RESOLVED_WITH_REPORT_REFERENCE'].includes(status), `${item} has invalid blocker mapping status ${status}`);
}

for (const token of [
  'Product Default Gate v3',
  'core:product:default-gate-v3',
  'DEFERRED_WITH_SIGNOFF',
  'NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON',
  'RESOLVED_WITH_REPORT_REFERENCE',
]) {
  assert(statusDoc.includes(token), `migration status doc is missing ${token}`);
}

for (const line of sourceSlice(statusDoc, '## Known Incomplete Areas', '## Capability Report').split('\n')) {
  if (!line.startsWith('- ')) continue;
  assert(
    /- (BLOCKED|DEFERRED_WITH_SIGNOFF|NOT_REQUIRED_FOR_WEB_DEFAULT_WITH_REASON|RESOLVED_WITH_REPORT_REFERENCE):/.test(line),
    `Known incomplete item lacks required status mapping: ${line}`,
  );
}

assert(nativeDoc.includes('DEFERRED_WITH_SIGNOFF') && nativeDoc.includes('Owner:') && nativeDoc.includes('Target follow-up:'), 'native release proof must document signed-off native default deferral with owner and follow-up');
assert(sourceParityDoc.includes('BLOCKED') || sourceParityDoc.includes('RESOLVED_WITH_REPORT_REFERENCE'), 'source parity doc must map remaining parity work');
assert(deterministicDoc.includes('BLOCKED') || deterministicDoc.includes('RESOLVED_WITH_REPORT_REFERENCE'), 'deterministic music doc must map remaining deterministic work');
assert(assetDoc.includes('DEFERRED_WITH_SIGNOFF') || assetDoc.includes('BLOCKED') || assetDoc.includes('RESOLVED_WITH_REPORT_REFERENCE'), 'asset decode matrix must map remaining release/decode work');

requireFreshReport('docs/reports/kessho-product-ci-latest.json', productCiReport.updatedAt ?? productCiReport.generatedAt, [
  'package.json',
  'scripts/run-kessho-product-ci.mjs',
  '.github/workflows/product-core-ci.yml',
  ...collectFiles('scripts'),
  ...collectFiles('src'),
  ...collectFiles('cpp/KesshoCore'),
  ...collectFiles('KesshoNativeSwift'),
  ...collectFiles('public/worklets'),
  ...collectFiles('docs/kessho-product-core-migration-status.md'),
  ...collectFiles('docs/kessho-product-default-gate-v3.md'),
  ...collectFiles('docs/kessho-product-native-release-proof.md'),
  ...collectFiles('docs/kessho-product-source-parity-broadening.md'),
  ...collectFiles('docs/kessho-product-deterministic-music-closure.md'),
  ...collectFiles('docs/kessho-product-asset-manifest-decode-matrix.md'),
]);
requireFreshReport('docs/reports/kessho-core-parity-readiness-latest.json', readinessReport.generatedAt, [
  'scripts/check-kessho-core-parity-readiness.mjs',
  'docs/reports/kessho-core-acceptance-corpus.json',
]);
requireFreshReport('docs/reports/kessho-product-cpu-budget-latest.json', cpuReport.generatedAt, [
  'scripts/check-kessho-product-cpu-budget.mjs',
  'cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp',
]);
requireFreshReport('docs/reports/kessho-product-runtime-fallbacks-latest.json', runtimeFallbackReport.generatedAt, [
  'scripts/check-kessho-product-runtime-fallbacks.mjs',
  'scripts/lib/kesshoProductBehaviorHarness.mjs',
  'src/audio/CoreProductFallbackDiagnostics.ts',
  'src/audio/coreProductEngineHost.ts',
  'docs/kessho-product-runtime-fallback-classification.md',
]);
requireFreshReport('docs/reports/kessho-product-dirty-diff-classification-latest.json', dirtyDiffReport.generatedAt, [
  'scripts/check-kessho-product-dirty-diff-classification.mjs',
  'scripts/lib/kesshoProductBehaviorHarness.mjs',
  'src/audio/CoreProductRuntimeAdapter.ts',
  'src/audio/coreProductEngineHost.ts',
  'docs/kessho-product-control-classification.md',
]);
requireFreshReport('docs/reports/kessho-product-host-reconciliation-latest.json', hostReconciliationReport.generatedAt, [
  'scripts/check-kessho-product-host-reconciliation.mjs',
  'scripts/lib/kesshoProductBehaviorHarness.mjs',
  'src/audio/coreProductEngineHost.ts',
  'src/audio/CoreProductRuntimeAdapter.ts',
  'cpp/KesshoCore/tests/ProductSequencerTests.cpp',
]);
requireFreshReport('docs/reports/kessho-product-patch-bridges.json', patchBridgeReport.generatedAt, [
  'scripts/check-kessho-product-patch-bridges.mjs',
  'docs/kessho-product-patch-bridge-policy.md',
  'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp',
]);
requireFreshReport('docs/reports/kessho-product-native-release-proof-latest.json', nativeReleaseReport.generatedAt, [
  'scripts/check-kessho-product-native-release-proof.mjs',
  'docs/kessho-product-native-release-proof.md',
]);
requireFreshReport('docs/reports/kessho-product-asset-manifest-latest.json', assetManifestReport.generatedAt, [
  'scripts/check-kessho-product-asset-manifest.mjs',
  'docs/kessho-product-asset-manifest-decode-matrix.md',
  'src/audio/coreProductAssetManifest.json',
]);

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
  'core:product:placeholder-getters',
  'core:product:reference-isolation',
  'core:product:abi',
  'core:build:wasm',
  'core:product:wasm',
  'core:product:determinism',
  'core:product:sequencer',
  'core:product:harmony',
  'core:product:graph',
  'core:product:fx',
  'core:product:fx-depth',
  'core:product:asset-manifest',
  'core:product:sources',
  'core:product:assets',
  'core:product:source-parity',
  'core:product:web-host',
  'core:product:native',
  'core:product:native-release',
  'core:product:cpu',
  'core:readiness:browser',
  'core:product:native-build',
  'core:product:native-release-smoke',
];

assert(Array.isArray(productCiReport.prerequisiteSteps), 'Product Core CI report must list prerequisiteSteps');
assert(JSON.stringify(productCiReport.prerequisiteSteps) === JSON.stringify(requiredPrerequisiteSteps), 'Product Core CI prerequisite step list is stale; rerun local CI with the v3 runner');
for (const stepName of requiredPrerequisiteSteps) {
  assertStepPassed(productCiReport, stepName);
}
assert(!stepByName(productCiReport, 'core:product:default-gate-v2'), 'Product Core CI report must not include v2 default gate');
if (productCiReport.mode === 'full-with-final-gate') {
  assert(productCiReport.expectedSteps?.at(-1) === 'core:product:default-gate-v3', 'full local Product Core CI must plan v3 default gate last');
}

blockIf(readinessReport.summary?.status !== 'pass', 'browser readiness report status is not pass');
blockIf(readinessReport.summary?.readiness !== 'pass', 'browser readiness report full readiness is not pass');
assert(readinessReport.summary?.browserCorpus === 'run', 'browser readiness report must include browser corpus');
assert(readinessReport.summary?.sliceCoverage === 'complete', 'browser readiness report must cover every readiness slice');
const retrySummary = summarizeBrowserRetries(readinessReport);
assert(retrySummary.caseCount > 0, 'browser readiness retry telemetry has no corpus cases');
assert(readinessReport.summary.retryHistogram, 'browser readiness report must expose retryHistogram');
assert(Object.hasOwn(readinessReport.summary, 'flakyCaseCount'), 'browser readiness report must expose flakyCaseCount');
assert(Object.hasOwn(readinessReport.summary, 'worstCaseRetries'), 'browser readiness report must expose worstCaseRetries');
blockIf(
  Number(readinessReport.summary.flakyCaseCount) !== 0,
  `browser corpus has flakiness debt: flakyCaseCount=${readinessReport.summary.flakyCaseCount}, worstCaseRetries=${readinessReport.summary.worstCaseRetries}`,
);

assert(cpuReport.status === 'pass', 'CPU report must pass');
const disabledCpu = cpuReport.cpu?.scenarios?.disabledFx;
const activeCpu = cpuReport.cpu?.scenarios?.activeFx;
assert(cpuReport.cpu?.status === 'pass', 'CPU scenario report must pass');
assert(cpuReport.heap?.status === 'pass', 'CPU report heap/asset memory section must pass');
assert(disabledCpu?.p95Ms >= 0 && disabledCpu?.p99Ms >= 0, 'CPU report missing disabled-FX p95/p99');
assert(activeCpu?.p95Ms >= 0 && activeCpu?.p99Ms >= 0, 'CPU report missing active-FX p95/p99');
assert(disabledCpu?.simulatedUnderrunCount <= 2, 'CPU report disabled-FX underrun count exceeds threshold');
assert(activeCpu?.simulatedUnderrunCount <= 2, 'CPU report active-FX underrun count exceeds threshold');
assert(Number.isFinite(cpuReport.heap?.webWorkletHeapBytes), 'CPU report missing web worklet heap bytes');

for (const [label, proofReport] of [
  ['runtime fallback', runtimeFallbackReport],
  ['dirty diff', dirtyDiffReport],
  ['host reconciliation', hostReconciliationReport],
]) {
  assert(proofReport.status === 'pass', `${label} behavioral proof report must pass`);
  assert(Array.isArray(proofReport.evidence) && proofReport.evidence.length > 0, `${label} behavioral proof report must include evidence`);
}

for (const token of [
  'dev-audio-critical-fallbacks-throw',
  'production-diagnostics-log-once',
  'getter-fallback-behavior',
  'documented-telemetry-getter-blockers',
  'reference-only-web-ts-not-supported',
]) {
  assert(
    runtimeFallbackReport.evidence.some((entry) => entry.id === token),
    `runtime fallback behavioral report is missing ${token}`,
  );
}

const requiredRuntimeFallbackDiagnosticFields = [
  'unsupportedControlCount',
  'unsupportedGetterCount',
  'lastUnsupportedMethod',
  'lastUnsupportedMethodClass',
  'runtimeFallbackDiagnosticCount',
  'audioCriticalFallbackCount',
];
for (const id of [
  'dev-audio-critical-fallbacks-throw',
  'production-diagnostics-log-once',
  'getter-fallback-behavior',
  'reference-only-web-ts-not-supported',
]) {
  const evidence = runtimeFallbackReport.evidence.find((entry) => entry.id === id);
  assert(evidence, `runtime fallback behavioral report is missing ${id}`);
  for (const field of requiredRuntimeFallbackDiagnosticFields) {
    assert(
      Object.hasOwn(evidence.details ?? {}, field),
      `runtime fallback behavioral report ${id} is missing diagnostic field ${field}`,
    );
  }
}

for (const token of [
  'runtime-adapter-diff-behavior',
  'host-dirty-diff-vs-full-snapshot-behavior',
]) {
  assert(
    dirtyDiffReport.evidence.some((entry) => entry.id === token),
    `dirty-diff behavioral report is missing ${token}`,
  );
}

for (const token of [
  'static-host-reconciliation-contract',
  'host-reconciliation-behavior',
  'rng-state-reconciliation-behavior',
]) {
  assert(
    hostReconciliationReport.evidence.some((entry) => entry.id === token),
    `host reconciliation behavioral report is missing ${token}`,
  );
}

assert(patchBridgeReport.status === 'pass', 'patch bridge sunset report must pass');
assert(Array.isArray(patchBridgeReport.sunsetEntries) && patchBridgeReport.sunsetEntries.length >= 42, 'patch bridge report must include every exact patch sunset entry');
assert(Array.isArray(patchBridgeReport.reconstructionProofs) && patchBridgeReport.reconstructionProofs.length >= 1, 'patch bridge report must include at least one reconstruction proof');
assert(nativeReleaseReport.status === 'deferred', 'native release report must remain deferred until live-device proof exists');
assert(nativeReleaseReport.deferral?.signOffStatus === 'signed-for-deferral-only', 'native release deferral must be explicitly signed for deferral only');
assert(Array.isArray(nativeReleaseReport.blockers) && nativeReleaseReport.blockers.length >= 10, 'native release report must keep explicit hardware/release blockers');
assert(assetManifestReport.status === 'pass-with-native-release-blockers', 'asset manifest report must pass while preserving native release blockers');
assert(assetManifestReport.scenePolicies?.soundscapeLayers?.length >= 6, 'asset manifest report must include scene-level nature policies');

assert(gateRow('Native release proof passes or native default is explicitly deferred with sign-off').status === 'DEFERRED_WITH_SIGNOFF', 'native release proof must stay deferred with sign-off while native-default-deferred is present');
assert(gateRow('Status/default-gate consistency lint passes').status === 'PASS', 'status/default-gate consistency lint row must pass when this script passes');
assert(defaultGateDoc.includes('core-product must remain selectable but not default'), 'default rule must keep core-product blocked from default promotion');

const blockingRows = rows
  .map(([requirement, status, , , blocker]) => ({ requirement, status, blocker }))
  .filter((row) => row.status === 'BLOCKED' || row.status === 'DEFERRED_WITH_SIGNOFF');
const blockers = [
  ...blockingRows.map((row) => `${row.requirement}: ${row.blocker}`),
  ...dynamicBlockers,
];
const runtimeFallbackDiagnosticSummaries = Object.fromEntries(
  [
    'dev-audio-critical-fallbacks-throw',
    'production-diagnostics-log-once',
    'getter-fallback-behavior',
    'reference-only-web-ts-not-supported',
  ].map((id) => {
    const evidence = runtimeFallbackReport.evidence.find((entry) => entry.id === id);
    return [
      id,
      Object.fromEntries(
        requiredRuntimeFallbackDiagnosticFields.map((field) => [field, evidence.details[field]]),
      ),
    ];
  }),
);
const report = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  status: blockers.length === 0 ? 'pass' : 'blocked',
  defaultPromotionReady: blockers.length === 0,
  localCi: {
    report: 'docs/reports/kessho-product-ci-latest.json',
    mode: productCiReport.mode,
    lastCommand: productCiReport.finalGateSkipped
      ? `${productCiReport.finalGateStep} (separate final gate after prerequisite report)`
      : (productCiReport.expectedSteps?.at(-1) ?? ''),
    lastPrerequisiteCommand: productCiReport.prerequisiteSteps?.at(-1) ?? '',
    prerequisiteCount: requiredPrerequisiteSteps.length,
  },
  githubCi: {
    workflow: '.github/workflows/product-core-ci.yml',
    lastCommand: workflowRunCommands.at(-1),
  },
  browserReadiness: {
    report: 'docs/reports/kessho-core-parity-readiness-latest.json',
    ...retrySummary,
  },
  cpu: {
    report: 'docs/reports/kessho-product-cpu-budget-latest.json',
    disabledFx: disabledCpu,
    activeFx: activeCpu,
    heap: cpuReport.heap,
  },
  behavioralProofs: {
    runtimeFallback: 'docs/reports/kessho-product-runtime-fallbacks-latest.json',
    runtimeFallbackDiagnostics: runtimeFallbackDiagnosticSummaries,
    dirtyDiff: 'docs/reports/kessho-product-dirty-diff-classification-latest.json',
    hostReconciliation: 'docs/reports/kessho-product-host-reconciliation-latest.json',
  },
  patchBridges: {
    report: 'docs/reports/kessho-product-patch-bridges.json',
    sunsetEntryCount: patchBridgeReport.sunsetEntries.length,
    reconstructionProofCount: patchBridgeReport.reconstructionProofs.length,
  },
  native: {
    defaultDisposition: 'native-default-deferred',
    evidence: 'docs/kessho-product-native-release-proof.md',
    report: 'docs/reports/kessho-product-native-release-proof-latest.json',
  },
  assets: {
    report: 'docs/reports/kessho-product-asset-manifest-latest.json',
    scenePolicyCount: assetManifestReport.scenePolicies.soundscapeLayers.length,
  },
  blockers,
};

writeGateReport(report);
if (blockers.length > 0) {
  console.error(`Kessho Product Default Gate v3 blocked default promotion (${blockers.length} blocker${blockers.length === 1 ? '' : 's'})`);
  process.exitCode = 1;
} else {
  console.log('Kessho Product Default Gate v3 passed: core-product is eligible for default promotion');
}
