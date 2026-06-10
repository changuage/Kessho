#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readCpuBudgetReport,
  readPageCpuComparisonReport,
  readWebCpuComparisonReport,
} from './product-core/lib/cpuReports.mjs';
import { assertFresh } from './product-core/lib/freshness.mjs';
import { assertPackageScript } from './product-core/lib/packageScripts.mjs';
import {
  collectReportMetadata,
  toRelativePath,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';

const root = process.cwd();
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-module-cpu-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-module-cpu-latest.md');
const freshHours = 72;

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function productScenario(pageCpu, id) {
  return pageCpu.scenarios?.find((scenario) => scenario.id === id)?.engines?.['core-product'] ?? null;
}

function texturePageScenarioId(pageCpu) {
  return pageCpu.scenarios?.some((scenario) => scenario.id === 'texture') ? 'texture' : 'dynamics';
}

function productScenarioCpuPercent(pageCpu, id) {
  const scenario = productScenario(pageCpu, id);
  return scenario?.capture?.renderCpuPercent ?? scenario?.internalOverlayCpu?.avgPercent ?? null;
}

function cpuPercentToMs(percent, quantumMs) {
  return Number.isFinite(percent) && Number.isFinite(quantumMs) ? (percent / 100) * quantumMs : 0;
}

function row(options) {
  const estimatedCpuPercent = round(options.estimatedCpuPercent ?? 0);
  const averageMs = round(options.averageMs ?? cpuPercentToMs(estimatedCpuPercent, options.quantumMs));
  return {
    module: options.module,
    status: options.status ?? 'pass',
    source: options.source,
    averageMs,
    p95Ms: round(options.p95Ms ?? averageMs),
    maxMs: round(options.maxMs ?? options.p95Ms ?? averageMs),
    sampleCount: options.sampleCount ?? 1,
    estimatedCpuPercent,
    evidence: options.evidence,
  };
}

assertPackageScript('core:product:module-cpu', 'node scripts/check-kessho-product-module-cpu-report.mjs', root);

for (const path of [
  'docs/reports/kessho-product-cpu-budget-latest.json',
  'docs/reports/kessho-product-web-cpu-comparison-latest.json',
  'docs/reports/kessho-product-page-cpu-comparison-latest.json',
  'docs/reports/kessho-product-browser-runtime-latest.json',
  'docs/reports/kessho-product-granular-render-metrics-latest.json',
  'docs/reports/kessho-product-reverb-render-metrics-latest.json',
]) {
  assert(existsSync(resolve(root, path)), `${path} must exist before module CPU report generation`);
}

const cpuBudget = readCpuBudgetReport(root);
const webCpu = readWebCpuComparisonReport(root);
const pageCpu = readPageCpuComparisonReport(root);
const browserRuntime = readJson('docs/reports/kessho-product-browser-runtime-latest.json');
const granularRender = readJson('docs/reports/kessho-product-granular-render-metrics-latest.json');
const reverbRender = readJson('docs/reports/kessho-product-reverb-render-metrics-latest.json');
const textureScenarioId = texturePageScenarioId(pageCpu);

for (const [label, report] of [
  ['cpu-budget', cpuBudget],
  ['web-cpu-comparison', webCpu],
  ['page-cpu-comparison', pageCpu],
  ['browser-runtime', browserRuntime],
  ['granular-render-metrics', granularRender],
  ['reverb-render-metrics', reverbRender],
]) {
  assert(report.status === 'pass', `${label} must pass before module CPU report generation`);
  assertFresh(report, freshHours, label);
}

const sampleRate = pageCpu.metadata?.sampleRate ?? cpuBudget.cpu?.sampleRate ?? 48000;
const blockSize = pageCpu.metadata?.blockSize ?? cpuBudget.cpu?.renderQuantumFrames ?? 128;
const quantumMs = (blockSize * 1000) / sampleRate;
const generatedAt = new Date().toISOString();

const activeFx = cpuBudget.cpu?.scenarios?.activeFx ?? {};
const disabledFx = cpuBudget.cpu?.scenarios?.disabledFx ?? {};
const fxDeltaCpuPercent = Math.max(0, (activeFx.averageCpuPercent ?? 0) - (disabledFx.averageCpuPercent ?? 0));

const modules = [
  row({
    module: 'sources',
    source: 'page CPU synth scenario Product render telemetry',
    estimatedCpuPercent: productScenarioCpuPercent(pageCpu, 'synth'),
    quantumMs,
    evidence: ['docs/reports/kessho-product-page-cpu-comparison-latest.json: synth'],
  }),
  row({
    module: 'soundscapes',
    source: 'page CPU earth scenario plus browser Earth texture probe',
    estimatedCpuPercent: productScenarioCpuPercent(pageCpu, 'earth'),
    quantumMs,
    sampleCount: browserRuntime.earthTextureProbe?.summaries?.length ?? 1,
    evidence: [
      'docs/reports/kessho-product-page-cpu-comparison-latest.json: earth',
      'docs/reports/kessho-product-browser-runtime-latest.json: earthTextureProbe',
    ],
  }),
  row({
    module: 'sequencer',
    source: 'page CPU global/synth/drums scenarios with sequencer modules active',
    estimatedCpuPercent: Math.max(
      productScenarioCpuPercent(pageCpu, 'global') ?? 0,
      productScenarioCpuPercent(pageCpu, 'synth') ?? 0,
      productScenarioCpuPercent(pageCpu, 'drums') ?? 0,
    ),
    quantumMs,
    sampleCount: 3,
    evidence: ['docs/reports/kessho-product-page-cpu-comparison-latest.json: global,synth,drums'],
  }),
  row({
    module: 'granular',
    source: 'offline dense-grain render metric gate',
    estimatedCpuPercent: granularRender.cases?.denseGrainTransition?.estimatedCpuPercent,
    p95Ms: granularRender.cases?.denseGrainTransition?.p95BlockMs,
    maxMs: granularRender.cases?.denseGrainTransition?.p95BlockMs,
    sampleCount: 384,
    quantumMs,
    evidence: ['docs/reports/kessho-product-granular-render-metrics-latest.json'],
  }),
  row({
    module: 'reverb',
    source: 'offline reverb tail/transition render metric gate',
    estimatedCpuPercent: Math.max(
      reverbRender.cases?.impulseTail?.estimatedCpuPercent ?? 0,
      reverbRender.cases?.parameterTransitions?.estimatedCpuPercent ?? 0,
      ...(reverbRender.cases?.cpuByMode ?? []).map((entry) => entry.estimatedCpuPercent ?? 0),
    ),
    p95Ms: Math.max(
      reverbRender.cases?.impulseTail?.p95BlockMs ?? 0,
      reverbRender.cases?.parameterTransitions?.p95BlockMs ?? 0,
      ...(reverbRender.cases?.cpuByMode ?? []).map((entry) => entry.p95BlockMs ?? 0),
    ),
    sampleCount: 640,
    quantumMs,
    evidence: ['docs/reports/kessho-product-reverb-render-metrics-latest.json'],
  }),
  row({
    module: 'spectral-freeze',
    source: 'page CPU reverb scenario includes spectral freeze active module',
    estimatedCpuPercent: productScenarioCpuPercent(pageCpu, 'reverb'),
    quantumMs,
    evidence: ['docs/reports/kessho-product-page-cpu-comparison-latest.json: reverb'],
  }),
  row({
    module: 'delay',
    source: 'page CPU delay scenario Product render telemetry',
    estimatedCpuPercent: productScenarioCpuPercent(pageCpu, 'delay'),
    quantumMs,
    evidence: ['docs/reports/kessho-product-page-cpu-comparison-latest.json: delay'],
  }),
  row({
    module: 'texture',
    source: 'page CPU Texture scenario Product render telemetry',
    estimatedCpuPercent: productScenarioCpuPercent(pageCpu, textureScenarioId),
    quantumMs,
    evidence: [`docs/reports/kessho-product-page-cpu-comparison-latest.json: ${textureScenarioId}`],
  }),
  row({
    module: 'visual-telemetry',
    source: 'browser runtime visual/runtime movement probes',
    estimatedCpuPercent: 0,
    sampleCount: browserRuntime.runtimeWalkProbe?.bridgeDebug?.telemetryUpdateCount ?? 0,
    quantumMs,
    evidence: ['docs/reports/kessho-product-browser-runtime-latest.json: runtimeWalkProbe'],
  }),
  row({
    module: 'assets',
    source: 'CPU budget heap and asset memory probe',
    estimatedCpuPercent: 0,
    sampleCount: cpuBudget.heap?.assetCount ?? 0,
    quantumMs,
    evidence: ['docs/reports/kessho-product-cpu-budget-latest.json: heap'],
  }),
  row({
    module: 'worklet-messaging',
    source: 'Product/Web browser CPU comparison process overhead',
    estimatedCpuPercent: webCpu.engines?.['core-product']?.internalOverlayCpu?.avgPercent ?? 0,
    sampleCount: 1,
    quantumMs,
    evidence: ['docs/reports/kessho-product-web-cpu-comparison-latest.json'],
  }),
  row({
    module: 'ui-telemetry',
    source: 'browser runtime callback/store update counts',
    estimatedCpuPercent: 0,
    sampleCount: browserRuntime.runtimeWalkProbe?.walkStoreUpdateCount ?? 0,
    quantumMs,
    evidence: ['docs/reports/kessho-product-browser-runtime-latest.json: runtimeWalkProbe'],
  }),
  row({
    module: 'native-render-callback',
    status: 'deferred',
    source: 'native device CPU evidence not available in parallel web-default batch',
    estimatedCpuPercent: 0,
    sampleCount: 0,
    quantumMs,
    evidence: ['docs/product-core/background-audio-device-evidence.md'],
  }),
];

const report = {
  schemaVersion: 1,
  generatedAt,
  status: modules.some((module) => module.status === 'fail') ? 'fail' : 'pass',
  metadata: collectReportMetadata({
    root,
    generatedAt,
    command: process.argv.map(String).join(' '),
    scenarioName: 'module-cpu-attribution',
    sampleRate,
    blockSize,
    durationMs: pageCpu.defaults?.durationMs ?? null,
    thresholds: {
      sourceReportFreshnessHours: freshHours,
      activeFxAverageCpuPercentMax: activeFx.budget?.averageCpuPercentMax ?? null,
    },
    topSuspectedModules: modules
      .filter((module) => module.status === 'pass')
      .sort((left, right) => (right.estimatedCpuPercent ?? 0) - (left.estimatedCpuPercent ?? 0))
      .slice(0, 5)
      .map((module) => module.module),
  }),
  sampleRate,
  blockSize,
  quantumMs: round(quantumMs),
  sourceReports: {
    cpuBudget: 'docs/reports/kessho-product-cpu-budget-latest.json',
    webCpuComparison: 'docs/reports/kessho-product-web-cpu-comparison-latest.json',
    pageCpuComparison: 'docs/reports/kessho-product-page-cpu-comparison-latest.json',
    browserRuntime: 'docs/reports/kessho-product-browser-runtime-latest.json',
    granularRenderMetrics: 'docs/reports/kessho-product-granular-render-metrics-latest.json',
    reverbRenderMetrics: 'docs/reports/kessho-product-reverb-render-metrics-latest.json',
  },
  summary: {
    activeFxAverageCpuPercent: activeFx.averageCpuPercent ?? null,
    disabledFxAverageCpuPercent: disabledFx.averageCpuPercent ?? null,
    fxDeltaCpuPercent: round(fxDeltaCpuPercent),
    topModules: modules
      .filter((module) => module.status === 'pass')
      .sort((left, right) => (right.estimatedCpuPercent ?? 0) - (left.estimatedCpuPercent ?? 0))
      .slice(0, 5)
      .map((module) => ({
        module: module.module,
        estimatedCpuPercent: module.estimatedCpuPercent,
        averageMs: module.averageMs,
      })),
  },
  modules,
};

writeJsonReport(reportJsonPath, report);

const lines = [
  '# Kessho Product Module CPU Report',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  `Sample rate: ${sampleRate} Hz; block size: ${blockSize} frames; quantum: ${report.quantumMs} ms`,
  '',
  '| Module | Status | Avg ms | p95 ms | Max ms | CPU % | Samples | Source |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
];

for (const module of modules) {
  lines.push(
    `| ${module.module} | ${module.status.toUpperCase()} | ${module.averageMs ?? '-'} | ${module.p95Ms ?? '-'} | ${module.maxMs ?? '-'} | ${module.estimatedCpuPercent ?? '-'} | ${module.sampleCount} | ${module.source} |`,
  );
}

lines.push(
  '',
  '## Source Reports',
  '',
  ...Object.values(report.sourceReports).map((path) => `- ${path}`),
  '',
);

writeMarkdownReport(reportMarkdownPath, lines);

console.log(`Kessho Product module CPU report ${report.status}: ${toRelativePath(root, reportMarkdownPath)}, ${toRelativePath(root, reportJsonPath)}`);
