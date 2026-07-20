#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4185;
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-browser-runtime-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-browser-runtime-latest.md');
const capturePreviewOutDir = 'build/kessho-product-browser-runtime-dist';

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

function graphCaptureBuildEnv() {
  return {
    ...process.env,
    BROWSER: 'none',
    VITE_KESSHO_ENABLE_GRAPH_CAPTURE: 'true',
  };
}

function buildGraphCapturePreviewBundle() {
  const result = spawnSync(process.execPath, [
    'node_modules/.bin/vite',
    'build',
    '--outDir',
    capturePreviewOutDir,
    '--emptyOutDir',
  ], {
    cwd: root,
    env: graphCaptureBuildEnv(),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Capture-enabled Product browser runtime build failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function startPreview(port, outDir = 'dist') {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', outDir], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: graphCaptureBuildEnv(),
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
    synthLevel: 0.25,
    synthChordSequencerEnabled: true,
    synthChordSequencerSource: 'pad1',
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
      captureStems: caseDef.captureStems === true,
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
      activeTab: 'global',
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

async function captureSynthArpProbe(page, baseUrl) {
  await page.goto(withQuery(baseUrl, { parity: '1' }), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__kesshoProductRuntimeProbe?.configureSynthArpSequencer), null, { timeout: 15000 });
  const capture = await page.evaluate(async () => {
    const probe = window.__kesshoProductRuntimeProbe;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    await probe.startState({
      activeTab: 'synth',
      statePatch: {
        masterVolume: 0.7,
        padEnabled: false,
        leadEnabled: true,
        lead2Enabled: false,
        pianoEnabled: false,
        lead1Level: 0.8,
        synthLevel: 0.8,
        synthChordSequencerEnabled: false,
        synthEuclideanMasterEnabled: true,
        synthEuclidJoinPolicy: 'grid',
        synthEuclidClockSource: 'localBeat',
        synthClockDivs: ['1/16'],
        sequencerMasterBPM: 120,
        synthEuclidBaseBPM: 120,
        synthEuclideanTempo: 1,
        synthEuclid1Enabled: true,
        synthEuclid1Preset: 'custom',
        synthEuclid1Steps: 16,
        synthEuclid1Hits: 1,
        synthEuclid1Rotation: 0,
        synthEuclid1NoteMin: 60,
        synthEuclid1NoteMax: 60,
        synthEuclid1Level: 1,
        synthEuclid1Probability: 1,
        synthEuclid1Source: 'lead1',
        synthEuclid2Enabled: false,
        synthEuclid3Enabled: false,
        synthEuclid4Enabled: false,
      },
    });
    let stableRevision = probe.readProductStateProbe().diagnostics.lastCommittedRevision;
    let stableSince = Date.now();
    const reconciliationDeadline = Date.now() + 5000;
    while (Date.now() < reconciliationDeadline && Date.now() - stableSince < 750) {
      await wait(50);
      const diagnostics = probe.readProductStateProbe().diagnostics;
      if (diagnostics.lastCommittedRevision !== stableRevision || diagnostics.pendingCommitCount > 0) {
        stableRevision = diagnostics.lastCommittedRevision;
        stableSince = Date.now();
      }
    }
    if (Date.now() - stableSince < 750) {
      throw new Error(`synth ARP startup reconciliation did not settle (revision=${stableRevision})`);
    }
    const fixtureDeadline = Date.now() + 5000;
    while (true) {
      const fixtureRevision = probe.readProductStateProbe().diagnostics.lastCommittedRevision;
      await probe.configureSynthArpSequencer({ laneIndex: 0 });
      await wait(300);
      const diagnostics = probe.readProductStateProbe().diagnostics;
      if (diagnostics.lastCommittedRevision === fixtureRevision && diagnostics.pendingCommitCount === 0) break;
      if (Date.now() >= fixtureDeadline) {
        throw new Error(
          `synth ARP fixture was repeatedly superseded by host commits ` +
            `(before=${fixtureRevision}, after=${diagnostics.lastCommittedRevision}, pending=${diagnostics.pendingCommitCount})`,
        );
      }
    }
    await probe.configureSynthArp({
      laneIndex: 0,
      length: 8,
      rate: 1,
      midiPattern: [60, 62, 64, 65, 67, 69, 71, 72],
    });
    const parentHitBaseline = probe.readProductStateProbe().telemetry?.synthSequencerHitCounts?.[0] ?? 0;
    const firstArpTriggerDeadline = Date.now() + 7000;
    let activePhrase = null;
    let lastParentProbe = null;
    while (Date.now() < firstArpTriggerDeadline) {
      await wait(80);
      const sample = probe.readProductStateProbe();
      lastParentProbe = sample;
      if ((sample.telemetry?.synthSequencerHitCounts?.[0] ?? 0) > parentHitBaseline) {
        activePhrase = sample;
        break;
      }
    }
    if (!activePhrase) {
      throw new Error(
        `synth ARP did not receive a parent trigger after the pattern commit ` +
          `(baseline=${parentHitBaseline}): ${JSON.stringify(lastParentProbe)}`,
      );
    }
    await wait(80);
    await probe.configureSynthArp({
      laneIndex: 0,
      length: 8,
      rate: 1,
      midiPattern: [72, 74, 76, 77, 79, 81, 83, 84],
    });
    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      await wait(50);
      const sample = probe.readProductStateProbe();
      if ((sample.telemetry?.synthSequencerHitCounts?.[0] ?? 0) !== parentHitBaseline + 1) break;
      samples.push(sample);
    }
    const timingSamples = [];
    const sampleTimingWindow = async (label, durationMs) => {
      const startedAt = Date.now();
      const deadline = startedAt + durationMs;
      while (Date.now() < deadline) {
        await wait(50);
        timingSamples.push({
          label,
          elapsedMs: Date.now() - startedAt,
          ...probe.readProductStateProbe(),
        });
      }
    };
    await sampleTimingWindow('baseline', 250);
    await probe.applyStatePatch({
      activeTab: 'global',
      patch: {
        phraseLength: 4,
        transportPrimaryClock: 'seconds',
        sequencerMasterBPM: 240,
        synthEuclidBaseBPM: 240,
        drumEuclidBaseBPM: 240,
      },
    });
    await sampleTimingWindow('phrase-seconds-live', 350);
    await probe.configureSynthLaneTiming({ laneIndex: 0, clockDivision: 32, swing: 0.35 });
    await sampleTimingWindow('lane-clock-swing-live', 350);
    await probe.applyStatePatch({
      activeTab: 'drums',
      patch: {
        phraseLength: 3,
        transportBeatsPerBar: 3,
        transportBarsPerPhrase: 2,
        sequencerMasterBPM: 120,
        synthEuclidBaseBPM: 120,
        drumEuclidBaseBPM: 120,
      },
    });
    await sampleTimingWindow('bar-beat-live', 350);
    await probe.configureSynthLaneTiming({ laneIndex: 0, tempoMultiplier: 1.5 });
    await sampleTimingWindow('lane-multiplier-live', 350);
    await probe.applyStatePatch({ activeTab: 'global', patch: {} });
    await sampleTimingWindow('away-from-synth', 350);
    for (const transition of [
      { phraseLength: 2.5, sequencerMasterBPM: 144 },
      { phraseLength: 3.75, sequencerMasterBPM: 96 },
      { phraseLength: 2, sequencerMasterBPM: 180 },
    ]) {
      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          ...transition,
          transportBeatsPerBar: 3,
          transportBarsPerPhrase: 2,
          synthEuclidBaseBPM: transition.sequencerMasterBPM,
          drumEuclidBaseBPM: transition.sequencerMasterBPM,
        },
      });
      await sampleTimingWindow('repeated-live-drag', 220);
    }
    return {
      parentHitCountAtPendingUpdate: activePhrase.telemetry?.synthSequencerHitCounts?.[0] ?? 0,
      samples,
      timingSamples,
    };
  });

  const sampleUiTimingWindow = (label, durationMs, intervalMs = 50) => page.evaluate(
    async ({ label: sampleLabel, durationMs: sampleDurationMs, intervalMs: sampleIntervalMs }) => {
      const probe = window.__kesshoProductRuntimeProbe;
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const samples = [];
      const startedAt = Date.now();
      const deadline = startedAt + sampleDurationMs;
      while (Date.now() < deadline) {
        await wait(sampleIntervalMs);
        samples.push({
          label: sampleLabel,
          elapsedMs: Date.now() - startedAt,
          ...probe.readProductStateProbe(),
        });
      }
      return samples;
    },
    { label, durationMs, intervalMs },
  );

  // Align native timing with the visible controls, then exercise the real UI
  // callbacks. This guards against a live native event path being correct while
  // the Clock/Swing controls are accidentally routed through a delayed commit.
  await page.evaluate(async () => {
    await window.__kesshoProductRuntimeProbe.configureSynthLaneTiming({
      laneIndex: 0,
      clockDivision: 16,
      swing: 0,
      tempoMultiplier: 1,
    });
  });
  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  capture.timingSamples.push(...await sampleUiTimingWindow('ui-clock-baseline', 600));

  const clockSelect = page.getByRole('combobox', { name: 'Clock', exact: true });
  await clockSelect.selectOption('1/32');
  capture.timingSamples.push(...await sampleUiTimingWindow('ui-clock-live', 600));

  const swingSlider = page.getByRole('slider', { name: /^Swing/ });
  const swingBox = await swingSlider.boundingBox();
  assert(swingBox, 'synth Swing slider has no browser layout box');
  const swingY = swingBox.y + swingBox.height / 2;
  const uiSwingDragValues = [];
  await page.mouse.move(swingBox.x + swingBox.width * 0.05, swingY);
  await page.mouse.down();
  for (const fraction of [0.25, 0.55, 0.85]) {
    await page.mouse.move(swingBox.x + swingBox.width * fraction, swingY, { steps: 4 });
    uiSwingDragValues.push(Number.parseFloat(await swingSlider.inputValue()));
    capture.timingSamples.push(...await sampleUiTimingWindow('ui-swing-drag-live', 180, 45));
  }
  assert(
    new Set(uiSwingDragValues).size >= 2 && Math.max(...uiSwingDragValues) >= 0.5,
    `visible Swing control did not update before pointer release (${uiSwingDragValues.join(', ')})`,
  );
  await page.mouse.up();
  capture.timingSamples.push(...await sampleUiTimingWindow('ui-swing-release', 250));
  capture.uiSwingDragValues = uiSwingDragValues;
  return capture;
}

