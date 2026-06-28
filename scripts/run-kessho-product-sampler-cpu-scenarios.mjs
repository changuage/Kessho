#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  collectReportMetadata,
  toRelativePath,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-product-sampler-cpu-latest.json');
const markdownReportPath = resolve(reportDir, 'kessho-product-sampler-cpu-latest.md');
const sampleCacheDesktopBytes = 128 * 1024 * 1024;
const sampleCacheMobileBytes = 32 * 1024 * 1024;
const sampleRate = 48000;
const blockSize = 128;
const quantumMs = blockSize * 1000 / sampleRate;

function commandText(command) {
  return command.map((part, index) => {
    if (index === 0 && part === process.execPath) return 'node';
    return /^[A-Za-z0-9_./:=+-]+$/.test(part)
      ? part
      : `'${String(part).replace(/'/g, `'\\''`)}'`;
  }).join(' ');
}

function parseScenarioRows(output) {
  const rows = [];
  const regex = /Sampler CPU scenario ([^:]+): avg ([0-9.eE+-]+)% peak ([0-9.eE+-]+)% p95 ([0-9.eE+-]+) ms p99 ([0-9.eE+-]+) ms missed ([0-9]+) activeVoices ([0-9]+) voiceSteals ([0-9]+) assetMisses ([0-9]+) registeredAssets ([0-9]+)/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    const [
      ,
      name,
      cpuAvgPercent,
      cpuPeakPercent,
      p95RenderMs,
      p99RenderMs,
      missedDeadlines,
      activeVoices,
      voiceSteals,
      assetMisses,
      registeredAssetCount,
    ] = match;
    rows.push({
      name,
      cpuAvgPercent: Number(cpuAvgPercent),
      cpuPeakPercent: Number(cpuPeakPercent),
      p95RenderMs: Number(p95RenderMs),
      p99RenderMs: Number(p99RenderMs),
      missedDeadlines: Number(missedDeadlines),
      activeVoices: Number(activeVoices),
      voiceSteals: Number(voiceSteals),
      assetMisses: Number(assetMisses),
      registeredAssetCount: Number(registeredAssetCount),
      sampleDecodedBytesEstimate: registeredAssetCount === '0' ? 0 : null,
    });
  }
  return rows;
}

function scenarioBudget(row) {
  const pianoOnly = row.name.startsWith('sample1-piano') || row.name === 'voice-steal-burst';
  const missing = row.name === 'asset-miss-burst-no-allocation';
  return {
    cpuAvgPercent: pianoOnly || missing ? 10 : 15,
    p99RenderMs: quantumMs,
    missedDeadlines: 0,
  };
}

function evaluate(row) {
  const budget = scenarioBudget(row);
  const failures = [];
  if (row.missedDeadlines !== budget.missedDeadlines) {
    failures.push(`missedDeadlines ${row.missedDeadlines} != ${budget.missedDeadlines}`);
  }
  if (row.p99RenderMs > budget.p99RenderMs) {
    failures.push(`p99RenderMs ${row.p99RenderMs} > ${budget.p99RenderMs}`);
  }
  if (row.cpuAvgPercent > budget.cpuAvgPercent) {
    failures.push(`cpuAvgPercent ${row.cpuAvgPercent} > ${budget.cpuAvgPercent}`);
  }
  if (row.name === 'asset-miss-burst-no-allocation' && row.assetMisses < 1) {
    failures.push('asset miss burst did not publish an asset miss counter');
  }
  return {
    ...row,
    budget,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
}

function readBaselineMetrics() {
  const path = resolve(root, 'docs/reports/kessho-product-cpu-budget-latest.json');
  if (!existsSync(path)) return null;
  const report = JSON.parse(readFileSync(path, 'utf8'));
  return {
    disabledFxAvgPercent: report.cpu?.scenarios?.disabledFx?.averageCpuPercent ?? null,
    activeFxAvgPercent: report.cpu?.scenarios?.activeFx?.averageCpuPercent ?? null,
    activeFxP99RenderMs: report.cpu?.scenarios?.activeFx?.p99RenderMs ?? report.cpu?.scenarios?.activeFx?.p99Ms ?? null,
  };
}

function markdownReport(report) {
  const lines = [
    '# Kessho Product Sampler CPU Scenarios',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Commit: ${report.metadata.gitCommit ?? 'unknown'}`,
    '',
    `Overall status: **${report.status.toUpperCase()}**`,
    '',
    `Run command: \`${report.runner.command}\``,
    '',
    `Desktop sample cache cap: ${report.sampleCache.desktopBytes} bytes`,
    '',
    `Mobile sample cache cap: ${report.sampleCache.mobileBytes} bytes`,
    '',
    '| Scenario | Status | Avg CPU % | Peak CPU % | p95 ms | p99 ms | Missed | Active voices | Voice steals | Asset misses | Assets |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const scenario of report.scenarios) {
    lines.push(`| ${scenario.name} | ${scenario.status.toUpperCase()} | ${scenario.cpuAvgPercent.toFixed(6)} | ${scenario.cpuPeakPercent.toFixed(6)} | ${scenario.p95RenderMs.toFixed(6)} | ${scenario.p99RenderMs.toFixed(6)} | ${scenario.missedDeadlines} | ${scenario.activeVoices} | ${scenario.voiceSteals} | ${scenario.assetMisses} | ${scenario.registeredAssetCount} |`);
  }
  if (report.failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  lines.push('', '## Evidence', '', '- C++ Product Core sampler scenario test registers generated sample asset IDs and measures native render blocks.', '- Cache byte caps come from `SampleDecodedAssetCache` defaults.');
  return `${lines.join('\n').trimEnd()}\n`;
}

const startedAt = new Date();
const command = [process.execPath, 'scripts/run-kessho-product-cpp-test.mjs', 'ProductSamplerCpuBudgetTests'];
const result = spawnSync(command[0], command.slice(1), {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const scenarios = parseScenarioRows(output).map(evaluate);
const expectedScenarioNames = [
  'sample1-piano-single-note',
  'sample1-piano-16-voices',
  'sample1-sample2-same-asset-shared-cache',
  'sample1-sample2-independent-assets',
  'sample1-looped-string-12-voices',
  'sample2-looped-string-12-voices',
  'sample1-sample2-max-voices',
  'asset-miss-burst-no-allocation',
  'voice-steal-burst',
  'loop-boundary-wrap-stress',
];
const failures = [];
if (result.status !== 0) failures.push(`C++ sampler CPU test exited with ${result.status ?? result.signal ?? 'unknown status'}`);
for (const name of expectedScenarioNames) {
  if (!scenarios.some((scenario) => scenario.name === name)) failures.push(`missing sampler CPU scenario: ${name}`);
}
for (const scenario of scenarios) {
  for (const failure of scenario.failures) failures.push(`${scenario.name}: ${failure}`);
}

const finishedAt = new Date();
const generatedAt = finishedAt.toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  status: failures.length === 0 ? 'pass' : 'fail',
  metadata: collectReportMetadata({
    root,
    generatedAt,
    command: commandText([process.execPath, 'scripts/run-kessho-product-sampler-cpu-scenarios.mjs']),
    scenarioName: 'ProductSamplerCpuBudgetTests',
    sampleRate,
    blockSize,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    thresholds: { quantumMs, sampleCacheDesktopBytes, sampleCacheMobileBytes },
    topSuspectedModules: ['sample-resolver', 'source-voice-allocator', 'sample-interpolation', 'loop-wrap'],
  }),
  runner: {
    command: commandText([process.execPath, 'scripts/run-kessho-product-sampler-cpu-scenarios.mjs']),
    cxxCommand: commandText(command),
    exitCode: result.status,
    signal: result.signal,
    reportPaths: {
      json: toRelativePath(root, jsonReportPath),
      markdown: toRelativePath(root, markdownReportPath),
    },
  },
  baseline: readBaselineMetrics(),
  sampleCache: {
    desktopBytes: sampleCacheDesktopBytes,
    mobileBytes: sampleCacheMobileBytes,
  },
  scenarios,
  failures,
};

writeJsonReport(jsonReportPath, report);
writeMarkdownReport(markdownReportPath, markdownReport(report));
console.log(`Kessho Product sampler CPU report: ${report.status.toUpperCase()} (${toRelativePath(root, markdownReportPath)}, ${toRelativePath(root, jsonReportPath)})`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  ${failure}`);
  process.exitCode = 1;
}
