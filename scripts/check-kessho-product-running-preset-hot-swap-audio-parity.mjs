#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4192;
const CAPTURE_DURATION_MS = 4600;
const SETTLE_MS = 500;
const SWAP_DELAY_MS = 1300;
const PRE_START_MS = 350;
const PRE_END_MS = 1150;
const POST_START_MS = 2600;
const POST_END_MS = 4350;
const ENVELOPE_BIN_MS = 35;
const MAX_ENVELOPE_LAG_MS = 420;
const MIN_POST_RMS = 0.00002;
const MIN_POST_ENVELOPE_CORRELATION = 0.58;
const MAX_POST_ENVELOPE_DISTANCE = 1.05;
const MIN_ENERGY_RATIO = 0.12;
const MAX_ENERGY_RATIO = 8.5;

const reportJsonPath = resolve(root, 'docs/reports/kessho-product-running-preset-hot-swap-audio-parity-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-running-preset-hot-swap-audio-parity-latest.md');

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-running-preset-hot-swap-audio-parity.mjs [--url=http://127.0.0.1:5173/] [--port=4192]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
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

async function startDevServer(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
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
    throw new Error(`Playwright is required for Product hot-swap audio parity proof but is not available: ${detail}`);
  }
}

function withCoreProductParity(url) {
  const next = new URL(url);
  next.searchParams.set('engine', 'core-product');
  next.searchParams.set('parity', '1');
  return next.toString();
}

function lowNoisePatch() {
  return {
    birds2Enabled: false,
    birdsEnabled: false,
    birdsLevel: 0,
    delayAEnabled: false,
    delayAFeedback: 0,
    delayAGranularSend: 0,
    delayAMix: 0,
    delayAToBSend: 0,
    delayBGranularSend: 0,
    delayBToASend: 0,
    driftEnabled: false,
    drumDelayEnabled: false,
    drumEnabled: false,
    drumEuclidMasterEnabled: false,
    dynamicsEnabled: false,
    frogsEnabled: false,
    frogsLevel: 0,
    granularDelayEnabled: false,
    granularDelayMix: 0,
    granularEnabled: false,
    granularFreeze: false,
    insects2Enabled: false,
    insectsEnabled: false,
    lead2Enabled: false,
    leadEnabled: false,
    leadRandomEnabled: false,
    masterVolume: 0.8,
    natureLevel: 0,
    oceanSampleEnabled: false,
    oceanSampleLevel: 0,
    oceanWaveSynthEnabled: false,
    pad2Enabled: false,
    padEnabled: false,
    pianoEnabled: false,
    reverbEnabled: false,
    reverbLevel: 0,
    sidechainEnabled: false,
    spectralFreezeEnabled: false,
    synthEuclideanMasterEnabled: false,
    waterEnabled: false,
  };
}

function sequencedSynthPatch(source, sourcePatch = {}) {
  return {
    ...lowNoisePatch(),
    synthLevel: 0.72,
    lead1Level: 0.72,
    lead2Level: 0.72,
    pianoLevel: 0.72,
    ...sourcePatch,
    sequencerMasterBPM: 150,
    synthAttack: 0.02,
    synthEuclid1Enabled: true,
    synthEuclid1Hits: 4,
    synthEuclid1Level: 0.95,
    synthEuclid1NoteMax: 64,
    synthEuclid1NoteMin: 64,
    synthEuclid1Preset: 'custom',
    synthEuclid1Probability: 1,
    synthEuclid1Rotation: 0,
    synthEuclid1Source: source,
    synthEuclid1Steps: 4,
    synthEuclid2Enabled: false,
    synthEuclid3Enabled: false,
    synthEuclid4Enabled: false,
    synthEuclidBaseBPM: 150,
    synthEuclidClockSource: 'localBeat',
    synthEuclidJoinPolicy: 'grid',
    synthEuclideanMasterEnabled: true,
    synthEuclideanTempo: 1,
    synthHold: 0.25,
    synthRelease: 0.45,
    transportBeatsPerBar: 4,
    transportPrimaryClock: 'seconds',
  };
}

function sample2PianoPatch() {
  return {
    sample2Enabled: true,
    sample2LibraryKey: 'piano',
    sample2Role: '',
    sample2Articulation: '',
    sample2SelectionMode: 'nearest',
    sample2DynamicMode: 'legacy-piano-parity',
    sample2FixedDynamic: 'regular',
    sample2VariantMode: 'stable',
    sample2LoopEnabled: false,
    sample2Level: 0.85,
    sample2ReverbSend: 0,
    sample2DelayASend: 0,
    sample2DelayBSend: 0,
    granularSample2Send: 0,
    sample2DiffuseSend: 0,
    sample2MaxVoices: 16,
  };
}

