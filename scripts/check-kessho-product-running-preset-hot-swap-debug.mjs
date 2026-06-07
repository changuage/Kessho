#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const DEFAULT_PORT = 4191;
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-running-preset-hot-swap-debug-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-running-preset-hot-swap-debug-latest.md');

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-running-preset-hot-swap-debug.mjs [--url=http://127.0.0.1:5173/] [--port=4191]');
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
    throw new Error(`Playwright is required for Product hot-swap debug proof but is not available: ${detail}`);
  }
}

function withParity(url) {
  const next = new URL(url);
  next.searchParams.set('parity', '1');
  return next.toString();
}

function uniqueValues(records, key) {
  return Array.from(new Set(records.map((record) => record?.[key]).filter(Boolean)));
}

function sourceEntry(telemetry, sourceId) {
  return (telemetry?.productDebugSourceStates ?? []).find((entry) => entry.sourceId === sourceId) ?? null;
}

function latestSpawn(telemetry, sourceId) {
  return (telemetry?.productDebugVoiceSpawns ?? [])
    .filter((entry) => entry.sourceId === sourceId)
    .sort((left, right) => (left.triggerSequence ?? 0) - (right.triggerSequence ?? 0))
    .at(-1) ?? null;
}

function baseHotSwapState() {
  return {
    birds2Enabled: false,
    birdsEnabled: false,
    characterEnabled: false,
    delayAEnabled: false,
    delayBToASend: 0,
    drumEnabled: false,
    drumEuclidMasterEnabled: false,
    dynamicsEnabled: false,
    frogsEnabled: false,
    granularEnabled: false,
    lead2Enabled: false,
    leadEnabled: true,
    leadRandomEnabled: false,
    lead1Density: 0,
    lead1Hold: 0.35,
    lead1Level: 0.38,
    lead1Morph: 0,
    lead1PresetA: 'soft_rhodes',
    lead1PresetB: 'gamelan',
    masterVolume: 0.75,
    oceanSampleEnabled: false,
    pad2Enabled: false,
    padEnabled: true,
    padMorph: 0,
    padPresetA: 'init',
    padPresetB: 'saturated_drift',
    pianoEnabled: false,
    reverbEnabled: false,
    sidechainEnabled: false,
    spectralFreezeEnabled: false,
    synthAttack: 0.05,
    synthChordSequencerEnabled: false,
    synthEuclideanMasterEnabled: false,
    synthHold: 0.25,
    synthLevel: 0.32,
    synthRelease: 0.45,
    waterEnabled: false,
  };
}

