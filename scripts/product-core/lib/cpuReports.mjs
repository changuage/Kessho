import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(root, path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

export function readCpuBudgetReport(root = process.cwd()) {
  return readJson(root, 'docs/reports/kessho-product-cpu-budget-latest.json');
}

export function readPageCpuComparisonReport(root = process.cwd()) {
  return readJson(root, 'docs/reports/kessho-product-page-cpu-comparison-latest.json');
}

export function readWebCpuComparisonReport(root = process.cwd()) {
  return readJson(root, 'docs/reports/kessho-product-web-cpu-comparison-latest.json');
}

export function readModuleCpuReport(root = process.cwd()) {
  return readJson(root, 'docs/reports/kessho-product-module-cpu-latest.json');
}

export function summarizeCpuRows(report) {
  if (report.cpu?.scenarios) {
    return Object.entries(report.cpu.scenarios).map(([id, scenario]) => ({
      id,
      status: scenario.status,
      averageCpuPercent: scenario.averageCpuPercent ?? null,
      p95Ms: scenario.p95Ms ?? null,
      p99Ms: scenario.p99Ms ?? null,
      threshold: scenario.budget ?? null,
    }));
  }
  if (Array.isArray(report.scenarios)) {
    return report.scenarios.map((scenario) => ({
      id: scenario.id,
      status: Object.keys(scenario.errors ?? {}).length === 0 ? 'pass' : 'fail',
      productCpuPercent: scenario.engines?.['core-product']?.browserProcessCpuPercent ?? null,
      webCpuPercent: scenario.engines?.['web-ts']?.browserProcessCpuPercent ?? null,
      savedPercent: scenario.comparison?.browserProcessCpuSavedPercent ?? null,
    }));
  }
  return [];
}
