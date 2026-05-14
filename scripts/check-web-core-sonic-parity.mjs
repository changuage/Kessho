#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_PORT = 4173;
const DEFAULT_DURATION_MS = 3000;
const DEFAULT_SETTLE_MS = 600;
const DEFAULT_RMS_TOLERANCE = 0.04;
const DEFAULT_PEAK_TOLERANCE = 0.25;
const DEFAULT_MIN_SIGNAL_RMS = 0.0001;
const DEFAULT_MAX_LAG_MS = 200;
const DEFAULT_MIN_LAG_CORRELATION = 0.98;
const DEFAULT_MANUAL_TRIGGER_DELAY_MS = 0;
const DEFAULT_CAPTURE_ATTEMPTS = 3;
const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DEFAULT_TRANSIENT_TIME_TOLERANCE_MS = 8;
const DEFAULT_TRANSIENT_PEAK_RATIO_TOLERANCE = 0.35;
const DEFAULT_TRANSIENT_RMS_RATIO_TOLERANCE = 0.35;
const DEFAULT_ENVELOPE_WINDOW_MS = 250;
const DEFAULT_ENVELOPE_TIME_TOLERANCE_MS = 20;
const DEFAULT_ENVELOPE_RMS_RATIO_TOLERANCE = 0.4;
const DEFAULT_ENVELOPE_PEAK_RATIO_TOLERANCE = 0.35;
const EXIT_SONIC_FAILURE = 1;
const EXIT_SETUP_FAILURE = 2;
const MANUAL_NOTE_SOURCES = new Set(['pad1', 'pad2', 'lead1', 'lead2', 'piano']);
const MANUAL_DRUM_VOICES = new Set(['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane']);
const CORE_ENGINE_NAMES = new Set(['core-product', 'core-smoke']);

class SonicParityRunError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'SonicParityRunError';
    this.kind = kind;
  }
}

function parseArgs(argv) {
  const args = {
    url: '',
    port: DEFAULT_PORT,
    durationMs: DEFAULT_DURATION_MS,
    settleMs: DEFAULT_SETTLE_MS,
    rmsTolerance: DEFAULT_RMS_TOLERANCE,
    peakTolerance: DEFAULT_PEAK_TOLERANCE,
    minSignalRms: DEFAULT_MIN_SIGNAL_RMS,
    maxLagMs: DEFAULT_MAX_LAG_MS,
    minLagCorrelation: DEFAULT_MIN_LAG_CORRELATION,
    noFail: false,
    statePatch: {},
    stateEvents: [],
    trackId: 'mix',
    manualNotes: [],
    manualDrumTriggers: [],
    manualTriggerDelayMs: DEFAULT_MANUAL_TRIGGER_DELAY_MS,
    manualWarmup: false,
    alignmentGate: false,
    selfCheck: false,
    printTransients: false,
    transientGate: false,
    transientTimeToleranceMs: DEFAULT_TRANSIENT_TIME_TOLERANCE_MS,
    transientPeakRatioTolerance: DEFAULT_TRANSIENT_PEAK_RATIO_TOLERANCE,
    transientRmsRatioTolerance: DEFAULT_TRANSIENT_RMS_RATIO_TOLERANCE,
    envelopeGate: false,
    envelopeWindowMs: DEFAULT_ENVELOPE_WINDOW_MS,
    envelopeTimeToleranceMs: DEFAULT_ENVELOPE_TIME_TOLERANCE_MS,
    envelopeRmsRatioTolerance: DEFAULT_ENVELOPE_RMS_RATIO_TOLERANCE,
    envelopePeakRatioTolerance: DEFAULT_ENVELOPE_PEAK_RATIO_TOLERANCE,
    coreEngine: 'core-product',
    printDebug: false,
    mobileDevice: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--duration-ms=')) args.durationMs = Number(arg.slice('--duration-ms='.length));
    else if (arg.startsWith('--settle-ms=')) args.settleMs = Number(arg.slice('--settle-ms='.length));
    else if (arg.startsWith('--rms-tolerance=')) args.rmsTolerance = Number(arg.slice('--rms-tolerance='.length));
    else if (arg.startsWith('--peak-tolerance=')) args.peakTolerance = Number(arg.slice('--peak-tolerance='.length));
    else if (arg.startsWith('--min-signal-rms=')) args.minSignalRms = Number(arg.slice('--min-signal-rms='.length));
    else if (arg.startsWith('--max-lag-ms=')) args.maxLagMs = Number(arg.slice('--max-lag-ms='.length));
    else if (arg.startsWith('--min-lag-correlation=')) args.minLagCorrelation = Number(arg.slice('--min-lag-correlation='.length));
    else if (arg.startsWith('--state-patch=')) args.statePatch = JSON.parse(arg.slice('--state-patch='.length));
    else if (arg.startsWith('--state-event=')) args.stateEvents.push(...parseStateEventArg(arg.slice('--state-event='.length)));
    else if (arg.startsWith('--track=')) args.trackId = arg.slice('--track='.length).trim() || 'mix';
    else if (arg.startsWith('--manual-note=')) args.manualNotes.push(...parseManualNoteArg(arg.slice('--manual-note='.length)));
    else if (arg.startsWith('--manual-drum=')) args.manualDrumTriggers.push(...parseManualDrumArg(arg.slice('--manual-drum='.length)));
    else if (arg.startsWith('--manual-trigger-delay-ms=')) args.manualTriggerDelayMs = Number(arg.slice('--manual-trigger-delay-ms='.length));
    else if (arg === '--manual-warmup') args.manualWarmup = true;
    else if (arg === '--manual-no-warmup') args.manualWarmup = false;
    else if (arg === '--alignment-gate') args.alignmentGate = true;
    else if (arg === '--print-transients') args.printTransients = true;
    else if (arg === '--transient-gate') args.transientGate = true;
    else if (arg.startsWith('--transient-time-tolerance-ms=')) args.transientTimeToleranceMs = Number(arg.slice('--transient-time-tolerance-ms='.length));
    else if (arg.startsWith('--transient-peak-ratio-tolerance=')) args.transientPeakRatioTolerance = Number(arg.slice('--transient-peak-ratio-tolerance='.length));
    else if (arg.startsWith('--transient-rms-ratio-tolerance=')) args.transientRmsRatioTolerance = Number(arg.slice('--transient-rms-ratio-tolerance='.length));
    else if (arg === '--envelope-gate') args.envelopeGate = true;
    else if (arg.startsWith('--envelope-window-ms=')) args.envelopeWindowMs = Number(arg.slice('--envelope-window-ms='.length));
    else if (arg.startsWith('--envelope-time-tolerance-ms=')) args.envelopeTimeToleranceMs = Number(arg.slice('--envelope-time-tolerance-ms='.length));
    else if (arg.startsWith('--envelope-rms-ratio-tolerance=')) args.envelopeRmsRatioTolerance = Number(arg.slice('--envelope-rms-ratio-tolerance='.length));
    else if (arg.startsWith('--envelope-peak-ratio-tolerance=')) args.envelopePeakRatioTolerance = Number(arg.slice('--envelope-peak-ratio-tolerance='.length));
    else if (arg.startsWith('--core-engine=')) args.coreEngine = arg.slice('--core-engine='.length).trim();
    else if (arg === '--print-debug') args.printDebug = true;
    else if (arg === '--mobile-device') args.mobileDevice = true;
    else if (arg === '--no-fail') args.noFail = true;
    else if (arg === '--self-check') args.selfCheck = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (!Number.isFinite(args.durationMs) || args.durationMs <= 0) throw new Error('--duration-ms must be a positive number');
  if (!Number.isFinite(args.settleMs) || args.settleMs < 0) throw new Error('--settle-ms must be a non-negative number');
  if (!Number.isFinite(args.rmsTolerance) || args.rmsTolerance < 0) throw new Error('--rms-tolerance must be non-negative');
  if (!Number.isFinite(args.peakTolerance) || args.peakTolerance < 0) throw new Error('--peak-tolerance must be non-negative');
  if (!Number.isFinite(args.minSignalRms) || args.minSignalRms < 0) throw new Error('--min-signal-rms must be non-negative');
  if (!Number.isFinite(args.maxLagMs) || args.maxLagMs < 0) throw new Error('--max-lag-ms must be non-negative');
  if (!Number.isFinite(args.minLagCorrelation) || args.minLagCorrelation < -1 || args.minLagCorrelation > 1) throw new Error('--min-lag-correlation must be between -1 and 1');
  if (!Number.isFinite(args.manualTriggerDelayMs) || args.manualTriggerDelayMs < 0) throw new Error('--manual-trigger-delay-ms must be non-negative');
  if (!Number.isFinite(args.transientTimeToleranceMs) || args.transientTimeToleranceMs < 0) throw new Error('--transient-time-tolerance-ms must be non-negative');
  if (!Number.isFinite(args.transientPeakRatioTolerance) || args.transientPeakRatioTolerance < 0) throw new Error('--transient-peak-ratio-tolerance must be non-negative');
  if (!Number.isFinite(args.transientRmsRatioTolerance) || args.transientRmsRatioTolerance < 0) throw new Error('--transient-rms-ratio-tolerance must be non-negative');
  if (!Number.isFinite(args.envelopeWindowMs) || args.envelopeWindowMs <= 0) throw new Error('--envelope-window-ms must be positive');
  if (!Number.isFinite(args.envelopeTimeToleranceMs) || args.envelopeTimeToleranceMs < 0) throw new Error('--envelope-time-tolerance-ms must be non-negative');
  if (!Number.isFinite(args.envelopeRmsRatioTolerance) || args.envelopeRmsRatioTolerance < 0) throw new Error('--envelope-rms-ratio-tolerance must be non-negative');
  if (!Number.isFinite(args.envelopePeakRatioTolerance) || args.envelopePeakRatioTolerance < 0) throw new Error('--envelope-peak-ratio-tolerance must be non-negative');
  if (!CORE_ENGINE_NAMES.has(args.coreEngine)) throw new Error('--core-engine must be core-product or core-smoke');
  return args;
}

function parseStateEventArg(value) {
  const parsed = JSON.parse(value.trim());
  const events = Array.isArray(parsed) ? parsed : [parsed];
  return events.map((event) => normalizeStateEvent(event, value));
}

function normalizeStateEvent(raw, originalValue) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`--state-event must be a JSON object or JSON array: ${originalValue}`);
  }
  const event = {
    delayMs: Number(raw.delayMs ?? 0),
    patch: raw.patch,
  };
  if (!Number.isFinite(event.delayMs) || event.delayMs < 0) throw new Error(`--state-event delayMs must be non-negative: ${originalValue}`);
  if (!event.patch || typeof event.patch !== 'object' || Array.isArray(event.patch)) throw new Error(`--state-event patch must be an object: ${originalValue}`);
  return event;
}