async function waitForStage(records, stage, minCount, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (records.filter((record) => record?.stage === stage).length >= minCount) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${minCount} ${stage} records`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vite = args.url ? { url: args.url, stop: async () => {} } : await startDevServer(args.port);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const productStateRecords = [];
  const pageErrors = [];

  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('kesshoProductStateDebug', '1');
    });
    page.on('console', async (message) => {
      if (!message.text().startsWith('[kessho-product-state]')) return;
      const args = message.args();
      try {
        const record = await args[1]?.jsonValue();
        if (record && typeof record === 'object') productStateRecords.push(record);
      } catch {
        productStateRecords.push({ stage: 'unreadable-console-record', text: message.text() });
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(withParity(vite.url), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__kesshoProductRuntimeProbe?.startState), null, { timeout: 20000 });

    const result = await page.evaluate(async (initialState) => {
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const probe = window.__kesshoProductRuntimeProbe;
      await probe.startState({ statePatch: initialState, activeTab: 'synth' });
      await wait(1000);
      const before = probe.readProductStateProbe();

      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          padPresetA: 'glass_shimmer',
          padPresetB: 'warm_analog',
          padMorph: 0,
        },
      });
      await wait(900);
      await probe.triggerSampleHoldNote({ source: 'pad1', midi: 60, velocity: 0.85, durationMs: 360 });
      await wait(900);
      const afterPad = probe.readProductStateProbe();

      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          lead1PresetA: 'gamelan',
          lead1PresetB: 'soft_rhodes',
          lead1Morph: 0,
        },
      });
      await wait(900);
      await probe.triggerSampleHoldNote({ source: 'lead1', midi: 67, velocity: 0.85, durationMs: 360 });
      await wait(1200);
      const afterLead = probe.readProductStateProbe();

      return { before, afterPad, afterLead };
    }, baseHotSwapState());

    await waitForStage(productStateRecords, 'product-control-resolved', 2);
    await waitForStage(productStateRecords, 'encoded-product-snapshot', 2);
    await waitForStage(productStateRecords, 'snapshot-applied', 2);
    await waitForStage(productStateRecords, 'cpp-product-telemetry', 2);

    assert(pageErrors.length === 0, `Page errors were reported: ${pageErrors.join('; ')}`);
    assert(result.before?.telemetry?.transportRunning === true, 'transport was not running before hot-swap');
    assert(result.afterPad?.telemetry?.transportRunning === true, 'transport stopped after Pad hot-swap');
    assert(result.afterLead?.telemetry?.transportRunning === true, 'transport stopped after Lead hot-swap');

    const padBefore = sourceEntry(result.before?.telemetry, 1);
    const padAfter = sourceEntry(result.afterPad?.telemetry, 1);
    const leadBefore = sourceEntry(result.afterPad?.telemetry, 3);
    const leadAfter = sourceEntry(result.afterLead?.telemetry, 3);
    assert(padBefore && padAfter, 'Pad source debug telemetry was missing');
    assert(leadBefore && leadAfter, 'Lead source debug telemetry was missing');
    assert(
      padBefore.sourceStateHash !== padAfter.sourceStateHash ||
        padBefore.compiledSourceHash !== padAfter.compiledSourceHash,
      'Pad source hash did not change after running hot-swap',
    );
    assert(
      leadBefore.sourceStateHash !== leadAfter.sourceStateHash ||
        leadBefore.compiledSourceHash !== leadAfter.compiledSourceHash,
      'Lead source hash did not change after running hot-swap',
    );

    const padSpawn = latestSpawn(result.afterPad?.telemetry, 1);
    const leadSpawn = latestSpawn(result.afterLead?.telemetry, 3);
    assert(padSpawn, 'Pad voice-spawn telemetry was missing after hot-swap trigger');
    assert(leadSpawn, 'Lead voice-spawn telemetry was missing after hot-swap trigger');
    assert(padSpawn.sourceStateHash === padAfter.sourceStateHash, 'Pad voice-spawn hash did not match active source hash');
    assert(leadSpawn.sourceStateHash === leadAfter.sourceStateHash, 'Lead voice-spawn hash did not match active source hash');

    const productControlRecords = productStateRecords.filter((record) => record.stage === 'product-control-resolved');
    const encodedRecords = productStateRecords.filter((record) => record.stage === 'encoded-product-snapshot');
    const appliedRecords = productStateRecords.filter((record) => record.stage === 'snapshot-applied');
    assert(uniqueValues(productControlRecords, 'padRelevantHash').length >= 2, 'ProductControl Pad hash did not change');
    assert(uniqueValues(productControlRecords, 'leadRelevantHash').length >= 2, 'ProductControl Lead hash did not change');
    assert(uniqueValues(encodedRecords, 'encodedSnapshotHash').length >= 2, 'encoded snapshot hash did not change');
    assert(uniqueValues(appliedRecords, 'encodedSnapshotHash').length >= 2, 'worklet-applied snapshot hash did not change');

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'pass',
      url: vite.url,
      productControlHashCount: productControlRecords.length,
      encodedSnapshotHashCount: encodedRecords.length,
      workletAppliedHashCount: appliedRecords.length,
      pad: {
        before: padBefore,
        after: padAfter,
        spawn: padSpawn,
      },
      lead: {
        before: leadBefore,
        after: leadAfter,
        spawn: leadSpawn,
      },
    };
    mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
    writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(
      reportMarkdownPath,
      [
        '# Kessho Product Running Preset Hot-Swap Debug',
        '',
        `Generated: ${report.generatedAt}`,
        '',
        `Status: **${report.status.toUpperCase()}**`,
        '',
        `ProductControl hash records: ${report.productControlHashCount}`,
        `Encoded snapshot records: ${report.encodedSnapshotHashCount}`,
        `Worklet-applied records: ${report.workletAppliedHashCount}`,
        '',
        `Pad source: ${padBefore.sourceStateHash}/${padBefore.compiledSourceHash} -> ${padAfter.sourceStateHash}/${padAfter.compiledSourceHash}; voice ${padSpawn.sourceStateHash}/${padSpawn.compiledSourceHash}`,
        `Lead source: ${leadBefore.sourceStateHash}/${leadBefore.compiledSourceHash} -> ${leadAfter.sourceStateHash}/${leadAfter.compiledSourceHash}; voice ${leadSpawn.sourceStateHash}/${leadSpawn.compiledSourceHash}`,
        '',
      ].join('\n'),
    );
    console.log('Kessho Product running preset hot-swap debug checks passed');
  } finally {
    await browser.close();
    await vite.stop();
  }
}

await main();
