#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve, relative } from 'node:path';

const root = process.cwd();
const DEFAULT_URL = 'http://127.0.0.1:4173/';
const DEFAULT_REPORT_DIR = 'docs/reports';
const DEFAULT_JSON_REPORT = 'kessho-core-parity-readiness-latest.json';
const DEFAULT_MARKDOWN_REPORT = 'kessho-core-parity-readiness-latest.md';
const OUTPUT_TAIL_CHARS = 9000;
const STATUS_PASS = 'pass';
const STATUS_FAIL = 'fail';
const STATUS_SKIPPED = 'skipped';
const STATUS_KNOWN_FAILURE = 'known-failure';
const FAILURE_KIND_SETUP = 'setup';
const FAILURE_KIND_SONIC = 'sonic';
const FAILURE_KIND_CORE_OUTPUT = 'sonic/core-output';
const FAILURE_KIND_CHECK = 'check';
const CORPUS_SONIC_RETRY_ATTEMPTS = 2;

const sliceDefinitions = [
  {
    id: 'pad',
    label: 'Pad Slice',
    target: 'Core pad module and pad-only browser acceptance path are ready.',
    moduleChecks: [
      check('pad-module-parity', 'Pad module parity', ['scripts/check-kessho-core-pad-module-parity.mjs']),
    ],
    corpusStageId: 'padSlice',
  },
  {
    id: 'fx',
    label: 'FX Slice',
    target: 'Shared FX, return stems, and master processing are ready when fed deterministic inputs.',
    moduleChecks: [
      check('dynamics-module-parity', 'Dynamics module parity', ['scripts/check-kessho-core-dynamics-module-parity.mjs']),
      check('reverb-module-parity', 'Reverb module parity', ['scripts/check-kessho-core-reverb-module-parity.mjs']),
      check('granular-module-parity', 'Granular module parity', ['scripts/check-kessho-core-granular-module-parity.mjs']),
      check('spectral-freeze-module-parity', 'Spectral freeze module parity', ['scripts/check-kessho-core-spectral-freeze-module-parity.mjs']),
      check('delay-a-module-regression', 'Delay A module regression', ['scripts/check-kessho-core-delay-a-module-regression.mjs']),
      check('delay-b-module-regression', 'Delay B module regression', ['scripts/check-kessho-core-delay-b-module-regression.mjs']),
    ],
    corpusStageId: 'fxSlice',
  },
  {
    id: 'source',
    label: 'Source Slice',
    target: 'Non-pad musical and environmental sources are ready.',
    moduleChecks: [
      check('lead-fm-module-parity', 'Lead FM module parity', ['scripts/check-kessho-core-lead-fm-module-parity.mjs']),
      check('drum-module-parity', 'Drum module parity', ['scripts/check-kessho-core-drum-module-parity.mjs']),
      check('soundscapes-module-parity', 'Soundscapes module parity', ['scripts/check-kessho-core-soundscapes-module-parity.mjs']),
      check('midi-events', 'Core MIDI event contract', ['scripts/check-core-midi-events.mjs']),
    ],
    corpusStageId: 'sourceSlice',
  },
  {
    id: 'full',
    label: 'Full Mix Slice',
    target: 'Backbone contracts, host routing, native/WASM smoke parity, and representative full mixes are ready.',
    moduleChecks: [
      check('snapshot-contract', 'Core snapshot contract', ['scripts/check-core-snapshot-contract.mjs']),
      check('engine-host-contract', 'Core engine host contract', ['scripts/check-core-engine-host.mjs']),
      check('architecture-parity-audit', 'Core architecture parity audit', ['scripts/audit-kessho-core-architecture-parity.mjs']),
      check('core-smoke-test', 'Core smoke test', ['scripts/test-kessho-core.mjs']),
      check('native-wasm-render-parity', 'Native/WASM render parity', ['scripts/check-kessho-core-render-parity.mjs']),
      check('web-module-preview', 'Core web module preview', ['scripts/check-kessho-core-web-module-preview.mjs']),
    ],
    corpusStageId: 'fullMixSlice',
  },
];

function check(id, label, args) {
  return {
    id,
    label,
    kind: 'module',
    command: [process.execPath, ...args],
  };
}

