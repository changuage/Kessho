#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PAGE_CPU_MAX_TRANSIENT_RETRIES,
  classifyPageCpuTransientError,
  createPageCpuViteEnv,
  createPageCpuRetryEntry,
  shouldRetryPageCpuAttempt,
} from './lib/kesshoProductPageCpuComparison.mjs';
import {
  collectReportMetadata,
  writeJsonReport,
  writeMarkdownReport,
} from './product-core/lib/reporting.mjs';

const root = process.cwd();
const DEFAULT_PORT = 4197;
const RENDER_BLOCK_FRAMES = 128;
const CPU_SUMMARY_STORAGE_KEY = 'kessho:audio-engine-cpu-summary:v1';
const ENGINE_STATE_STORAGE_PREFIX = 'kessho:audio-engine-switch-state:v1:';
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-page-cpu-comparison-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-page-cpu-comparison-latest.md');

function parseArgs(argv) {
  const args = {
    url: '',
    port: DEFAULT_PORT,
    durationMs: 8000,
    settleMs: 800,
    warmupMs: 1500,
    scenarios: [],
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--duration-ms=')) args.durationMs = Number(arg.slice('--duration-ms='.length));
    else if (arg.startsWith('--settle-ms=')) args.settleMs = Number(arg.slice('--settle-ms='.length));
    else if (arg.startsWith('--warmup-ms=')) args.warmupMs = Number(arg.slice('--warmup-ms='.length));
    else if (arg.startsWith('--scenario=')) args.scenarios.push(arg.slice('--scenario='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-page-cpu-comparison.mjs [--url=http://127.0.0.1:4173/] [--duration-ms=8000] [--settle-ms=800] [--warmup-ms=1500] [--scenario=synth]');
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

function killProcessGroup(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already exited */ }
  }
}

function childExitPromise(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once('exit', resolveExit));
}

async function stopPreviewProcess(child, exitedPromise) {
  if (child.exitCode === null && child.signalCode === null) {
    killProcessGroup(child, 'SIGTERM');
    await Promise.race([exitedPromise, delay(1500)]);
  }
  if (child.exitCode === null && child.signalCode === null) {
    killProcessGroup(child, 'SIGKILL');
    await Promise.race([exitedPromise, delay(1000)]);
  }
}

async function startPreview(port) {
  const url = `http://127.0.0.1:${port}/`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'kessho-page-cpu-vite-cache-'));
  const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: createPageCpuViteEnv(process.env, cacheDir),
  });
  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const exitedPromise = childExitPromise(child);
  try {
    await waitForHttp(url, 120000, () => output);
  } catch (error) {
    await stopPreviewProcess(child, exitedPromise);
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }
  return {
    url,
    stop: async () => {
      await stopPreviewProcess(child, exitedPromise);
      await rm(cacheDir, { recursive: true, force: true });
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
    throw new Error(`Playwright is required for Product/Web page CPU comparison but is not available: ${detail}`);
  }
}

function withQuery(baseUrl, query) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
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