function observedSequencerStepAdvance(samples, label, stepCount = 16) {
  const steps = samples
    .filter((sample) => sample.label === label)
    .map((sample) => sample.telemetry?.synthSequencerCurrentSteps?.[0])
    .filter((step) => Number.isInteger(step));
  let advance = 0;
  for (let index = 1; index < steps.length; index += 1) {
    advance += (steps[index] - steps[index - 1] + stepCount) % stepCount;
  }
  return { advance, steps };
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
  const transportDebug = latest.productState?.transportDebug ?? {};
  assert((bridgeDebug.rangeSetCallCount ?? 0) > 0, 'runtime-walk bridge did not receive UI range-set calls');
  assert((bridgeDebug.postedEventCount ?? 0) > 0, 'runtime-walk bridge did not post ProductEvents');
  assert((bridgeDebug.telemetryValueCount ?? 0) > 0, 'runtime-walk bridge did not receive telemetry values');
  assert((bridgeDebug.publishedPositionCount ?? 0) > 0, 'runtime-walk bridge did not publish positions');
  assert(
    (runtimeSliderDebug.walkStoreUpdateCount ?? 0) === 0,
    `inactive runtime-walk UI store received unnecessary position updates: ${JSON.stringify(runtimeSliderDebug)}`,
  );
  assert(
    (runtimeSliderDebug.walkIndicatorConsumeCount ?? 0) === 0,
    `inactive runtime-walk indicator consumed positions: ${JSON.stringify(runtimeSliderDebug)}`,
  );
  assert(
    (runtimeSliderDebug.triggerStoreUpdateCount ?? 0) === 0,
    `inactive piano trigger UI received unnecessary updates: ${JSON.stringify({ runtimeSliderDebug, transportDebug })}`,
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
  assert(
    (runtimeSliderDebug.triggerStoreUpdateCount ?? 0) === 0,
    `inactive sample-hold UI store received trigger positions: ${JSON.stringify(runtimeSliderDebug)}`,
  );
  assert(
    (runtimeSliderDebug.triggerFlashUpdateCount ?? 0) === 0,
    `inactive sample-hold UI store received flash updates: ${JSON.stringify(runtimeSliderDebug)}`,
  );
  assert(
    (runtimeSliderDebug.triggerIndicatorConsumeCount ?? 0) === 0,
    `inactive sample-hold indicator consumed positions: ${JSON.stringify(runtimeSliderDebug)}`,
  );
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

function assertSynthArpProbe(capture) {
  const samples = capture?.samples;
  assert(Array.isArray(samples) && samples.length >= 8, 'synth ARP probe did not return enough telemetry samples');
  const parentHitCountAtPendingUpdate = capture?.parentHitCountAtPendingUpdate;
  assert(Number.isInteger(parentHitCountAtPendingUpdate) && parentHitCountAtPendingUpdate >= 1, 'synth ARP probe did not capture an active parent phrase');
  const telemetry = samples.map((sample) => sample?.telemetry ?? {});
  const arpSteps = telemetry
    .map((sample) => sample.synthArpCurrentSteps?.[0])
    .filter((step) => Number.isInteger(step));
  const distinctSteps = [...new Set(arpSteps)];
  assert(
    distinctSteps.length >= 3,
    `synth ARP did not advance through multiple native steps (${arpSteps.join(', ')}); ` +
      `midis=${telemetry.map((sample) => sample.synthArpCurrentMidis?.[0] ?? null).join(', ')}; ` +
      `parentHits=${telemetry.map((sample) => sample.synthSequencerHitCounts?.[0] ?? null).join(', ')}; ` +
      `errors=${telemetry.map((sample) => sample.lastErrorCode ?? null).join(', ')}; ` +
      `output=${telemetry.map((sample) => sample.workletLeadStemPeak ?? sample.masterOutputPeak ?? 0).join(', ')}`,
  );
  assert(
    telemetry.every((sample) => (sample.synthSequencerHitCounts?.[0] ?? 0) === parentHitCountAtPendingUpdate),
    `synth ARP pending update crossed a parent-trigger boundary (${telemetry.map((sample) => sample.synthSequencerHitCounts?.[0] ?? 0).join(', ')})`,
  );
  assert(
    telemetry.some((sample) => (sample.synthArpCurrentMidis?.[0] ?? -1) >= 72),
    `synth ARP pending pattern did not become audible before the next parent trigger (${telemetry.map((sample) => sample.synthArpCurrentMidis?.[0] ?? -1).join(', ')})`,
  );
  assert(
    telemetry.some((sample) => (sample.workletLeadStemPeak ?? 0) > 0.000001 || (sample.masterOutputPeak ?? 0) > 0.000001),
    'synth ARP produced no Product Core audio output',
  );
  assert(
    telemetry.every((sample) => (sample.lastErrorCode ?? 0) > 0),
    `synth ARP Product Core error: ${telemetry.map((sample) => sample.lastErrorCode ?? 0).join(', ')}`,
  );
  const timingSamples = Array.isArray(capture?.timingSamples) ? capture.timingSamples : [];
  assert(timingSamples.length >= 30, 'synth ARP live-timing probe did not return enough telemetry samples');
  const timingTelemetry = timingSamples.map((sample) => sample?.telemetry ?? {});
  const timingArpSteps = timingTelemetry
    .map((sample) => sample.synthArpCurrentSteps?.[0])
    .filter((step) => Number.isInteger(step));
  const timingHitCounts = timingTelemetry.map((sample) => sample.synthSequencerHitCounts?.[0] ?? 0);
  for (let index = 1; index < timingHitCounts.length; index += 1) {
    assert(
      timingHitCounts[index] >= timingHitCounts[index - 1],
      `live timing reset the synth parent-hit count (${timingHitCounts.join(', ')})`,
    );
  }
  const timingRevisions = timingTelemetry.map((sample) => sample.transportTransitionRevision ?? 0);
  for (let index = 1; index < timingRevisions.length; index += 1) {
    assert(
      timingRevisions[index] >= timingRevisions[index - 1],
      `live timing regressed the transport transition revision (${timingRevisions.join(', ')})`,
    );
  }
  assert(
    Math.max(...timingRevisions) > Math.min(...timingRevisions),
    `live transport timing changes did not reach Product Core (${JSON.stringify(timingSamples.map((sample) => ({
      label: sample.label,
      revision: sample.telemetry?.transportTransitionRevision ?? 0,
      bpm: sample.telemetry?.transportBpm ?? null,
      phraseSeconds: sample.telemetry?.transportPhraseSeconds ?? null,
      running: sample.telemetry?.transportRunning ?? null,
      reloads: sample.diagnostics?.snapshotReloadReasons ?? [],
      dirtyDiffCount: sample.diagnostics?.dirtyDiffCount ?? null,
    })))})`,
  );
  assert(
    timingTelemetry.every((sample) => sample.transportTransitionPending !== true),
    'live timing unexpectedly staged a next-phrase transport transition',
  );
  assert(
    new Set(timingArpSteps).size >= 4,
    `synth ARP did not keep advancing through live timing and page changes (${timingArpSteps.join(', ')})`,
  );
  const uiClockBaseline = observedSequencerStepAdvance(timingSamples, 'ui-clock-baseline');
  const uiClockLive = observedSequencerStepAdvance(timingSamples, 'ui-clock-live');
  assert(
    uiClockBaseline.advance >= 2,
    `visible Clock baseline did not advance enough to measure (${uiClockBaseline.steps.join(', ')})`,
  );
  assert(
    uiClockLive.advance >= uiClockBaseline.advance * 1.5,
    `visible Clock change did not retime the running lane (${uiClockBaseline.advance} -> ${uiClockLive.advance}; ${uiClockLive.steps.join(', ')})`,
  );
  const liveSignal = timingTelemetry.map((sample) => (
    (sample.activeVoices ?? 0) > 0 ||
    (sample.masterOutputRms ?? 0) > 0.000001 ||
    (sample.workletLeadStemPeak ?? 0) > 0.000001
  ));
  let longestSilentRun = 0;
  let silentRun = 0;
  for (const active of liveSignal) {
    silentRun = active ? 0 : silentRun + 1;
    longestSilentRun = Math.max(longestSilentRun, silentRun);
  }
  assert(
    longestSilentRun <= 5,
    `synth ARP audio became inactive for more than 250 ms during live timing (${liveSignal.map((active) => active ? 1 : 0).join('')})`,
  );
  for (const label of [
    'phrase-seconds-live',
    'lane-clock-swing-live',
    'bar-beat-live',
    'lane-multiplier-live',
    'away-from-synth',
    'repeated-live-drag',
    'ui-clock-live',
    'ui-swing-drag-live',
    'ui-swing-release',
  ]) {
    assert(
      timingSamples.some((sample) => sample.label === label && (
        (sample.telemetry?.activeVoices ?? 0) > 0 ||
        (sample.telemetry?.workletLeadStemPeak ?? 0) > 0.000001
      )),
      `synth ARP produced no audio evidence during ${label}`,
    );
  }
  assertCleanProbeDiagnostics(timingSamples.at(-1), 'synth ARP live-timing probe');
  return {
    id: 'synth-arp-native-runtime',
    arpSteps,
    distinctStepCount: distinctSteps.length,
    hitCount: parentHitCountAtPendingUpdate,
    peak: Math.max(...telemetry.map((sample) => Math.max(sample.workletLeadStemPeak ?? 0, sample.masterOutputPeak ?? 0))),
    liveTimingSampleCount: timingSamples.length,
    liveTimingDistinctArpSteps: new Set(timingArpSteps).size,
    liveTimingTransitionRevisions: [...new Set(timingRevisions)],
    liveTimingLongestSilentMs: longestSilentRun * 50,
    uiClockBaselineAdvance: uiClockBaseline.advance,
    uiClockLiveAdvance: uiClockLive.advance,
    uiSwingDragValues: capture.uiSwingDragValues,
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
    '## Synth ARP',
    '',
    report.synthArpProbe
      ? `Distinct native ARP steps: ${report.synthArpProbe.distinctStepCount}; parent hits: ${report.synthArpProbe.hitCount}; peak: ${report.synthArpProbe.peak.toFixed(6)}; live timing samples: ${report.synthArpProbe.liveTimingSampleCount}; live timing ARP steps: ${report.synthArpProbe.liveTimingDistinctArpSteps}; longest inactive window: ${report.synthArpProbe.liveTimingLongestSilentMs} ms`
      : 'Not run',
    '',
  ];
  writeFileSync(reportMarkdownPath, `${lines.join('\n')}\n`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.url) buildGraphCapturePreviewBundle();
const vite = args.url ? { url: args.url, stop: async () => {} } : await startPreview(args.port, capturePreviewOutDir);
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
  graphCapturePreviewBuild: args.url ? 'external-url' : capturePreviewOutDir,
  cases: [],
  earthTextureProbe: null,
  runtimeWalkProbe: null,
  sampleHoldProbe: null,
  synthArpProbe: null,
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
      captureStems: true,
      baseUrl: vite.url,
    },
    {
      id: 'string-waves-arrangement',
      durationMs: 18200,
      settleMs: 800,
      statePatch: stringWavesArrangementPatch(),
      manualNotes: [{ source: 'pad1', midi: 60, velocity: 0.8, durationMs: 20000 }],
      captureStems: true,
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
  const synthArpSamples = await captureSynthArpProbe(page, vite.url);
  report.synthArpProbe = assertSynthArpProbe(synthArpSamples);
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