function parseArgs(argv) {
  const args = {
    browserCorpus: false,
    browserCorpusExplicit: false,
    url: DEFAULT_URL,
    urlProvided: false,
    noFail: false,
    reportDir: DEFAULT_REPORT_DIR,
    jsonReport: '',
    markdownReport: '',
    slices: new Set(sliceDefinitions.map((slice) => slice.id)),
    selfCheck: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--browser-corpus') {
      args.browserCorpus = true;
      args.browserCorpusExplicit = true;
    } else if (arg === '--skip-browser-corpus') {
      args.browserCorpus = false;
      args.browserCorpusExplicit = true;
    } else if (arg.startsWith('--url=')) {
      args.url = arg.slice('--url='.length);
      args.urlProvided = true;
    } else if (arg === '--no-fail') {
      args.noFail = true;
    } else if (arg.startsWith('--report-dir=')) {
      args.reportDir = arg.slice('--report-dir='.length);
    } else if (arg.startsWith('--json-report=')) {
      args.jsonReport = arg.slice('--json-report='.length);
    } else if (arg.startsWith('--markdown-report=')) {
      args.markdownReport = arg.slice('--markdown-report='.length);
    } else if (arg.startsWith('--slice=')) {
      const value = arg.slice('--slice='.length);
      const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      const normalized = new Set();
      for (const id of ids) {
        if (id === 'all') {
          for (const slice of sliceDefinitions) normalized.add(slice.id);
        } else {
          normalized.add(id);
        }
      }
      args.slices = normalized;
    } else if (arg === '--self-check') {
      args.selfCheck = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.urlProvided && !args.browserCorpusExplicit) {
    args.browserCorpus = true;
  }

  const knownSlices = new Set(sliceDefinitions.map((slice) => slice.id));
  for (const id of args.slices) {
    if (!knownSlices.has(id)) {
      throw new Error(`Unknown --slice=${id}. Use one of: ${Array.from(knownSlices).join(', ')}, all`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-kessho-core-parity-readiness.mjs [options]

Runs the staged KesshoCore parity readiness suite and writes:
  docs/reports/kessho-core-parity-readiness-latest.json
  docs/reports/kessho-core-parity-readiness-latest.md

Options:
  --browser-corpus            Run browser acceptance corpus cases through profile-kessho-core-acceptance-corpus.mjs.
  --skip-browser-corpus       Run only non-browser backbone/module checks. This is the default without --url.
  --url=http://127.0.0.1:4173/
                              Existing dev server URL. Supplying --url implies --browser-corpus.
  --slice=pad,fx,source,full  Limit to one or more slices. Use --slice=all for all slices.
  --report-dir=docs/reports   Report directory.
  --json-report=<path>        Explicit JSON report path.
  --markdown-report=<path>    Explicit Markdown report path.
  --no-fail                   Always exit 0 after writing reports, even when checks fail.
  --self-check                Run readiness-runner invariant checks without launching browsers or subprocess checks.
  --help, -h                  Show this help.

Examples:
  node scripts/check-kessho-core-parity-readiness.mjs --skip-browser-corpus
  node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --url=http://127.0.0.1:4173/
  npm run core:readiness:browser -- --url=http://127.0.0.1:4173/
`);
}

function commandText(command) {
  return command.map((part, index) => {
    if (index === 0 && part === process.execPath) return 'node';
    if (/^[A-Za-z0-9_./:=+-]+$/.test(part)) return part;
    return `'${String(part).replace(/'/g, `'\\''`)}'`;
  }).join(' ');
}

function tail(value, limit = OUTPUT_TAIL_CHARS) {
  if (!value) return '';
  return value.length > limit ? value.slice(value.length - limit) : value;
}

function trimLines(value, maxLines = 14) {
  const lines = value.trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines));
}

function statusFromExitCode(exitCode) {
  return exitCode === 0 ? STATUS_PASS : STATUS_FAIL;
}

function runCommand(command, options = {}) {
  const start = performance.now();
  return new Promise((resolvePromise) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout = tail(stdout + chunk.toString(), options.outputLimit ?? OUTPUT_TAIL_CHARS);
    });
    child.stderr.on('data', (chunk) => {
      stderr = tail(stderr + chunk.toString(), options.outputLimit ?? OUTPUT_TAIL_CHARS);
    });
    child.on('error', (error) => {
      const durationMs = Math.round(performance.now() - start);
      resolvePromise({
        status: 'fail',
        exitCode: null,
        signal: null,
        durationMs,
        stdout,
        stderr: tail(`${stderr}\n${error instanceof Error ? error.message : String(error)}`),
      });
    });
    child.on('close', (exitCode, signal) => {
      const durationMs = Math.round(performance.now() - start);
      resolvePromise({
        status: statusFromExitCode(exitCode),
        exitCode,
        signal,
        durationMs,
        stdout,
        stderr,
      });
    });
  });
}

async function loadCorpusContract() {
  const command = [process.execPath, 'scripts/profile-kessho-core-acceptance-corpus.mjs', '--json'];
  const result = await runCommand(command, { outputLimit: 80 * 1024 * 1024 });
  const report = {
    kind: 'corpus-contract',
    id: 'acceptance-corpus-contract',
    label: 'Acceptance corpus contract',
    command,
    commandText: commandText(command),
    status: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    rerunCommand: commandText(command),
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
    caseCount: 0,
    stagedParity: {},
    knownFailures: [],
    error: '',
  };

  if (result.status !== STATUS_PASS) {
    report.error = firstMeaningfulLine(result.stderr || result.stdout) || 'Failed to load acceptance corpus JSON.';
    return { report, contract: null, casesById: new Map(), knownFailuresByCaseId: new Map() };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    report.caseCount = parsed.caseCount ?? parsed.cases?.length ?? 0;
    report.stagedParity = parsed.contract?.stagedParity ?? {};
    report.knownFailures = parsed.contract?.knownFailures ?? [];
    const casesById = new Map((parsed.cases ?? []).map((entry) => [entry.id, entry]));
    const knownFailuresByCaseId = new Map((report.knownFailures ?? []).map((entry) => [entry.caseId, entry]));
    return { report, contract: parsed.contract ?? null, casesById, knownFailuresByCaseId };
  } catch (error) {
    report.status = STATUS_FAIL;
    report.exitCode = 1;
    report.error = `Could not parse corpus JSON: ${error instanceof Error ? error.message : String(error)}`;
    return { report, contract: null, casesById: new Map(), knownFailuresByCaseId: new Map() };
  }
}

function firstMeaningfulLine(value) {
  const lines = trimLines(value, 8).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^(Error|TypeError|SyntaxError|ReferenceError|Missing|Cannot|Timed out|Sonic parity)/.test(line)) ??
    lines[0] ??
    '';
}

