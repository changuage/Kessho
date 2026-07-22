#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectReportMetadata,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';
import {
  PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO,
  PAGE_CPU_MAX_RAW_REGRESSION_PERCENT,
  PAGE_CPU_MAX_REGRESSION_PERCENT,
  PAGE_CPU_RUN_COUNT,
  assessPairedPageCpuMeasurementQuality,
  describePairedPageCpuQuality,
  isPageCpuRegressionWithinGate,
  normalizedPageCpuRegressionPercent,
  pairedNormalizedPageCpuRegressionPercent,
  planPairedPageCpuRetry,
  planInterleavedPageCpuRuns,
} from './lib/kesshoProductPageCpuBeforeAfter.mjs';

const root = process.cwd();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-page-cpu-before-after-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-page-cpu-before-after-latest.md');
const pageCpuReportPath = 'docs/reports/kessho-product-page-cpu-comparison-latest.json';
const RUN_COUNT = PAGE_CPU_RUN_COUNT;
const MAX_REGRESSION_PERCENT = PAGE_CPU_MAX_REGRESSION_PERCENT;
const MAX_MEASUREMENT_OUTLIER_RATIO = PAGE_CPU_MAX_MEASUREMENT_OUTLIER_RATIO;
const BASE_PORT = 4300;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    durationMs: 12000,
    settleMs: 1000,
    warmupMs: 2500,
    port: BASE_PORT,
    reuseReport: false,
    baselineRef: process.env.KESSHO_PRODUCT_PAGE_CPU_BASELINE_REF ?? null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--duration-ms=')) args.durationMs = Number(arg.slice('--duration-ms='.length));
    else if (arg.startsWith('--settle-ms=')) args.settleMs = Number(arg.slice('--settle-ms='.length));
    else if (arg.startsWith('--warmup-ms=')) args.warmupMs = Number(arg.slice('--warmup-ms='.length));
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--baseline-ref=')) args.baselineRef = arg.slice('--baseline-ref='.length);
    else if (arg === '--reuse-report') args.reuseReport = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-page-cpu-before-after.mjs [--duration-ms=12000] [--settle-ms=1000] [--warmup-ms=2500] [--port=4300] [--baseline-ref=REF]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  assert(Number.isFinite(args.durationMs) && args.durationMs > 0, '--duration-ms must be positive');
  assert(Number.isFinite(args.settleMs) && args.settleMs >= 0, '--settle-ms must be non-negative');
  assert(Number.isFinite(args.warmupMs) && args.warmupMs >= 0, '--warmup-ms must be non-negative');
  assert(Number.isInteger(args.port) && args.port > 0, '--port must be a positive integer');
  return args;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readGitCommit(cwd) {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function resolveBaselineRef(args) {
  if (args.baselineRef) return args.baselineRef;
  const dirty = spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: root }).status !== 0;
  return dirty ? 'HEAD' : 'HEAD^';
}

function median(values) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  assert(finite.length > 0, 'median requires at least one finite measurement');
  return finite[Math.floor(finite.length / 2)];
}

function medianRunValues(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  assert(finite.length === RUN_COUNT, `expected ${RUN_COUNT} finite measurements, received ${finite.length}`);
  return median(finite);
}

