import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const now = new Date();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-default-gate-v3-latest.md');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stepByName(report, name) {
  return report.steps?.find((step) => step.step === name);
}

function requireFreshReport(path, generatedAt, inputs) {
  assert(existsSync(resolve(root, path)), `${path} is missing`);
  const generatedMs = Date.parse(generatedAt);
  assert(Number.isFinite(generatedMs), `${path} has an invalid generatedAt`);
  assert(now.getTime() - generatedMs < 24 * 60 * 60 * 1000, `${path} is stale`);
  const stale = inputs.filter((input) => {
    const fullPath = resolve(root, input);
    return existsSync(fullPath) && statSync(fullPath).mtimeMs > generatedMs;
  });
  assert(stale.length === 0, `${path} is stale after ${stale.join(', ')}`);
}

const packageJson = readJson('package.json');
const productCiReport = readJson('docs/reports/kessho-product-ci-latest.json');
const browserRuntimeReport = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const cpuReport = readJson('docs/reports/kessho-product-cpu-budget-latest.json');
const pageCpuReport = readJson('docs/reports/kessho-product-page-cpu-comparison-latest.json');
const pageCpuBeforeAfterReport = readJson('docs/reports/kessho-product-page-cpu-before-after-latest.json');
const sequencerReport = readJson('docs/reports/kessho-product-sequencer-ui-parity-latest.json');
const runtimeFallbackReport = readJson('docs/reports/kessho-product-runtime-fallbacks-latest.json');

const requiredPrerequisiteSteps = [
  'architecture:web-tsx-reachability',
  'test:live-note-input',
  'core:product:live-note-contract',
  'test:generated-sequencer-capture',
  'test:document-visibility',
  'core:product:background-audio',
  'core:product:background-audio-docs',
  'core:product:no-temporary-runtime-compat',
  'core:product:page-cpu-before-after',
];
const configuredSteps = new Set(productCiReport.expectedSteps ?? productCiReport.prerequisiteSteps ?? []);
for (const step of requiredPrerequisiteSteps) {
  assert(configuredSteps.has(step), `Product Core CI report is missing required step ${step}`);
}
assert(productCiReport.finalGateStep === 'core:product:default-gate-v3', 'Product Core CI final gate contract is missing');

assert(productCiReport.summary?.status === 'pass', 'Product Core CI prerequisite report must pass');
assert(productCiReport.steps?.every((step) => step.status === 'pass'), 'Product Core CI contains a failed step');
for (const stepName of productCiReport.prerequisiteSteps ?? []) {
  assert(stepByName(productCiReport, stepName)?.status === 'pass', `Product Core CI prerequisite ${stepName} did not pass`);
}
assert(browserRuntimeReport.status === 'pass', 'Product browser-runtime report must pass');
assert(browserRuntimeReport.defaultRuntime === 'core-product', 'Product browser-runtime report must prove the production default');
assert(cpuReport.status === 'pass' && cpuReport.cpu?.status === 'pass' && cpuReport.heap?.status === 'pass', 'Product CPU/heap report must pass');
assert(pageCpuReport.status === 'pass', 'Product page CPU comparison must pass');
assert(pageCpuBeforeAfterReport.status === 'pass', 'Product page CPU before/after report must pass');
assert(pageCpuBeforeAfterReport.thresholds?.runCount === 3, 'Product page CPU before/after report must contain three runs per phase');
assert(Array.isArray(pageCpuBeforeAfterReport.scenarios) && pageCpuBeforeAfterReport.scenarios.length > 0, 'Product page CPU before/after report must contain scenarios');
assert(pageCpuBeforeAfterReport.scenarios.every((scenario) => scenario.status === 'pass'), 'Product page CPU before/after contains a median regression');
assert(runtimeFallbackReport.status === 'pass', 'Product runtime fallback behavior report must pass');
assert(sequencerReport.status === 'pass' && sequencerReport.fullRun === true, 'sequencer behavioral evidence must be the full passing run');

requireFreshReport('docs/reports/kessho-product-ci-latest.json', productCiReport.updatedAt ?? productCiReport.generatedAt, []);
requireFreshReport('docs/reports/kessho-product-browser-runtime-latest.json', browserRuntimeReport.generatedAt, []);
requireFreshReport('docs/reports/kessho-product-cpu-budget-latest.json', cpuReport.generatedAt, []);
requireFreshReport('docs/reports/kessho-product-page-cpu-comparison-latest.json', pageCpuReport.generatedAt, []);
requireFreshReport('docs/reports/kessho-product-page-cpu-before-after-latest.json', pageCpuBeforeAfterReport.generatedAt, []);
requireFreshReport('docs/reports/kessho-product-runtime-fallbacks-latest.json', runtimeFallbackReport.generatedAt, []);

const report = {
  schemaVersion: 3,
  generatedAt: now.toISOString(),
  status: 'pass',
  defaultPromotionReady: true,
  webDefaultRuntime: 'core-product',
  localCi: {
    report: 'docs/reports/kessho-product-ci-latest.json',
    mode: productCiReport.mode,
    prerequisiteCount: productCiReport.prerequisiteSteps?.length ?? 0,
  },
  browserRuntime: {
    report: 'docs/reports/kessho-product-browser-runtime-latest.json',
    cases: browserRuntimeReport.cases ?? [],
  },
  cpu: {
    report: 'docs/reports/kessho-product-cpu-budget-latest.json',
    scenarios: cpuReport.cpu?.scenarios,
    pageComparison: pageCpuReport.summary,
    pageBeforeAfter: pageCpuBeforeAfterReport.summary,
  },
  sequencerBehavior: {
    report: 'docs/reports/kessho-product-sequencer-ui-parity-latest.json',
    caseCount: sequencerReport.selection?.caseCount,
  },
  packageScriptCount: Object.keys(packageJson.scripts ?? {}).length,
};

mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(reportMarkdownPath, [
  '# Kessho Product Default Gate v3',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  'Status: **PASS**',
  '',
  'Product Core is the production Web runtime default.',
  '',
  `Prerequisite gates: ${report.localCi.prerequisiteCount}`,
  `Browser cases: ${report.browserRuntime.cases.length}`,
  `Page CPU scenarios: ${report.cpu.pageBeforeAfter?.scenarioCount ?? 0}`,
  '',
].join('\n'));
console.log('Kessho Product Default Gate v3 passed: core-product is the web default runtime');