function browserCaseCheck(caseId, entry, url, caseRole = 'required') {
  const browserParityArgs = Array.isArray(entry?.browserParityArgs) ? entry.browserParityArgs : null;
  return {
    id: `corpus-${caseId}`,
    label: entry?.title ? `${caseId}: ${entry.title}` : caseId,
    kind: 'corpus',
    caseId,
    caseRole,
    expectedFailure: false,
    knownFailure: null,
    thresholdClass: entry?.thresholdClass ?? null,
    expectedOutcome: entry?.expectedOutcome ?? null,
    candidateOutcome: (entry?.expectedOutcome ?? '') === 'candidate',
    group: entry?.group ?? null,
    command: [
      process.execPath,
      browserParityArgs ? 'scripts/check-web-core-sonic-parity.mjs' : 'scripts/profile-kessho-core-acceptance-corpus.mjs',
      ...(browserParityArgs ? [] : ['--run', `--case=${caseId}`]),
      `--url=${url}`,
      ...(browserParityArgs ?? []),
    ],
  };
}

function classifyFailure(definition, stderr, stdout) {
  const output = `${stderr ?? ''}\n${stdout ?? ''}`;
  if (definition.kind === 'corpus') {
    if (/Result:\s*FAIL \(sonic\/core-output\)|fail\/sonic\/core-output|Sonic parity sonic\/core-output failure|non-finite core output|core-wasm capture has non-finite/i.test(output)) {
      return FAILURE_KIND_CORE_OUTPUT;
    }
    if (/Result:\s*FAIL \(sonic\)|Sonic parity sonic failure|Sonic parity thresholds exceeded|thresholds exceeded|silent capture|non-finite samples|unexpectedly quiet/i.test(output)) {
      return FAILURE_KIND_SONIC;
    }
    return FAILURE_KIND_SETUP;
  }
  if (definition.kind === 'setup') return FAILURE_KIND_SETUP;
  return FAILURE_KIND_CHECK;
}

async function runCheck(definition) {
  let result = await runCommand(definition.command);
  let failureKind = result.status === STATUS_FAIL
    ? classifyFailure(definition, result.stderr, result.stdout)
    : '';
  let retryCount = 0;
  let totalDurationMs = result.durationMs;
  let retryOutput = '';
  while (
    definition.kind === 'corpus' &&
    result.status === STATUS_FAIL &&
    failureKind === FAILURE_KIND_SONIC &&
    retryCount < CORPUS_SONIC_RETRY_ATTEMPTS
  ) {
    retryCount += 1;
    const previousSummary = firstMeaningfulLine(result.stderr || result.stdout) || `Exited with ${result.exitCode ?? result.signal ?? 'unknown status'}`;
    retryOutput = tail(`${retryOutput}\n[retry] ${definition.label} sonic failure attempt ${retryCount}/${CORPUS_SONIC_RETRY_ATTEMPTS}: ${previousSummary}`);
    result = await runCommand(definition.command);
    totalDurationMs += result.durationMs;
    failureKind = result.status === STATUS_FAIL
      ? classifyFailure(definition, result.stderr, result.stdout)
      : '';
  }
  const expectedFailure = Boolean(definition.expectedFailure);
  const status = result.status === STATUS_FAIL && expectedFailure && failureKind === FAILURE_KIND_SONIC
    ? STATUS_KNOWN_FAILURE
    : result.status;
  const failureSummary = result.status === STATUS_FAIL
    ? firstMeaningfulLine(result.stderr || result.stdout) || `Exited with ${result.exitCode ?? result.signal ?? 'unknown status'}`
    : '';
  return {
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    caseId: definition.caseId ?? null,
    caseRole: definition.caseRole ?? null,
    expectedFailure,
    knownFailure: definition.knownFailure ?? null,
    failureKind,
    group: definition.group ?? null,
    thresholdClass: definition.thresholdClass ?? null,
    expectedOutcome: definition.expectedOutcome ?? null,
    candidateOutcome: Boolean(definition.candidateOutcome),
    command: commandText(definition.command),
    rerunCommand: commandText(definition.command),
    status,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: totalDurationMs,
    stdoutTail: retryOutput ? tail(`${retryOutput}\n${result.stdout}`) : result.stdout,
    stderrTail: result.stderr,
    failureSummary,
  };
}

function skippedBrowserCase(caseId, entry, reason, url, caseRole = 'required', knownFailure = null) {
  const command = browserCaseCheck(caseId, entry, url, caseRole).command;
  return {
    id: `corpus-${caseId}`,
    label: entry?.title ? `${caseId}: ${entry.title}` : caseId,
    kind: 'corpus',
    caseId,
    caseRole,
    expectedFailure: Boolean(knownFailure),
    knownFailure,
    failureKind: '',
    group: entry?.group ?? null,
    thresholdClass: entry?.thresholdClass ?? null,
    expectedOutcome: entry?.expectedOutcome ?? null,
    candidateOutcome: (entry?.expectedOutcome ?? '') === 'candidate',
    command: commandText(command),
    rerunCommand: commandText(command),
    status: STATUS_SKIPPED,
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutTail: '',
    stderrTail: '',
    failureSummary: '',
    skipReason: reason,
  };
}

function failedSetupCheck(id, label, command, summary, output = '') {
  return {
    id,
    label,
    kind: 'setup',
    caseId: null,
    caseRole: null,
    expectedFailure: false,
    knownFailure: null,
    failureKind: FAILURE_KIND_SETUP,
    group: null,
    thresholdClass: null,
    command,
    rerunCommand: command,
    status: STATUS_FAIL,
    exitCode: 1,
    signal: null,
    durationMs: 0,
    stdoutTail: '',
    stderrTail: output,
    failureSummary: summary,
  };
}

function skippedSetupCheck(id, label, command, reason) {
  return {
    id,
    label,
    kind: 'setup',
    caseId: null,
    caseRole: null,
    expectedFailure: false,
    knownFailure: null,
    failureKind: '',
    group: null,
    thresholdClass: null,
    command,
    rerunCommand: command,
    status: STATUS_SKIPPED,
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdoutTail: '',
    stderrTail: '',
    failureSummary: '',
    skipReason: reason,
  };
}

