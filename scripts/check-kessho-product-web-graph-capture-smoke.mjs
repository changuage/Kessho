#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { defaultSmokeStatePatch as statePatch, smokeCases as cases } from './lib/kesshoProductWebGraphSmokeCases.mjs';
import { fastSmokeCaseIds } from './lib/kesshoProductWebParityFastTier.mjs';

const root = process.cwd();
const fullReportPath = resolve(root, 'docs/reports/kessho-product-web-graph-capture-smoke-latest.json');
const fastReportPath = resolve(root, 'docs/reports/kessho-product-web-graph-capture-smoke-fast-latest.json');
const selectedReportPath = resolve(root, 'docs/reports/kessho-product-web-graph-capture-smoke-selected-latest.json');
const DEFAULT_PORT = 4195;
const DEFAULT_CASE_ATTEMPTS = 2;

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT, caseIds: [], tier: 'full' };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--case=')) args.caseIds.push(arg.slice('--case='.length));
    else if (arg.startsWith('--tier=')) args.tier = arg.slice('--tier='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-web-graph-capture-smoke.mjs [--url=http://127.0.0.1:4173/] [--port=4195] [--tier=fast|full] [--case=manual-pad1-dry]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (args.caseIds.some((caseId) => caseId.length === 0)) throw new Error('--case must not be empty');
  if (!['fast', 'full'].includes(args.tier)) throw new Error('--tier must be fast or full');
  return args;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function killProcessTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill();
  }
}

