#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4196;
const CPU_SUMMARY_STORAGE_KEY = 'kessho:audio-engine-cpu-summary:v1';
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-web-cpu-comparison-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-web-cpu-comparison-latest.md');

function parseArgs(argv) {
  const args = {
    url: '',
    port: DEFAULT_PORT,
    durationMs: 12000,
    settleMs: 1000,
    warmupMs: 2500,
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--duration-ms=')) args.durationMs = Number(arg.slice('--duration-ms='.length));
    else if (arg.startsWith('--settle-ms=')) args.settleMs = Number(arg.slice('--settle-ms='.length));
    else if (arg.startsWith('--warmup-ms=')) args.warmupMs = Number(arg.slice('--warmup-ms='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-web-cpu-comparison.mjs [--url=http://127.0.0.1:4173/] [--duration-ms=12000] [--settle-ms=1000] [--warmup-ms=2500]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (!Number.isFinite(args.durationMs) || args.durationMs <= 0) throw new Error('--duration-ms must be positive');
  if (!Number.isFinite(args.settleMs) || args.settleMs < 0) throw new Error('--settle-ms must be non-negative');
  if (!Number.isFinite(args.warmupMs) || args.warmupMs < 0) throw new Error('--warmup-ms must be non-negative');
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForHttp(url, timeoutMs, outputProvider = () => '') {
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
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${url}: ${detail}\n${outputProvider()}`);
}

async function startPreview(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  });
  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  try {
    await waitForHttp(url, 120000, () => output);
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    url,
    stop: async () => {
      child.kill();
      await delay(250);
    },
  };
}

async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    if (!mod.chromium) throw new Error('The playwright package did not expose chromium.');
    return mod;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright is required for Product/Web CPU comparison but is not available: ${detail}`);
  }
}

function withQuery(baseUrl, query) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function lowNoisePatch() {
  return {
    birds2Enabled: false,
    birdsEnabled: false,
    characterEnabled: false,
    delayAEnabled: false,
    delayAFeedback: 0,
    delayAGranularSend: 0,
    delayAMix: 0,
    delayAToBSend: 0,
    delayBGranularSend: 0,
    delayBToASend: 0,
    drumEnabled: false,
    drumEuclidMasterEnabled: false,
    dynamicsEnabled: false,
    frogsEnabled: false,
    granularEnabled: false,
    granularFreeze: false,
    insects2Enabled: false,
    insectsEnabled: false,
    lead2Enabled: false,
    leadEnabled: false,
    leadRandomEnabled: false,
    oceanSampleEnabled: false,
    oceanWaveSynthEnabled: false,
    pad2Enabled: false,
    padEnabled: false,
    pianoEnabled: false,
    reverbEnabled: false,
    sidechainEnabled: false,
    spectralFreezeEnabled: false,
    synthEuclideanMasterEnabled: false,
    waterEnabled: false,
  };
}

function stringWavesArrangementPatch() {
  return {
    ...lowNoisePatch(),
    masterVolume: 0.86,
    phraseLength: 16,
    transportPrimaryClock: 'seconds',
    transportBeatsPerBar: 4,
    transportBarsPerPhrase: 4,
    rootNote: 0,
    tension: 0.3,
    padEnabled: true,
    synthLevel: 0.07,
    synthChordSequencerEnabled: true,
    synthEuclideanMasterEnabled: false,
    synthVoiceMask: 63,
    synthAttack: 6,
    synthDecay: 1,
    synthRelease: 12,
    padPresetA: 'saturated_drift',
    padPresetB: 'init',
    padMorph: 0,
    padPostLPF: 1930,
    granularPad1Send: 0.59,
    pad1ReverbSend: 0.31,
    leadEnabled: true,
    leadRandomEnabled: true,
    leadRandomSource: 'lead1',
    leadRandomClockSource: 'globalPhrase',
    leadRandomSyncPolicy: 'restartNow',
    leadLevel: 1,
    lead1Level: 0.01,
    lead1Density: 0.5,
    lead1Hold: 0.5,
    lead1Octave: 0,
    lead1OctaveRange: 2,
    lead1PresetA: 'soft_rhodes',
    lead1PresetB: 'gamelan',
    lead1Morph: 0.413588,
    granularLead1Send: 0.85,
    lead1ReverbSend: 0.5,
    oceanSampleEnabled: true,
    oceanSampleLevel: 0.23,
    natureLevel: 0.23,
  };
}

function processSnapshotById(processInfo) {
  const byId = new Map();
  for (const info of processInfo ?? []) {
    byId.set(info.id, {
      type: info.type,
      cpuTime: Number(info.cpuTime) || 0,
    });
  }
  return byId;
}

function processCpuDelta(beforeInfo, afterInfo) {
  const before = processSnapshotById(beforeInfo);
  let totalCpuSeconds = 0;
  const byType = {};
  for (const after of afterInfo ?? []) {
    const previous = before.get(after.id);
    const delta = Math.max(0, (Number(after.cpuTime) || 0) - (previous?.cpuTime ?? 0));
    totalCpuSeconds += delta;
    byType[after.type] = (byType[after.type] ?? 0) + delta;
  }
  return { totalCpuSeconds, byType };
}

function summarizeCapture(capture) {
  const telemetry = capture.debug?.latestTelemetry ?? {};
  return {
    engine: capture.engine,
    rms: capture.stats?.rms ?? null,
    peak: capture.stats?.peak ?? null,
    activeVoices: telemetry.activeVoices ?? null,
    activeAssets: telemetry.activeAssets ?? null,
    activeGrains: telemetry.activeGrains ?? null,
    renderCpuPercent: telemetry.renderCpuPercent ?? null,
    renderCpuPeakPercent: telemetry.renderCpuPeakPercent ?? null,
    missedQuantumCount: telemetry.missedQuantumCount ?? null,
  };
}

function parseOverlaySummary(raw, mode) {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    const summary = parsed?.[mode];
    if (!summary || typeof summary !== 'object') return null;
    return {
      avgPercent: Number.isFinite(summary.avgPercent) ? summary.avgPercent : null,
      peakPercent: Number.isFinite(summary.peakPercent) ? summary.peakPercent : null,
      missPercent: Number.isFinite(summary.missPercent) ? summary.missPercent : null,
      moduleCount: Number.isFinite(summary.moduleCount) ? summary.moduleCount : null,
      updatedAt: Number.isFinite(summary.updatedAt) ? summary.updatedAt : null,
    };
  } catch {
    return null;
  }
}

async function captureScenario(page, durationMs, settleMs) {
  return page.evaluate(
    async (options) => window.__kesshoSonicParity.capture(options),
    {
      durationMs,
      settleMs,
      telemetrySampleIntervalMs: 100,
      statePatch: stringWavesArrangementPatch(),
      manualNotes: [],
      manualWarmup: false,
    },
  );
}

async function measureEngine({ chromium, baseUrl, mode, args }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const cdp = await browser.newBrowserCDPSession();
  const page = await browser.newPage();
  const url = withQuery(baseUrl, { parity: '1', engineAB: '1', engine: mode });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 15000 });
    if (args.warmupMs > 0) {
      await captureScenario(page, args.warmupMs, Math.min(args.settleMs, 600));
      await delay(500);
    }
    const before = await cdp.send('SystemInfo.getProcessInfo');
    const wallStartMs = performance.now();
    const capture = await captureScenario(page, args.durationMs, args.settleMs);
    const wallEndMs = performance.now();
    const after = await cdp.send('SystemInfo.getProcessInfo');
    const overlayRaw = await page.evaluate((key) => window.sessionStorage.getItem(key), CPU_SUMMARY_STORAGE_KEY);
    await page.evaluate(() => window.__kesshoSonicParity?.teardown());

    assert(capture?.engine === mode, `${mode}: capture engine was ${capture?.engine}`);
    assert(capture?.stats?.rms > 0.0005, `${mode}: capture RMS stayed silent (${capture?.stats?.rms})`);
    assert(capture?.stats?.peak > 0.001, `${mode}: capture peak stayed silent (${capture?.stats?.peak})`);

    const wallSeconds = Math.max(0.001, (wallEndMs - wallStartMs) / 1000);
    const cpuDelta = processCpuDelta(before.processInfo, after.processInfo);
    return {
      mode,
      url,
      wallSeconds,
      processCpuSeconds: cpuDelta.totalCpuSeconds,
      browserProcessCpuPercent: (cpuDelta.totalCpuSeconds / wallSeconds) * 100,
      browserProcessCpuSecondsByType: cpuDelta.byType,
      internalOverlayCpu: parseOverlaySummary(overlayRaw, mode),
      capture: summarizeCapture(capture),
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

function percentDelta(from, to) {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((from - to) / from) * 100;
}

function writeReport(report) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const product = report.engines['core-product'];
  const web = report.engines['web-ts'];
  const lines = [
    '# Kessho Product vs Web CPU Comparison',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Scenario: ${report.scenario.id}`,
    '',
    '## Comparable Browser-Process CPU',
    '',
    '| Runtime | Browser CPU % | CPU seconds | Wall seconds | Internal avg % | Internal peak % | Internal modules | RMS | Peak |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...['core-product', 'web-ts'].map((mode) => {
      const entry = report.engines[mode];
      const internal = entry.internalOverlayCpu ?? {};
      return `| ${mode} | ${entry.browserProcessCpuPercent.toFixed(3)} | ${entry.processCpuSeconds.toFixed(3)} | ${entry.wallSeconds.toFixed(3)} | ${internal.avgPercent ?? '-'} | ${internal.peakPercent ?? '-'} | ${internal.moduleCount ?? '-'} | ${entry.capture.rms?.toFixed(6) ?? '-'} | ${entry.capture.peak?.toFixed(6) ?? '-'} |`;
    }),
    '',
    `Browser-process CPU saved by Product Core vs Web TS: ${report.comparison.browserProcessCpuSavedPercent === null ? 'n/a' : `${report.comparison.browserProcessCpuSavedPercent.toFixed(2)}%`}`,
    '',
    '## Notes',
    '',
    '- Browser-process CPU uses Chrome process CPU deltas around the same parity capture scenario for each runtime. This includes renderer/audio-thread/browser process work and is more comparable than summing only Web TS worklet telemetry.',
    '- Internal avg/peak keeps the old overlay-style metric visible. For Web TS, that is still worklet-reported CPU only and excludes native WebAudio node DSP; for Product Core, the single worklet contains the Product renderer.',
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

const args = parseArgs(process.argv.slice(2));
const server = args.url ? { url: args.url, stop: async () => {} } : await startPreview(args.port);
const { chromium } = await loadPlaywright();

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'running',
  url: server.url,
  scenario: {
    id: 'string-waves-arrangement',
    durationMs: args.durationMs,
    settleMs: args.settleMs,
    warmupMs: args.warmupMs,
  },
  engines: {},
  comparison: {},
};

try {
  const product = await measureEngine({ chromium, baseUrl: server.url, mode: 'core-product', args });
  const web = await measureEngine({ chromium, baseUrl: server.url, mode: 'web-ts', args });
  report.engines['core-product'] = product;
  report.engines['web-ts'] = web;
  report.comparison = {
    browserProcessCpuSavedPercent: percentDelta(web.browserProcessCpuPercent, product.browserProcessCpuPercent),
    browserProcessCpuRatioProductOverWeb: web.browserProcessCpuPercent > 0
      ? product.browserProcessCpuPercent / web.browserProcessCpuPercent
      : null,
    oldInternalOverlaySavedPercent: web.internalOverlayCpu?.avgPercent && product.internalOverlayCpu?.avgPercent
      ? percentDelta(web.internalOverlayCpu.avgPercent, product.internalOverlayCpu.avgPercent)
      : null,
  };
  report.status = 'pass';
  writeReport(report);
  console.log(
    `Kessho Product/Web CPU comparison passed: Product browser CPU ${product.browserProcessCpuPercent.toFixed(3)}%, ` +
    `Web TS browser CPU ${web.browserProcessCpuPercent.toFixed(3)}%, saved ` +
    `${report.comparison.browserProcessCpuSavedPercent?.toFixed(2) ?? 'n/a'}% ` +
    `(report: ${reportJsonPath})`,
  );
} catch (error) {
  report.status = 'fail';
  report.error = error instanceof Error ? error.message : String(error);
  writeReport(report);
  throw error;
} finally {
  await server.stop();
}