function parseManualNoteArg(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const notes = Array.isArray(parsed) ? parsed : [parsed];
    return notes.map((note) => normalizeManualNote(note, value));
  }

  return [parseManualNoteShorthand(value)];
}

function parseManualNoteShorthand(value) {
  const [source = 'pad1', midi = '60', velocity = '0.82', durationMs = '900'] = value.split(':');
  return normalizeManualNote({
    source,
    midi: Number(midi),
    velocity: Number(velocity),
    durationMs: Number(durationMs),
  }, value);
}

function normalizeManualNote(raw, originalValue) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`--manual-note must be a JSON object, JSON array, or source:midi:velocity:durationMs shorthand: ${originalValue}`);
  }

  const source = typeof raw.source === 'string' ? raw.source : 'pad1';
  if (!MANUAL_NOTE_SOURCES.has(source)) {
    throw new Error(`--manual-note source must be pad1, pad2, lead1, lead2, or piano: ${originalValue}`);
  }

  const note = {
    source,
    midi: Number(raw.midi ?? 60),
    velocity: Number(raw.velocity ?? 0.82),
    durationMs: Number(raw.durationMs ?? 900),
  };
  if (!Number.isFinite(note.midi) || note.midi < 0) throw new Error(`--manual-note midi must be numeric: ${originalValue}`);
  if (!Number.isFinite(note.velocity) || note.velocity < 0) throw new Error(`--manual-note velocity must be numeric: ${originalValue}`);
  if (!Number.isFinite(note.durationMs) || note.durationMs <= 0) throw new Error(`--manual-note durationMs must be positive: ${originalValue}`);
  return note;
}

function parseManualDrumArg(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    const triggers = Array.isArray(parsed) ? parsed : [parsed];
    return triggers.map((trigger) => normalizeManualDrumTrigger(trigger, value));
  }
  const [voice = 'kick', velocity = '0.8', delayMs = '0'] = value.split(':');
  return [normalizeManualDrumTrigger({
    voice,
    velocity: Number(velocity),
    delayMs: Number(delayMs),
  }, value)];
}

function normalizeManualDrumTrigger(raw, originalValue) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`--manual-drum must be a JSON object, JSON array, or voice:velocity:delayMs shorthand: ${originalValue}`);
  }
  const voice = typeof raw.voice === 'number' ? raw.voice : String(raw.voice ?? 'kick');
  if (typeof voice === 'string' && !MANUAL_DRUM_VOICES.has(voice)) {
    throw new Error(`--manual-drum voice must be sub, kick, click, beepHi, beepLo, noise, or membrane: ${originalValue}`);
  }
  const trigger = {
    voice,
    velocity: Number(raw.velocity ?? 0.8),
    delayMs: Number(raw.delayMs ?? 0),
  };
  if (!Number.isFinite(trigger.velocity) || trigger.velocity < 0) throw new Error(`--manual-drum velocity must be numeric: ${originalValue}`);
  if (!Number.isFinite(trigger.delayMs) || trigger.delayMs < 0) throw new Error(`--manual-drum delayMs must be non-negative: ${originalValue}`);
  return trigger;
}

function printHelp() {
  console.log(`Usage: node scripts/check-web-core-sonic-parity.mjs [options]

Options:
  --url=http://127.0.0.1:4173  Connect to an existing Vite server instead of launching one
  --port=4173                  Port to use when launching Vite
  --duration-ms=3000           Capture duration per engine
  --settle-ms=600              Time to let the graph settle before capture
  --state-patch='{"synthLevel":0.8}'  JSON merged into the current App slider state for both engines
  --state-event='{"delayMs":300,"patch":{"spectralFreezeActive":true}}'
                                Timed state update applied during capture; repeatable
  --track=mix                   Capture mix, reverb, or delayAOut. Default: mix
  --manual-note='{"source":"pad1","midi":60,"velocity":1,"durationMs":1200}'
  --manual-drum=kick:1:0        Trigger a drum voice after manual notes; fields are voice:velocity:delayMs
                                Trigger deterministic note(s) from recorder/capture start.
                                Also accepts pad1:60:0.82:900 shorthand and repeated flags.
  --manual-trigger-delay-ms=0   Optional recorder warm-up before clearing the tap and triggering manual note(s)
  --manual-warmup               Opt into a low-velocity pre-capture note. Default is off to avoid long release tails
  --manual-no-warmup            Keep pre-capture manual-note warmup disabled
  --alignment-gate              Gate self-running captures on best/onset-aligned buffers instead of raw frame zero
  --print-transients            Print first transient start/peak summaries for web and core captures
  --transient-gate              Gate self-running captures by transient count/timing/level instead of sample waveform diff
  --transient-time-tolerance-ms=8       Maximum paired transient residual start-time delta after global phase offset
  --transient-peak-ratio-tolerance=0.35 Maximum relative paired transient peak delta
  --transient-rms-ratio-tolerance=0.35  Maximum relative paired transient RMS delta
  --envelope-gate             Gate feedback-heavy captures by onset and windowed RMS/peak envelope
  --envelope-window-ms=250    Envelope comparison window size
  --envelope-time-tolerance-ms=20       Maximum first-signal delta for envelope gate
  --envelope-rms-ratio-tolerance=0.4    Maximum relative RMS delta per active envelope window
  --envelope-peak-ratio-tolerance=0.35  Maximum relative peak delta per active envelope window
  --core-engine=core-product      Core runtime to compare against Web: core-product or core-smoke
  --mobile-device              Emulate a mobile browser user agent for platform-dependent graph choices
  --rms-tolerance=0.04         Maximum normalized RMS difference
  --peak-tolerance=0.25        Maximum peak absolute sample difference
  --min-signal-rms=0.0001      Minimum reference Web RMS required to avoid silent false passes
  --max-lag-ms=200             Maximum lag search/correction window
  --min-lag-correlation=0.98   Minimum onset-corrected correlation for manual-note gate
  --print-debug                Print optional engine debug snapshots when available
  --no-fail                    Print comparison without failing on threshold mismatch
  --self-check                 Run no-browser comparator/classification invariants

Exit codes:
  0 pass, or sonic failure suppressed by --no-fail
  1 sonic threshold failure
  2 setup/capture/browser failure
`);
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    if (!mod.chromium) throw new Error('The playwright package did not expose chromium.');
    return mod;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Playwright is required for browser sonic parity capture but is not available (${detail}).\n` +
        'Install it with `npm install -D playwright` and install a browser with `npx playwright install chromium`, then rerun this script.',
    );
  }
}

function withQuery(baseUrl, query) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
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

async function startVite(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForHttp(url, 30000);
  } catch (error) {
    child.kill();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nVite output:\n${output.trim()}`);
  }

  return {
    url,
    stop: async () => {
      child.kill();
      await delay(250);
    },
  };
}

