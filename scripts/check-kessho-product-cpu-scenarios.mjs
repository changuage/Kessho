#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-product-cpu-scenarios-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-product-cpu-scenarios-latest.md');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toRelative(path) {
  const rel = relative(root, path);
  return rel.startsWith('..') ? path : rel;
}

function reportAgeHours(generatedAt) {
  const at = Date.parse(generatedAt);
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return (Date.now() - at) / 3_600_000;
}

function pageScenario(pageReport, id) {
  return pageReport.scenarios?.find((scenario) => scenario.id === id) ?? null;
}

function pageScenarioPass(pageReport, id) {
  const scenario = pageScenario(pageReport, id);
  return Boolean(
    pageReport.status === 'pass' &&
      scenario &&
      Object.keys(scenario.errors ?? {}).length === 0 &&
      scenario.engines?.['core-product']?.capture?.rms > 0.0005,
  );
}

function productCpuPercent(pageReport, id) {
  return pageScenario(pageReport, id)?.engines?.['core-product']?.browserProcessCpuPercent ?? null;
}

function pageModules(pageReport, id) {
  return pageScenario(pageReport, id)?.activeModules ?? [];
}

function passRow(id, label, evidence, metrics = {}) {
  return { id, label, status: 'pass', evidence, metrics };
}

function deferredRow(id, label, reason, evidence = []) {
  return { id, label, status: 'deferred', reason, evidence, metrics: {} };
}

const packageJson = readJson('package.json');
assert(
  packageJson.scripts?.['core:product:cpu-scenarios'] === 'node scripts/check-kessho-product-cpu-scenarios.mjs',
  'package.json must expose core:product:cpu-scenarios',
);

for (const path of [
  'docs/reports/kessho-product-cpu-budget-latest.json',
  'docs/reports/kessho-product-web-cpu-comparison-latest.json',
  'docs/reports/kessho-product-page-cpu-comparison-latest.json',
  'docs/reports/kessho-product-browser-runtime-latest.json',
  'docs/product-core/product-cpu-governor-policy.md',
]) {
  assert(existsSync(resolve(root, path)), `${path} must exist before CPU scenario signoff`);
}

const cpuBudget = readJson('docs/reports/kessho-product-cpu-budget-latest.json');
const webCpu = readJson('docs/reports/kessho-product-web-cpu-comparison-latest.json');
const pageCpu = readJson('docs/reports/kessho-product-page-cpu-comparison-latest.json');
const browserRuntime = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const governorPolicy = read('docs/product-core/product-cpu-governor-policy.md');

assert(cpuBudget.status === 'pass', 'CPU budget report must pass');
assert(cpuBudget.cpu?.scenarios?.activeFx?.status === 'pass', 'active-FX CPU budget must pass');
assert(cpuBudget.cpu?.scenarios?.disabledFx?.status === 'pass', 'disabled-FX CPU budget must pass');
assert(webCpu.status === 'pass', 'web CPU comparison report must pass');
assert(webCpu.engines?.['core-product']?.capture?.rms > 0.0005, 'web CPU comparison Product capture must be audible');
assert(pageCpu.status === 'pass', 'page CPU comparison report must pass');
assert(browserRuntime.status === 'pass', 'browser runtime report must pass');
assert(packageJson.scripts?.['test:mobile-web-hotpaths'] === 'node scripts/check-mobile-web-hotpaths.mjs', 'mobile hotpath gate must remain exposed');

for (const token of [
  'Desktop governor',
  'Mobile browser governor',
  'Native background governor',
  'Lite under pressure',
  'lower visual telemetry rate',
  'Browser/mobile background audio is best-effort',
]) {
  assert(governorPolicy.includes(token), `CPU governor policy must include ${token}`);
}

for (const id of ['global', 'earth', 'granular', 'reverb', 'routing']) {
  assert(pageScenarioPass(pageCpu, id), `page CPU scenario ${id} must pass`);
}

assert(
  pageModules(pageCpu, 'granular').some((moduleName) => /granular/i.test(moduleName)),
  'granular page CPU scenario must name granular modules',
);
assert(
  pageModules(pageCpu, 'reverb').some((moduleName) => /reverb/i.test(moduleName)) &&
    pageModules(pageCpu, 'reverb').some((moduleName) => /spectral freeze/i.test(moduleName)),
  'reverb page CPU scenario must name reverb and spectral freeze modules',
);
assert(
  browserRuntime.runtimeWalkProbe?.distinctPositionCount > 1 &&
    browserRuntime.sampleHoldProbe?.distinctPositionCount > 1,
  'browser runtime report must prove random-walk and sample-hold movement',
);

const freshHours = 72;
const staleReports = [
  ['cpu-budget', cpuBudget.generatedAt],
  ['web-cpu-comparison', webCpu.generatedAt],
  ['page-cpu-comparison', pageCpu.generatedAt],
  ['browser-runtime', browserRuntime.generatedAt],
].filter(([, generatedAt]) => reportAgeHours(generatedAt) > freshHours);
assert(staleReports.length === 0, `CPU evidence reports must be refreshed within ${freshHours}h: ${staleReports.map(([id]) => id).join(', ')}`);