function medianOrNull(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length === RUN_COUNT ? median(finite) : null;
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function percentChange(from, to) {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

function summarizeRun(report) {
  assert(report?.status === 'pass', `page CPU run did not pass: ${report?.status ?? 'missing status'}`);
  const scenarios = report.scenarios ?? [];
  assert(scenarios.length > 0, 'page CPU run did not produce scenarios');
  return {
    generatedAt: report.generatedAt,
    metadata: report.metadata,
    defaults: report.defaults,
    scenarios: scenarios.map((scenario) => {
      const product = scenario.engines?.['core-product'];
      const web = scenario.engines?.['web-ts'];
      assert(product && web, `${scenario.id}: both Product and Web TS measurements are required`);
      return {
        id: scenario.id,
        label: scenario.label,
        productBrowserProcessCpuPercent: product.browserProcessCpuPercent,
        productProcessCpuSeconds: product.processCpuSeconds,
        webBrowserProcessCpuPercent: web.browserProcessCpuPercent,
        webProcessCpuSeconds: web.processCpuSeconds,
        productInternalOverlayCpu: product.internalOverlayCpu?.avgPercent ?? null,
        webInternalOverlayCpu: web.internalOverlayCpu?.avgPercent ?? null,
      };
    }),
  };
}

function removeReportIfPresent(cwd) {
  const path = join(cwd, pageCpuReportPath);
  if (existsSync(path)) unlinkSync(path);
}

function runPageCpuComparison(cwd, phase, runIndex, args, port) {
  removeReportIfPresent(cwd);
  console.log(`\n[${phase} ${runIndex}/${RUN_COUNT}] page CPU comparison on ${readGitCommit(cwd)} (port ${port})`);
  const result = spawnSync('npm', [
    'run',
    'core:product:page-cpu-comparison',
    '--',
    `--duration-ms=${args.durationMs}`,
    `--settle-ms=${args.settleMs}`,
    `--warmup-ms=${args.warmupMs}`,
    `--port=${port}`,
  ], {
    cwd,
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'inherit',
  });
  assert(result.status === 0, `${phase} page CPU run ${runIndex} exited with ${result.status ?? result.signal}`);
  const reportPath = join(cwd, pageCpuReportPath);
  assert(existsSync(reportPath), `${phase} page CPU run ${runIndex} did not write ${pageCpuReportPath}`);
  return summarizeRun(readJson(reportPath));
}

function collectPairedPageCpuRuns({ baselineCwd, currentCwd, args, basePort, label = '' }) {
  const runs = { baseline: [], current: [] };
  for (const planned of planInterleavedPageCpuRuns({ basePort, runCount: RUN_COUNT })) {
    const cwd = planned.phase === 'baseline' ? baselineCwd : currentCwd;
    const phaseLabel = label ? `${planned.phase} ${label}` : planned.phase;
    runs[planned.phase].push(runPageCpuComparison(cwd, phaseLabel, planned.runIndex, args, planned.port));
  }
  return runs;
}

function createBaselineWorktree(ref) {
  const tempRoot = resolve(tmpdir(), `kessho-product-page-cpu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(tempRoot, { recursive: true });
  const worktree = join(tempRoot, 'baseline');
  const resolvedRef = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  execFileSync('git', ['worktree', 'add', '--detach', worktree, resolvedRef], { cwd: root, stdio: 'inherit' });
  const nodeModules = join(root, 'node_modules');
  assert(existsSync(nodeModules), 'current worktree node_modules is required for baseline measurement');
  symlinkSync(nodeModules, join(worktree, 'node_modules'), 'dir');
  return {
    path: worktree,
    dispose() {
      execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'inherit' });
    },
  };
}

function aggregatePhase(runs) {
  const scenarioIds = runs[0].scenarios.map((scenario) => scenario.id);
  return scenarioIds.map((id) => {
    const rows = runs.map((run) => run.scenarios.find((scenario) => scenario.id === id));
    assert(rows.every(Boolean), `${id}: scenario missing from one of the ${RUN_COUNT} runs`);
    const first = rows[0];
    return {
      id,
      label: first.label,
      productBrowserProcessCpuPercentMedian: medianRunValues(rows.map((row) => row.productBrowserProcessCpuPercent)),
      productProcessCpuSecondsMedian: medianRunValues(rows.map((row) => row.productProcessCpuSeconds)),
      webBrowserProcessCpuPercentMedian: medianRunValues(rows.map((row) => row.webBrowserProcessCpuPercent)),
      webProcessCpuSecondsMedian: medianRunValues(rows.map((row) => row.webProcessCpuSeconds)),
      productInternalOverlayCpuMedian: medianOrNull(rows.map((row) => row.productInternalOverlayCpu)),
      webInternalOverlayCpuMedian: medianOrNull(rows.map((row) => row.webInternalOverlayCpu)),
      runValues: rows.map((row) => ({
        productBrowserProcessCpuPercent: row.productBrowserProcessCpuPercent,
        webBrowserProcessCpuPercent: row.webBrowserProcessCpuPercent,
      })),
    };
  });
}

function comparePhases(baseline, current) {
  const currentById = new Map(current.map((scenario) => [scenario.id, scenario]));
  return baseline.map((before) => {
    const after = currentById.get(before.id);
    assert(after, `${before.id}: current median is missing`);
    const productRegressionPercent = percentChange(
      before.productBrowserProcessCpuPercentMedian,
      after.productBrowserProcessCpuPercentMedian,
    );
    const webRegressionPercent = percentChange(
      before.webBrowserProcessCpuPercentMedian,
      after.webBrowserProcessCpuPercentMedian,
    );
    const productVsWebSavedPercent = percentChange(
      after.webBrowserProcessCpuPercentMedian,
      after.productBrowserProcessCpuPercentMedian,
    );
    const phaseMedianProductVsWebRegressionPercent = normalizedPageCpuRegressionPercent({
      baselineProduct: before.productBrowserProcessCpuPercentMedian,
      baselineWeb: before.webBrowserProcessCpuPercentMedian,
      currentProduct: after.productBrowserProcessCpuPercentMedian,
      currentWeb: after.webBrowserProcessCpuPercentMedian,
    });
    const pairedProductVsWebRegressionValues = before.runValues.map((run, index) =>
      pairedNormalizedPageCpuRegressionPercent({
        baselineProduct: run.productBrowserProcessCpuPercent,
        currentProduct: after.runValues[index]?.productBrowserProcessCpuPercent,
        baselineWeb: run.webBrowserProcessCpuPercent,
        currentWeb: after.runValues[index]?.webBrowserProcessCpuPercent,
      }));
    const productVsWebRegressionPercent = medianOrNull(pairedProductVsWebRegressionValues);
    return {
      id: before.id,
      label: before.label,
      baseline: before,
      current: after,
      productRegressionPercent,
      webRegressionPercent,
      phaseMedianProductVsWebRegressionPercent,
      productVsWebRegressionPercent,
      productVsWebSavedPercent: productVsWebSavedPercent === null ? null : -productVsWebSavedPercent,
      status: isPageCpuRegressionWithinGate({
        rawRegressionPercent: productRegressionPercent,
        normalizedRegressionPercent: productVsWebRegressionPercent,
      }) ? 'pass' : 'fail',
    };
  });
}

function writeReport(report) {
  writeJsonReport(reportJsonPath, report);
  const lines = [
    '# Kessho Product Page CPU Before/After',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Baseline commit: ${report.baseline.commit}`,
    `Current worktree commit: ${report.current.commit}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Runs per phase: ${report.thresholds.runCount}; aggregation: ${report.thresholds.aggregation}`,
    `Raw Product median delta (diagnostic; ${report.thresholds.maxRawProductRegressionPercent}% catastrophic guard): ${Number.isFinite(report.summary.maxProductRegressionPercent) ? `${report.summary.maxProductRegressionPercent.toFixed(2)}%` : 'n/a'}`,
    `Normalized Product/Web threshold: ${report.thresholds.maxNormalizedRegressionPercent}%; raw Product catastrophic guard: ${report.thresholds.maxRawProductRegressionPercent}%`,
    `Measurement validity: retry both phases once when a Product CPU sample is more than ${((MAX_MEASUREMENT_OUTLIER_RATIO - 1) * 100).toFixed(0)}% away from the phase's other samples`,
    '',
    `Passing scenarios: ${report.summary.passingScenarioCount ?? '-'}/${report.summary.scenarioCount ?? '-'}`,
    `Maximum normalized Product CPU regression: ${Number.isFinite(report.summary.maxNormalizedProductRegressionPercent) ? `${report.summary.maxNormalizedProductRegressionPercent.toFixed(2)}%` : 'n/a'}`,
    '',
    '| Page | Baseline Product median % | Current Product median % | Product change % | Normalized Product/Web change % | Current Product saved vs Web TS % | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const scenario of report.scenarios) {
    lines.push(`| ${scenario.label} | ${scenario.baseline.productBrowserProcessCpuPercentMedian.toFixed(3)} | ${scenario.current.productBrowserProcessCpuPercentMedian.toFixed(3)} | ${scenario.productRegressionPercent?.toFixed(2) ?? '-'} | ${scenario.productVsWebRegressionPercent?.toFixed(2) ?? '-'} | ${scenario.productVsWebSavedPercent?.toFixed(2) ?? '-'} | ${scenario.status.toUpperCase()} |`);
  }
  lines.push(
    '',
    '## Method',
    '',
    '- Each phase runs the same nine page scenarios three times with matching duration, warmup, settle, and browser settings.',
    '- Baseline and current runs are paired and interleaved, with the order alternating per pair to reduce drift from host load and thermal state.',
    '- A process-info outlier causes one paired retry of both phases; rejected runs are discarded and the report retains exactly three accepted runs per phase rather than allowing a dropped Chrome process to distort the median.',
    '- Browser-process CPU percent is measured around the same Product/Web TS page capture used by the focused comparison.',
    '- The baseline is a detached worktree at the explicit `--baseline-ref` (or `KESSHO_PRODUCT_PAGE_CPU_BASELINE_REF`); otherwise it uses `HEAD` for tracked-dirty local changes and `HEAD^` for a clean commit.',
    '- Acceptance uses paired Product/Web difference-in-differences: a scenario fails only when both raw Product and normalized Product/Web deltas exceed 3%; any raw Product increase above the 20% catastrophic guard fails independently. Raw and normalized medians remain in the report for diagnosis.',
  );
  if (report.error) lines.push('', '## Error', '', `- ${report.error}`);
  writeMarkdownReport(reportMarkdownPath, lines);
}

const args = parseArgs(process.argv.slice(2));
const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  status: 'running',
  metadata: collectReportMetadata({
    root,
    generatedAt,
    command: process.argv.map(String).join(' '),
    scenarioName: 'before-after-page-cpu',
    thresholds: {
      runCount: RUN_COUNT,
      maxProductRegressionPercent: MAX_REGRESSION_PERCENT,
      maxNormalizedRegressionPercent: MAX_REGRESSION_PERCENT,
      maxRawProductRegressionPercent: PAGE_CPU_MAX_RAW_REGRESSION_PERCENT,
      aggregation: 'median',
    },
    topSuspectedModules: ['visual-telemetry', 'ui-telemetry', 'worklet-messaging', 'sources', 'fx'],
  }),
  thresholds: {
    runCount: RUN_COUNT,
    maxProductRegressionPercent: MAX_REGRESSION_PERCENT,
    maxNormalizedRegressionPercent: MAX_REGRESSION_PERCENT,
    maxRawProductRegressionPercent: PAGE_CPU_MAX_RAW_REGRESSION_PERCENT,
    aggregation: 'median',
    metric: 'browserProcessCpuPercent',
  },
  args,
  baseline: { commit: null, runs: [] },
  current: { commit: null, runs: [] },
  scenarios: [],
  summary: {},
  measurementQuality: {
    outlierRatio: MAX_MEASUREMENT_OUTLIER_RATIO,
    retries: [],
  },
};

let baselineWorktree = null;
try {
  if (args.reuseReport) {
    const savedReport = readJson(reportJsonPath);
    assert(savedReport.baseline?.runs?.length === RUN_COUNT, `saved baseline report must contain ${RUN_COUNT} runs`);
    assert(savedReport.current?.runs?.length === RUN_COUNT, `saved current report must contain ${RUN_COUNT} runs`);
    report.baseline = savedReport.baseline;
    report.current = savedReport.current;
    const savedQuality = assessPairedPageCpuMeasurementQuality(
      report.baseline.runs,
      report.current.runs,
      { runCount: RUN_COUNT, outlierRatio: MAX_MEASUREMENT_OUTLIER_RATIO },
    );
    if (!savedQuality.valid) {
      throw new Error(`Saved page CPU phases are statistically invalid: ${describePairedPageCpuQuality(savedQuality)}`);
    }
  } else {
    const baselineRef = resolveBaselineRef(args);
    baselineWorktree = createBaselineWorktree(baselineRef);
    report.baseline.commit = readGitCommit(baselineWorktree.path);
    report.current.commit = readGitCommit(root);
    const initialRuns = collectPairedPageCpuRuns({
      baselineCwd: baselineWorktree.path,
      currentCwd: root,
      args,
      basePort: args.port,
    });
    report.baseline.runs = initialRuns.baseline;
    report.current.runs = initialRuns.current;

    const retryPlan = planPairedPageCpuRetry({
      baselineRuns: report.baseline.runs,
      currentRuns: report.current.runs,
      basePort: args.port + (RUN_COUNT * 2),
      runCount: RUN_COUNT,
      outlierRatio: MAX_MEASUREMENT_OUTLIER_RATIO,
    });
    const initialQuality = retryPlan.quality;
    if (retryPlan.retry) {
      const retryPort = retryPlan.plan[0]?.port ?? (args.port + (RUN_COUNT * 2));
      console.warn(`Retrying both page CPU phases because of outlier scenario(s): ${describePairedPageCpuQuality(initialQuality)}`);
      const retryRecord = {
        type: 'paired',
        phases: ['baseline', 'current'],
        originalInvalidPhases: initialQuality.invalidPhases,
        originalInvalidScenarios: {
          baseline: initialQuality.baseline,
          current: initialQuality.current,
        },
        replacementBasePort: retryPort,
        replacementRunCount: RUN_COUNT,
      };
      // The original set is rejected as a whole. Keep no rejected runs in the
      // report while the paired replacement is being collected or validated.
      report.baseline.runs = [];
      report.current.runs = [];
      const replacementRuns = collectPairedPageCpuRuns({
        baselineCwd: baselineWorktree.path,
        currentCwd: root,
        args,
        basePort: retryPort,
        label: 'paired retry',
      });
      const retryQuality = assessPairedPageCpuMeasurementQuality(
        replacementRuns.baseline,
        replacementRuns.current,
        { runCount: RUN_COUNT, outlierRatio: MAX_MEASUREMENT_OUTLIER_RATIO },
      );
      retryRecord.replacementInvalidPhases = retryQuality.invalidPhases;
      retryRecord.replacementInvalidScenarios = {
        baseline: retryQuality.baseline,
        current: retryQuality.current,
      };
      report.measurementQuality.retries.push(retryRecord);
      if (!retryQuality.valid) {
        throw new Error(`Paired page CPU phases remained statistically invalid after retry: ${describePairedPageCpuQuality(retryQuality)}`);
      }
      report.baseline.runs = replacementRuns.baseline;
      report.current.runs = replacementRuns.current;
      retryRecord.acceptedRunCount = {
        baseline: report.baseline.runs.length,
        current: report.current.runs.length,
      };
    }
  }

  const baselineMedians = aggregatePhase(report.baseline.runs);
  const currentMedians = aggregatePhase(report.current.runs);
  report.scenarios = comparePhases(baselineMedians, currentMedians);
  const rawRegressions = report.scenarios
    .map((scenario) => scenario.productRegressionPercent)
    .filter((value) => Number.isFinite(value));
  const normalizedRegressions = report.scenarios
    .map((scenario) => scenario.productVsWebRegressionPercent)
    .filter((value) => Number.isFinite(value));
  report.summary = {
    scenarioCount: report.scenarios.length,
    passingScenarioCount: report.scenarios.filter((scenario) => scenario.status === 'pass').length,
    failedScenarioCount: report.scenarios.filter((scenario) => scenario.status !== 'pass').length,
    maxProductRegressionPercent: rawRegressions.length > 0 ? Math.max(...rawRegressions) : null,
    medianProductRegressionPercent: rawRegressions.length > 0 ? median(rawRegressions) : null,
    maxNormalizedProductRegressionPercent: normalizedRegressions.length > 0 ? Math.max(...normalizedRegressions) : null,
  };
  report.status = report.summary.failedScenarioCount === 0 ? 'pass' : 'fail';
  report.metadata = collectReportMetadata({
    root,
    generatedAt: report.generatedAt,
    command: process.argv.map(String).join(' '),
    scenarioName: report.scenarios.map((scenario) => scenario.id).join(','),
    sampleRate: report.current.runs[0]?.metadata?.sampleRate ?? null,
    blockSize: report.current.runs[0]?.metadata?.blockSize ?? null,
    durationMs: args.durationMs,
    thresholds: report.thresholds,
    topSuspectedModules: ['visual-telemetry', 'ui-telemetry', 'worklet-messaging', 'sources', 'fx'],
  });
  writeReport(report);
  console.log(`Kessho Product page CPU before/after ${report.status}: report ${reportJsonPath}`);
  if (report.status !== 'pass') {
    throw new Error(
      `Page CPU corroborated regression exceeded ${MAX_REGRESSION_PERCENT}% normalized and raw thresholds in one or more scenarios`,
    );
  }
} catch (error) {
  report.status = 'fail';
  report.error = error instanceof Error ? error.message : String(error);
  report.summary = report.summary ?? {};
  writeReport(report);
  throw error;
} finally {
  if (baselineWorktree) baselineWorktree.dispose();
}