function percentDelta(from, to) {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((from - to) / from) * 100;
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function basePatch() {
  return {
    masterVolume: 0.82,
    transportPrimaryClock: 'seconds',
    transportBeatsPerBar: 4,
    transportBarsPerPhrase: 4,
    sequencerMasterBPM: 120,
    phraseLength: 16,
    rootNote: 4,
    tension: 0.35,
    cofDriftEnabled: false,
    chordProgressionEnabled: false,

    padEnabled: false,
    pad2Enabled: false,
    leadEnabled: false,
    lead2Enabled: false,
    pianoEnabled: false,
    synthEuclideanMasterEnabled: false,
    synthEuclid1Enabled: false,
    synthEuclid2Enabled: false,
    synthEuclid3Enabled: false,
    synthEuclid4Enabled: false,
    leadRandomEnabled: false,

    drumEnabled: false,
    drumLevel: 0,
    drumDelayEnabled: false,
    drumEuclidMasterEnabled: false,
    drumEuclid1Enabled: false,
    drumEuclid2Enabled: false,
    drumEuclid3Enabled: false,
    drumEuclid4Enabled: false,

    oceanSampleEnabled: false,
    oceanSampleLevel: 0,
    birdsEnabled: false,
    birds2Enabled: false,
    frogsEnabled: false,
    waterEnabled: false,
    insectsEnabled: false,
    insects2Enabled: false,

    delayAEnabled: false,
    delayAMix: 0,
    delayAFeedback: 0,
    delayAReverbSend: 0,
    delayAToBSend: 0,
    delayBToASend: 0,
    delayAGranularSend: 0,
    delayBGranularSend: 0,
    granularDelayEnabled: false,
    granularDelayMix: 0,
    granularDelayReverbSend: 0,

    reverbEnabled: false,
    reverbLevel: 0,
    spectralFreezeEnabled: false,
    spectralFreezeActive: false,
    spectralFreezeMix: 0,

    granularEnabled: false,
    granularLevel: 0,
    granularFreeze: false,
    granularReverbSend: 0,
    granularDelayASend: 0,
    granularDelayBSend: 0,
    granularPad1Send: 0,
    granularPad2Send: 0,
    granularLead1Send: 0,
    granularLead2Send: 0,
    granularPianoSend: 0,
    granularDrumSend: 0,
    granularWavesSend: 0,
    granularWaterSend: 0,
    granularInsectsSend: 0,
    granularNatureSend: 0,

    dynamicsEnabled: false,
    sidechainEnabled: false,
    driftEnabled: false,
    erosionEnabled: false,
    dynamicsSaturationEnabled: false,
    endCompEnabled: false,

    pad1DelayASend: 0,
    pad1DelayBSend: 0,
    pad1ReverbSend: 0,
    pad2DelayASend: 0,
    pad2DelayBSend: 0,
    pad2ReverbSend: 0,
    lead1DelayASend: 0,
    lead1DelayBSend: 0,
    lead1ReverbSend: 0,
    lead2DelayASend: 0,
    lead2DelayBSend: 0,
    lead2ReverbSend: 0,
    pianoDelayASend: 0,
    pianoDelayBSend: 0,
    pianoReverbSend: 0,
    drumDelayASend: 0,
    drumDelayBSend: 0,
    drumReverbSend: 0,
    oceanDelayASend: 0,
    oceanDelayBSend: 0,
    oceanReverbSend: 0,
    waterDelayASend: 0,
    waterDelayBSend: 0,
    waterReverbSend: 0,
    natureDelayASend: 0,
    natureDelayBSend: 0,
    natureReverbSend: 0,
    insDelayASend: 0,
    insDelayBSend: 0,
    insectsReverbSend: 0,
  };
}

function synthSourcesPatch(level = 0.45) {
  return {
    padEnabled: true,
    synthLevel: level,
    padPresetA: 'saturated_drift',
    padPresetB: 'init',
    padMorph: 0.25,
    pad2Enabled: true,
    pad2Level: level * 0.85,
    pad2VoiceAssign: 42,
    pad2PresetA: 'init',
    pad2PresetB: 'saturated_drift',
    pad2Morph: 0.35,
    leadEnabled: true,
    lead1Level: level * 0.9,
    lead1Density: 0.7,
    lead1Hold: 0.35,
    lead1PresetA: 'soft_rhodes',
    lead1PresetB: 'gamelan',
    lead1Morph: 0.35,
    lead2Enabled: true,
    lead2Level: level * 0.75,
    lead2PresetC: 'gamelan',
    lead2PresetD: 'soft_rhodes',
    lead2Morph: 0.55,
    pianoEnabled: true,
    pianoLevel: level * 0.8,
  };
}

function synthSequencerPatch() {
  return {
    synthEuclideanMasterEnabled: true,
    synthEuclidClockSource: 'globalBeat',
    synthEuclid1Enabled: true,
    synthEuclid1Steps: 16,
    synthEuclid1Hits: 5,
    synthEuclid1Rotation: 0,
    synthEuclid1Source: 'synth1',
    synthEuclid1NoteMin: 52,
    synthEuclid1NoteMax: 76,
    synthEuclid1Level: 0.75,
    synthEuclid2Enabled: true,
    synthEuclid2Steps: 12,
    synthEuclid2Hits: 5,
    synthEuclid2Rotation: 2,
    synthEuclid2Source: 'lead1',
    synthEuclid2NoteMin: 64,
    synthEuclid2NoteMax: 88,
    synthEuclid2Level: 0.7,
    synthEuclid3Enabled: true,
    synthEuclid3Steps: 16,
    synthEuclid3Hits: 4,
    synthEuclid3Rotation: 3,
    synthEuclid3Source: 'lead2',
    synthEuclid3NoteMin: 48,
    synthEuclid3NoteMax: 72,
    synthEuclid3Level: 0.65,
    synthEuclid4Enabled: true,
    synthEuclid4Steps: 15,
    synthEuclid4Hits: 7,
    synthEuclid4Rotation: 1,
    synthEuclid4Source: 'piano',
    synthEuclid4NoteMin: 60,
    synthEuclid4NoteMax: 84,
    synthEuclid4Level: 0.7,
  };
}

function drumsPatch(level = 0.7) {
  return {
    drumEnabled: true,
    drumLevel: level,
    drumEuclidMasterEnabled: true,
    drumEuclidClockSource: 'globalBeat',
    drumEuclid1Enabled: true,
    drumEuclid1Steps: 16,
    drumEuclid1Hits: 5,
    drumEuclid1TargetSub: true,
    drumEuclid1TargetKick: true,
    drumEuclid1TargetClick: false,
    drumEuclid1TargetBeepHi: false,
    drumEuclid1TargetBeepLo: false,
    drumEuclid1TargetNoise: false,
    drumEuclid1TargetMembrane: false,
    drumEuclid2Enabled: true,
    drumEuclid2Steps: 12,
    drumEuclid2Hits: 5,
    drumEuclid2Rotation: 1,
    drumEuclid2TargetSub: false,
    drumEuclid2TargetKick: false,
    drumEuclid2TargetClick: false,
    drumEuclid2TargetBeepHi: true,
    drumEuclid2TargetBeepLo: true,
    drumEuclid2TargetNoise: false,
    drumEuclid2TargetMembrane: false,
    drumEuclid3Enabled: true,
    drumEuclid3Steps: 16,
    drumEuclid3Hits: 7,
    drumEuclid3Rotation: 3,
    drumEuclid3TargetSub: false,
    drumEuclid3TargetKick: false,
    drumEuclid3TargetClick: true,
    drumEuclid3TargetBeepHi: false,
    drumEuclid3TargetBeepLo: false,
    drumEuclid3TargetNoise: true,
    drumEuclid3TargetMembrane: false,
    drumEuclid4Enabled: true,
    drumEuclid4Steps: 15,
    drumEuclid4Hits: 4,
    drumEuclid4Rotation: 2,
    drumEuclid4TargetSub: false,
    drumEuclid4TargetKick: false,
    drumEuclid4TargetClick: false,
    drumEuclid4TargetBeepHi: false,
    drumEuclid4TargetBeepLo: false,
    drumEuclid4TargetNoise: false,
    drumEuclid4TargetMembrane: true,
  };
}

function earthPatch(level = 0.45) {
  return {
    earthLevel: 0.9,
    oceanSampleEnabled: true,
    oceanSampleLevel: level,
    oceanSliceDensity: 0.55,
    birdsEnabled: true,
    birdsLevel: level * 0.85,
    birdsSliceDensity: 0.65,
    birds2Enabled: true,
    birds2Level: level * 0.75,
    birds2SliceDensity: 0.65,
    frogsEnabled: true,
    frogsLevel: level * 0.7,
    frogsSliceDensity: 0.65,
    natureLevel: 0.8,
    waterEnabled: true,
    waterLevel: level,
    waterIntensity: 0.85,
    waterLayerHardDrops: 0.45,
    waterLayerWaterDrops: 0.75,
    waterLayerTurbulence: 0.65,
    waterLayerBubbling: 0.7,
    waterLayerSurf: 0.4,
    waterLayerChannels: 0.4,
    insectsEnabled: true,
    insectsLevel: level * 0.8,
    insectsDensity: 0.75,
    insectsClickRate: 0.55,
    insects2Enabled: true,
    insects2Level: level * 0.65,
    insects2Density: 0.75,
    insects2ClickRate: 0.55,
    insectsSharedLevel: 0.85,
  };
}

function delayPatch() {
  return {
    delayAEnabled: true,
    delayAPingPong: true,
    drumDelayNoteL: '1/8d',
    drumDelayNoteR: '1/4',
    delayAFeedback: 0.55,
    delayAMix: 0.45,
    delayAFilter: 3500,
    delayAWidth: 0.8,
    delayAModRate: 0.45,
    delayAModDepth: 0.45,
    delayADuck: 0.2,
    granularDelayEnabled: true,
    granularSpaceMode: 'clocked',
    granularDelayTime: '1/8',
    granularDelayActivity: 0.65,
    granularDelayRepeats: 0.55,
    granularDelayMix: 0.75,
    granularDelayFilter: 0.55,
    granularDelayVibrato: 0.25,
    delayBPattern: 'scatter',
    delayBWarp: 'tape',
    delayBWarpIntensity: 0.65,
    delayBSpread: 0.75,
    delayAToBSend: 0.35,
    delayBToASend: 0.25,
  };
}

function reverbPatch() {
  return {
    reverbEnabled: true,
    reverbLevel: 0.55,
    reverbEngine: 'algorithmic',
    reverbType: 'cathedral',
    reverbQuality: 'balanced',
    reverbDecay: 0.95,
    reverbSize: 4,
    reverbDiffusion: 0.95,
    reverbModulation: 0.65,
    predelay: 80,
    damping: 0.18,
    width: 0.95,
    reverbShimmer: 0.32,
    reverbShimmerPitch: 12,
    reverbSlowModRate: 0.03,
    reverbSlowModDepth: 0.55,
    reverbReverse: 0.25,
    reverbReverseLength: 3.5,
    reverbChorusRate: 0.35,
    reverbChorusDepth: 28,
    reverbModCharacter: 'drift',
    reverbWarp: 0.4,
    reverbCrossFeed: 0.25,
    reverbEarlyReflections: 0.2,
    reverbAirAbsorption: 0.25,
    reverbSaturationMode: 'tape',
    spectralFreezeEnabled: true,
    spectralFreezeActive: true,
    spectralFreezeMode: 'livingStretch',
    spectralFreezeCaptureSerial: 1,
    spectralFreezeStretchSpeed: 0.5,
    spectralFreezeDirection: 'pingpong',
    spectralFreezePosition: 0,
    spectralFreezeRefresh: 0.2,
    spectralFreezeInputSensitivity: 0.5,
    spectralFreezeMix: 0.45,
    spectralFreezeSustain: 0.85,
    spectralFreezeDiffusion: 0.2,
    spectralFreezeTone: -0.15,
    spectralFreezeWidth: 0.85,
  };
}

function granularPatch() {
  return {
    granularEnabled: true,
    granularLevel: 0.55,
    granularBufferSeconds: 16,
    granularSpaceMode: 'clocked',
    granularDiffusion: 0.7,
    granularMacroActivity: 0.72,
    granularMacroTexture: 0.65,
    granularMacroComplexity: 0.7,
    granularMacroDarkness: 0.35,
    granularMacroChaos: 0.45,
    granularFeedback: 0.25,
    granularFeedbackLPF: 7000,
    granularReverbSend: 0.35,
    granularDelayASend: 0.25,
    granularDelayBSend: 0.25,
    granularV1Enabled: true,
    granularV1Mode: 'granular',
    granularV1Density: 48,
    granularV1GrainSize: 120,
    granularV1Gain: 0.55,
    granularV2Enabled: true,
    granularV2Mode: 'granular',
    granularV2Density: 40,
    granularV2GrainSize: 180,
    granularV2Pitch: 7,
    granularV2Gain: 0.45,
    granularV3Enabled: true,
    granularV3Mode: 'clean',
    granularV3Speed: 0,
    granularV3ScanRate: 0.75,
    granularV3Gain: 0.4,
    granularV4Enabled: true,
    granularV4Mode: 'granular',
    granularV4Density: 52,
    granularV4GrainSize: 240,
    granularV4Pitch: -12,
    granularV4Gain: 0.4,
    granularDelayEnabled: true,
    granularDelayActivity: 0.55,
    granularDelayRepeats: 0.45,
    granularDelayMix: 0.55,
    delayBGranularSend: 0.25,
  };
}

function dynamicsPatch() {
  return {
    dynamicsEnabled: true,
    sidechainEnabled: true,
    sidechainKeyA: 'kick',
    sidechainKeyB: 'noise',
    sidechainKeyAWeight: 1,
    sidechainKeyBWeight: 0.65,
    sidechainAmount: 0.65,
    sidechainThreshold: -28,
    sidechainRatio: 5,
    sidechainKnee: 8,
    sidechainAttackMs: 4,
    sidechainHoldMs: 30,
    sidechainReleaseMs: 220,
    sidechainMix: 1,
    sidechainPad1Target: 0.5,
    sidechainPad2Target: 0.45,
    sidechainLead1Target: 0.5,
    sidechainLead2Target: 0.45,
    sidechainPianoTarget: 0.45,
    sidechainGranularTarget: 0.35,
    sidechainDelayATarget: 0.35,
    sidechainDelayBTarget: 0.35,
    sidechainReverbTarget: 0.25,
    driftEnabled: true,
    driftMode: 'abyssWater',
    driftMix: 0.45,
    driftAge: 0.55,
    driftDepth: 0.55,
    driftRate: 0.35,
    erosionEnabled: true,
    erosionMix: 0.35,
    erosionAge: 0.45,
    erosionGeneration: 0.35,
    erosionAlias: 0.25,
    erosionWow: 0.35,
    erosionFlutter: 0.22,
    erosionNoise: 0.18,
    erosionSaturation: 0.25,
    dynamicsSaturationEnabled: true,
    dynamicsSaturationMode: 'tube',
    dynamicsSaturationDrive: 0.45,
    dynamicsSaturationTone: 0.55,
    dynamicsSaturationBias: 0.45,
    endCompEnabled: true,
    endCompThreshold: -22,
    endCompKnee: 10,
    endCompRatio: 3,
    endCompAttackMs: 8,
    endCompReleaseMs: 240,
    endCompMakeup: 1.25,
    endCompMix: 0.85,
  };
}

function sendsToAllFx(amount = 0.35) {
  return {
    pad1DelayASend: amount,
    pad1DelayBSend: amount * 0.7,
    pad1ReverbSend: amount,
    pad2DelayASend: amount * 0.75,
    pad2DelayBSend: amount * 0.65,
    pad2ReverbSend: amount,
    lead1DelayASend: amount,
    lead1DelayBSend: amount * 0.7,
    lead1ReverbSend: amount,
    lead2DelayASend: amount * 0.85,
    lead2DelayBSend: amount * 0.65,
    lead2ReverbSend: amount,
    pianoDelayASend: amount * 0.7,
    pianoDelayBSend: amount * 0.55,
    pianoReverbSend: amount,
    drumDelayASend: amount,
    drumDelayBSend: amount * 0.65,
    drumReverbSend: amount * 0.45,
    oceanDelayASend: amount * 0.6,
    oceanDelayBSend: amount * 0.45,
    oceanReverbSend: amount,
    waterDelayASend: amount * 0.6,
    waterDelayBSend: amount * 0.45,
    waterReverbSend: amount,
    natureDelayASend: amount * 0.5,
    natureDelayBSend: amount * 0.4,
    natureReverbSend: amount,
    insDelayASend: amount * 0.55,
    insDelayBSend: amount * 0.4,
    insectsReverbSend: amount,
    granularPad1Send: amount,
    granularPad2Send: amount * 0.8,
    granularLead1Send: amount,
    granularLead2Send: amount * 0.8,
    granularPianoSend: amount * 0.65,
    granularDrumSend: amount,
    granularWavesSend: amount * 0.55,
    granularWaterSend: amount * 0.55,
    granularNatureSend: amount * 0.45,
    granularInsectsSend: amount * 0.5,
  };
}

const DEFAULT_MANUAL_NOTES = [
  { source: 'pad1', midi: 52, velocity: 0.7, durationMs: 3600, voiceIndex: 0 },
  { source: 'pad2', midi: 59, velocity: 0.62, durationMs: 3400, voiceIndex: 1 },
  { source: 'lead1', midi: 76, velocity: 0.68, durationMs: 900 },
  { source: 'lead2', midi: 83, velocity: 0.6, durationMs: 900 },
  { source: 'piano', midi: 64, velocity: 0.7, durationMs: 1200 },
];

const DEFAULT_DRUM_TRIGGERS = [
  { voice: 'sub', velocity: 0.75, delayMs: 0 },
  { voice: 'kick', velocity: 0.8, delayMs: 70 },
  { voice: 'click', velocity: 0.65, delayMs: 140 },
  { voice: 'beepHi', velocity: 0.58, delayMs: 210 },
  { voice: 'beepLo', velocity: 0.62, delayMs: 280 },
  { voice: 'noise', velocity: 0.55, delayMs: 350 },
  { voice: 'membrane', velocity: 0.62, delayMs: 420 },
];

function makeScenario(id, tabLabel, label, activeModules, patch, options = {}) {
  return {
    id,
    tabLabel,
    label,
    activeModules,
    minRms: options.minRms ?? 0.0005,
    manualNotes: options.manualNotes ?? [],
    manualDrumTriggers: options.manualDrumTriggers ?? [],
    state: {
      ...basePatch(),
      ...patch,
    },
  };
}

const SCENARIOS = [
  makeScenario(
    'global',
    'Global',
    'Global Harmony',
    ['COF drift', 'chord progression', 'pad chord engine', 'lead random', 'synth Euclid'],
    {
      ...synthSourcesPatch(0.32),
      ...synthSequencerPatch(),
      cofDriftEnabled: true,
      cofDriftRate: 1,
      cofDriftRange: 4,
      chordProgressionEnabled: true,
      chordProgressionSteps: 4,
      chordProgressionHits: 4,
      chordProgressionPattern: [0, 5, 3, 4],
      chordProgressionStepEnabled: [true, true, true, true],
      leadRandomEnabled: true,
      leadRandomSource: 'lead1',
      leadRandomClockSource: 'globalBeat',
      leadRandomSyncPolicy: 'restartNow',
    },
    { manualNotes: DEFAULT_MANUAL_NOTES.slice(0, 3) },
  ),
  makeScenario(
    'synth',
    'Synth',
    'Synth Page',
    ['pad 1', 'pad 2', 'lead 1', 'lead 2', 'piano', 'chord generator', 'synth Euclid'],
    {
      ...synthSourcesPatch(0.4),
      ...synthSequencerPatch(),
      padSubEnabled: true,
      padNoiseLevel: 0.18,
      padLfo1Depth: 0.25,
      padLfo1Dest: 'filterCutoff',
      pad2Lfo1Depth: 0.25,
      pad2Lfo1Dest: 'filterCutoff',
      leadRandomEnabled: true,
      leadRandomSource: 'lead1',
      leadRandomClockSource: 'globalBeat',
      leadRandomSyncPolicy: 'restartNow',
    },
    { manualNotes: DEFAULT_MANUAL_NOTES },
  ),
  makeScenario(
    'drums',
    'Drums',
    'Drums Page',
    ['drum source', 'all drum voices', 'drum Euclid', 'drum delay'],
    {
      ...drumsPatch(0.72),
      drumDelayEnabled: true,
      drumDelayMix: 0.35,
      drumDelayFeedback: 0.45,
      drumDelayASend: 0.55,
      drumReverbSend: 0.08,
    },
    { manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
  makeScenario(
    'earth',
    'Earth',
    'Earth Page',
    ['waves', 'water', 'birds', 'birds 2', 'frogs', 'insects', 'insects 2'],
    {
      ...earthPatch(0.42),
    },
  ),
  makeScenario(
    'granular',
    'Granular',
    'Granular Page',
    ['granular bus', '4 granular voices', 'legacy voice', 'clean voice', 'clocked delay'],
    {
      ...synthSourcesPatch(0.24),
      ...synthSequencerPatch(),
      ...drumsPatch(0.25),
      ...earthPatch(0.2),
      ...granularPatch(),
      ...delayPatch(),
      ...sendsToAllFx(0.35),
      reverbEnabled: true,
      reverbLevel: 0.2,
    },
    { manualNotes: DEFAULT_MANUAL_NOTES, manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
  makeScenario(
    'delay',
    'Delay',
    'Delay Page',
    ['delay A', 'delay B', 'ping-pong', 'cross feedback', 'source sends'],
    {
      ...synthSourcesPatch(0.28),
      ...synthSequencerPatch(),
      ...drumsPatch(0.35),
      ...earthPatch(0.18),
      ...delayPatch(),
      ...sendsToAllFx(0.45),
      reverbEnabled: true,
      reverbLevel: 0.2,
    },
    { manualNotes: DEFAULT_MANUAL_NOTES, manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
  makeScenario(
    'reverb',
    'Reverb',
    'Reverb Page',
    ['algorithmic reverb', 'shimmer', 'reverse', 'modulation', 'spectral freeze'],
    {
      ...synthSourcesPatch(0.3),
      ...synthSequencerPatch(),
      ...drumsPatch(0.28),
      ...earthPatch(0.2),
      ...reverbPatch(),
      ...sendsToAllFx(0.35),
    },
    { manualNotes: DEFAULT_MANUAL_NOTES, manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
  makeScenario(
    'texture',
    'Texture',
    'Texture Page',
    ['sidechain', 'drift', 'degrade', 'saturation', 'end compressor'],
    {
      ...synthSourcesPatch(0.3),
      ...synthSequencerPatch(),
      ...drumsPatch(0.48),
      ...granularPatch(),
      ...delayPatch(),
      ...reverbPatch(),
      ...dynamicsPatch(),
      ...sendsToAllFx(0.3),
    },
    { manualNotes: DEFAULT_MANUAL_NOTES, manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
  makeScenario(
    'routing',
    'Routing',
    'Routing Page',
    ['all primary sources', 'delay A', 'delay B', 'granular', 'reverb', 'texture', 'soundscapes'],
    {
      ...synthSourcesPatch(0.25),
      ...synthSequencerPatch(),
      ...drumsPatch(0.35),
      ...earthPatch(0.22),
      ...granularPatch(),
      ...delayPatch(),
      ...reverbPatch(),
      ...dynamicsPatch(),
      ...sendsToAllFx(0.4),
      delayAToBSend: 0.4,
      delayBToASend: 0.3,
      delayAGranularSend: 0.3,
      delayBGranularSend: 0.3,
      granularDelayASend: 0.25,
      granularDelayBSend: 0.25,
    },
    { manualNotes: DEFAULT_MANUAL_NOTES, manualDrumTriggers: DEFAULT_DRUM_TRIGGERS },
  ),
];

function selectScenarios(args) {
  if (args.scenarios.length === 0) return SCENARIOS;
  const requested = new Set(args.scenarios);
  const selected = SCENARIOS.filter((scenario) => requested.has(scenario.id));
  const known = new Set(SCENARIOS.map((scenario) => scenario.id));
  const unknown = [...requested].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown scenario(s): ${unknown.join(', ')}. Known: ${[...known].join(', ')}`);
  }
  return selected;
}

async function captureScenario(page, scenario, durationMs, settleMs) {
  return page.evaluate(
    async (options) => {
      const capture = await window.__kesshoSonicParity.capture(options);
      return {
        engine: capture.engine,
        sampleRate: capture.sampleRate,
        frames: capture.frames,
        durationMs: capture.durationMs,
        manual: capture.manual,
        stats: capture.stats,
        debug: capture.debug,
      };
    },
    {
      durationMs,
      settleMs,
      telemetrySampleIntervalMs: 100,
      statePatch: scenario.state,
      manualNotes: scenario.manualNotes,
      manualDrumTriggers: scenario.manualDrumTriggers,
      manualWarmup: false,
    },
  );
}

async function openScenarioTab(page, scenario) {
  if (!scenario.tabLabel) return;
  const tab = page.locator('.app-tab-bar button').filter({ hasText: scenario.tabLabel }).first();
  if (await tab.count() === 0) return;
  await tab.click({ timeout: 10000 });
  await page.waitForTimeout(250);
}

function summarizeCapture(capture) {
  const telemetry = capture.debug?.latestTelemetry ?? {};
  return {
    engine: capture.engine,
    sampleRate: capture.sampleRate ?? null,
    frames: capture.frames ?? null,
    durationMs: capture.durationMs ?? null,
    blockSize: RENDER_BLOCK_FRAMES,
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

async function measureEngineScenarioAttempt({ browser, baseUrl, mode, args, scenario }) {
  const stateKey = `page-cpu-${scenario.id}-${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const storageKey = `${ENGINE_STATE_STORAGE_PREFIX}${stateKey}`;
  const context = await browser.newContext();
  let cdp = null;
  let page = null;
  const url = withQuery(baseUrl, {
    parity: '1',
    engineAB: '1',
    pageCpu: '1',
    engine: mode,
    engineState: stateKey,
  });
  try {
    await context.addInitScript(
      ({ storageKey: initStorageKey, cpuSummaryKey, scenarioState }) => {
        window.sessionStorage.setItem(initStorageKey, JSON.stringify(scenarioState));
        window.sessionStorage.removeItem(cpuSummaryKey);
      },
      { storageKey, cpuSummaryKey: CPU_SUMMARY_STORAGE_KEY, scenarioState: scenario.state },
    );
    cdp = await browser.newBrowserCDPSession();
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__kesshoSonicParity?.capture), null, { timeout: 15000 });
    await openScenarioTab(page, scenario);
    if (args.warmupMs > 0) {
      await captureScenario(page, scenario, args.warmupMs, Math.min(args.settleMs, 600));
      await delay(300);
    }

    const before = await cdp.send('SystemInfo.getProcessInfo');
    const wallStartMs = performance.now();
    const capture = await captureScenario(page, scenario, args.durationMs, args.settleMs);
    const wallEndMs = performance.now();
    const after = await cdp.send('SystemInfo.getProcessInfo');
    const overlayRaw = await page.evaluate((key) => window.sessionStorage.getItem(key), CPU_SUMMARY_STORAGE_KEY);
    await page.evaluate(() => window.__kesshoSonicParity?.teardown());

    assert(capture?.engine === mode, `${scenario.id}/${mode}: capture engine was ${capture?.engine}`);
    assert(capture?.stats?.rms > scenario.minRms, `${scenario.id}/${mode}: capture RMS stayed silent (${capture?.stats?.rms})`);
    assert(capture?.stats?.peak > scenario.minRms, `${scenario.id}/${mode}: capture peak stayed silent (${capture?.stats?.peak})`);

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
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
    if (cdp) await cdp.detach().catch(() => {});
  }
}

async function measureEngineScenario(params) {
  const retryAttempts = [];
  for (let attempt = 1; attempt <= PAGE_CPU_MAX_TRANSIENT_RETRIES + 1; attempt += 1) {
    try {
      const result = await measureEngineScenarioAttempt(params);
      retryAttempts.push(createPageCpuRetryEntry({ attempt, status: 'pass' }));
      return attempt > 1
        ? {
          ...result,
          retryMetadata: {
            retried: true,
            attempts: retryAttempts,
          },
        }
        : result;
    } catch (error) {
      const reason = classifyPageCpuTransientError(error);
      retryAttempts.push(createPageCpuRetryEntry({ attempt, status: 'fail', error, reason }));
      if (!shouldRetryPageCpuAttempt({ attempt, reason })) {
        const retryMetadata = {
          retried: attempt > 1,
          attempts: retryAttempts,
        };
        if (error && typeof error === 'object') {
          error.retryMetadata = retryMetadata;
          throw error;
        }
        const normalizedError = new Error(String(error));
        normalizedError.retryMetadata = retryMetadata;
        throw normalizedError;
      }
    }
  }
  throw new Error('Page CPU measurement retry policy exhausted unexpectedly.');
}

function scenarioComparison(result) {
  const product = result.engines['core-product'];
  const web = result.engines['web-ts'];
  if (!product || !web) return {};
  return {
    browserProcessCpuSavedPercent: percentDelta(web.browserProcessCpuPercent, product.browserProcessCpuPercent),
    browserProcessCpuRatioProductOverWeb: web.browserProcessCpuPercent > 0
      ? product.browserProcessCpuPercent / web.browserProcessCpuPercent
      : null,
    oldInternalOverlaySavedPercent: web.internalOverlayCpu?.avgPercent && product.internalOverlayCpu?.avgPercent
      ? percentDelta(web.internalOverlayCpu.avgPercent, product.internalOverlayCpu.avgPercent)
      : null,
  };
}

function reportSummary(scenarios) {
  const comparable = scenarios.filter((scenario) => scenario.comparison?.browserProcessCpuSavedPercent !== undefined);
  const savedValues = comparable
    .map((scenario) => scenario.comparison.browserProcessCpuSavedPercent)
    .filter((value) => Number.isFinite(value));
  const productWins = savedValues.filter((value) => value > 0).length;
  const webWins = savedValues.filter((value) => value < 0).length;
  const averageSavedPercent = savedValues.length > 0
    ? savedValues.reduce((sum, value) => sum + value, 0) / savedValues.length
    : null;
  const weightedWebCpu = comparable.reduce((sum, scenario) => sum + (scenario.engines['web-ts']?.processCpuSeconds ?? 0), 0);
  const weightedProductCpu = comparable.reduce((sum, scenario) => sum + (scenario.engines['core-product']?.processCpuSeconds ?? 0), 0);
  return {
    comparableScenarioCount: comparable.length,
    productWins,
    webWins,
    averageSavedPercent,
    weightedBrowserProcessCpuSavedPercent: percentDelta(weightedWebCpu, weightedProductCpu),
  };
}

function writeReport(report) {
  writeJsonReport(reportJsonPath, report);

  const lines = [
    '# Kessho Product Page CPU Comparison',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Commit: ${report.metadata.gitCommit ?? 'unknown'}`,
    '',
    `Platform: ${report.metadata.machine.platform}/${report.metadata.machine.arch}; CPU: ${report.metadata.machine.cpuModel ?? 'unknown'} x${report.metadata.machine.cpuCount}`,
    '',
    `Sample rate: ${report.metadata.sampleRate ?? '-'} Hz; block size: ${report.metadata.blockSize ?? '-'} frames; duration: ${report.metadata.durationMs ?? '-'} ms`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Duration: ${report.defaults.durationMs} ms; warmup: ${report.defaults.warmupMs} ms; settle: ${report.defaults.settleMs} ms`,
    '',
    `Product wins: ${report.summary.productWins}/${report.summary.comparableScenarioCount}`,
    '',
    `Average Product CPU saved vs Web TS: ${report.summary.averageSavedPercent === null ? 'n/a' : `${report.summary.averageSavedPercent.toFixed(2)}%`}`,
    '',
    `Weighted Product CPU saved vs Web TS: ${report.summary.weightedBrowserProcessCpuSavedPercent === null ? 'n/a' : `${report.summary.weightedBrowserProcessCpuSavedPercent.toFixed(2)}%`}`,
    '',
    '## Page Matrix',
    '',
    '| Page | Product CPU % | Web TS CPU % | Saved % | Product internal avg % | Web internal avg % | Product RMS | Web RMS | Product voices/assets/grains |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const scenario of report.scenarios) {
    const product = scenario.engines['core-product'];
    const web = scenario.engines['web-ts'];
    const saved = scenario.comparison?.browserProcessCpuSavedPercent;
    const pagedTelemetry = product?.capture
      ? `${product.capture.activeVoices ?? '-'} / ${product.capture.activeAssets ?? '-'} / ${product.capture.activeGrains ?? '-'}`
      : '-';
    lines.push(`| ${scenario.label} | ${product?.browserProcessCpuPercent?.toFixed(3) ?? '-'} | ${web?.browserProcessCpuPercent?.toFixed(3) ?? '-'} | ${Number.isFinite(saved) ? saved.toFixed(2) : '-'} | ${product?.internalOverlayCpu?.avgPercent ?? '-'} | ${web?.internalOverlayCpu?.avgPercent ?? '-'} | ${product?.capture?.rms?.toFixed(6) ?? '-'} | ${web?.capture?.rms?.toFixed(6) ?? '-'} | ${pagedTelemetry} |`);
  }

  lines.push(
    '',
    '## Scenario Definitions',
    '',
  );
  for (const scenario of report.scenarios) {
    lines.push(`- ${scenario.label}: ${scenario.activeModules.join(', ')}`);
  }

  const failures = report.scenarios.flatMap((scenario) => {
    const entries = Object.entries(scenario.errors ?? {});
    return entries.map(([mode, error]) => `${scenario.id}/${mode}: ${error}`);
  });
  if (failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const failure of failures) lines.push(`- ${failure}`);
  }

  const retryEntries = report.scenarios.flatMap((scenario) => {
    const entries = [];
    for (const [mode, metadata] of Object.entries(scenario.retryMetadata ?? {})) {
      entries.push(`${scenario.id}/${mode}: ${JSON.stringify(metadata)}`);
    }
    for (const [mode, measurement] of Object.entries(scenario.engines ?? {})) {
      if (measurement.retryMetadata) {
        entries.push(`${scenario.id}/${mode}: ${JSON.stringify(measurement.retryMetadata)}`);
      }
    }
    return entries;
  });
  if (retryEntries.length > 0) {
    lines.push('', '## Transient Retry Metadata', '');
    for (const entry of retryEntries) lines.push(`- ${entry}`);
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- Browser-process CPU uses Chrome process CPU deltas around each page scenario. This includes renderer/audio-thread/browser process work while the matching app tab is visible.',
    '- Each scenario preloads the page state through the app engine-state loader, then the sonic parity harness captures the same state for Product Core and Web TS.',
    '- The pageCpu query keeps runtime selection available while parking the development runtime-comparison panel and perf monitor so the measurement does not benchmark its own debug instrumentation.',
    '- Web TS is measured only through the local dev/reference runtime path; production preview/build requests for Web TS continue to resolve to Product Core.',
    '- Internal avg/peak keeps the overlay-style metric visible. For Web TS, that is still worklet-reported CPU only and excludes native WebAudio node DSP.',
    '',
  );

  writeMarkdownReport(reportMarkdownPath, lines);
}

const args = parseArgs(process.argv.slice(2));
const selectedScenarios = selectScenarios(args);
const server = args.url ? { url: args.url, stop: async () => {} } : await startPreview(args.port);
let browser = null;
let report = null;

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const generatedAt = new Date().toISOString();

  report = {
    schemaVersion: 1,
    generatedAt,
    status: 'running',
    metadata: collectReportMetadata({
      root,
      generatedAt,
      command: process.argv.map(String).join(' '),
      scenarioName: selectedScenarios.map((scenario) => scenario.id).join(','),
      sampleRate: null,
      blockSize: RENDER_BLOCK_FRAMES,
      durationMs: args.durationMs,
      thresholds: {
        minRms: 'scenario-specific',
      },
      topSuspectedModules: ['visual-telemetry', 'ui-telemetry', 'worklet-messaging', 'sources', 'fx'],
    }),
    url: server.url,
    defaults: {
      durationMs: args.durationMs,
      settleMs: args.settleMs,
      warmupMs: args.warmupMs,
      serverMode: args.url ? 'external' : 'vite-dev-reference',
    },
    scenarios: [],
    summary: {},
  };

  try {
    for (const scenario of selectedScenarios) {
      const result = {
        id: scenario.id,
        label: scenario.label,
        tabLabel: scenario.tabLabel,
        activeModules: scenario.activeModules,
        engines: {},
        comparison: {},
        errors: {},
      };

      for (const mode of ['core-product', 'web-ts']) {
        try {
          result.engines[mode] = await measureEngineScenario({ browser, baseUrl: server.url, mode, args, scenario });
        } catch (error) {
          result.errors[mode] = error instanceof Error ? error.message : String(error);
          if (error?.retryMetadata) {
            result.retryMetadata ??= {};
            result.retryMetadata[mode] = error.retryMetadata;
          }
        }
      }

      result.comparison = scenarioComparison(result);
      report.scenarios.push(result);

      const product = result.engines['core-product'];
      const web = result.engines['web-ts'];
      const saved = result.comparison.browserProcessCpuSavedPercent;
      if (product && web) {
        console.log(
          `${scenario.id}: Product ${product.browserProcessCpuPercent.toFixed(3)}%, ` +
          `Web TS ${web.browserProcessCpuPercent.toFixed(3)}%, saved ${saved?.toFixed(2) ?? 'n/a'}%`,
        );
      } else {
        console.log(`${scenario.id}: failed (${Object.entries(result.errors).map(([mode, error]) => `${mode}: ${error}`).join('; ')})`);
      }
    }

    report.summary = reportSummary(report.scenarios);
    const firstCapture = report.scenarios
      .map((scenario) => scenario.engines?.['core-product']?.capture ?? scenario.engines?.['web-ts']?.capture)
      .find((capture) => capture?.sampleRate);
    report.metadata = collectReportMetadata({
      root,
      generatedAt: report.generatedAt,
      command: process.argv.map(String).join(' '),
      scenarioName: report.scenarios.map((scenario) => scenario.id).join(','),
      sampleRate: firstCapture?.sampleRate ?? null,
      blockSize: RENDER_BLOCK_FRAMES,
      durationMs: args.durationMs,
      thresholds: {
        minRms: 'scenario-specific',
      },
      topSuspectedModules: ['visual-telemetry', 'ui-telemetry', 'worklet-messaging', 'sources', 'fx'],
    });
    report.status = report.scenarios.some((scenario) => Object.keys(scenario.errors ?? {}).length > 0) ? 'fail' : 'pass';
    writeReport(report);
    console.log(`Kessho Product/Web page CPU comparison ${report.status}: report ${reportJsonPath}`);
    if (report.status !== 'pass') {
      throw new Error(`Page CPU comparison failed; see ${reportJsonPath}`);
    }
  } catch (error) {
    if (report.status === 'running') {
      report.status = 'fail';
      report.error = error instanceof Error ? error.message : String(error);
      report.summary = reportSummary(report.scenarios);
      writeReport(report);
    }
    throw error;
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.stop();
}
