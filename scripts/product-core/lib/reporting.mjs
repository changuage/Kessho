import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, relative } from 'node:path';

function safeExec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function toRelativePath(root, path) {
  const rel = relative(root, path);
  return rel.startsWith('..') ? path : rel;
}

export function collectReportMetadata(options = {}) {
  const root = options.root ?? process.cwd();
  const cpus = os.cpus();
  return {
    gitCommit: safeExec('git rev-parse --short HEAD', { cwd: root }),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    command: options.command ?? process.argv.map(String).join(' '),
    scenarioName: options.scenarioName ?? null,
    sampleRate: options.sampleRate ?? null,
    blockSize: options.blockSize ?? null,
    durationMs: options.durationMs ?? null,
    thresholds: options.thresholds ?? null,
    topSuspectedModules: options.topSuspectedModules ?? null,
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? null,
      cpuCount: cpus.length,
    },
  };
}

export function writeJsonReport(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeMarkdownReport(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const body = Array.isArray(rows) ? rows.join('\n') : String(rows);
  writeFileSync(path, `${body.trimEnd()}\n`);
}

export function printPassFailSummary(rows) {
  const failures = rows.filter((row) => row.status && row.status !== 'pass');
  if (failures.length === 0) {
    console.log(`PASS (${rows.length} row${rows.length === 1 ? '' : 's'})`);
    return;
  }
  console.log(`FAIL (${failures.length}/${rows.length} row${rows.length === 1 ? '' : 's'})`);
  for (const row of failures) {
    console.log(`  ${row.id ?? row.label ?? 'row'}: ${row.status}`);
  }
}