function isTransientCaptureError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Execution context was destroyed') ||
    message.includes('No execution context available') ||
    message.includes('AudioWorkletNode cannot be created');
}

function isBlockingBrowserLog(entry) {
  return entry.startsWith('[error]') ||
    entry.startsWith('[pageerror]') ||
    entry.startsWith('[response]') ||
    entry.startsWith('[requestfailed]');
}

function collectBlockingBrowserLogs(web, core, coreLabel = 'core-product') {
  const logs = [];
  for (const [label, result] of [['web', web], [coreLabel, core]]) {
    for (const entry of result.logs) {
      if (isBlockingBrowserLog(entry)) logs.push(`${label}: ${entry}`);
    }
  }
  return logs;
}

async function captureEngine(browser, baseUrl, engineName, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      const result = await captureEngineOnce(browser, baseUrl, engineName, options);
      if (attempt > 1) {
        result.logs.unshift(`[retry] ${engineName} capture succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_CAPTURE_ATTEMPTS || !isTransientCaptureError(error)) break;
      await delay(500);
    }
  }
  throw lastError;
}

async function captureEngineOnce(browser, baseUrl, engineName, options) {
  const page = await browser.newPage(options.mobileDevice
    ? {
        userAgent: MOBILE_USER_AGENT,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      }
    : undefined);
  const logs = [];
  page.on('console', (message) => {
    const text = message.text();
    const location = message.location();
    const locationSuffix = location.url
      ? ` @ ${location.url}${location.lineNumber ? `:${location.lineNumber}` : ''}`
      : '';
    if (message.type() === 'error' || text.includes('Sonic parity')) {
      logs.push(`[${message.type()}] ${text}${locationSuffix}`);
    }
  });
  page.on('pageerror', (error) => {
    logs.push(`[pageerror] ${error.message}`);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    logs.push(`[response] ${status} ${request.method()} ${request.resourceType()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const detail = failure?.errorText ? ` ${failure.errorText}` : '';
    logs.push(`[requestfailed] ${request.method()} ${request.resourceType()} ${request.url()}${detail}`);
  });

  const runtimeQuery = {
    engine: engineName,
    parity: '1',
  };
  const url = withQuery(baseUrl, runtimeQuery);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 15000 });

    const capture = await page.evaluate(
      async ({ durationMs, settleMs, trackId, statePatch, stateEvents, manualNotes, manualDrumTriggers, manualTriggerDelayMs, manualWarmup }) => window.__kesshoSonicParity.capture({
        durationMs,
        settleMs,
        trackId,
        statePatch,
        stateEvents,
        manualNotes,
        manualDrumTriggers,
        manualTriggerDelayMs,
        manualWarmup,
      }),
      {
        durationMs: options.durationMs,
        settleMs: options.settleMs,
        trackId: options.trackId,
        statePatch: options.statePatch,
        stateEvents: options.stateEvents,
        manualNotes: options.manualNotes,
        manualDrumTriggers: options.manualDrumTriggers,
        manualTriggerDelayMs: options.manualTriggerDelayMs,
        manualWarmup: options.manualWarmup,
      },
    );
    await page.evaluate(() => window.__kesshoSonicParity?.teardown());
    return { capture, logs };
  } finally {
    await page.close().catch(() => {});
  }
}

function compareCaptures(web, core, options = {}) {
  const coreLabel = options.coreLabel ?? 'core-product';
  if (web.sampleRate !== core.sampleRate) {
    throw new Error(`Sample-rate mismatch: web=${web.sampleRate}, ${coreLabel}=${core.sampleRate}`);
  }

  const webExpectedFrames = expectedCaptureFrames(web);
  const coreExpectedFrames = expectedCaptureFrames(core);
  if (webExpectedFrames !== coreExpectedFrames) {
    throw new Error(`Expected capture length mismatch: web=${webExpectedFrames}, ${coreLabel}=${coreExpectedFrames}`);
  }

  const frames = webExpectedFrames;
  if (frames <= 0) {
    throw new Error(`No captured frames: web=${web.frames}, ${coreLabel}=${core.frames}`);
  }

  const raw = compareAtLag(web, core, frames, 0);
  const maxLagMs = options.maxLagMs ?? DEFAULT_MAX_LAG_MS;
  const maxLagFrames = Math.min(frames - 1, Math.round((maxLagMs / 1000) * web.sampleRate));
  const webFirstSignalMs = firstSignalMs(web, frames);
  const coreFirstSignalMs = firstSignalMs(core, frames);
  const bestLag = findBestLagCorrelation(web, core, frames, maxLagMs);
  const onsetLag = firstSignalLag(web, core, frames, maxLagFrames, webFirstSignalMs, coreFirstSignalMs);
  const alignmentLag = options.preferFirstSignalLag && onsetLag
    ? chooseAlignmentLag(web, core, frames, [onsetLag, bestLag])
    : bestLag;
  const aligned = compareAtLag(web, core, frames, alignmentLag.lagFrames);

  return {
    frames,
    sampleRate: web.sampleRate,
    durationSeconds: frames / web.sampleRate,
    rmsDiff: raw.rmsDiff,
    normalizedRmsDiff: raw.normalizedRmsDiff,
    peakDiff: raw.peakDiff,
    correlation: raw.correlation,
    raw,
    aligned,
    bestLag,
    onsetLag,
    alignmentLag,
    alignmentSource: onsetLag && alignmentLag.lagFrames === onsetLag.lagFrames ? 'first-signal' : 'correlation',
    webFirstSignalMs,
    coreFirstSignalMs,
    webStats: web.stats,
    coreStats: core.stats,
  };
}

function expectedCaptureFrames(capture) {
  if (
    Number.isFinite(capture.durationMs) &&
    capture.durationMs > 0 &&
    Number.isFinite(capture.sampleRate) &&
    capture.sampleRate > 0
  ) {
    return Math.max(1, Math.round((capture.durationMs / 1000) * capture.sampleRate));
  }
  return Number.isFinite(capture.frames) ? capture.frames : 0;
}

