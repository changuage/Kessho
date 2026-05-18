#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { masterCases as cases } from './lib/kesshoProductWebMasterCases.mjs';

const root = process.cwd();
const fullReportPath = resolve(root, 'docs/reports/kessho-product-web-master-corpus-latest.json');
const selectedReportPath = resolve(root, 'docs/reports/kessho-product-web-master-corpus-selected-latest.json');
const DEFAULT_PORT = 4196;
const DEFAULT_CASE_ATTEMPTS = 2;

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT, caseIds: [] };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--case=')) args.caseIds.push(arg.slice('--case='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-web-master-corpus.mjs [--url=http://127.0.0.1:4173/] [--port=4196] [--case=master-pad-reverb-scene]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (args.caseIds.some((caseId) => caseId.length === 0)) throw new Error('--case must not be empty');
  return args;
}

function runCaseAttempt(caseDef, args, attempt) {
  const command = [
    'scripts/check-web-core-sonic-parity.mjs',
    '--track=masterPostLimiter',
    `--duration-ms=${caseDef.durationMs}`,
    `--settle-ms=${caseDef.settleMs ?? 150}`,
    '--manual-trigger-delay-ms=0',
    `--state-patch=${JSON.stringify(caseDef.statePatch)}`,
    `--max-lag-ms=${caseDef.maxLagMs ?? 120}`,
    `--min-lag-correlation=${caseDef.minLagCorrelation}`,
    `--rms-tolerance=${caseDef.rmsTolerance}`,
    `--peak-tolerance=${caseDef.peakTolerance}`,
  ];
  if (caseDef.envelopeGate !== false) command.push('--envelope-gate');
  if (caseDef.alignmentGate) command.push('--alignment-gate');
  for (const stateEvent of caseDef.stateEvents ?? []) {
    command.push(`--state-event=${JSON.stringify(stateEvent)}`);
  }
  if (Array.isArray(caseDef.manualNotes)) {
    for (const manualNote of caseDef.manualNotes) command.push(`--manual-note=${manualNote}`);
  } else if (caseDef.manualNotes !== false) {
    command.push(`--manual-note=pad1:60:0.75:${caseDef.noteDurationMs ?? 1000}`);
  }
  for (const manualDrum of caseDef.manualDrums ?? []) command.push(`--manual-drum=${manualDrum}`);
  if (caseDef.envelopeRmsRatioTolerance !== undefined) command.push(`--envelope-rms-ratio-tolerance=${caseDef.envelopeRmsRatioTolerance}`);
  if (caseDef.envelopePeakRatioTolerance !== undefined) command.push(`--envelope-peak-ratio-tolerance=${caseDef.envelopePeakRatioTolerance}`);
  if (caseDef.envelopeTimeToleranceMs !== undefined) command.push(`--envelope-time-tolerance-ms=${caseDef.envelopeTimeToleranceMs}`);
  if (caseDef.mobileDevice) command.push('--mobile-device');
  if (args.url) command.push(`--url=${args.url}`);
  else command.push(`--port=${args.port}`);

  const result = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    id: caseDef.id,
    domain: caseDef.domain,
    attempt,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runCase(caseDef, args) {
  const maxAttempts = Math.max(1, caseDef.attempts ?? DEFAULT_CASE_ATTEMPTS);
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runCaseAttempt(caseDef, args, attempt);
    attempts.push(result);
    if (result.status === 'pass') {
      return {
        ...result,
        attempts: attempts.length,
        attemptResults: attempts,
      };
    }
  }
  const last = attempts[attempts.length - 1];
  return {
    ...last,
    attempts: attempts.length,
    attemptResults: attempts,
  };
}

function reportPathForArgs(args) {
  return args.caseIds.length > 0 ? selectedReportPath : fullReportPath;
}

function writeReport(report, args) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  const reportPath = reportPathForArgs(args);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

const args = parseArgs(process.argv.slice(2));
const selectedCases = args.caseIds.length > 0 ? cases.filter((caseDef) => args.caseIds.includes(caseDef.id)) : cases;
const selectedCaseIds = new Set(selectedCases.map((caseDef) => caseDef.id));
const missingCaseIds = args.caseIds.filter((caseId) => !selectedCaseIds.has(caseId));
if (missingCaseIds.length > 0) {
  throw new Error(`Unknown master corpus case(s): ${missingCaseIds.join(', ')}`);
}

const results = [];
for (const [index, caseDef] of selectedCases.entries()) {
  process.stderr.write(`[${index + 1}/${selectedCases.length}] ${caseDef.id}\n`);
  const result = runCase(caseDef, args);
  process.stderr.write(`[${index + 1}/${selectedCases.length}] ${caseDef.id}: ${result.status}${result.attempts > 1 ? ` after ${result.attempts} attempts` : ''}\n`);
  results.push(result);
}
const failed = results.filter((result) => result.status !== 'pass');
const report = {
  schema: 'kessho-product-web-master-corpus-v1',
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'pass' : 'fail',
  filteredCaseIds: args.caseIds,
  cases: results.map((result) => ({
    id: result.id,
    domain: result.domain,
    track: 'masterPostLimiter',
    status: result.status,
    exitCode: result.exitCode,
    attempts: result.attempts,
    ...(result.attempts > 1
      ? {
          attemptStatuses: result.attemptResults.map((attempt) => ({
            attempt: attempt.attempt,
            status: attempt.status,
            exitCode: attempt.exitCode,
          })),
        }
      : {}),
  })),
};
const reportPath = writeReport(report, args);

for (const result of results) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

if (failed.length > 0) {
  throw new Error(`Kessho Product Web master corpus failed: ${failed.map((result) => result.id).join(', ')}. See ${reportPath}`);
}

console.log(`Kessho Product Web master corpus passed (${results.length} cases, report: ${reportPath})`);