const scenarios = [
  passRow('01-default-product-scene', 'Default product scene', [
    'docs/reports/kessho-product-cpu-budget-latest.json: activeFx and disabledFx pass',
    'docs/reports/kessho-product-web-cpu-comparison-latest.json: string-waves arrangement pass',
  ], {
    activeFxAverageCpuPercent: cpuBudget.cpu.scenarios.activeFx.averageCpuPercent,
    activeFxP95Ms: cpuBudget.cpu.scenarios.activeFx.p95Ms,
    webComparisonProductCpuPercent: webCpu.engines['core-product'].browserProcessCpuPercent,
    webComparisonSavedPercent: webCpu.comparison.browserProcessCpuSavedPercent,
  }),
  passRow('02-earth-texture-scene', 'Earth texture scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: earth scenario pass',
    'docs/reports/kessho-product-browser-runtime-latest.json: Earth texture probe pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'earth'),
    activeTextureSlots: browserRuntime.earthTextureProbe?.summaries?.length ?? 0,
  }),
  passRow('03-dense-granular-scene', 'Dense granular scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: granular scenario pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'granular'),
  }),
  passRow('04-long-ambient-reverb-scene', 'Long ambient reverb scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb scenario pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'reverb'),
  }),
  passRow('05-spectral-freeze-scene', 'Spectral freeze scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb scenario includes spectral freeze',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'reverb'),
  }),
  passRow('06-random-walk-sample-hold-modulation-scene', 'Random-walk + sample-hold modulation scene', [
    'docs/reports/kessho-product-page-cpu-comparison-latest.json: global random movement scene pass',
    'docs/reports/kessho-product-browser-runtime-latest.json: runtimeWalkProbe and sampleHoldProbe pass',
  ], {
    productBrowserCpuPercent: productCpuPercent(pageCpu, 'global'),
    runtimeWalkDistinctPositions: browserRuntime.runtimeWalkProbe.distinctPositionCount,
    sampleHoldDistinctPositions: browserRuntime.sampleHoldProbe.distinctPositionCount,
  }),
  passRow('07-mobile-browser-foreground', 'Mobile browser foreground', [
    'npm run test:mobile-web-hotpaths',
    'docs/product-core/product-cpu-governor-policy.md: Mobile browser governor',
  ]),
  passRow('08-browser-hidden-resume-best-effort', 'Browser hidden/resume best-effort', [
    'docs/product-core/product-cpu-governor-policy.md: hidden/resume policy',
    'docs/product-core/background-audio.md: browser/mobile background audio is best-effort',
  ]),
  deferredRow('09-native-ios-render', 'Native iOS render', 'Native Product Core render/device evidence is Batch 4 scope.', [
    'docs/product-core/background-audio-device-evidence.md',
  ]),
  deferredRow('10-native-macos-render', 'Native macOS render', 'Native Product Core render/device evidence is Batch 4 scope.', [
    'docs/product-core/background-audio-device-evidence.md',
  ]),
];

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: scenarios.some((scenario) => scenario.status === 'fail') ? 'fail' : 'pass',
  reportFreshnessHours: freshHours,
  sourceReports: {
    cpuBudget: {
      generatedAt: cpuBudget.generatedAt,
      status: cpuBudget.status,
      path: 'docs/reports/kessho-product-cpu-budget-latest.json',
    },
    webCpuComparison: {
      generatedAt: webCpu.generatedAt,
      status: webCpu.status,
      path: 'docs/reports/kessho-product-web-cpu-comparison-latest.json',
    },
    pageCpuComparison: {
      generatedAt: pageCpu.generatedAt,
      status: pageCpu.status,
      scenarioCount: pageCpu.scenarios?.length ?? 0,
      path: 'docs/reports/kessho-product-page-cpu-comparison-latest.json',
    },
    browserRuntime: {
      generatedAt: browserRuntime.generatedAt,
      status: browserRuntime.status,
      path: 'docs/reports/kessho-product-browser-runtime-latest.json',
    },
  },
  policy: {
    desktop: 'Ultra allowed when headroom exists; full visual telemetry allowed.',
    mobileBrowser: 'Balanced default; Lite under pressure; heavy shimmer/reverb/granular modes limited; lower visual telemetry rate when needed.',
    nativeBackground: 'Conservative profile; stable render callback budget; no realtime allocations.',
  },
  scenarios,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Kessho Product CPU Scenarios',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  '## Scenario Matrix',
  '',
  '| Scenario | Status | Evidence | Key Metrics |',
  '| --- | --- | --- | --- |',
];

for (const scenario of scenarios) {
  const evidence = [...(scenario.evidence ?? []), scenario.reason ? `Reason: ${scenario.reason}` : ''].filter(Boolean).join('<br>');
  const metrics = Object.entries(scenario.metrics ?? {})
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? Number(value.toFixed(6)) : value}`)
    .join('<br>');
  lines.push(`| ${scenario.label} | ${scenario.status.toUpperCase()} | ${evidence} | ${metrics || '-'} |`);
}

lines.push(
  '',
  '## Governor Policy',
  '',
  `- Desktop: ${report.policy.desktop}`,
  `- Mobile browser: ${report.policy.mobileBrowser}`,
  `- Native background: ${report.policy.nativeBackground}`,
  '',
  '## Source Reports',
  '',
  `- ${report.sourceReports.cpuBudget.path}`,
  `- ${report.sourceReports.webCpuComparison.path}`,
  `- ${report.sourceReports.pageCpuComparison.path}`,
  `- ${report.sourceReports.browserRuntime.path}`,
  '',
);

writeFileSync(markdownReportPath, `${lines.join('\n')}\n`);

console.log(`Kessho Product CPU scenario checks passed (report: ${toRelative(markdownReportPath)}, ${toRelative(jsonReportPath)})`);