function sample2SoftStringPatch() {
  return {
    sample2Enabled: true,
    sample2LibraryKey: 'soft-string-spurs',
    sample2Role: 'sustain',
    sample2Articulation: 'core',
    sample2SelectionMode: 'mapped',
    sample2DynamicMode: 'velocity',
    sample2FixedDynamic: 'level-2',
    sample2VariantMode: 'stable',
    sample2LoopEnabled: true,
    sample2Level: 1.6,
    sample2ReverbSend: 0,
    sample2DelayASend: 0,
    sample2DelayBSend: 0,
    granularSample2Send: 0,
    sample2DiffuseSend: 0,
    sample2MaxVoices: 16,
  };
}

function createCases() {
  return [
    {
      id: 'lead1-running-preset-hot-swap',
      label: 'Lead 1 running preset hot-swap',
      baselineMode: 'fresh-target',
      trackId: 'lead1Dry',
      sourceId: 3,
      initialState: sequencedSynthPatch('lead1', {
        leadEnabled: true,
        lead1Density: 0,
        lead1Hold: 0.35,
        lead1Level: 0.72,
        lead1Morph: 0,
        lead1PresetA: 'soft_rhodes',
        lead1PresetB: 'soft_rhodes',
        lead1ReverbSend: 0,
        lead1DelayASend: 0,
        lead1DelayBSend: 0,
        granularLead1Send: 0,
      }),
      targetPatch: {
        lead1Morph: 0,
        lead1PresetA: 'gamelan',
        lead1PresetB: 'gamelan',
      },
      targetStatePatch: {
        lead1Morph: 0,
        lead1PresetA: 'gamelan',
        lead1PresetB: 'gamelan',
      },
    },
    {
      id: 'pad1-running-preset-hot-swap',
      label: 'Pad 1 running preset hot-swap',
      baselineMode: 'immediate-hot-swap',
      trackId: 'pad1Dry',
      sourceId: 1,
      initialState: sequencedSynthPatch('synth1', {
        padEnabled: true,
        padMorph: 0,
        padPresetA: 'init',
        padPresetB: 'init',
        pad1ReverbSend: 0,
        pad1DelayASend: 0,
        pad1DelayBSend: 0,
        granularPad1Send: 0,
        pad1DiffuseSend: 0,
      }),
      targetPatch: {
        padMorph: 0,
        padPresetA: 'glass_shimmer',
        padPresetB: 'glass_shimmer',
      },
      targetStatePatch: {
        padMorph: 0,
        padPresetA: 'glass_shimmer',
        padPresetB: 'glass_shimmer',
      },
    },
    {
      id: 'sample2-running-library-hot-swap-euclid',
      label: 'Sample 2 running library hot-swap on native Euclid',
      baselineMode: 'fresh-target',
      trackId: 'sample2Dry',
      sourceId: 8,
      expectedReloadReason: 'asset-reference-change',
      initialState: sequencedSynthPatch('sample2', {
        ...sample2PianoPatch(),
        synthEuclid1Level: 1,
        synthEuclid1NoteMin: 98,
        synthEuclid1NoteMax: 98,
      }),
      targetPatch: sample2SoftStringPatch(),
      targetStatePatch: sample2SoftStringPatch(),
    },
  ];
}