async function checkBrowserSetup(options) {
  const command = `node -e 'fetch(process.argv[1]).then((response)=>{console.log("HTTP " + response.status); process.exit(response.ok ? 0 : 1);}).catch((error)=>{console.error(error); process.exit(1);})' ${options.url}`;
  if (!options.browserCorpus) {
    return skippedSetupCheck(
      'browser-corpus-url',
      'Browser corpus URL',
      command,
      options.browserCorpusExplicit ? 'Browser corpus was explicitly skipped.' : 'Browser corpus was not requested.',
    );
  }

  const start = performance.now();
  try {
    const response = await fetch(options.url);
    const durationMs = Math.round(performance.now() - start);
    if (!response.ok) {
      return {
        ...failedSetupCheck('browser-corpus-url', 'Browser corpus URL', command, `Browser corpus URL returned HTTP ${response.status}.`),
        durationMs,
      };
    }
    return {
      id: 'browser-corpus-url',
      label: 'Browser corpus URL',
      kind: 'setup',
      caseId: null,
      caseRole: null,
      expectedFailure: false,
      knownFailure: null,
      failureKind: '',
      group: null,
      thresholdClass: null,
      command,
      rerunCommand: command,
      status: STATUS_PASS,
      exitCode: 0,
      signal: null,
      durationMs,
      stdoutTail: `HTTP ${response.status}`,
      stderrTail: '',
      failureSummary: '',
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    if (isSandboxLoopbackProbeBlocked(error, options.url)) {
      return {
        id: 'browser-corpus-url',
        label: 'Browser corpus URL',
        kind: 'setup',
        caseId: null,
        caseRole: null,
        expectedFailure: false,
        knownFailure: null,
        failureKind: '',
        group: null,
        thresholdClass: null,
        command,
        rerunCommand: command,
        status: STATUS_PASS,
        exitCode: 0,
        signal: null,
        durationMs,
        stdoutTail: 'Node fetch loopback preflight blocked by sandbox EPERM; browser corpus cases will validate the URL.',
        stderrTail: error instanceof Error ? error.message : String(error),
        failureSummary: '',
      };
    }
    return {
      ...failedSetupCheck(
        'browser-corpus-url',
        'Browser corpus URL',
        command,
        `Browser corpus URL is not reachable from Node fetch: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack ?? error.message : String(error),
      ),
      durationMs,
    };
  }
}

function isSandboxLoopbackProbeBlocked(error, url) {
  if (!isLoopbackUrl(url)) return false;
  const stack = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  const cause = error instanceof Error && error.cause ? error.cause : null;
  const causeText = cause instanceof Error ? `${cause.message}\n${cause.stack ?? ''}` : String(cause ?? '');
  return `${stack}\n${causeText}`.includes('EPERM');
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

async function waitForManagedBrowserServer(url, timeoutMs, outputProvider) {
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
    await delay(500);
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const output = outputProvider().trim();
  throw new Error(`Timed out waiting for ${url}: ${detail}${output ? `\nVite output:\n${output}` : ''}`);
}

async function startManagedBrowserServer(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== 'http:' || !isLoopbackUrl(urlValue)) {
    throw new Error('managed browser readiness server only supports loopback http URLs');
  }
  const port = Number(url.port || '80');
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`invalid managed browser readiness port: ${url.port}`);
  }

  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = tail(output + chunk.toString(), 20000);
  });
  child.stderr.on('data', (chunk) => {
    output = tail(output + chunk.toString(), 20000);
  });

  try {
    await waitForManagedBrowserServer(urlValue, 120000, () => output);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    stop: async () => {
      child.kill();
      await delay(250);
    },
  };
}

function corpusSetupFailureCheck(slice, corpus) {
  return {
    id: `corpus-${slice.id}-setup`,
    label: 'Corpus setup',
    kind: 'corpus',
    caseId: null,
    caseRole: null,
    expectedFailure: false,
    knownFailure: null,
    failureKind: FAILURE_KIND_SETUP,
    group: null,
    thresholdClass: null,
    command: corpus.report.rerunCommand ?? corpus.report.commandText,
    rerunCommand: corpus.report.rerunCommand ?? corpus.report.commandText,
    status: STATUS_FAIL,
    exitCode: corpus.report.exitCode ?? 1,
    signal: null,
    durationMs: corpus.report.durationMs ?? 0,
    stdoutTail: corpus.report.stdoutTail ?? '',
    stderrTail: corpus.report.stderrTail ?? '',
    failureSummary: corpus.report.error || 'Acceptance corpus setup failed.',
  };
}

function corpusStageMissingCheck(slice, corpus) {
  return {
    id: `corpus-${slice.id}-contract-missing`,
    label: 'Corpus stage definition',
    kind: 'corpus',
    caseId: null,
    caseRole: null,
    expectedFailure: false,
    knownFailure: null,
    failureKind: FAILURE_KIND_SETUP,
    group: null,
    thresholdClass: null,
    command: corpus.report.rerunCommand ?? corpus.report.commandText,
    rerunCommand: corpus.report.rerunCommand ?? corpus.report.commandText,
    status: STATUS_FAIL,
    exitCode: 1,
    signal: null,
    durationMs: 0,
    stdoutTail: corpus.report.stdoutTail ?? '',
    stderrTail: corpus.report.stderrTail ?? '',
    failureSummary: 'No required or boundary corpus cases were available for this slice.',
  };
}

async function runSlice(slice, options, corpus, browserSetup) {
  console.log(`\n== ${slice.label} ==`);
  const moduleResults = [];
  for (const definition of slice.moduleChecks) {
    process.stdout.write(`  ${definition.label} ... `);
    const result = await runCheck(definition);
    console.log(`${result.status.toUpperCase()} (${formatDuration(result.durationMs)})`);
    moduleResults.push(result);
  }

  const stage = corpus.report.stagedParity?.[slice.corpusStageId] ?? null;
  const corpusCaseDefs = [
    ...(stage?.requiredCases ?? []).map((caseId) => ({ caseId, caseRole: 'required' })),
    ...(stage?.boundaryCases ?? []).map((caseId) => ({ caseId, caseRole: 'boundary' })),
  ];
  const corpusResults = [];
  if (corpus.report.status !== STATUS_PASS) {
    corpusResults.push(corpusSetupFailureCheck(slice, corpus));
  } else if (corpusCaseDefs.length === 0) {
    corpusResults.push(corpusStageMissingCheck(slice, corpus));
  } else if (!options.browserCorpus) {
    for (const { caseId, caseRole } of corpusCaseDefs) {
      const knownFailure = corpus.knownFailuresByCaseId.get(caseId) ?? null;
      corpusResults.push(skippedBrowserCase(caseId, corpus.casesById.get(caseId), browserSetup.skipReason, options.url, caseRole, knownFailure));
    }
  } else if (browserSetup.status === STATUS_FAIL) {
    for (const { caseId, caseRole } of corpusCaseDefs) {
      const knownFailure = corpus.knownFailuresByCaseId.get(caseId) ?? null;
      corpusResults.push(skippedBrowserCase(caseId, corpus.casesById.get(caseId), 'Browser setup failed before corpus cases could run.', options.url, caseRole, knownFailure));
    }
  } else {
    for (const { caseId, caseRole } of corpusCaseDefs) {
      const entry = corpus.casesById.get(caseId);
      const knownFailure = corpus.knownFailuresByCaseId.get(caseId) ?? null;
      const definition = {
        ...browserCaseCheck(caseId, entry, options.url, caseRole),
        expectedFailure: Boolean(knownFailure),
        knownFailure,
      };
      process.stdout.write(`  Corpus ${caseId}${caseRole === 'boundary' ? ' (boundary)' : ''} ... `);
      const result = await runCheck(definition);
      console.log(`${result.status.toUpperCase()} (${formatDuration(result.durationMs)})`);
      corpusResults.push(result);
    }
  }

  const checks = [...moduleResults, ...corpusResults];
  const failedChecks = checks.filter((entry) => entry.status === STATUS_FAIL);
  const skippedChecks = checks.filter((entry) => entry.status === STATUS_SKIPPED);
  const knownFailureChecks = checks.filter((entry) => entry.status === STATUS_KNOWN_FAILURE);
  const candidateChecks = checks.filter((entry) => entry.candidateOutcome);
  const runChecks = checks.filter((entry) => entry.status !== STATUS_SKIPPED);
  const status = failedChecks.length > 0 ? 'fail' : 'pass';
  const readiness = failedChecks.length > 0
    ? 'fail'
    : skippedChecks.length > 0 || knownFailureChecks.length > 0 || candidateChecks.length > 0
      ? 'incomplete'
      : 'pass';

  return {
    id: slice.id,
    label: slice.label,
    target: stage?.target ?? slice.target,
    passDefinition: stage?.passDefinition ?? '',
    boundaryDefinition: stage?.boundaryDefinition ?? '',
    status,
    readiness,
    checksPassed: runChecks.filter((entry) => entry.status === STATUS_PASS).length,
    checksFailed: failedChecks.length,
    checksSkipped: skippedChecks.length,
    checksKnownFailed: knownFailureChecks.length,
    checksCandidate: candidateChecks.length,
    checksTotal: checks.length,
    moduleChecks: moduleResults,
    corpusCases: corpusResults,
  };
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function summarize(report) {
  const setupChecks = report.setupChecks ?? [];
  const failedSetupChecks = setupChecks.filter((entry) => entry.status === STATUS_FAIL);
  const skippedSetupChecks = setupChecks.filter((entry) => entry.status === STATUS_SKIPPED);
  const failedSlices = report.slices.filter((slice) => slice.status === STATUS_FAIL);
  const incompleteSlices = report.slices.filter((slice) => slice.readiness === 'incomplete');
  const fullSliceCoverage = (report.runner.selectedSlices?.length ?? 0) === sliceDefinitions.length;
  const checks = [
    ...setupChecks,
    ...report.slices.flatMap((slice) => [...slice.moduleChecks, ...slice.corpusCases]),
  ];
  const knownFailureChecks = checks.filter((entry) => entry.status === STATUS_KNOWN_FAILURE);
  const candidateChecks = checks.filter((entry) => entry.candidateOutcome);
  return {
    status: failedSetupChecks.length > 0 || failedSlices.length > 0 ? 'fail' : 'pass',
    readiness: failedSetupChecks.length > 0 || failedSlices.length > 0
      ? 'fail'
      : !fullSliceCoverage || incompleteSlices.length > 0 || skippedSetupChecks.length > 0 || knownFailureChecks.length > 0 || candidateChecks.length > 0
        ? 'incomplete'
        : 'pass',
    sliceCoverage: fullSliceCoverage ? 'complete' : 'partial',
    browserCorpus: report.runner.browserCorpus ? 'run' : 'skipped',
    slicesPassed: report.slices.filter((slice) => slice.status === STATUS_PASS).length,
    slicesFailed: failedSlices.length,
    slicesIncomplete: incompleteSlices.length,
    setupPassed: setupChecks.filter((entry) => entry.status === STATUS_PASS).length,
    setupFailed: failedSetupChecks.length,
    setupSkipped: skippedSetupChecks.length,
    checksPassed: checks.filter((entry) => entry.status === STATUS_PASS).length,
    checksFailed: checks.filter((entry) => entry.status === STATUS_FAIL).length,
    checksSkipped: checks.filter((entry) => entry.status === STATUS_SKIPPED).length,
    checksKnownFailed: knownFailureChecks.length,
    checksCandidate: candidateChecks.length,
    checksTotal: checks.length,
  };
}

function githubCommandEscape(value) {
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function collectFailedChecks(report) {
  return [
    ...(report.setupChecks ?? []),
    ...report.slices.flatMap((slice) => [...slice.moduleChecks, ...slice.corpusCases]),
  ].filter((entry) => entry.status === STATUS_FAIL);
}

function emitGithubFailureAnnotations(report) {
  const failures = collectFailedChecks(report);
  if (failures.length === 0) return;
  console.error('\n== Failure Details ==');
  for (const entry of failures.slice(0, 8)) {
    const summary = entry.failureSummary || `Exited with ${entry.exitCode ?? entry.signal ?? 'unknown status'}`;
    const detail = `${entry.label}: ${entry.failureKind || 'check'} - ${summary}. Rerun: ${entry.rerunCommand}`;
    console.error(`  ${detail}`);
    console.error(`::error file=docs/reports/kessho-core-parity-readiness-latest.md::${githubCommandEscape(detail)}`);
  }
}

function selectedSliceArg(selectedSlices) {
  if (selectedSlices.length === sliceDefinitions.length) return '';
  return ` --slice=${selectedSlices.map((slice) => slice.id).join(',')}`;
}

function buildRerunCommands(options, selectedSlices) {
  const sliceArg = selectedSliceArg(selectedSlices);
  return {
    nonBrowser: `npm run core:readiness -- --skip-browser-corpus${sliceArg}`,
    browserCorpus: `npm run core:readiness:browser -- --url=${options.url}${sliceArg}`,
    fullBrowserCorpus: `npm run core:readiness:browser -- --url=${options.url}`,
    directBrowserCorpus: `node scripts/check-kessho-core-parity-readiness.mjs --browser-corpus --url=${options.url}${sliceArg}`,
  };
}

function reportPaths(options) {
  const reportDir = resolve(root, options.reportDir);
  return {
    reportDir,
    json: resolve(root, options.jsonReport || resolve(options.reportDir, DEFAULT_JSON_REPORT)),
    markdown: resolve(root, options.markdownReport || resolve(options.reportDir, DEFAULT_MARKDOWN_REPORT)),
  };
}

function toRelative(path) {
  const rel = relative(root, path);
  return rel.startsWith('..') ? path : rel;
}

function writeReports(report, paths) {
  mkdirSync(paths.reportDir, { recursive: true });
  writeFileSync(paths.json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(paths.markdown, markdownReport(report));
}

function statusLabel(status) {
  return status.toUpperCase();
}

function markdownReport(report) {
  const lines = [
    '# KesshoCore Parity Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Run command: \`${report.runner.command}\``,
    '',
    `Overall check status: **${statusLabel(report.summary.status)}**`,
    '',
    `Full objective readiness status: **${statusLabel(report.summary.readiness)}**`,
    '',
    `Objective slice coverage: **${report.summary.sliceCoverage === 'complete' ? 'COMPLETE' : 'PARTIAL'}** (${report.runner.selectedSlices.join(', ')})`,
    '',
    `Browser corpus: ${report.runner.browserCorpus ? `run against ${report.runner.url}` : 'skipped'}`,
    '',
    '## Rerun Commands',
    '',
    `Non-browser backbone: \`${report.runner.rerunCommands.nonBrowser}\``,
    '',
    `Selected browser corpus: \`${report.runner.rerunCommands.browserCorpus}\``,
    '',
    `Full objective browser corpus: \`${report.runner.rerunCommands.fullBrowserCorpus}\``,
    '',
  ];

  if (report.summary.sliceCoverage !== 'complete') {
    lines.push(
      'Note: this report is slice-limited. It can prove the selected slice, but it cannot prove the full core-backbone parity objective.',
      '',
    );
  }

  if (!report.runner.browserCorpus) {
    lines.push(
      'Note: this report covers non-browser backbone checks only. Run with `--browser-corpus --url=http://127.0.0.1:4173/` after starting the app to include dry pad, pad+reverb, FX, source, and full-mix browser gates.',
      '',
    );
  }

  lines.push(
    '## Slice Status',
    '',
    '| Slice | Check Status | Full Readiness | Passed | Failed | Known Failed | Candidate | Skipped |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
  );

  for (const slice of report.slices) {
    lines.push(`| ${slice.label} | ${statusLabel(slice.status)} | ${statusLabel(slice.readiness)} | ${slice.checksPassed} | ${slice.checksFailed} | ${slice.checksKnownFailed} | ${slice.checksCandidate} | ${slice.checksSkipped} |`);
  }

  lines.push(
    '',
    '## Setup Checks',
    '',
    '| Status | Check | Duration | Rerun / Reason |',
    '| --- | --- | ---: | --- |',
  );

  for (const entry of report.setupChecks) {
    const detail = entry.status === STATUS_SKIPPED
      ? `${entry.skipReason} Rerun: \`${entry.rerunCommand}\``
      : `\`${entry.rerunCommand}\``;
    lines.push(`| ${statusLabel(entry.status)} | ${entry.label} | ${formatDuration(entry.durationMs)} | ${detail} |`);
  }

  lines.push(
    '',
    '## Corpus Contract',
    '',
    `Status: **${statusLabel(report.corpusContract.status)}**`,
    '',
    `Command: \`${report.corpusContract.commandText}\``,
    '',
    `Cases available: ${report.corpusContract.caseCount}`,
    '',
  );

  if (report.corpusContract.error) {
    lines.push(`Error: ${report.corpusContract.error}`, '');
  }

  for (const slice of report.slices) {
    lines.push(
      `## ${slice.label}`,
      '',
      `Target: ${slice.target}`,
      '',
    );

    if (slice.passDefinition) {
      lines.push(`Pass definition: ${slice.passDefinition}`, '');
    }

    if (slice.boundaryDefinition) {
      lines.push(`Boundary definition: ${slice.boundaryDefinition}`, '');
    }

    lines.push(
      '| Status | Kind | Check | Duration | Rerun / Reason |',
      '| --- | --- | --- | ---: | --- |',
    );

    for (const entry of [...slice.moduleChecks, ...slice.corpusCases]) {
      const role = entry.caseRole ? ` (${entry.caseRole}${entry.candidateOutcome ? ', candidate' : ''})` : '';
      const reason = entry.status === STATUS_SKIPPED
        ? `${entry.skipReason} Rerun: \`${entry.rerunCommand}\``
        : `\`${entry.rerunCommand}\``;
      lines.push(`| ${statusLabel(entry.status)} | ${entry.kind}${role} | ${entry.label} | ${formatDuration(entry.durationMs)} | ${reason} |`);
    }

    const failures = [...slice.moduleChecks, ...slice.corpusCases].filter((entry) => (
      entry.status === STATUS_FAIL || entry.status === STATUS_KNOWN_FAILURE
    ));
    if (failures.length > 0) {
      lines.push('', '### Failure Output', '');
      for (const failure of failures) {
        lines.push(`#### ${failure.label}`, '');
        lines.push(`Status: ${statusLabel(failure.status)}${failure.failureKind ? ` (${failure.failureKind})` : ''}`, '');
        lines.push(`Rerun: \`${failure.rerunCommand}\``, '');
        if (failure.knownFailure?.note) {
          lines.push(`Known failure note: ${failure.knownFailure.note}`, '');
        }
        if (failure.failureSummary) {
          lines.push(`Summary: ${failure.failureSummary}`, '');
        }
        const output = [failure.stderrTail, failure.stdoutTail].filter(Boolean).join('\n');
        const failureLines = trimLines(output, 18);
        if (failureLines.length > 0) {
          lines.push('```text', ...failureLines, '```', '');
        }
      }
    }

    lines.push('');
  }

  lines.push(
    '## Machine-Readable Pair',
    '',
    `JSON: \`${report.runner.reportPaths.json}\``,
    '',
  );

  return `${lines.join('\n').trimEnd()}\n`;
}

function selfCheckSetup(status = STATUS_PASS) {
  return {
    id: `self-check-${status}`,
    label: `Self-check ${status}`,
    kind: 'setup',
    status,
    failureKind: status === STATUS_FAIL ? FAILURE_KIND_SETUP : '',
    durationMs: 0,
  };
}

function selfCheckSlice(id, readiness = 'pass') {
  return {
    id,
    label: id,
    status: readiness === 'fail' ? 'fail' : 'pass',
    readiness,
    moduleChecks: [],
    corpusCases: [],
  };
}

function selfCheckCandidateSlice(id, candidateStatus = STATUS_PASS) {
  return {
    id,
    label: id,
    status: candidateStatus === STATUS_FAIL ? 'fail' : 'pass',
    readiness: candidateStatus === STATUS_FAIL ? 'fail' : 'incomplete',
    moduleChecks: [],
    corpusCases: [{
      status: candidateStatus,
      candidateOutcome: true,
      failureKind: candidateStatus === STATUS_FAIL ? FAILURE_KIND_SONIC : '',
    }],
  };
}

function runSelfCheck() {
  let assertions = 0;
  const assert = (condition, message) => {
    assertions += 1;
    if (!condition) throw new Error(`Self-check failed: ${message}`);
  };

  const allSliceIds = sliceDefinitions.map((slice) => slice.id);
  const completePassingReport = {
    runner: { browserCorpus: true, selectedSlices: allSliceIds },
    setupChecks: [selfCheckSetup(), selfCheckSetup()],
    slices: allSliceIds.map((id) => selfCheckSlice(id)),
  };
  const completePassingSummary = summarize(completePassingReport);
  assert(completePassingSummary.status === 'pass', 'complete passing report has pass status');
  assert(completePassingSummary.readiness === 'pass', 'complete passing report has pass readiness');
  assert(completePassingSummary.sliceCoverage === 'complete', 'complete passing report has complete coverage');

  const partialPassingSummary = summarize({
    ...completePassingReport,
    runner: { browserCorpus: true, selectedSlices: ['pad'] },
    slices: [selfCheckSlice('pad')],
  });
  assert(partialPassingSummary.status === 'pass', 'partial passing report still has pass check status');
  assert(partialPassingSummary.readiness === 'incomplete', 'partial passing report cannot claim full readiness');
  assert(partialPassingSummary.sliceCoverage === 'partial', 'partial passing report has partial coverage');

  const skippedBrowserSummary = summarize({
    ...completePassingReport,
    runner: { browserCorpus: false, selectedSlices: allSliceIds },
    setupChecks: [selfCheckSetup(), selfCheckSetup(STATUS_SKIPPED)],
    slices: allSliceIds.map((id) => selfCheckSlice(id, 'incomplete')),
  });
  assert(skippedBrowserSummary.status === 'pass', 'skipped browser report can pass non-browser checks');
  assert(skippedBrowserSummary.readiness === 'incomplete', 'skipped browser report is incomplete');

  const candidateSummary = summarize({
    ...completePassingReport,
    slices: [
      selfCheckSlice('pad'),
      selfCheckCandidateSlice('fx'),
      selfCheckSlice('source'),
      selfCheckSlice('full'),
    ],
  });
  assert(candidateSummary.status === 'pass', 'candidate report can pass checks');
  assert(candidateSummary.readiness === 'incomplete', 'candidate report cannot claim full readiness');
  assert(candidateSummary.checksCandidate === 1, 'candidate report counts candidate checks');

  const failedCandidateSummary = summarize({
    ...completePassingReport,
    slices: [
      selfCheckCandidateSlice('pad', STATUS_FAIL),
      selfCheckSlice('fx'),
      selfCheckSlice('source'),
      selfCheckSlice('full'),
    ],
  });
  assert(failedCandidateSummary.status === 'fail', 'failed candidate case fails overall status');
  assert(failedCandidateSummary.readiness === 'fail', 'failed candidate case fails readiness');
  assert(failedCandidateSummary.checksCandidate === 1, 'failed candidate case is still counted as candidate');
  assert(failedCandidateSummary.checksFailed === 1, 'failed candidate case is still counted as failed');

  const coreOutputKind = classifyFailure(
    { kind: 'corpus' },
    'Sonic parity sonic/core-output failure: core-wasm capture has non-finite core output',
    '',
  );
  assert(coreOutputKind === FAILURE_KIND_CORE_OUTPUT, 'core non-finite output is classified as sonic/core-output');

  const failingSetupSummary = summarize({
    ...completePassingReport,
    setupChecks: [selfCheckSetup(STATUS_FAIL)],
  });
  assert(failingSetupSummary.status === 'fail', 'setup failure fails overall status');
  assert(failingSetupSummary.readiness === 'fail', 'setup failure fails readiness');

  const reruns = buildRerunCommands({ url: DEFAULT_URL }, [sliceDefinitions[0]]);
  assert(reruns.browserCorpus.includes('--slice=pad'), 'selected browser rerun keeps slice filter');
  assert(!reruns.fullBrowserCorpus.includes('--slice='), 'full objective browser rerun has no slice filter');

  console.log(`Readiness runner self-check passed (${assertions} assertions).`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.selfCheck) {
    runSelfCheck();
    return;
  }

  const selectedSlices = sliceDefinitions.filter((slice) => options.slices.has(slice.id));
  const paths = reportPaths(options);
  const startedAt = new Date();
  let managedBrowserServer = null;

  try {
    console.log('KesshoCore staged parity readiness');
    console.log(`Browser corpus: ${options.browserCorpus ? `run against ${options.url}` : 'skipped'}`);
    console.log(`Slices: ${selectedSlices.map((slice) => slice.id).join(', ')}`);
    console.log('\n== Corpus Contract ==');

    process.stdout.write('  Acceptance corpus JSON ... ');
    const corpus = await loadCorpusContract();
    console.log(`${corpus.report.status.toUpperCase()} (${formatDuration(corpus.report.durationMs)})`);

    if (options.browserCorpus && !options.urlProvided) {
      process.stdout.write('  Managed browser server ... ');
      const start = performance.now();
      managedBrowserServer = await startManagedBrowserServer(options.url);
      console.log(`PASS (${formatDuration(Math.round(performance.now() - start))})`);
    }

    process.stdout.write('  Browser corpus URL ... ');
    const browserSetup = await checkBrowserSetup(options);
    console.log(`${browserSetup.status.toUpperCase()} (${formatDuration(browserSetup.durationMs)})`);

    const slices = [];
    for (const slice of selectedSlices) {
      slices.push(await runSlice(slice, options, corpus, browserSetup));
    }

    const finishedAt = new Date();
    const report = {
    schemaVersion: 1,
    generatedAt: finishedAt.toISOString(),
    runner: {
      cwd: root,
      command: commandText([process.execPath, 'scripts/check-kessho-core-parity-readiness.mjs', ...process.argv.slice(2)]),
      browserCorpus: options.browserCorpus,
      url: options.url,
      selectedSlices: selectedSlices.map((slice) => slice.id),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      reportPaths: {
        json: toRelative(paths.json),
        markdown: toRelative(paths.markdown),
      },
      rerunCommands: buildRerunCommands(options, selectedSlices),
    },
    setupChecks: [
      {
        id: corpus.report.id,
        label: corpus.report.label,
        kind: 'setup',
        status: corpus.report.status,
        failureKind: corpus.report.status === STATUS_FAIL ? FAILURE_KIND_SETUP : '',
        command: corpus.report.commandText,
        rerunCommand: corpus.report.rerunCommand ?? corpus.report.commandText,
        exitCode: corpus.report.exitCode,
        signal: null,
        durationMs: corpus.report.durationMs,
        stdoutTail: corpus.report.stdoutTail,
        stderrTail: corpus.report.stderrTail,
        failureSummary: corpus.report.error,
        skipReason: '',
      },
      browserSetup,
    ],
    corpusContract: corpus.report,
    slices,
  };
    report.summary = summarize(report);

    writeReports(report, paths);

    console.log('\n== Summary ==');
    console.log(`  Overall: ${report.summary.status.toUpperCase()} (readiness ${report.summary.readiness.toUpperCase()}, coverage ${report.summary.sliceCoverage.toUpperCase()}, setup pass ${report.summary.setupPassed}, setup fail ${report.summary.setupFailed}, setup skip ${report.summary.setupSkipped})`);
    for (const slice of report.slices) {
      console.log(`  ${slice.label}: ${slice.status.toUpperCase()} (readiness ${slice.readiness.toUpperCase()}, pass ${slice.checksPassed}, fail ${slice.checksFailed}, known fail ${slice.checksKnownFailed}, candidate ${slice.checksCandidate}, skip ${slice.checksSkipped})`);
    }
    console.log(`Reports: ${toRelative(paths.markdown)}, ${toRelative(paths.json)}`);

    if (report.summary.status === 'fail') {
      emitGithubFailureAnnotations(report);
    }

    if (report.summary.status === 'fail' && !options.noFail) {
      process.exitCode = 1;
    }
  } finally {
    await managedBrowserServer?.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
