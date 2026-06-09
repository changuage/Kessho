#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4185;
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-browser-runtime-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-browser-runtime-latest.md');

function parseArgs(argv) {
  const args = {
    url: '',
    port: DEFAULT_PORT,
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-browser-runtime.mjs [--url=http://127.0.0.1:4173/] [--port=4185]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  return args;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withQuery(baseUrl, query) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
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
    throw new Error(`Playwright is required for Product browser-runtime proof but is not available: ${detail}`);
  }
}

function lowNoisePatch() {
  return {
    birds2Enabled: false,
    birdsEnabled: false,
    driftEnabled: false,
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

async function captureCase(page, caseDef) {
  await page.goto(withQuery(caseDef.baseUrl, { parity: '1' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 15000 });
  const capture = await page.evaluate(
    async (options) => window.__kesshoSonicParity.capture(options),
    {
      durationMs: caseDef.durationMs,
      settleMs: caseDef.settleMs,
      statePatch: caseDef.statePatch,
      manualNotes: caseDef.manualNotes,
      manualWarmup: false,
    },
  );
  await page.evaluate(() => window.__kesshoSonicParity?.teardown());
  return capture;
}

function assertFiniteCapture(capture, label) {
  assert(capture?.engine === 'core-product', `${label}: default browser runtime was ${capture?.engine}, expected core-product`);
  assert(capture?.debug?.engineMode === 'core-product', `${label}: debug engineMode was not core-product`);
  assert(capture?.debug?.runtimeReady === true, `${label}: Product runtime was not ready`);
  assert(!capture?.debug?.runtimeError, `${label}: Product runtime error: ${capture?.debug?.runtimeError}`);
  assert(capture?.stats && Number.isFinite(capture.stats.rms), `${label}: missing finite RMS`);
  assert(capture?.stats && Number.isFinite(capture.stats.peak), `${label}: missing finite peak`);
  assert(capture.stats.rms > 0.0005, `${label}: capture RMS stayed silent (${capture.stats.rms})`);
  assert(capture.stats.peak > 0.001, `${label}: capture peak stayed silent (${capture.stats.peak})`);
  const telemetry = capture.debug?.latestTelemetry ?? {};
  assert(telemetry.unsupportedControlCount === 0, `${label}: unsupported control diagnostics were reported`);
  assert(telemetry.unsupportedGetterCount === 0, `${label}: unsupported getter diagnostics were reported`);
  assert(telemetry.runtimeFallbackDiagnosticCount === 0, `${label}: runtime fallback diagnostics were reported`);
  assert(telemetry.audioCriticalFallbackCount === 0, `${label}: audio-critical fallback diagnostics were reported`);
  assert(telemetry.workletMasterStemPeak > 0 || telemetry.masterOutputPeak > 0, `${label}: Product telemetry did not report master output`);
}

function assertCleanProbeDiagnostics(latest, label) {
  const diagnostics = latest?.diagnostics ?? {};
  assert(diagnostics.unsupportedControlCount === 0, `${label}: unsupported controls were reported`);
  assert(diagnostics.unsupportedGetterCount === 0, `${label}: unsupported getters were reported`);
  assert(diagnostics.runtimeFallbackDiagnosticCount === 0, `${label}: runtime fallback diagnostics were reported`);
  assert(diagnostics.audioCriticalFallbackCount === 0, `${label}: audio-critical fallback diagnostics were reported`);
  const reasons = Array.isArray(diagnostics.snapshotReloadReasons) ? diagnostics.snapshotReloadReasons : [];
  const disallowed = reasons.filter((reason) => (
    reason === 'ui-control-change' ||
    reason === 'fx-control-change' ||
    reason === 'morph-control-change'
  ));
  assert(disallowed.length === 0, `${label}: live interaction caused disallowed full snapshot reloads (${disallowed.join(', ')})`);
}

function summarizeCapture(id, capture) {
  const telemetry = capture.debug?.latestTelemetry ?? {};
  return {
    id,
    engine: capture.engine,
    rms: capture.stats.rms,
    peak: capture.stats.peak,
    activeVoices: telemetry.activeVoices ?? null,
    activeAssets: telemetry.activeAssets ?? null,
    masterOutputPeak: telemetry.masterOutputPeak ?? null,
    masterOutputRms: telemetry.masterOutputRms ?? null,
    workletPadStemPeak: telemetry.workletPadStemPeak ?? null,
    workletLeadStemPeak: telemetry.workletLeadStemPeak ?? null,
    workletMasterStemPeak: telemetry.workletMasterStemPeak ?? null,
    decodedAssetBytes: telemetry.decodedAssetBytes ?? null,
  };
}

async function captureRuntimeWalkProbe(page, baseUrl) {
  await page.goto(withQuery(baseUrl, { parity: '1' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kesshoProductRuntimeProbe?.configureRuntimeWalk), null, { timeout: 15000 });
  return page.evaluate(async () => {
    const probe = window.__kesshoProductRuntimeProbe;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const key = 'lead1Density';
    await probe.configureRuntimeWalk({
      key,
      range: { min: 0.1, max: 4.5 },
      activeTab: 'synth',
      statePatch: {
        leadEnabled: false,
        lead2Enabled: false,
        pianoEnabled: true,
        leadRandomEnabled: true,
        leadRandomSource: 'piano',
        leadRandomClockSource: 'localPhrase',
        leadRandomSyncPolicy: 'restartNow',
        lead1Density: 4.5,
        lead1Octave: 0,
        lead1OctaveRange: 2,
        phraseLength: 1.5,
        transportPrimaryClock: 'seconds',
        pianoDistance: 0.72,
        masterVolume: 0.7,
        padEnabled: false,
        synthChordSequencerEnabled: false,
        synthLevel: 0,
        randomWalkMode: 'globalWalk',
        randomWalkSpeed: 4.5,
      },
    });
    const samples = [];
    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      await wait(250);
      samples.push(probe.readRuntimeWalkProbe(key));
    }
    return samples;
  });
}

async function captureEarthTextureProbe(page, baseUrl) {
  await page.goto(withQuery(baseUrl, { parity: '1' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 15000 });
  const capture = await page.evaluate(
    async (options) => window.__kesshoSonicParity.capture(options),
    {
      durationMs: 9000,
      settleMs: 1200,
      statePatch: {
        ...lowNoisePatch(),
        masterVolume: 0.72,
        oceanSampleEnabled: true,
        oceanSampleLevel: 0.42,
        waterEnabled: true,
        waterLevel: 0.34,
        birdsEnabled: true,
        birds2Enabled: true,
        frogsEnabled: true,
        natureLevel: 0.48,
        birdsSliceDuration: 2.2,
        birds2SliceDuration: 2.4,
        frogsSliceDuration: 2.1,
        oceanSliceDuration: 2.6,
        birdsSliceDensity: 0.9,
        birds2SliceDensity: 0.9,
        frogsSliceDensity: 0.9,
        oceanSliceDensity: 0.9,
        soundscapeParityFixture: false,
      },
      manualNotes: [],
      manualWarmup: false,
    },
  );
  await page.evaluate(() => window.__kesshoSonicParity?.teardown());
  return capture;
}

async function captureSampleHoldProbe(page, baseUrl) {
  await page.goto(withQuery(baseUrl, { parity: '1' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kesshoProductRuntimeProbe?.configureSampleHold), null, { timeout: 15000 });
  return page.evaluate(async () => {
    const probe = window.__kesshoProductRuntimeProbe;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    await probe.configureSampleHold({
      key: 'masterVolume',
      range: { min: 0.18, max: 0.82 },
      activeTab: 'global',
      statePatch: {
        masterVolume: 0.5,
        padEnabled: true,
        synthLevel: 0.3,
      },
    });
    const samples = [];
    const deadline = Date.now() + 2200;
    while (Date.now() < deadline) {
      await wait(125);
      samples.push(probe.readSampleHoldProbe('masterVolume'));
    }
    return samples;
  });
}

function assertRuntimeWalkProbe(samples) {
  assert(Array.isArray(samples) && samples.length > 2, 'runtime-walk probe did not return enough samples');
  const positions = samples
    .map((sample) => sample?.position)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const distinctPositions = [];
  for (const position of positions) {
    if (!distinctPositions.some((existing) => Math.abs(existing - position) < 0.0025)) {
      distinctPositions.push(position);
    }
  }
  assert(distinctPositions.length >= 3, `runtime-walk UI position did not change at least twice: ${positions.join(', ')}`);
  const latest = samples.at(-1) ?? {};
  const debug = latest.telemetry?.productModulationDebug?.randomWalk ?? [];
  assert(
    debug.some((entry) => entry.controlName === 'lead1Density' && entry.normalizedPosition >= 0 && entry.normalizedPosition <= 1),
    'runtime-walk telemetry did not expose active lead1Density random-walk debug',
  );
  const walkDebug = latest.telemetry?.runtimeWalkValues ?? {};
  assert(Object.keys(walkDebug).length > 0, 'runtime-walk telemetry values were empty');
  const bridgeDebug = latest.telemetry?.runtimeWalkDebug ?? {};
  const runtimeSliderDebug = latest.runtimeSliderDebug ?? {};
  assert((bridgeDebug.rangeSetCallCount ?? 0) > 0, 'runtime-walk bridge did not receive UI range-set calls');
  assert((bridgeDebug.postedEventCount ?? 0) > 0, 'runtime-walk bridge did not post ProductEvents');
  assert((bridgeDebug.telemetryValueCount ?? 0) > 0, 'runtime-walk bridge did not receive telemetry values');
  assert((bridgeDebug.publishedPositionCount ?? 0) > 0, 'runtime-walk bridge did not publish positions');
  assert((runtimeSliderDebug.walkStoreUpdateCount ?? 0) > 0, 'runtime-walk UI store did not receive position updates');
  assert((runtimeSliderDebug.walkIndicatorConsumeCount ?? 0) > 0, 'runtime-walk DualSlider indicator did not consume positions');
  assert(
    (runtimeSliderDebug.triggerStoreUpdateCount ?? 0) > 0 && (runtimeSliderDebug.lastTriggerKeys ?? []).includes('pianoDistance'),
    'runtime-walk piano random timing did not publish pianoDistance trigger animation',
  );
  assertCleanProbeDiagnostics(latest, 'runtime-walk probe');
  return {
    id: 'runtime-walk-ui',
    positionSamples: positions,
    distinctPositionCount: distinctPositions.length,
    walkStoreUpdateCount: runtimeSliderDebug.walkStoreUpdateCount ?? 0,
    walkIndicatorConsumeCount: runtimeSliderDebug.walkIndicatorConsumeCount ?? 0,
    pianoTriggerStoreUpdateCount: runtimeSliderDebug.triggerStoreUpdateCount ?? 0,
    bridgeDebug,
  };
}

function assertEarthTextureProbe(capture) {
  assertFiniteCapture(capture, 'earth-texture probe');
  const telemetry = capture.debug?.latestTelemetry ?? {};
  const earth = telemetry.earthTextureDebugState ?? {};
  const requiredKeys = ['waves', 'birds', 'birds2', 'frogs'];
  const summaries = requiredKeys.map((key) => {
    const row = earth[key] ?? null;
    assert(row, `earth-texture probe missing ${key} debug row`);
    assert(row.active === true, `earth-texture ${key} was not active`);
    assert(row.textureParamsAvailable === true, `earth-texture ${key} did not report texture params`);
    assert(row.parityFixture === false, `earth-texture ${key} unexpectedly used parity fixture`);
    assert((row.maxOffset ?? 0) > 0, `earth-texture ${key} did not expose positive maxOffset`);
    assert((row.activeSliceCount ?? 0) > 0, `earth-texture ${key} did not schedule active slices`);
    const slice = row.activeSlices?.[0];
    assert(slice, `earth-texture ${key} did not expose last slice`);
    assert(slice.offset > 0, `earth-texture ${key} repeated the first slice offset`);
    assert(Math.abs(slice.detuneCents) > 0.01 || Math.abs(slice.speedMultiplier - 1) > 0.0001, `earth-texture ${key} did not vary detune or speed`);
    return {
      key,
      assetId: row.assetId ?? null,
      activeSliceCount: row.activeSliceCount ?? 0,
      offset: slice.offset,
      detuneCents: slice.detuneCents,
      speedMultiplier: slice.speedMultiplier,
      maxOffset: row.maxOffset ?? null,
    };
  });
  return { id: 'earth-texture-ui', summaries };
}

function assertSampleHoldProbe(samples) {
  assert(Array.isArray(samples) && samples.length > 2, 'sample-hold probe did not return enough samples');
  const positions = samples
    .map((sample) => sample?.position)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const distinctPositions = [];
  for (const position of positions) {
    if (!distinctPositions.some((existing) => Math.abs(existing - position) < 0.0025)) {
      distinctPositions.push(position);
    }
  }
  assert(distinctPositions.length >= 2, `sample-hold UI trigger position did not change: ${positions.join(', ')}`);
  const latest = samples.at(-1) ?? {};
  const debug = latest.telemetry?.productModulationDebug?.sampleHold ?? [];
  assert(
    debug.some((entry) => entry.controlName === 'masterVolume' && entry.triggerCounter > 0 && entry.normalizedPosition >= 0 && entry.normalizedPosition <= 1),
    'sample-hold telemetry did not expose active masterVolume trigger debug',
  );
  const sampleHoldDebug = latest.telemetry?.sampleHoldDebug ?? {};
  const runtimeSliderDebug = latest.runtimeSliderDebug ?? {};
  assert((sampleHoldDebug.changedTriggerCount ?? 0) > 0, 'sample-hold bridge did not observe trigger changes');
  assert((sampleHoldDebug.publishedGenericCount ?? 0) > 0, 'sample-hold bridge did not publish UI trigger positions');
  assert((runtimeSliderDebug.triggerStoreUpdateCount ?? 0) > 0, 'sample-hold UI store did not receive trigger position updates');
  assert((runtimeSliderDebug.triggerFlashUpdateCount ?? 0) > 0, 'sample-hold UI store did not receive flash updates');
  assert((runtimeSliderDebug.triggerIndicatorConsumeCount ?? 0) > 0, 'sample-hold DualSlider indicator did not consume positions');
  assertCleanProbeDiagnostics(latest, 'sample-hold probe');
  return {
    id: 'sample-hold-ui',
    positionSamples: positions,
    distinctPositionCount: distinctPositions.length,
    triggerStoreUpdateCount: runtimeSliderDebug.triggerStoreUpdateCount ?? 0,
    triggerFlashUpdateCount: runtimeSliderDebug.triggerFlashUpdateCount ?? 0,
    triggerIndicatorConsumeCount: runtimeSliderDebug.triggerIndicatorConsumeCount ?? 0,
    sampleHoldDebug,
  };
}

function writeReport(report) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# Kessho Product Browser Runtime',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Default runtime: ${report.defaultRuntime}`,
    '',
    '## Cases',
    '',
    '| Case | Engine | RMS | Peak | Active Voices | Active Assets | Pad Stem | Lead Stem |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.cases.map((entry) => `| ${entry.id} | ${entry.engine} | ${entry.rms.toFixed(6)} | ${entry.peak.toFixed(6)} | ${entry.activeVoices ?? '-'} | ${entry.activeAssets ?? '-'} | ${entry.workletPadStemPeak ?? '-'} | ${entry.workletLeadStemPeak ?? '-'} |`),
    '',
    '## Runtime Walk',
    '',
    report.runtimeWalkProbe
      ? `Distinct UI positions: ${report.runtimeWalkProbe.distinctPositionCount}; store updates: ${report.runtimeWalkProbe.walkStoreUpdateCount}; indicator reads: ${report.runtimeWalkProbe.walkIndicatorConsumeCount}; piano trigger updates: ${report.runtimeWalkProbe.pianoTriggerStoreUpdateCount}`
      : 'Not run',
    '',
    '## Earth Texture',
    '',
    report.earthTextureProbe
      ? report.earthTextureProbe.summaries.map((entry) => `${entry.key}: offset=${entry.offset.toFixed(3)}, detune=${entry.detuneCents.toFixed(2)}, speed=${entry.speedMultiplier.toFixed(3)}`).join('\n')
      : 'Not run',
    '',
    '## Sample Hold',
    '',
    report.sampleHoldProbe
      ? `Distinct UI positions: ${report.sampleHoldProbe.distinctPositionCount}; store updates: ${report.sampleHoldProbe.triggerStoreUpdateCount}; flash updates: ${report.sampleHoldProbe.triggerFlashUpdateCount}; indicator reads: ${report.sampleHoldProbe.triggerIndicatorConsumeCount}`
      : 'Not run',
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

const args = parseArgs(process.argv.slice(2));
const vite = args.url ? { url: args.url, stop: async () => {} } : await startPreview(args.port);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'running',
  defaultRuntime: 'unknown',
  url: vite.url,
  cases: [],
  earthTextureProbe: null,
  runtimeWalkProbe: null,
  sampleHoldProbe: null,
};

try {
  const page = await browser.newPage();
  const cases = [
    {
      id: 'default-pad-note',
      durationMs: 2400,
      settleMs: 500,
      statePatch: {
        ...lowNoisePatch(),
        masterVolume: 0.8,
        padEnabled: true,
        synthLevel: 0.64,
      },
      manualNotes: [{ source: 'pad1', midi: 60, velocity: 0.9, durationMs: 1800 }],
      baseUrl: vite.url,
    },
    {
      id: 'default-lead-note',
      durationMs: 1800,
      settleMs: 500,
      statePatch: {
        ...lowNoisePatch(),
        leadEnabled: true,
        lead1Level: 0.8,
        leadLevel: 0.8,
        lead1PresetA: 'soft_rhodes',
        lead1PresetB: 'gamelan',
        lead1Morph: 0.25,
        masterVolume: 0.8,
      },
      manualNotes: [{ source: 'lead1', midi: 72, velocity: 0.9, durationMs: 900 }],
      baseUrl: vite.url,
    },
    {
      id: 'default-sample-and-synth',
      durationMs: 2400,
      settleMs: 600,
      statePatch: {
        ...lowNoisePatch(),
        masterVolume: 0.78,
        padEnabled: true,
        pianoEnabled: true,
        synthLevel: 0.5,
      },
      manualNotes: [
        { source: 'pad1', midi: 60, velocity: 0.8, durationMs: 1600 },
        { source: 'piano', midi: 64, velocity: 0.85, durationMs: 1200 },
      ],
      baseUrl: vite.url,
    },
    {
      id: 'string-waves-arrangement',
      durationMs: 18200,
      settleMs: 800,
      statePatch: stringWavesArrangementPatch(),
      manualNotes: [],
      baseUrl: vite.url,
    },
  ];

  for (const caseDef of cases) {
    const capture = await captureCase(page, caseDef);
    assertFiniteCapture(capture, caseDef.id);
    const summary = summarizeCapture(caseDef.id, capture);
    if (caseDef.id === 'default-sample-and-synth') {
      assert((summary.activeAssets ?? 0) > 0, 'sample+synth case did not register any Product Core asset');
      assert((summary.workletPadStemPeak ?? 0) > 0, 'sample+synth case did not report Pad stem output');
    }
    if (caseDef.id === 'string-waves-arrangement') {
      assert((summary.activeAssets ?? 0) > 0, 'String Waves arrangement did not register Product Core soundscape assets');
      assert((summary.activeVoices ?? 0) > 0, 'String Waves arrangement did not leave Product Core synth voices active');
      assert((summary.workletPadStemPeak ?? 0) > 0.00001, 'String Waves arrangement did not report Pad stem output');
      assert((summary.workletLeadStemPeak ?? 0) > 0.000001, 'String Waves arrangement did not report Lead stem output');
    }
    report.defaultRuntime = capture.engine;
    report.cases.push(summary);
  }
  const earthTextureCapture = await captureEarthTextureProbe(page, vite.url);
  report.earthTextureProbe = assertEarthTextureProbe(earthTextureCapture);
  const runtimeWalkSamples = await captureRuntimeWalkProbe(page, vite.url);
  report.runtimeWalkProbe = assertRuntimeWalkProbe(runtimeWalkSamples);
  const sampleHoldSamples = await captureSampleHoldProbe(page, vite.url);
  report.sampleHoldProbe = assertSampleHoldProbe(sampleHoldSamples);
  await page.close();
  report.status = 'pass';
  writeReport(report);
  console.log(`Kessho Product browser runtime checks passed (report: ${reportJsonPath})`);
} catch (error) {
  report.status = 'fail';
  report.error = error instanceof Error ? error.message : String(error);
  writeReport(report);
  throw error;
} finally {
  await browser.close().catch(() => {});
  await vite.stop();
}