async function captureProductCase(browser, baseUrl, options, pageErrors) {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || text.includes('Sonic parity')) logs.push(`[${message.type()}] ${text}`);
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    logs.push(`[pageerror] ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    logs.push(`[requestfailed] ${request.method()} ${request.resourceType()} ${request.url()} ${failure?.errorText ?? ''}`.trim());
  });
  try {
    await page.goto(withCoreProductParity(baseUrl), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 20000 });
    const capture = await page.evaluate(
      async (captureOptions) => window.__kesshoSonicParity.capture(captureOptions),
      options,
    );
    await page.evaluate(() => window.__kesshoSonicParity?.teardown());
    return { capture, logs };
  } finally {
    await page.close().catch(() => {});
  }
}

function latestTelemetry(capture) {
  return capture?.debug?.latestTelemetry ?? {};
}

function sourceEntry(capture, sourceId) {
  return (latestTelemetry(capture).productDebugSourceStates ?? [])
    .find((entry) => entry?.sourceId === sourceId) ?? null;
}

function fullSnapshotReloadCount(capture) {
  const value = latestTelemetry(capture).fullSnapshotReloadCount;
  return Number.isFinite(value) ? value : 0;
}

function dirtyDiffCount(capture) {
  const value = latestTelemetry(capture).dirtyDiffCount;
  return Number.isFinite(value) ? value : 0;
}

function snapshotReloadReasons(capture) {
  const reasons = latestTelemetry(capture).snapshotReloadReasons;
  return Array.isArray(reasons) ? reasons.filter((reason) => typeof reason === 'string') : [];
}

function monoWindow(capture, startMs, endMs) {
  const sampleRate = capture.sampleRate;
  const start = Math.max(0, Math.min(capture.frames, Math.round(sampleRate * startMs / 1000)));
  const end = Math.max(start, Math.min(capture.frames, Math.round(sampleRate * endMs / 1000)));
  const frames = end - start;
  const result = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    result[index] = ((capture.left[start + index] ?? 0) + (capture.right[start + index] ?? 0)) * 0.5;
  }
  return result;
}

function rms(samples) {
  if (!samples.length) return 0;
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / samples.length);
}

function peak(samples) {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}

function envelope(samples, sampleRate, binMs) {
  const binFrames = Math.max(1, Math.round(sampleRate * binMs / 1000));
  const binCount = Math.max(1, Math.floor(samples.length / binFrames));
  const values = new Array(binCount);
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = bin * binFrames;
    const end = Math.min(samples.length, start + binFrames);
    let sumSquares = 0;
    for (let index = start; index < end; index += 1) {
      const sample = samples[index] ?? 0;
      sumSquares += sample * sample;
    }
    values[bin] = Math.sqrt(sumSquares / Math.max(1, end - start));
  }
  return values;
}

function compareEnvelopes(hotEnvelope, baselineEnvelope, maxLagBins) {
  let best = {
    correlation: -Infinity,
    distance: Infinity,
    lagBins: 0,
    overlapBins: 0,
  };
  for (let lag = -maxLagBins; lag <= maxLagBins; lag += 1) {
    const hotStart = Math.max(0, lag);
    const baselineStart = Math.max(0, -lag);
    const overlap = Math.min(hotEnvelope.length - hotStart, baselineEnvelope.length - baselineStart);
    if (overlap < 8) continue;
    let dot = 0;
    let hotEnergy = 0;
    let baselineEnergy = 0;
    let diffEnergy = 0;
    for (let index = 0; index < overlap; index += 1) {
      const hot = hotEnvelope[hotStart + index] ?? 0;
      const baseline = baselineEnvelope[baselineStart + index] ?? 0;
      dot += hot * baseline;
      hotEnergy += hot * hot;
      baselineEnergy += baseline * baseline;
      const diff = hot - baseline;
      diffEnergy += diff * diff;
    }
    const correlation = dot / Math.sqrt(Math.max(1e-24, hotEnergy * baselineEnergy));
    const distance = Math.sqrt(diffEnergy / Math.max(1e-24, baselineEnergy));
    if (
      correlation > best.correlation ||
      (Math.abs(correlation - best.correlation) < 1e-9 && distance < best.distance)
    ) {
      best = { correlation, distance, lagBins: lag, overlapBins: overlap };
    }
  }
  return best;
}

function compareWindows(hotCapture, baselineCapture, startMs, endMs) {
  assert(hotCapture.sampleRate === baselineCapture.sampleRate, `sample-rate mismatch: hot=${hotCapture.sampleRate}, baseline=${baselineCapture.sampleRate}`);
  const hotSamples = monoWindow(hotCapture, startMs, endMs);
  const baselineSamples = monoWindow(baselineCapture, startMs, endMs);
  const hotEnvelope = envelope(hotSamples, hotCapture.sampleRate, ENVELOPE_BIN_MS);
  const baselineEnvelope = envelope(baselineSamples, baselineCapture.sampleRate, ENVELOPE_BIN_MS);
  const maxLagBins = Math.max(1, Math.round(MAX_ENVELOPE_LAG_MS / ENVELOPE_BIN_MS));
  const envelopeComparison = compareEnvelopes(hotEnvelope, baselineEnvelope, maxLagBins);
  const hotRms = rms(hotSamples);
  const baselineRms = rms(baselineSamples);
  return {
    startMs,
    endMs,
    hotRms,
    baselineRms,
    hotPeak: peak(hotSamples),
    baselinePeak: peak(baselineSamples),
    energyRatio: hotRms / Math.max(1e-12, baselineRms),
    envelope: {
      ...envelopeComparison,
      lagMs: envelopeComparison.lagBins * ENVELOPE_BIN_MS,
      binMs: ENVELOPE_BIN_MS,
      maxLagMs: MAX_ENVELOPE_LAG_MS,
    },
  };
}

function summarizeCapture(capture, sourceId) {
  return {
    engine: capture.engine,
    sampleRate: capture.sampleRate,
    frames: capture.frames,
    durationMs: capture.durationMs,
    stats: capture.stats,
    fullSnapshotReloadCount: fullSnapshotReloadCount(capture),
    dirtyDiffCount: dirtyDiffCount(capture),
    snapshotReloadReasons: snapshotReloadReasons(capture),
    source: sourceEntry(capture, sourceId),
    transportRunning: latestTelemetry(capture).transportRunning ?? null,
  };
}

async function runCase(browser, baseUrl, caseDef, pageErrors) {
  const hotOptions = {
    durationMs: CAPTURE_DURATION_MS,
    settleMs: SETTLE_MS,
    trackId: caseDef.trackId,
    statePatch: caseDef.initialState,
    stateEvents: [{ delayMs: SWAP_DELAY_MS, patch: caseDef.targetPatch }],
  };
  const baselineOptions = {
    durationMs: CAPTURE_DURATION_MS,
    settleMs: SETTLE_MS,
    trackId: caseDef.trackId,
    statePatch: caseDef.baselineMode === 'immediate-hot-swap'
      ? caseDef.initialState
      : { ...caseDef.initialState, ...caseDef.targetStatePatch },
    stateEvents: caseDef.baselineMode === 'immediate-hot-swap'
      ? [{ delayMs: 0, patch: caseDef.targetPatch }]
      : [],
  };

  const hot = await captureProductCase(browser, baseUrl, hotOptions, pageErrors);
  const baseline = await captureProductCase(browser, baseUrl, baselineOptions, pageErrors);
  const hotCapture = hot.capture;
  const baselineCapture = baseline.capture;

  assert(hotCapture?.engine === 'core-product', `${caseDef.id}: hot capture engine was ${hotCapture?.engine}`);
  assert(baselineCapture?.engine === 'core-product', `${caseDef.id}: baseline capture engine was ${baselineCapture?.engine}`);
  assert(hotCapture?.debug?.runtimeReady === true, `${caseDef.id}: hot runtime was not ready`);
  assert(baselineCapture?.debug?.runtimeReady === true, `${caseDef.id}: baseline runtime was not ready`);
  assert(!hotCapture?.debug?.runtimeError, `${caseDef.id}: hot runtime error: ${hotCapture?.debug?.runtimeError}`);
  assert(!baselineCapture?.debug?.runtimeError, `${caseDef.id}: baseline runtime error: ${baselineCapture?.debug?.runtimeError}`);

  const hotSource = sourceEntry(hotCapture, caseDef.sourceId);
  const baselineSource = sourceEntry(baselineCapture, caseDef.sourceId);
  assert(hotSource, `${caseDef.id}: missing hot source telemetry for source ${caseDef.sourceId}`);
  assert(baselineSource, `${caseDef.id}: missing baseline source telemetry for source ${caseDef.sourceId}`);
  assert(
    hotSource.sourceStateHash === baselineSource.sourceStateHash,
    `${caseDef.id}: hot source hash ${hotSource.sourceStateHash} did not match target baseline ${baselineSource.sourceStateHash}`,
  );
  assert(fullSnapshotReloadCount(hotCapture) >= (caseDef.minFullSnapshotReloadCount ?? 2), `${caseDef.id}: hot capture did not report a source hot-swap full snapshot`);
  assert(
    snapshotReloadReasons(hotCapture).includes(caseDef.expectedReloadReason ?? 'source-structure-change'),
    `${caseDef.id}: hot capture did not report ${caseDef.expectedReloadReason ?? 'source-structure-change'} reload (${snapshotReloadReasons(hotCapture).join(', ')})`,
  );
  const post = compareWindows(hotCapture, baselineCapture, POST_START_MS, POST_END_MS);
  assert(post.hotRms > MIN_POST_RMS, `${caseDef.id}: post-swap hot audio stayed silent (${post.hotRms})`);
  assert(post.baselineRms > MIN_POST_RMS, `${caseDef.id}: target baseline audio stayed silent (${post.baselineRms})`);
  assert(
    post.energyRatio >= MIN_ENERGY_RATIO && post.energyRatio <= MAX_ENERGY_RATIO,
    `${caseDef.id}: post-swap energy ratio ${post.energyRatio} outside ${MIN_ENERGY_RATIO}..${MAX_ENERGY_RATIO}`,
  );
  assert(
    post.envelope.correlation >= MIN_POST_ENVELOPE_CORRELATION ||
      post.envelope.distance <= MAX_POST_ENVELOPE_DISTANCE,
    `${caseDef.id}: post-swap envelope did not match target baseline (corr=${post.envelope.correlation}, distance=${post.envelope.distance})`,
  );

  const pre = compareWindows(hotCapture, baselineCapture, PRE_START_MS, PRE_END_MS);
  return {
    id: caseDef.id,
    label: caseDef.label,
    status: 'pass',
    baselineMode: caseDef.baselineMode,
    trackId: caseDef.trackId,
    sourceId: caseDef.sourceId,
    timing: {
      captureDurationMs: CAPTURE_DURATION_MS,
      settleMs: SETTLE_MS,
      swapDelayMs: SWAP_DELAY_MS,
      postStartMs: POST_START_MS,
      postEndMs: POST_END_MS,
    },
    gates: {
      minPostRms: MIN_POST_RMS,
      minPostEnvelopeCorrelation: MIN_POST_ENVELOPE_CORRELATION,
      maxPostEnvelopeDistance: MAX_POST_ENVELOPE_DISTANCE,
      minEnergyRatio: MIN_ENERGY_RATIO,
      maxEnergyRatio: MAX_ENERGY_RATIO,
    },
    preWindowAgainstTarget: pre,
    postWindowAgainstTarget: post,
    hotCapture: summarizeCapture(hotCapture, caseDef.sourceId),
    baselineCapture: summarizeCapture(baselineCapture, caseDef.sourceId),
    logs: {
      hot: hot.logs,
      baseline: baseline.logs,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vite = args.url ? { url: args.url, stop: async () => {} } : await startDevServer(args.port);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const pageErrors = [];

  try {
    const cases = [];
    for (const caseDef of createCases()) {
      cases.push(await runCase(browser, vite.url, caseDef, pageErrors));
    }
    assert(pageErrors.length === 0, `Page errors were reported: ${pageErrors.join('; ')}`);

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'pass',
      url: vite.url,
      cases,
    };
    mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
    writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      reportMarkdownPath,
      [
        '# Kessho Product Running Preset Hot-Swap Audio Parity',
        '',
        `Generated: ${report.generatedAt}`,
        '',
        `Status: **${report.status.toUpperCase()}**`,
        '',
        ...cases.flatMap((caseReport) => [
          `## ${caseReport.label}`,
          '',
          `Track: \`${caseReport.trackId}\`; source ID: \`${caseReport.sourceId}\`; baseline: \`${caseReport.baselineMode}\``,
          `Full snapshot reloads: hot \`${caseReport.hotCapture.fullSnapshotReloadCount}\`, baseline \`${caseReport.baselineCapture.fullSnapshotReloadCount}\``,
          `Dirty diffs: hot \`${caseReport.hotCapture.dirtyDiffCount}\`, baseline \`${caseReport.baselineCapture.dirtyDiffCount}\``,
          `Source hash: \`${caseReport.hotCapture.source?.sourceStateHash ?? 'missing'}\`; compiled hash: \`${caseReport.hotCapture.source?.compiledSourceHash ?? 'missing'}\``,
          `Post-swap RMS: hot \`${caseReport.postWindowAgainstTarget.hotRms.toFixed(8)}\`, baseline \`${caseReport.postWindowAgainstTarget.baselineRms.toFixed(8)}\`, ratio \`${caseReport.postWindowAgainstTarget.energyRatio.toFixed(4)}\``,
          `Post-swap envelope: corr \`${caseReport.postWindowAgainstTarget.envelope.correlation.toFixed(4)}\`, distance \`${caseReport.postWindowAgainstTarget.envelope.distance.toFixed(4)}\`, lag \`${caseReport.postWindowAgainstTarget.envelope.lagMs}ms\``,
          '',
        ]),
      ].join('\n'),
    );
    console.log('Kessho Product running preset hot-swap audio parity checks passed');
  } finally {
    await browser.close();
    await vite.stop();
  }
}

await main();
