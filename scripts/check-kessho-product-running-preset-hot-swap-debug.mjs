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

function sequencerHitCount(telemetry, laneIndex = 0) {
  const value = telemetry?.synthSequencerHitCounts?.[laneIndex];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function baseHotSwapState() {
  return {
    birds2Enabled: false,
    birdsEnabled: false,
    driftEnabled: false,
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
    synthEuclid1Enabled: true,
    synthEuclid1Hits: 4,
    synthEuclid1NoteMax: 64,
    synthEuclid1NoteMin: 64,
    synthEuclid1Preset: 'custom',
    synthEuclid1Probability: 1,
    synthEuclid1Rotation: 0,
    synthEuclid1Source: 'synth1',
    synthEuclid1Steps: 4,
    synthEuclid2Enabled: false,
    synthEuclid3Enabled: false,
    synthEuclid4Enabled: false,
    synthEuclidBaseBPM: 150,
    synthEuclidClockSource: 'localBeat',
    synthEuclideanMasterEnabled: true,
    synthEuclideanTempo: 1,
    synthHold: 0.25,
    synthLevel: 0.32,
    synthRelease: 0.45,
    sequencerMasterBPM: 150,
    waterEnabled: false,
  };
}

async function waitForStage(records, stage, minCount, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (records.filter((record) => record?.stage === stage).length >= minCount) return;
    await delay(100);
  }
  const stageCounts = records.reduce((counts, record) => {
    const recordStage = record?.stage ?? 'unknown';
    counts[recordStage] = (counts[recordStage] ?? 0) + 1;
    return counts;
  }, {});
  throw new Error(`Timed out waiting for ${minCount} ${stage} records; observed ${records.filter((record) => record?.stage === stage).length}; stage counts: ${JSON.stringify(stageCounts)}`);
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
      await wait(1300);
      const before = probe.readProductStateProbe();

      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          padPresetA: 'glass_shimmer',
          padPresetB: 'warm_analog',
          padMorph: 0,
        },
      });
      await wait(1300);
      const afterPadSequencer = probe.readProductStateProbe();
      await probe.triggerSampleHoldNote({ source: 'pad1', midi: 60, velocity: 0.85, durationMs: 360 });
      await wait(900);
      const afterPad = probe.readProductStateProbe();

      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          synthEuclid1Source: 'lead1',
          lead1PresetA: 'soft_rhodes',
          lead1PresetB: 'soft_rhodes',
          lead1Morph: 0,
        },
      });
      await probe.configureSynthMorphSubLane({
        laneIndex: 0,
        values: [0.65, 0.65, 0.65, 0.65],
      });
      await wait(1300);
      const beforeLeadSequencer = probe.readProductStateProbe();

      await probe.applyStatePatch({
        activeTab: 'synth',
        patch: {
          lead1PresetB: 'gamelan',
        },
      });
      await wait(1300);
      const afterLeadSequencer = probe.readProductStateProbe();
      await probe.triggerSampleHoldNote({ source: 'lead1', midi: 67, velocity: 0.85, durationMs: 360 });
      await wait(1200);
      const afterLead = probe.readProductStateProbe();

      return { before, afterPadSequencer, afterPad, beforeLeadSequencer, afterLeadSequencer, afterLead };
    }, baseHotSwapState());

    await waitForStage(productStateRecords, 'product-control-resolved', 3);
    await waitForStage(productStateRecords, 'encoded-product-snapshot', 3);
    await waitForStage(productStateRecords, 'cpp-product-telemetry', 2);

    assert(pageErrors.length === 0, `Page errors were reported: ${pageErrors.join('; ')}`);
    assert(result.before?.telemetry?.transportRunning === true, 'transport was not running before hot-swap');
    assert(result.afterPadSequencer?.telemetry?.transportRunning === true, 'transport stopped after Pad sequencer hot-swap');
    assert(result.afterPad?.telemetry?.transportRunning === true, 'transport stopped after Pad hot-swap');
    assert(result.beforeLeadSequencer?.telemetry?.transportRunning === true, 'transport stopped before Lead sequencer hot-swap');
    assert(result.afterLeadSequencer?.telemetry?.transportRunning === true, 'transport stopped after Lead sequencer hot-swap');
    assert(result.afterLead?.telemetry?.transportRunning === true, 'transport stopped after Lead hot-swap');
    const beforeHitCount = sequencerHitCount(result.before?.telemetry);
    const afterPadSequencerHitCount = sequencerHitCount(result.afterPadSequencer?.telemetry);
    const beforeLeadSequencerHitCount = sequencerHitCount(result.beforeLeadSequencer?.telemetry);
    const afterLeadSequencerHitCount = sequencerHitCount(result.afterLeadSequencer?.telemetry);
    const afterLeadHitCount = sequencerHitCount(result.afterLead?.telemetry);
    if (
      beforeHitCount !== null &&
        afterPadSequencerHitCount !== null &&
        Math.max(beforeHitCount, afterPadSequencerHitCount) > 0
    ) {
      assert(
        afterPadSequencerHitCount > beforeHitCount,
        `Pad hot-swap reset or stalled sequencer hit count (${beforeHitCount} -> ${afterPadSequencerHitCount})`,
      );
    }
    if (
      beforeLeadSequencerHitCount !== null &&
        afterLeadSequencerHitCount !== null &&
        Math.max(beforeLeadSequencerHitCount, afterLeadSequencerHitCount) > 0
    ) {
      assert(
        afterLeadSequencerHitCount > beforeLeadSequencerHitCount,
        `Lead hot-swap reset or stalled sequencer hit count (${beforeLeadSequencerHitCount} -> ${afterLeadSequencerHitCount})`,
      );
    }

    const padBefore = sourceEntry(result.before?.telemetry, 1);
    const padAfterSequencer = sourceEntry(result.afterPadSequencer?.telemetry, 1);
    const padAfter = sourceEntry(result.afterPad?.telemetry, 1);
    const leadBefore = sourceEntry(result.beforeLeadSequencer?.telemetry, 3);
    const leadAfterSequencer = sourceEntry(result.afterLeadSequencer?.telemetry, 3);
    const leadAfter = sourceEntry(result.afterLead?.telemetry, 3);
    assert(padBefore && padAfterSequencer && padAfter, 'Pad source debug telemetry was missing');
    assert(leadBefore && leadAfterSequencer && leadAfter, 'Lead source debug telemetry was missing');
    assert(
      padBefore.sourceStateHash !== padAfterSequencer.sourceStateHash ||
        padBefore.compiledSourceHash !== padAfterSequencer.compiledSourceHash,
      `Pad source hash did not change after running sequencer hot-swap: ${JSON.stringify({
        before: padBefore,
        afterSequencer: padAfterSequencer,
        fullSnapshotBefore: result.before?.diagnostics?.fullSnapshotReloadCount ?? null,
        fullSnapshotAfterPad: result.afterPadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
        dirtyDiffBefore: result.before?.diagnostics?.dirtyDiffCount ?? null,
        dirtyDiffAfterPad: result.afterPadSequencer?.diagnostics?.dirtyDiffCount ?? null,
      })}`,
    );
    assert(
      leadBefore.sourceStateHash !== leadAfterSequencer.sourceStateHash ||
        leadBefore.compiledSourceHash !== leadAfterSequencer.compiledSourceHash,
      `Lead source hash did not change after running sequencer hot-swap: ${JSON.stringify({
        before: leadBefore,
        afterSequencer: leadAfterSequencer,
        fullSnapshotBeforeLead: result.beforeLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
        fullSnapshotAfterLead: result.afterLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
        dirtyDiffBeforeLead: result.beforeLeadSequencer?.diagnostics?.dirtyDiffCount ?? null,
        dirtyDiffAfterLead: result.afterLeadSequencer?.diagnostics?.dirtyDiffCount ?? null,
      })}`,
    );

    const padSpawnBefore = latestSpawn(result.before?.telemetry, 1);
    const padSequencerSpawn = latestSpawn(result.afterPadSequencer?.telemetry, 1);
    const padSpawn = latestSpawn(result.afterPad?.telemetry, 1);
    const leadSequencerSpawnBefore = latestSpawn(result.beforeLeadSequencer?.telemetry, 3);
    const leadSequencerSpawnAfter = latestSpawn(result.afterLeadSequencer?.telemetry, 3);
    const leadSpawn = latestSpawn(result.afterLead?.telemetry, 3);
    assert(padSpawnBefore, 'Pad voice-spawn telemetry was missing before hot-swap');
    assert(padSpawn, 'Pad voice-spawn telemetry was missing after hot-swap trigger');
    assert(leadSequencerSpawnBefore, 'Lead voice-spawn telemetry was missing before sequenced hot-swap');
    assert(leadSequencerSpawnAfter, 'Lead voice-spawn telemetry was missing after sequenced hot-swap');
    assert(leadSpawn, 'Lead voice-spawn telemetry was missing after hot-swap trigger');
    assert(padSpawn.sourceStateHash === padAfter.sourceStateHash, 'Pad voice-spawn hash did not match active source hash');
    assert(
      (leadSequencerSpawnAfter.triggerSequence ?? 0) > (leadSequencerSpawnBefore.triggerSequence ?? 0),
      'Lead sequencer did not spawn a new voice after hot-swap',
    );
    assert(leadSequencerSpawnAfter.sourceStateHash === leadAfterSequencer.sourceStateHash, 'Lead sequencer voice-spawn hash did not match active source hash');
    assert(leadSequencerSpawnAfter.compiledSourceHash === leadAfterSequencer.compiledSourceHash, 'Lead sequencer voice-spawn compiled hash did not match active source hash');
    assert(leadSpawn.sourceStateHash === leadAfter.sourceStateHash, 'Lead voice-spawn hash did not match active source hash');

    const productControlRecords = productStateRecords.filter((record) => record.stage === 'product-control-resolved');
    const encodedRecords = productStateRecords.filter((record) => record.stage === 'encoded-product-snapshot');
    const appliedRecords = productStateRecords.filter((record) => record.stage === 'snapshot-applied');
    const fullSnapshotResolvedRecords = productControlRecords.filter((record) => record.applyMode === 'full-snapshot');
    assert(uniqueValues(productControlRecords, 'padRelevantHash').length >= 2, 'ProductControl Pad hash did not change');
    assert(uniqueValues(productControlRecords, 'leadRelevantHash').length >= 2, 'ProductControl Lead hash did not change');
    assert(encodedRecords.length > 0, 'encoded snapshot debug records were missing');
    assert(
      fullSnapshotResolvedRecords.length >= 2,
      'Pad/Lead hot-swaps should resolve through full-snapshot commits',
    );
    assert(
      (result.afterPadSequencer?.diagnostics?.fullSnapshotReloadCount ?? 0) >
        (result.before?.diagnostics?.fullSnapshotReloadCount ?? 0),
      'Pad hot-swap did not full-snapshot the running Product snapshot',
    );
    assert(
      (result.afterLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? 0) >
        (result.beforeLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? 0),
      'Lead hot-swap did not full-snapshot the running Product snapshot',
    );

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: 'pass',
      url: vite.url,
      productControlHashCount: productControlRecords.length,
      productControlFullSnapshotCount: fullSnapshotResolvedRecords.length,
      encodedSnapshotHashCount: encodedRecords.length,
      workletAppliedHashCount: appliedRecords.length,
      dirtyDiffCountBefore: result.before?.diagnostics?.dirtyDiffCount ?? null,
      dirtyDiffCountAfterPad: result.afterPadSequencer?.diagnostics?.dirtyDiffCount ?? null,
      dirtyDiffCountBeforeLead: result.beforeLeadSequencer?.diagnostics?.dirtyDiffCount ?? null,
      dirtyDiffCountAfterLeadSequencer: result.afterLeadSequencer?.diagnostics?.dirtyDiffCount ?? null,
      dirtyDiffCountAfterLead: result.afterLead?.diagnostics?.dirtyDiffCount ?? null,
      fullSnapshotReloadCountBefore: result.before?.diagnostics?.fullSnapshotReloadCount ?? null,
      fullSnapshotReloadCountAfterPad: result.afterPadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
      fullSnapshotReloadCountBeforeLead: result.beforeLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
      fullSnapshotReloadCountAfterLeadSequencer: result.afterLeadSequencer?.diagnostics?.fullSnapshotReloadCount ?? null,
      fullSnapshotReloadCountAfterLead: result.afterLead?.diagnostics?.fullSnapshotReloadCount ?? null,
      pad: {
        before: padBefore,
        afterSequencer: padAfterSequencer,
        sequencerSpawnBefore: padSpawnBefore,
        sequencerSpawnAfter: padSequencerSpawn,
        after: padAfter,
        spawn: padSpawn,
      },
      lead: {
        before: leadBefore,
        sequencerSpawnBefore: leadSequencerSpawnBefore,
        afterSequencer: leadAfterSequencer,
        sequencerSpawnAfter: leadSequencerSpawnAfter,
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
        `ProductControl full-snapshot records: ${report.productControlFullSnapshotCount}`,
        `Encoded snapshot records: ${report.encodedSnapshotHashCount}`,
        `Worklet-applied records: ${report.workletAppliedHashCount}`,
        `Dirty diffs: ${report.dirtyDiffCountBefore} -> ${report.dirtyDiffCountAfterPad} -> ${report.dirtyDiffCountBeforeLead} -> ${report.dirtyDiffCountAfterLeadSequencer} -> ${report.dirtyDiffCountAfterLead}`,
        `Full snapshot reloads: ${report.fullSnapshotReloadCountBefore} -> ${report.fullSnapshotReloadCountAfterPad} -> ${report.fullSnapshotReloadCountBeforeLead} -> ${report.fullSnapshotReloadCountAfterLeadSequencer} -> ${report.fullSnapshotReloadCountAfterLead}`,
        '',
        `Pad source: ${padBefore.sourceStateHash}/${padBefore.compiledSourceHash} -> ${padAfterSequencer.sourceStateHash}/${padAfterSequencer.compiledSourceHash}; sequencer voice ${padSpawnBefore.sourceStateHash}/${padSpawnBefore.compiledSourceHash} -> ${padSequencerSpawn?.sourceStateHash ?? 'unreported'}/${padSequencerSpawn?.compiledSourceHash ?? 'unreported'}`,
        `Pad manual trigger: ${padAfter.sourceStateHash}/${padAfter.compiledSourceHash}; voice ${padSpawn.sourceStateHash}/${padSpawn.compiledSourceHash}`,
        `Lead source: ${leadBefore.sourceStateHash}/${leadBefore.compiledSourceHash} -> ${leadAfterSequencer.sourceStateHash}/${leadAfterSequencer.compiledSourceHash}; sequencer voice ${leadSequencerSpawnBefore.sourceStateHash}/${leadSequencerSpawnBefore.compiledSourceHash} -> ${leadSequencerSpawnAfter.sourceStateHash}/${leadSequencerSpawnAfter.compiledSourceHash}; latest voice ${leadSpawn.sourceStateHash}/${leadSpawn.compiledSourceHash}`,
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
