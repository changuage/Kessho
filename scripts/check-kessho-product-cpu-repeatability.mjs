#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const runCount = 3;
const maxSpreadPercent = 5;
const reportDir = resolve(root, 'docs/reports');
const jsonPath = resolve(reportDir, 'kessho-product-cpu-repeatability-latest.json');
const markdownPath = resolve(reportDir, 'kessho-product-cpu-repeatability-latest.md');
const binaryPath = resolve(root, 'build/kessho-core/product-tests/ProductCpuBudgetTests');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(result.status === 0, `CPU repeatability command failed (${command} ${args.join(' ')}):\n${output.slice(-12000)}`);
  return output;
}

function parse(output) {
  const match = output.match(
    /Kessho Product CPU smoke passed: disabled FX ([0-9.eE+-]+)% avg, ([0-9.eE+-]+)% peak, p95 ([0-9.eE+-]+) ms, p99 ([0-9.eE+-]+) ms, missed ([0-9]+); active FX ([0-9.eE+-]+)% avg, ([0-9.eE+-]+)% peak, p95 ([0-9.eE+-]+) ms, p99 ([0-9.eE+-]+) ms, missed ([0-9]+)/,
  );
  assert(match, 'CPU repeatability run did not emit the expected Product CPU summary');
  const scenario = (offset) => ({
    averageCpuPercent: Number(match[offset]),
    peakCpuPercent: Number(match[offset + 1]),
    p95Ms: Number(match[offset + 2]),
    p99Ms: Number(match[offset + 3]),
    missedQuantumCount: Number(match[offset + 4]),
  });
  return { disabledFx: scenario(1), activeFx: scenario(6) };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(runs, key) {
  const values = runs.map((entry) => entry[key].averageCpuPercent);
  const medianAverageCpuPercent = median(values);
  const minAverageCpuPercent = Math.min(...values);
  const maxAverageCpuPercent = Math.max(...values);
  const spreadPercent = medianAverageCpuPercent > 0
    ? ((maxAverageCpuPercent - minAverageCpuPercent) / medianAverageCpuPercent) * 100
    : 0;
  return {
    values,
    medianAverageCpuPercent,
    minAverageCpuPercent,
    maxAverageCpuPercent,
    spreadPercent,
    maxSpreadPercent,
    missedQuantumCount: runs.reduce((total, entry) => total + entry[key].missedQuantumCount, 0),
    status: spreadPercent < maxSpreadPercent ? 'pass' : 'fail',
  };
}

const outputs = [
  run(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductCpuBudgetTests']),
];
for (let index = 1; index < runCount; index += 1) outputs.push(run(binaryPath, []));
const runs = outputs.map(parse);
const scenarios = {
  disabledFx: summarize(runs, 'disabledFx'),
  activeFx: summarize(runs, 'activeFx'),
};
const failures = Object.entries(scenarios)
  .filter(([, scenario]) => scenario.status !== 'pass')
  .map(([name, scenario]) => `${name} mean CPU spread ${scenario.spreadPercent.toFixed(3)}% is not below ${maxSpreadPercent}%`);
for (const [index, entry] of runs.entries()) {
  for (const key of ['disabledFx', 'activeFx']) {
    if (entry[key].missedQuantumCount !== 0) failures.push(`run ${index + 1} ${key} missed ${entry[key].missedQuantumCount} render quanta`);
  }
}
const report = {
  schema: 'kessho-product-cpu-repeatability-v1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'pass' : 'fail',
  runCount,
  maxSpreadPercent,
  runs,
  scenarios,
  failures,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  '# Kessho Product CPU Repeatability',
  '',
  `Status: **${report.status.toUpperCase()}**`,
  '',
  `Runs: ${runCount}; required mean CPU spread: < ${maxSpreadPercent}%`,
  '',
  '| Scenario | Run means | Median | Spread | Missed quanta |',
  '| --- | --- | ---: | ---: | ---: |',
  ...Object.entries(scenarios).map(([name, scenario]) => (
    `| ${name} | ${scenario.values.map((value) => `${value.toFixed(5)}%`).join(', ')} | ${scenario.medianAverageCpuPercent.toFixed(5)}% | ${scenario.spreadPercent.toFixed(3)}% | ${scenario.missedQuantumCount} |`
  )),
  '',
  ...(failures.length > 0 ? ['## Failures', '', ...failures.map((failure) => `- ${failure}`), ''] : []),
];
writeFileSync(markdownPath, `${lines.join('\n')}\n`);

if (failures.length > 0) {
  console.error(`Kessho Product CPU repeatability failed: ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`Kessho Product CPU repeatability passed (${runCount} runs; disabled ${scenarios.disabledFx.spreadPercent.toFixed(3)}% spread; active ${scenarios.activeFx.spreadPercent.toFixed(3)}% spread)`);