function validateCapture(label, capture) {
  const setupIssues = [];
  const coreOutputIssues = [];
  const addNonFiniteIssue = (message) => {
    if (label !== 'web') coreOutputIssues.push(message);
    else setupIssues.push(message);
  };
  if (!capture || typeof capture !== 'object') {
    throw new SonicParityRunError('setup', `${label} capture returned no object.`);
  }

  if (!Number.isFinite(capture.sampleRate) || capture.sampleRate <= 0) {
    setupIssues.push(`invalid sampleRate=${capture.sampleRate}`);
  }
  if (!Number.isFinite(capture.frames) || capture.frames <= 0) {
    setupIssues.push(`invalid frames=${capture.frames}`);
  }
  if (!Number.isFinite(capture.durationMs) || capture.durationMs <= 0) {
    setupIssues.push(`invalid durationMs=${capture.durationMs}`);
  }

  if (!capture.stats || typeof capture.stats !== 'object') {
    setupIssues.push('stats is not an object');
  } else {
    for (const key of ['rms', 'peak', 'mean', 'dc']) {
      const value = capture.stats[key];
      if (typeof value !== 'number') {
        setupIssues.push(`stats.${key} is not numeric (${value})`);
      } else if (!Number.isFinite(value)) {
        addNonFiniteIssue(`non-finite stats.${key}=${value}`);
      }
    }
  }

  for (const channelName of ['left', 'right']) {
    const channel = capture[channelName];
    if (!Array.isArray(channel)) {
      setupIssues.push(`${channelName} is not an array`);
      continue;
    }
    if (Number.isFinite(capture.frames) && channel.length < capture.frames) {
      setupIssues.push(`${channelName} length ${channel.length} < frames ${capture.frames}`);
    }
    for (let index = 0; index < channel.length; index += 1) {
      if (!Number.isFinite(channel[index])) {
        addNonFiniteIssue(`${channelName}[${index}] is non-finite (${channel[index]})`);
        break;
      }
    }
  }

  if (setupIssues.length > 0) {
    throw new SonicParityRunError('setup', `${label} capture is invalid: ${setupIssues.join('; ')}`);
  }
  if (coreOutputIssues.length > 0) {
    throw new SonicParityRunError(
      'sonic/core-output',
      `Sonic parity sonic/core-output failure: ${label} capture has non-finite core output: ${coreOutputIssues.join('; ')}`,
    );
  }
}

function chooseAlignmentLag(web, core, frames, candidates) {
  let selected = candidates[0];
  let selectedMetrics = compareAtLag(web, core, frames, selected.lagFrames);
  for (const candidate of candidates.slice(1)) {
    const metrics = compareAtLag(web, core, frames, candidate.lagFrames);
    if (
      metrics.normalizedRmsDiff < selectedMetrics.normalizedRmsDiff ||
      (
        Math.abs(metrics.normalizedRmsDiff - selectedMetrics.normalizedRmsDiff) <= 1e-9 &&
        metrics.correlation > selectedMetrics.correlation
      )
    ) {
      selected = candidate;
      selectedMetrics = metrics;
    }
  }
  return selected;
}

function compareAtLag(web, core, frames, lagFrames) {
  let diffSquares = 0;
  let signalSquares = 0;
  let peakDiff = 0;
  let sumWeb = 0;
  let sumCore = 0;
  let sumWebSquares = 0;
  let sumCoreSquares = 0;
  let sumCross = 0;
  let count = 0;

  const start = Math.max(0, lagFrames);
  const end = Math.min(frames, frames + lagFrames);
  for (let channel = 0; channel < 2; channel += 1) {
    const webChannel = channel === 0 ? web.left : web.right;
    const coreChannel = channel === 0 ? core.left : core.right;
    for (let webIndex = start; webIndex < end; webIndex += 1) {
      const coreIndex = webIndex - lagFrames;
      const webSample = webChannel[webIndex] ?? 0;
      const coreSample = coreChannel[coreIndex] ?? 0;
      const diff = webSample - coreSample;
      diffSquares += diff * diff;
      signalSquares += webSample * webSample;
      peakDiff = Math.max(peakDiff, Math.abs(diff));
      sumWeb += webSample;
      sumCore += coreSample;
      sumWebSquares += webSample * webSample;
      sumCoreSquares += coreSample * coreSample;
      sumCross += webSample * coreSample;
      count += 1;
    }
  }

  const rmsDiff = count > 0 ? Math.sqrt(diffSquares / count) : 0;
  const signalRms = count > 0 ? Math.sqrt(signalSquares / count) : 0;
  const normalizedRmsDiff = signalRms > 1e-9 ? rmsDiff / signalRms : rmsDiff;
  const covariance = count > 1 ? sumCross - (sumWeb * sumCore) / count : 0;
  const varianceWeb = count > 1 ? sumWebSquares - (sumWeb * sumWeb) / count : 0;
  const varianceCore = count > 1 ? sumCoreSquares - (sumCore * sumCore) / count : 0;
  const correlation = varianceWeb > 0 && varianceCore > 0
    ? covariance / Math.sqrt(varianceWeb * varianceCore)
    : 0;

  return {
    lagFrames,
    lagMs: (lagFrames / web.sampleRate) * 1000,
    overlapFrames: Math.max(0, end - start),
    overlapSeconds: Math.max(0, end - start) / web.sampleRate,
    rmsDiff,
    normalizedRmsDiff,
    peakDiff,
    correlation,
  };
}

function correlationAtLag(web, core, frames, lagFrames, stepFrames) {
  let sumWeb = 0;
  let sumCore = 0;
  let sumWebSquares = 0;
  let sumCoreSquares = 0;
  let sumCross = 0;
  let count = 0;

  const start = Math.max(0, lagFrames);
  const end = Math.min(frames, frames + lagFrames);
  for (let channel = 0; channel < 2; channel += 1) {
    const webChannel = channel === 0 ? web.left : web.right;
    const coreChannel = channel === 0 ? core.left : core.right;
    for (let webIndex = start; webIndex < end; webIndex += stepFrames) {
      const coreIndex = webIndex - lagFrames;
      const webSample = webChannel[webIndex] ?? 0;
      const coreSample = coreChannel[coreIndex] ?? 0;
      sumWeb += webSample;
      sumCore += coreSample;
      sumWebSquares += webSample * webSample;
      sumCoreSquares += coreSample * coreSample;
      sumCross += webSample * coreSample;
      count += 1;
    }
  }

  if (count <= 1) return 0;
  const covariance = sumCross - (sumWeb * sumCore) / count;
  const varianceWeb = sumWebSquares - (sumWeb * sumWeb) / count;
  const varianceCore = sumCoreSquares - (sumCore * sumCore) / count;
  return varianceWeb > 0 && varianceCore > 0
    ? covariance / Math.sqrt(varianceWeb * varianceCore)
    : 0;
}

function findBestLagCorrelation(web, core, frames, maxLagMs = DEFAULT_MAX_LAG_MS) {
  const maxLagFrames = Math.min(frames - 1, Math.round((maxLagMs / 1000) * web.sampleRate));
  const stepFrames = Math.max(1, Math.round(web.sampleRate / 3000));
  const lagStepFrames = Math.max(1, Math.round(web.sampleRate / 2000));
  let best = { lagFrames: 0, lagMs: 0, correlation: correlationAtLag(web, core, frames, 0, stepFrames) };

  for (let lagFrames = -maxLagFrames; lagFrames <= maxLagFrames; lagFrames += lagStepFrames) {
    const correlation = correlationAtLag(web, core, frames, lagFrames, stepFrames);
    if (correlation > best.correlation) {
      best = {
        lagFrames,
        lagMs: (lagFrames / web.sampleRate) * 1000,
        correlation,
      };
    }
  }

  const refineStart = Math.max(-maxLagFrames, best.lagFrames - lagStepFrames);
  const refineEnd = Math.min(maxLagFrames, best.lagFrames + lagStepFrames);
  best = {
    ...best,
    correlation: correlationAtLag(web, core, frames, best.lagFrames, 1),
  };
  for (let lagFrames = refineStart; lagFrames <= refineEnd; lagFrames += 1) {
    const correlation = correlationAtLag(web, core, frames, lagFrames, 1);
    if (correlation > best.correlation) {
      best = {
        lagFrames,
        lagMs: (lagFrames / web.sampleRate) * 1000,
        correlation,
      };
    }
  }

  return best;
}

