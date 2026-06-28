#!/usr/bin/env node
import fs from 'node:fs';

const path = 'docs/reports/kessho-product-sampler-cpu-latest.json';
if (!fs.existsSync(path)) {
  console.error(`${path} is missing. Run npm run core:product:sampler-cpu.`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(path, 'utf8'));
const failures = [];
if (report.status !== 'pass') failures.push(`report status is ${report.status}`);
if (!Array.isArray(report.scenarios) || report.scenarios.length < 10) {
  failures.push('sampler CPU report must include all ten required scenarios');
}
for (const scenario of report.scenarios ?? []) {
  if (scenario.status !== 'pass') failures.push(`${scenario.name}: status ${scenario.status}`);
  if (scenario.missedDeadlines !== 0) failures.push(`${scenario.name}: missed deadlines ${scenario.missedDeadlines}`);
  if (scenario.p99RenderMs > scenario.budget?.p99RenderMs) {
    failures.push(`${scenario.name}: p99 ${scenario.p99RenderMs} > ${scenario.budget.p99RenderMs}`);
  }
  if (scenario.cpuAvgPercent > scenario.budget?.cpuAvgPercent) {
    failures.push(`${scenario.name}: cpu ${scenario.cpuAvgPercent} > ${scenario.budget.cpuAvgPercent}`);
  }
}
if (report.sampleCache?.desktopBytes > 128 * 1024 * 1024) {
  failures.push('desktop sample cache cap exceeds 128 MiB');
}
if (report.sampleCache?.mobileBytes > 32 * 1024 * 1024) {
  failures.push('mobile sample cache cap exceeds 32 MiB');
}

if (failures.length) {
  console.error('Sampler CPU budget failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Sampler CPU budget passed.');