async function startSharedVite(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    detached: process.platform !== 'win32',
  });

  let output = '';
  let exited = false;
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.on('exit', () => {
    exited = true;
  });

  try {
    await waitForHttp(url, 30000);
  } catch (error) {
    killProcessTree(child);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nVite output:\n${output.trim()}`);
  }

  return {
    url,
    stop: async () => {
      if (!exited) killProcessTree(child);
      await delay(500);
    },
  };
}

function runCaseAttempt(caseDef, args, attempt, captureUrl) {
  const command = [
    'scripts/check-web-core-sonic-parity.mjs',
    `--track=${caseDef.track}`,
    `--duration-ms=${caseDef.durationMs ?? 700}`,
    `--settle-ms=${caseDef.settleMs ?? 150}`,
    `--manual-trigger-delay-ms=${caseDef.manualTriggerDelayMs ?? 0}`,
    `--state-patch=${JSON.stringify(caseDef.statePatch ?? statePatch)}`,
    `--max-lag-ms=${caseDef.maxLagMs ?? 90}`,
    `--min-lag-correlation=${caseDef.minLagCorrelation}`,
    `--min-signal-rms=${caseDef.minSignalRms ?? 0.0001}`,
    `--rms-tolerance=${caseDef.rmsTolerance}`,
    `--peak-tolerance=${caseDef.peakTolerance}`,
  ];
  for (const stateEvent of caseDef.stateEvents ?? []) {
    command.push(`--state-event=${JSON.stringify(stateEvent)}`);
  }
  if (Array.isArray(caseDef.manualNotes)) {
    for (const manualNote of caseDef.manualNotes) {
      command.push(`--manual-note=${manualNote}`);
    }
  } else if (caseDef.manualNotes !== false) {
    command.push(`--manual-note=pad1:60:0.75:${caseDef.noteDurationMs ?? 700}`);
  }
  for (const manualDrum of caseDef.manualDrums ?? []) {
    command.push(`--manual-drum=${manualDrum}`);
  }
  if (captureUrl) command.push(`--url=${captureUrl}`);
  else command.push(`--port=${args.port}`);
	  if (caseDef.coreOnly) command.push('--core-only');
	  if (caseDef.mobileDevice) command.push('--mobile-device');
	  if (caseDef.routeSmokeOnly) command.push('--route-smoke');
	  if (caseDef.envelopeGate) command.push('--envelope-gate');
  if (caseDef.alignmentGate) command.push('--alignment-gate');
  if (caseDef.envelopeWindowMs !== undefined) command.push(`--envelope-window-ms=${caseDef.envelopeWindowMs}`);
  if (caseDef.envelopeTimeToleranceMs !== undefined) command.push(`--envelope-time-tolerance-ms=${caseDef.envelopeTimeToleranceMs}`);
  if (caseDef.envelopeRmsRatioTolerance !== undefined) command.push(`--envelope-rms-ratio-tolerance=${caseDef.envelopeRmsRatioTolerance}`);
  if (caseDef.envelopePeakRatioTolerance !== undefined) command.push(`--envelope-peak-ratio-tolerance=${caseDef.envelopePeakRatioTolerance}`);
  const result = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    id: caseDef.id,
    track: caseDef.track,
    attempt,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function runCase(caseDef, args, captureUrl) {
  const maxAttempts = Math.max(1, caseDef.attempts ?? DEFAULT_CASE_ATTEMPTS);
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runCaseAttempt(caseDef, args, attempt, captureUrl);
    attempts.push(result);
    if (result.status === 'pass') {
      return {
        ...result,
        attempts: attempts.length,
        attemptResults: attempts,
      };
    }
    if (attempt < maxAttempts) await delay(Math.min(5000, 500 * attempt));
  }
  const last = attempts[attempts.length - 1];
  return {
    ...last,
    attempts: attempts.length,
    attemptResults: attempts,
  };
}

function reportPathForArgs(args) {
  if (args.caseIds.length > 0) return selectedReportPath;
  return args.tier === 'fast' ? fastReportPath : fullReportPath;
}

function writeReport(report, args) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  const reportPath = reportPathForArgs(args);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

const args = parseArgs(process.argv.slice(2));
const selectedCases = args.caseIds.length > 0
  ? cases.filter((caseDef) => args.caseIds.includes(caseDef.id))
  : args.tier === 'fast'
    ? fastSmokeCaseIds.map((caseId) => cases.find((caseDef) => caseDef.id === caseId)).filter(Boolean)
    : cases;
const selectedCaseIds = new Set(selectedCases.map((caseDef) => caseDef.id));
const missingCaseIds = args.caseIds.filter((caseId) => !selectedCaseIds.has(caseId));
if (missingCaseIds.length > 0) {
  throw new Error(`Unknown smoke case(s): ${missingCaseIds.join(', ')}`);
}

const outputTail = (value) => {
  const limit = 12000;
  return value.length > limit ? value.slice(-limit) : value;
};

let sharedVite = null;
try {
  sharedVite = args.url ? null : await startSharedVite(args.port);
  const captureUrl = args.url || sharedVite?.url || '';
  const results = [];
  for (const [index, caseDef] of selectedCases.entries()) {
    process.stderr.write(`[${index + 1}/${selectedCases.length}] ${caseDef.id}\n`);
    const result = await runCase(caseDef, args, captureUrl);
    process.stderr.write(`[${index + 1}/${selectedCases.length}] ${caseDef.id}: ${result.status}${result.attempts > 1 ? ` after ${result.attempts} attempts` : ''}\n`);
    results.push(result);
  }
  const failed = results.filter((result) => result.status !== 'pass');
  const fastSonicOnlyFailure = args.tier === 'fast' &&
    failed.length > 0 &&
    failed.every((result) => result.exitCode === 1);
  const report = {
    schema: 'kessho-product-web-graph-capture-smoke-v1',
    generatedAt: new Date().toISOString(),
    status: failed.length === 0 ? 'pass' : fastSonicOnlyFailure ? 'warn' : 'fail',
    tier: args.tier,
    nonBlockingSonicFailure: fastSonicOnlyFailure,
    filteredCaseIds: args.caseIds,
    cases: results.map((result) => ({
      id: result.id,
      track: result.track,
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
      ...(result.status === 'pass'
        ? {}
        : {
            stdoutTail: outputTail(result.stdout),
            stderrTail: outputTail(result.stderr),
          }),
    })),
  };
  const reportPath = writeReport(report, args);

  for (const result of results) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }

  if (failed.length > 0 && fastSonicOnlyFailure) {
    console.warn(`Kessho Product Web graph capture smoke had nonblocking fast-tier sonic failure(s): ${failed.map((result) => result.id).join(', ')}. See ${reportPath}`);
  } else if (failed.length > 0) {
    throw new Error(`Kessho Product Web graph capture smoke failed: ${failed.map((result) => result.id).join(', ')}. See ${reportPath}`);
  }

  console.log(`Kessho Product Web graph capture smoke ${fastSonicOnlyFailure ? 'completed with nonblocking fast-tier sonic warning' : 'passed'} (${results.length} cases, report: ${reportPath})`);
} finally {
  await sharedVite?.stop();
}