function firstSignalLag(web, core, frames, maxLagFrames, webFirstSignalMs, coreFirstSignalMs) {
  if (webFirstSignalMs === null || coreFirstSignalMs === null) return null;
  const lagFrames = Math.max(
    -maxLagFrames,
    Math.min(maxLagFrames, Math.round(((webFirstSignalMs - coreFirstSignalMs) / 1000) * web.sampleRate)),
  );
  return {
    lagFrames,
    lagMs: (lagFrames / web.sampleRate) * 1000,
    correlation: correlationAtLag(web, core, frames, lagFrames, 1),
  };
}

function firstSignalMs(capture, frames, threshold = DEFAULT_MIN_SIGNAL_RMS) {
  for (let index = 0; index < frames; index += 1) {
    const left = Math.abs(capture.left[index] ?? 0);
    const right = Math.abs(capture.right[index] ?? 0);
    if (Math.max(left, right) >= threshold) {
      return (index / capture.sampleRate) * 1000;
    }
  }
  return null;
}

function formatNumber(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function formatNullableMs(value) {
  return value === null ? 'none' : `${formatNumber(value, 2)}ms`;
}

function formatLagDirection(lagMs) {
  if (Math.abs(lagMs) < 0.01) return 'no measurable lead';
  return lagMs > 0
    ? `core leads web by ${formatNumber(lagMs, 2)}ms`
    : `web leads core by ${formatNumber(Math.abs(lagMs), 2)}ms`;
}

function formatManualNote(note) {
  return `${note.source}:midi=${formatNumber(note.midi, 0)} velocity=${formatNumber(note.velocity, 3)} duration=${formatNumber(note.durationMs, 0)}ms`;
}

function formatManualMetadata(result) {
  const meta = result.capture.manual;
  if (!meta?.enabled) return 'not enabled';
  const warmupWindowMs = meta.warmupStartContextTime !== null && meta.warmupEndContextTime !== null
    ? (meta.warmupEndContextTime - meta.warmupStartContextTime) * 1000
    : null;
  const triggerWindowMs = meta.triggerStartContextTime !== null && meta.triggerEndContextTime !== null
    ? (meta.triggerEndContextTime - meta.triggerStartContextTime) * 1000
    : null;
  return `warmup=${meta.warmedUp ? formatNullableMs(warmupWindowMs) : 'off'}, pre-trigger cleared=${meta.preTriggerFrames} frames, trigger command window=${formatNullableMs(triggerWindowMs)}`;
}

function compareTransientSummaries(webCapture, coreCapture, args) {
  const webTransients = summarizeTransients(webCapture);
  const coreTransients = summarizeTransients(coreCapture);
  const issues = [];
  if (webTransients.length !== coreTransients.length) {
    issues.push(`transient count mismatch web=${webTransients.length} core=${coreTransients.length}`);
  }

  const pairCount = Math.min(webTransients.length, coreTransients.length);
  const startOffsetsMs = [];
  for (let index = 0; index < pairCount; index += 1) {
    startOffsetsMs.push(coreTransients[index].startMs - webTransients[index].startMs);
  }
  const sortedOffsets = [...startOffsetsMs].sort((left, right) => left - right);
  const mid = Math.floor(sortedOffsets.length / 2);
  const globalStartOffsetMs = sortedOffsets.length === 0
    ? 0
    : sortedOffsets.length % 2 === 0
      ? ((sortedOffsets[mid - 1] ?? 0) + (sortedOffsets[mid] ?? 0)) / 2
      : sortedOffsets[mid] ?? 0;
  let maxStartDeltaMs = 0;
  let maxPeakRatioDelta = 0;
  let maxRmsRatioDelta = 0;
  for (let index = 0; index < pairCount; index += 1) {
    const webTransient = webTransients[index];
    const coreTransient = coreTransients[index];
    const startDeltaMs = Math.abs((coreTransient.startMs - globalStartOffsetMs) - webTransient.startMs);
    const peakRatioDelta = Math.abs(coreTransient.peak - webTransient.peak) / Math.max(Math.abs(webTransient.peak), 1e-9);
    const rmsRatioDelta = Math.abs(coreTransient.rms - webTransient.rms) / Math.max(Math.abs(webTransient.rms), 1e-9);
    maxStartDeltaMs = Math.max(maxStartDeltaMs, startDeltaMs);
    maxPeakRatioDelta = Math.max(maxPeakRatioDelta, peakRatioDelta);
    maxRmsRatioDelta = Math.max(maxRmsRatioDelta, rmsRatioDelta);
  }

  if (maxStartDeltaMs > args.transientTimeToleranceMs) {
    issues.push(`max transient start delta ${formatNumber(maxStartDeltaMs, 2)}ms exceeds ${formatNumber(args.transientTimeToleranceMs, 2)}ms`);
  }
  if (maxPeakRatioDelta > args.transientPeakRatioTolerance) {
    issues.push(`max transient peak ratio delta ${formatNumber(maxPeakRatioDelta)} exceeds ${formatNumber(args.transientPeakRatioTolerance)}`);
  }
  if (maxRmsRatioDelta > args.transientRmsRatioTolerance) {
    issues.push(`max transient RMS ratio delta ${formatNumber(maxRmsRatioDelta)} exceeds ${formatNumber(args.transientRmsRatioTolerance)}`);
  }

  return {
    passed: issues.length === 0,
    issues,
    webTransients,
    coreTransients,
    globalStartOffsetMs,
    maxStartDeltaMs,
    maxPeakRatioDelta,
    maxRmsRatioDelta,
  };
}

function windowEnvelope(capture, startFrame, windowFrames) {
  const endFrame = Math.min(expectedCaptureFrames(capture), startFrame + windowFrames);
  let sumSq = 0;
  let peak = 0;
  let count = 0;
  for (let index = startFrame; index < endFrame; index += 1) {
    const left = capture.left[index] ?? 0;
    const right = capture.right[index] ?? 0;
    sumSq += left * left + right * right;
    peak = Math.max(peak, Math.abs(left), Math.abs(right));
    count += 2;
  }
  return {
    rms: count > 0 ? Math.sqrt(sumSq / count) : 0,
    peak,
  };
}

function shiftedWindowEnvelope(capture, webStartFrame, windowFrames, lagFrames) {
  const coreStartFrame = webStartFrame - lagFrames;
  const frames = expectedCaptureFrames(capture);
  if (coreStartFrame >= frames || coreStartFrame + windowFrames <= 0) {
    return { rms: 0, peak: 0 };
  }
  return windowEnvelope(capture, Math.max(0, coreStartFrame), windowFrames);
}

function compareEnvelopeSummaries(webCapture, coreCapture, comparison, args) {
  const issues = [];
  const frames = comparison.frames;
  const windowFrames = Math.max(1, Math.round((args.envelopeWindowMs / 1000) * comparison.sampleRate));
  const lagFrames = comparison.onsetLag?.lagFrames ?? 0;
  const activeThreshold = Math.max(args.minSignalRms * 10, 0.001);
  const firstSignalDeltaMs = comparison.webFirstSignalMs !== null && comparison.coreFirstSignalMs !== null
    ? Math.abs(comparison.coreFirstSignalMs - comparison.webFirstSignalMs)
    : Infinity;
  let activeWindows = 0;
  let maxRmsRatioDelta = 0;
  let maxPeakRatioDelta = 0;
  let maxRmsAbsDelta = 0;
  let maxPeakAbsDelta = 0;
  let maxWindowStartMs = 0;
  const rmsAbsTolerance = Math.max(args.minSignalRms * 25, comparison.webStats.rms * 0.02);
  const peakAbsTolerance = Math.max(args.minSignalRms * 80, comparison.webStats.peak * 0.05);

  for (let startFrame = 0; startFrame < frames; startFrame += windowFrames) {
    const webWindow = windowEnvelope(webCapture, startFrame, windowFrames);
    const coreWindow = shiftedWindowEnvelope(coreCapture, startFrame, windowFrames, lagFrames);
    if (webWindow.rms < activeThreshold && coreWindow.rms < activeThreshold) continue;
    const rmsAbsDelta = Math.abs(coreWindow.rms - webWindow.rms);
    const peakAbsDelta = Math.abs(coreWindow.peak - webWindow.peak);
    const rmsRatioDelta = rmsAbsDelta / Math.max(Math.abs(webWindow.rms), 1e-9);
    const peakRatioDelta = peakAbsDelta / Math.max(Math.abs(webWindow.peak), 1e-9);
    activeWindows += 1;
    maxRmsAbsDelta = Math.max(maxRmsAbsDelta, rmsAbsDelta);
    maxPeakAbsDelta = Math.max(maxPeakAbsDelta, peakAbsDelta);
    if (rmsRatioDelta > maxRmsRatioDelta) {
      maxRmsRatioDelta = rmsRatioDelta;
      maxWindowStartMs = (startFrame / comparison.sampleRate) * 1000;
    }
    maxPeakRatioDelta = Math.max(maxPeakRatioDelta, peakRatioDelta);
  }

  const totalRmsRatioDelta = Math.abs(comparison.coreStats.rms - comparison.webStats.rms) /
    Math.max(Math.abs(comparison.webStats.rms), 1e-9);
  const totalPeakRatioDelta = Math.abs(comparison.coreStats.peak - comparison.webStats.peak) /
    Math.max(Math.abs(comparison.webStats.peak), 1e-9);

  if (activeWindows === 0) {
    issues.push(`no active envelope windows above RMS ${formatNumber(activeThreshold)}`);
  }
  if (firstSignalDeltaMs > args.envelopeTimeToleranceMs) {
    issues.push(`first-signal delta ${formatNumber(firstSignalDeltaMs, 2)}ms exceeds ${formatNumber(args.envelopeTimeToleranceMs, 2)}ms`);
  }
  if (totalRmsRatioDelta > args.envelopeRmsRatioTolerance) {
    issues.push(`total RMS ratio delta ${formatNumber(totalRmsRatioDelta)} exceeds ${formatNumber(args.envelopeRmsRatioTolerance)}`);
  }
  if (totalPeakRatioDelta > args.envelopePeakRatioTolerance) {
    issues.push(`total peak ratio delta ${formatNumber(totalPeakRatioDelta)} exceeds ${formatNumber(args.envelopePeakRatioTolerance)}`);
  }
  if (maxRmsRatioDelta > args.envelopeRmsRatioTolerance && maxRmsAbsDelta > rmsAbsTolerance) {
    issues.push(`max window RMS ratio delta ${formatNumber(maxRmsRatioDelta)} at ${formatNumber(maxWindowStartMs, 2)}ms exceeds ${formatNumber(args.envelopeRmsRatioTolerance)} with abs delta ${formatNumber(maxRmsAbsDelta)} > ${formatNumber(rmsAbsTolerance)}`);
  }
  if (maxPeakRatioDelta > args.envelopePeakRatioTolerance && maxPeakAbsDelta > peakAbsTolerance) {
    issues.push(`max window peak ratio delta ${formatNumber(maxPeakRatioDelta)} exceeds ${formatNumber(args.envelopePeakRatioTolerance)} with abs delta ${formatNumber(maxPeakAbsDelta)} > ${formatNumber(peakAbsTolerance)}`);
  }

  return {
    passed: issues.length === 0,
    issues,
    activeWindows,
    firstSignalDeltaMs,
    totalRmsRatioDelta,
    totalPeakRatioDelta,
    maxRmsRatioDelta,
    maxPeakRatioDelta,
    maxRmsAbsDelta,
    maxPeakAbsDelta,
    rmsAbsTolerance,
    peakAbsTolerance,
    maxWindowStartMs,
    windowMs: args.envelopeWindowMs,
  };
}

function buildFailureReasons({ comparison, gateMetrics, args, manualMode, web, core }) {
  const reasons = [];
  const coreLabel = args.coreEngine ?? 'core-product';
  const hasReferenceSignal = comparison.webStats.rms >= args.minSignalRms;
  const hasCoreSignal = comparison.coreStats.rms >= args.minSignalRms;
  const transientComparison = args.transientGate && !manualMode
    ? compareTransientSummaries(web.capture, core.capture, args)
    : null;
  const envelopeComparison = args.envelopeGate
    ? compareEnvelopeSummaries(web.capture, core.capture, comparison, args)
    : null;

  if (!hasReferenceSignal) {
    reasons.push({
      kind: 'setup',
      message: `reference Web RMS ${formatNumber(comparison.webStats.rms)} is below min-signal ${formatNumber(args.minSignalRms)}; the case did not produce a usable Web reference capture`,
    });
  } else if (!hasCoreSignal) {
    reasons.push({
      kind: 'sonic',
      message: `${coreLabel} RMS ${formatNumber(comparison.coreStats.rms)} is below min-signal ${formatNumber(args.minSignalRms)} while Web RMS is ${formatNumber(comparison.webStats.rms)}; the enabled core route may be silent`,
    });
  }

  if (envelopeComparison) {
    if (!envelopeComparison.passed) {
      reasons.push({
        kind: 'sonic',
        message: `envelope gate failed: ${envelopeComparison.issues.join('; ')}`,
      });
    }
  } else if (transientComparison) {
    if (!transientComparison.passed) {
      reasons.push({
        kind: 'sonic',
        message: `transient gate failed: ${transientComparison.issues.join('; ')}`,
      });
    }
  } else {
    if (gateMetrics.normalizedRmsDiff > args.rmsTolerance) {
      reasons.push({
        kind: 'sonic',
        message: `${manualMode ? 'aligned ' : ''}normalized RMS ${formatNumber(gateMetrics.normalizedRmsDiff)} exceeds tolerance ${formatNumber(args.rmsTolerance)}`,
      });
    }
    if (gateMetrics.peakDiff > args.peakTolerance) {
      reasons.push({
        kind: 'sonic',
        message: `${manualMode ? 'aligned ' : ''}peak diff ${formatNumber(gateMetrics.peakDiff)} exceeds tolerance ${formatNumber(args.peakTolerance)}`,
      });
    }
  }
  const alignmentGate = manualMode || args.alignmentGate;
  if (!envelopeComparison && alignmentGate && Math.abs(comparison.alignmentLag.lagMs) > args.maxLagMs) {
    reasons.push({
      kind: 'sonic',
      message: `alignment lag ${formatNumber(Math.abs(comparison.alignmentLag.lagMs), 2)}ms exceeds max ${formatNumber(args.maxLagMs, 2)}ms`,
    });
  }
  if (!envelopeComparison && alignmentGate && comparison.aligned.correlation < args.minLagCorrelation) {
    reasons.push({
      kind: 'sonic',
      message: `aligned correlation ${formatNumber(comparison.aligned.correlation)} is below minimum ${formatNumber(args.minLagCorrelation)}`,
    });
  }

  const blockingLogs = collectBlockingBrowserLogs(web, core, coreLabel);
  for (const entry of blockingLogs) {
    reasons.push({
      kind: 'setup',
      message: `blocking browser log: ${entry}`,
    });
  }

  return reasons;
}

function summarizeFailureKind(reasons) {
  return reasons.some((reason) => reason.kind === 'setup') ? 'setup' : 'sonic';
}

function statsForSamples(left, right) {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  const sampleCount = (left.length + right.length) || 1;
  for (let index = 0; index < left.length; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
    sumSquares += leftSample * leftSample + rightSample * rightSample;
    sum += leftSample + rightSample;
  }
  const mean = sum / sampleCount;
  return {
    peak,
    rms: Math.sqrt(sumSquares / sampleCount),
    mean,
    dc: Math.abs(mean),
  };
}

function summarizeTransients(capture, { limit = 12, threshold = 0.02 } = {}) {
  const transients = [];
  const sampleRate = capture.sampleRate;
  const frames = expectedCaptureFrames(capture);
  const releaseFrames = Math.max(1, Math.round(sampleRate * 0.03));
  let active = false;
  let startFrame = 0;
  let peakFrame = 0;
  let peak = 0;
  let energy = 0;
  let belowFrames = 0;

  for (let index = 0; index < frames; index += 1) {
    const left = capture.left[index] ?? 0;
    const right = capture.right[index] ?? 0;
    const magnitude = Math.max(Math.abs(left), Math.abs(right));
    if (!active && magnitude >= threshold) {
      active = true;
      startFrame = index;
      peakFrame = index;
      peak = magnitude;
      energy = 0;
      belowFrames = 0;
    }
    if (!active) continue;

    energy += left * left + right * right;
    if (magnitude > peak) {
      peak = magnitude;
      peakFrame = index;
    }
    belowFrames = magnitude < threshold * 0.25 ? belowFrames + 1 : 0;
    if (belowFrames < releaseFrames && index < frames - 1) continue;

    const transientFrames = Math.max(1, index - startFrame + 1);
    transients.push({
      startMs: (startFrame / sampleRate) * 1000,
      peakMs: (peakFrame / sampleRate) * 1000,
      peak,
      rms: Math.sqrt(energy / (transientFrames * 2)),
    });
    if (transients.length >= limit) break;
    active = false;
  }

  return transients;
}

function formatTransientSummary(transients) {
  if (transients.length === 0) return 'none';
  return transients
    .map((entry) => `${formatNumber(entry.startMs, 2)}ms->${formatNumber(entry.peakMs, 2)}ms peak=${formatNumber(entry.peak)} rms=${formatNumber(entry.rms)}`)
    .join('; ');
}

function selfCheckCapture({
  sampleRate = 1000,
  durationMs = 4,
  frames,
  left,
  right = left,
  stats,
}) {
  const normalizedLeft = Array.from(left);
  const normalizedRight = Array.from(right);
  return {
    sampleRate,
    durationMs,
    frames: frames ?? normalizedLeft.length,
    left: normalizedLeft,
    right: normalizedRight,
    stats: stats ?? statsForSamples(normalizedLeft, normalizedRight),
  };
}

function runSelfCheck() {
  let assertions = 0;
  const assert = (condition, message) => {
    assertions += 1;
    if (!condition) throw new Error(`Self-check failed: ${message}`);
  };
  const assertThrows = (fn, message) => {
    assertions += 1;
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(`Self-check failed: ${message}; no error thrown`);
  };
  const assertThrowsKind = (fn, expectedKind, message) => {
    assertions += 1;
    try {
      fn();
    } catch (error) {
      if (error instanceof SonicParityRunError && error.kind === expectedKind) return error;
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new Error(`Self-check failed: ${message}; got ${detail}`);
    }
    throw new Error(`Self-check failed: ${message}; no error thrown`);
  };

  const web = selfCheckCapture({ left: [1, 1, 1, 1] });
  const shortCore = selfCheckCapture({ frames: 2, left: [1, 1] });
  const comparison = compareCaptures(web, shortCore, { maxLagMs: 0 });
  assert(comparison.frames === 4, 'comparison uses requested duration instead of min captured frames');
  assert(comparison.raw.peakDiff === 1, 'missing core tail is compared as silence');
  assert(comparison.raw.normalizedRmsDiff > 0.7, 'missing core tail produces a non-zero normalized RMS diff');

  const mismatchedDurationCore = selfCheckCapture({ durationMs: 3, left: [1, 1, 1] });
  assertThrows(
    () => compareCaptures(web, mismatchedDurationCore, { maxLagMs: 0 }),
    'expected capture length mismatches remain setup failures',
  );

  const coreNonFinite = selfCheckCapture({ left: [0, NaN], right: [0, 0] });
  assertThrowsKind(
    () => validateCapture('core-product', coreNonFinite),
    'sonic/core-output',
    'core non-finite samples are core-output sonic failures',
  );

  const webNonFinite = selfCheckCapture({ left: [0, NaN], right: [0, 0] });
  assertThrowsKind(
    () => validateCapture('web', webNonFinite),
    'setup',
    'web reference non-finite samples remain setup failures',
  );

  const envelopeWeb = selfCheckCapture({
    sampleRate: 1000,
    durationMs: 1000,
    left: [0, 0.5, 0.6, 0.4],
    right: [0, 0.4, 0.5, 0.3],
  });
  const envelopeCore = selfCheckCapture({
    sampleRate: 1000,
    durationMs: 1000,
    left: [0, 0.45, 0.62, 0.35],
    right: [0, 0.42, 0.48, 0.34],
  });
  const envelopeComparison = compareCaptures(envelopeWeb, envelopeCore, { maxLagMs: 0 });
  const envelopeGate = compareEnvelopeSummaries(envelopeWeb, envelopeCore, envelopeComparison, {
    minSignalRms: 0.001,
    envelopeWindowMs: 250,
    envelopeTimeToleranceMs: 10,
    envelopeRmsRatioTolerance: 0.35,
    envelopePeakRatioTolerance: 0.35,
  });
  assert(envelopeGate.passed, 'envelope gate accepts close windowed RMS/peak shape');

  const loudEnvelopeCore = selfCheckCapture({
    sampleRate: 1000,
    durationMs: 1000,
    left: [0, 1.2, 1.2, 1.2],
    right: [0, 1.2, 1.2, 1.2],
  });
  const loudEnvelopeComparison = compareCaptures(envelopeWeb, loudEnvelopeCore, { maxLagMs: 0 });
  const loudEnvelopeGate = compareEnvelopeSummaries(envelopeWeb, loudEnvelopeCore, loudEnvelopeComparison, {
    minSignalRms: 0.001,
    envelopeWindowMs: 250,
    envelopeTimeToleranceMs: 10,
    envelopeRmsRatioTolerance: 0.35,
    envelopePeakRatioTolerance: 0.35,
  });
  assert(!loudEnvelopeGate.passed, 'envelope gate rejects excessive level drift');

  console.log(`Browser sonic parity self-check passed (${assertions} assertions).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) {
    runSelfCheck();
    return;
  }
  const { chromium } = await loadPlaywright();
  const vite = args.url ? { url: args.url, stop: async () => {} } : await startVite(args.port);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await vite.stop();
    throw new SonicParityRunError('setup', `Could not launch Chromium for browser sonic parity capture: ${detail}`);
  }

  try {
    const coreLabel = args.coreEngine;
    const web = await captureEngine(browser, vite.url, 'web', args);
    const core = await captureEngine(browser, vite.url, coreLabel, args);
    validateCapture('web', web.capture);
    validateCapture(coreLabel, core.capture);
    const manualMode = args.manualNotes.length > 0;
    let comparison;
    try {
      comparison = compareCaptures(web.capture, core.capture, {
        maxLagMs: args.maxLagMs,
        preferFirstSignalLag: manualMode || args.alignmentGate,
        coreLabel,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SonicParityRunError('setup', `Could not compare browser captures: ${detail}`);
    }
    const gateMetrics = manualMode || args.alignmentGate ? comparison.aligned : comparison.raw;
    const failureReasons = buildFailureReasons({ comparison, gateMetrics, args, manualMode, web, core });
    const passed = failureReasons.length === 0;
    const failureKind = passed ? '' : summarizeFailureKind(failureReasons);

    console.log('Browser sonic parity comparison');
    console.log(`  URL: ${vite.url}`);
    console.log(`  Core engine: ${coreLabel}`);
    console.log(`  Track: ${args.trackId}`);
    if (manualMode) {
      console.log(`  Manual mode: ${args.manualNotes.length} note(s), synth chord sequencer disabled, trigger delay=${formatNumber(args.manualTriggerDelayMs, 0)}ms, warmup=${args.manualWarmup ? 'on' : 'off'}`);
      console.log(`  Manual notes: ${args.manualNotes.map(formatManualNote).join('; ')}`);
      console.log(`  Manual metadata: web ${formatManualMetadata(web)}; core ${formatManualMetadata(core)}`);
    }
    console.log(`  Frames: ${comparison.frames} @ ${comparison.sampleRate} Hz (${formatNumber(comparison.durationSeconds, 3)}s)`);
    console.log(`  Web RMS/peak: ${formatNumber(comparison.webStats.rms)} / ${formatNumber(comparison.webStats.peak)}`);
    console.log(`  Core RMS/peak: ${formatNumber(comparison.coreStats.rms)} / ${formatNumber(comparison.coreStats.peak)}`);
    if (args.printDebug && web.capture.debug !== undefined) {
      console.log(`  Web debug: ${JSON.stringify(web.capture.debug)}`);
    }
    if (args.printDebug && core.capture.debug !== undefined) {
      console.log(`  Core debug: ${JSON.stringify(core.capture.debug)}`);
    }
    console.log(`  Diff RMS: ${formatNumber(comparison.rmsDiff)} normalized=${formatNumber(comparison.normalizedRmsDiff)}`);
    console.log(`  Diff peak: ${formatNumber(comparison.peakDiff)}`);
    console.log(`  Correlation: ${formatNumber(comparison.correlation)}`);
    console.log(`  Best correlation lag: ${formatNumber(comparison.bestLag.lagMs, 2)}ms (${formatLagDirection(comparison.bestLag.lagMs)}) corr=${formatNumber(comparison.bestLag.correlation)}`);
    if (comparison.onsetLag) {
      console.log(`  First-signal lag: ${formatNumber(comparison.onsetLag.lagMs, 2)}ms (${formatLagDirection(comparison.onsetLag.lagMs)}) corr=${formatNumber(comparison.onsetLag.correlation)}`);
    }
    console.log(`  Alignment lag: ${formatNumber(comparison.alignmentLag.lagMs, 2)}ms (${comparison.alignmentSource}, ${formatLagDirection(comparison.alignmentLag.lagMs)}) corr=${formatNumber(comparison.alignmentLag.correlation)}`);
    console.log(`  Aligned overlap: ${comparison.aligned.overlapFrames} frames (${formatNumber(comparison.aligned.overlapSeconds, 3)}s)`);
    console.log(`  Aligned diff RMS: ${formatNumber(comparison.aligned.rmsDiff)} normalized=${formatNumber(comparison.aligned.normalizedRmsDiff)}`);
    console.log(`  Aligned diff peak: ${formatNumber(comparison.aligned.peakDiff)}`);
    console.log(`  Aligned correlation: ${formatNumber(comparison.aligned.correlation)}`);
    console.log(`  First signal: web=${formatNullableMs(comparison.webFirstSignalMs)} core=${formatNullableMs(comparison.coreFirstSignalMs)}`);
    if (comparison.webFirstSignalMs !== null && comparison.coreFirstSignalMs !== null) {
      console.log(`  First-signal delta: ${formatNumber(comparison.coreFirstSignalMs - comparison.webFirstSignalMs, 2)}ms (core-web)`);
    }
    console.log(`  Gate: ${args.envelopeGate ? 'envelope' : ((manualMode || args.alignmentGate) ? 'aligned' : 'raw')} RMS<=${formatNumber(args.rmsTolerance)} peak<=${formatNumber(args.peakTolerance)}${(manualMode || args.alignmentGate) && !args.envelopeGate ? ` lag-corr>=${formatNumber(args.minLagCorrelation)} maxLag<=${formatNumber(args.maxLagMs, 2)}ms` : ''}`);
    console.log(`  Min Web RMS: ${formatNumber(args.minSignalRms)} (${comparison.webStats.rms >= args.minSignalRms ? 'met' : 'not met'})`);
    if (args.envelopeGate) {
      const envelopeComparison = compareEnvelopeSummaries(web.capture, core.capture, comparison, args);
      console.log(`  Envelope gate: activeWindows=${envelopeComparison.activeWindows}, window=${formatNumber(envelopeComparison.windowMs, 0)}ms, firstSignalDelta=${formatNumber(envelopeComparison.firstSignalDeltaMs, 2)}ms/${formatNumber(args.envelopeTimeToleranceMs, 2)}ms, totalRmsRatioDelta=${formatNumber(envelopeComparison.totalRmsRatioDelta)}/${formatNumber(args.envelopeRmsRatioTolerance)}, maxWindowRmsRatioDelta=${formatNumber(envelopeComparison.maxRmsRatioDelta)}/${formatNumber(args.envelopeRmsRatioTolerance)} abs=${formatNumber(envelopeComparison.maxRmsAbsDelta)}/${formatNumber(envelopeComparison.rmsAbsTolerance)}, totalPeakRatioDelta=${formatNumber(envelopeComparison.totalPeakRatioDelta)}/${formatNumber(args.envelopePeakRatioTolerance)}, maxPeakRatioDelta=${formatNumber(envelopeComparison.maxPeakRatioDelta)}/${formatNumber(args.envelopePeakRatioTolerance)} abs=${formatNumber(envelopeComparison.maxPeakAbsDelta)}/${formatNumber(envelopeComparison.peakAbsTolerance)}`);
    }
    if (args.transientGate && !manualMode) {
      const transientComparison = compareTransientSummaries(web.capture, core.capture, args);
      console.log(`  Transient gate: count web=${transientComparison.webTransients.length} core=${transientComparison.coreTransients.length}, globalStartOffset=${formatNumber(transientComparison.globalStartOffsetMs, 2)}ms, maxStartDelta=${formatNumber(transientComparison.maxStartDeltaMs, 2)}ms/${formatNumber(args.transientTimeToleranceMs, 2)}ms, maxPeakRatioDelta=${formatNumber(transientComparison.maxPeakRatioDelta)}/${formatNumber(args.transientPeakRatioTolerance)}, maxRmsRatioDelta=${formatNumber(transientComparison.maxRmsRatioDelta)}/${formatNumber(args.transientRmsRatioTolerance)}`);
    }
    if (args.printTransients) {
      console.log(`  Web transients: ${formatTransientSummary(summarizeTransients(web.capture))}`);
      console.log(`  Core transients: ${formatTransientSummary(summarizeTransients(core.capture))}`);
    }

    for (const [label, result] of [['web', web], [coreLabel, core]]) {
      if (result.logs.length > 0) {
        console.log(`  ${label} browser logs:`);
        for (const entry of result.logs) console.log(`    ${entry}`);
      }
    }

    if (passed) {
      console.log('  Result: PASS');
    } else {
      const suppressed = args.noFail && failureKind === 'sonic';
      console.log(`  Result: FAIL (${failureKind})${suppressed ? ' [not enforced due to --no-fail]' : ''}`);
      console.log('  Failure diagnostics:');
      for (const reason of failureReasons) {
        console.log(`    [${reason.kind}] ${reason.message}`);
      }
      if (!suppressed) {
        throw new SonicParityRunError(
          failureKind,
          `Sonic parity ${failureKind} failure (${failureReasons.length} reason${failureReasons.length === 1 ? '' : 's'}). See diagnostics above.`,
        );
      }
    }
  } finally {
    await browser.close();
    await vite.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof SonicParityRunError) {
    process.exitCode = error.kind === 'setup' ? EXIT_SETUP_FAILURE : EXIT_SONIC_FAILURE;
  } else {
    process.exitCode = EXIT_SETUP_FAILURE;
  }
});
