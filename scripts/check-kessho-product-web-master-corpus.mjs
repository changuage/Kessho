#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const fullReportPath = resolve(root, 'docs/reports/kessho-product-web-master-corpus-latest.json');
const selectedReportPath = resolve(root, 'docs/reports/kessho-product-web-master-corpus-selected-latest.json');
const DEFAULT_PORT = 4196;

function parseArgs(argv) {
  const args = { url: '', port: DEFAULT_PORT, caseIds: [] };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--port=')) args.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--case=')) args.caseIds.push(arg.slice('--case='.length));
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-kessho-product-web-master-corpus.mjs [--url=http://127.0.0.1:4173/] [--port=4196] [--case=master-pad-reverb-scene]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (args.caseIds.some((caseId) => caseId.length === 0)) throw new Error('--case must not be empty');
  return args;
}

const baseState = {
  padEnabled: true,
  synthLevel: 0.5,
  masterVolume: 0.75,
  reverbEnabled: false,
  delayAEnabled: false,
  granularEnabled: false,
  spectralFreezeEnabled: false,
  dynamicsEnabled: false,
  characterEnabled: false,
  sidechainEnabled: false,
  drumEnabled: false,
  waterEnabled: false,
  insectsEnabled: false,
  insects2Enabled: false,
  leadEnabled: false,
  lead2Enabled: false,
  pianoEnabled: false,
  synthChordSequencerEnabled: false,
  synthEuclideanMasterEnabled: false,
};

const granularCleanState = {
  ...baseState,
  granularEnabled: true,
  granularLevel: 0.6,
  granularPad1Send: 0.8,
  granularReverbSend: 0,
  granularFeedback: 0,
  granularFeedbackLPF: 12000,
  granularBufferSeconds: 4,
  granularShape: 'triangle',
  granularV1Enabled: true,
  granularV1Mode: 'clean',
  granularV1Slice: 1,
  granularV1Speed: 1,
  granularV1ScanRate: 1,
  granularV1Reverse: false,
  granularV1Pitch: 0,
  granularV1Attack: 0.003,
  granularV1Decay: 1,
  granularV1Blur: 0,
  granularV1GrainOct: 0,
  granularV1Spray: 0,
  granularV1Density: 64,
  granularV1GrainSize: 300,
  granularV1Pan: 0,
  granularV1Gain: 1,
  granularV1PosLFORate: 0,
  granularV1PosLFODepth: 0,
  granularV1PanLFORate: 0,
  granularV1StereoSpread: 0,
  granularV1ReverseLFORate: 0,
  granularV1WriteFollow: 1,
  granularV1RecordLFORate: 0,
  granularV2Enabled: false,
  granularV3Enabled: false,
  granularV4Enabled: false,
};

const spectralFreezeLiveState = {
  ...baseState,
  reverbEnabled: true,
  reverbLevel: 0.25,
  pad1ReverbSend: 0.45,
  synthReverbSend: 0.45,
  spectralFreezeEnabled: true,
  spectralFreezeActive: false,
  spectralFreezeSlushy: false,
  spectralFreezeMix: 1,
  spectralFreezeSpeed: 0.3,
  spectralFreezeDecay: 1,
  spectralFreezePhaseJitter: 0,
  spectralFreezeRouting: 'pre',
  spectralFreezeReverbCrossfade: 1,
};

const delaySceneState = {
  ...baseState,
  delayAEnabled: true,
  delayAMix: 0.35,
  delayAFeedback: 0.2,
  delayAFilter: 8000,
  delayAPingPong: false,
  delayAModDepth: 0,
  delayADuck: 0,
  delayAWidth: 0.5,
  drumDelayNoteL: '1/32',
  drumDelayNoteR: '1/32',
  pad1DelayASend: 0.5,
  granularDelayEnabled: true,
  granularDelayMix: 0.2,
  granularDelayActivity: 1,
  granularDelayRepeats: 0.2,
  granularDelayTime: '1/32',
  granularDelayFilter: 1,
  granularDelayVibrato: 0,
  granularSpaceMode: 'cascade',
  delayBPattern: 'cascade',
  delayBWarp: 'clean',
  delayBWarpIntensity: 0,
  delayBSpread: 0.5,
  pad1DelayBSend: 0.4,
  delayAToBSend: 0.3,
  delayBToASend: 0.2,
  delayACrossFeedFilter: 1,
};

const dynamicsCharacterState = {
  ...baseState,
  dynamicsEnabled: true,
  characterEnabled: true,
  characterMix: 0.45,
  characterMode: 'shallowWater',
  characterAge: 0.25,
  characterDepth: 0.35,
  characterRate: 0.2,
  characterStereo: 0.2,
  endCompEnabled: false,
  degradeEnabled: false,
  dynamicsSaturationEnabled: false,
};

const drumKickState = {
  ...baseState,
  padEnabled: false,
  drumEnabled: true,
  drumEuclidMasterEnabled: false,
  drumLevel: 0.75,
  drumReverbSend: 0,
  drumDelayASend: 0,
  drumDelayBSend: 0,
  granularDrumSend: 0,
};

const sidechainState = {
  ...baseState,
  sidechainEnabled: true,
  sidechainKeyA: 'kick',
  sidechainKeyB: 'off',
  sidechainKeyAWeight: 1,
  sidechainKeyBWeight: 0,
  sidechainAmount: 1,
  sidechainThreshold: -60,
  sidechainRatio: 20,
  sidechainKnee: 0,
  sidechainAttackMs: 18,
  sidechainHoldMs: 70,
  sidechainReleaseMs: 260,
  sidechainMakeup: 1,
  sidechainMix: 1,
  sidechainCurve: 0.5,
  sidechainPad1Target: 1,
  drumEnabled: true,
  drumEuclidMasterEnabled: false,
  drumLevel: 0.75,
  drumReverbSend: 0,
  drumDelayASend: 0,
  drumDelayBSend: 0,
  granularDrumSend: 0,
};

const reverbTensionScaleState = {
  ...baseState,
  reverbEnabled: true,
  reverbLevel: 0.35,
  pad1ReverbSend: 0.4,
  synthReverbSend: 0.4,
  tension: 0.9,
  reverbTensionMode: 'locked',
  reverbTensionValue: 0.9,
  reverbDecay: 0.2,
  reverbDiffusion: 0.2,
  reverbShimmer: 0.1,
  reverbShimmerPitch: 13,
  reverbScaleShimmer: true,
  scaleMode: 'manual',
  manualScale: 'Major (Ionian)',
  reverbType: 'hall',
  reverbQuality: 'balanced',
  predelay: 0,
};

const soundscapeOceanState = {
  ...baseState,
  padEnabled: false,
  oceanSampleEnabled: true,
  oceanSampleLevel: 0.55,
  earthLevel: 1,
  oceanReverbSend: 0,
  oceanDelayASend: 0,
  oceanDelayBSend: 0,
  granularWavesSend: 0,
  oceanSliceDuration: 6,
  oceanSliceDensity: 1,
  soundscapeParityFixture: true,
  seed: 42,
  seedWindow: 'day',
};

const soundscapeNatureState = {
  ...baseState,
  padEnabled: false,
  birdsEnabled: false,
  birds2Enabled: true,
  frogsEnabled: false,
  birds2Level: 0.55,
  natureLevel: 0.8,
  earthLevel: 1,
  natureReverbSend: 0,
  natureDelayASend: 0,
  natureDelayBSend: 0,
  granularNatureSend: 0,
  birds2SliceDuration: 6,
  birds2SliceDensity: 1,
  soundscapeParityFixture: true,
  seed: 42,
  seedWindow: 'day',
};

const soundscapeWaterState = {
  ...baseState,
  padEnabled: false,
  waterEnabled: true,
  waterLevel: 0.8,
  earthLevel: 1,
  waterReverbSend: 0,
  waterDelayASend: 0,
  waterDelayBSend: 0,
  granularWaterSend: 0,
  soundscapeParityFixture: true,
  seed: 42,
  seedWindow: 'day',
};

const soundscapeInsectsState = {
  ...baseState,
  padEnabled: false,
  insectsEnabled: true,
  insects2Enabled: false,
  insectsLevel: 0.7,
  insectsSharedLevel: 1,
  earthLevel: 1,
  insectsReverbSend: 0,
  insDelayASend: 0,
  insDelayBSend: 0,
  granularInsectsSend: 0,
  soundscapeParityFixture: true,
  seed: 42,
  seedWindow: 'day',
};

const soundscapeWaterInsectsState = {
  ...soundscapeWaterState,
  insectsEnabled: true,
  insectsLevel: 0.55,
  insectsSharedLevel: 1,
  insectsReverbSend: 0,
  insDelayASend: 0,
  insDelayBSend: 0,
  granularInsectsSend: 0,
};

const cases = [
  {
    id: 'master-pad-reverb-scene',
    domain: 'reverbMacro',
    durationMs: 1600,
    noteDurationMs: 1200,
    statePatch: { ...baseState, reverbEnabled: true, reverbLevel: 0.35, reverbPreDelay: 0, reverbDecay: 0.35, reverbTone: 0.5, reverbMod: 0 },
    rmsTolerance: 0.08,
    peakTolerance: 0.12,
    minLagCorrelation: 0.95,
  },
  {
    id: 'master-pad-reverb-tension-scale-scene',
    domain: 'reverbMacro',
    durationMs: 1800,
    settleMs: 250,
    noteDurationMs: 1400,
    statePatch: reverbTensionScaleState,
    rmsTolerance: 0.12,
    peakTolerance: 0.14,
    minLagCorrelation: 0.95,
    maxLagMs: 160,
    envelopeTimeToleranceMs: 60,
    envelopeRmsRatioTolerance: 0.45,
    envelopePeakRatioTolerance: 0.45,
  },
  {
    id: 'master-pad-granular-clean-scene',
    domain: 'granular',
    durationMs: 1800,
    settleMs: 250,
    noteDurationMs: 1400,
    statePatch: granularCleanState,
    rmsTolerance: 0.08,
    peakTolerance: 0.12,
    minLagCorrelation: 0.95,
    envelopeRmsRatioTolerance: 0.45,
    envelopePeakRatioTolerance: 0.45,
  },
  {
    id: 'master-pad-spectral-freeze-live-pre-scene',
    domain: 'spectralFreeze',
    durationMs: 1800,
    settleMs: 250,
    noteDurationMs: 1400,
    statePatch: spectralFreezeLiveState,
    rmsTolerance: 0.5,
    peakTolerance: 0.5,
    minLagCorrelation: 0.85,
  },
  {
    id: 'master-pad-diffuse-scene',
    domain: 'diffuseSourceSpatial',
    durationMs: 1400,
    noteDurationMs: 1000,
    statePatch: { ...baseState, padDiffuseSend: 0.7 },
    rmsTolerance: 0.08,
    peakTolerance: 0.12,
    minLagCorrelation: 0.95,
  },
  {
    id: 'master-pad-delay-ab-feedback-scene',
    domain: 'delayAB',
    durationMs: 1600,
    noteDurationMs: 1200,
    statePatch: delaySceneState,
    rmsTolerance: 0.12,
    peakTolerance: 0.14,
    minLagCorrelation: 0.94,
    maxLagMs: 140,
    envelopeRmsRatioTolerance: 0.45,
    envelopePeakRatioTolerance: 0.45,
  },
  {
    id: 'master-pad-dynamics-character-scene',
    domain: 'dynamicsSidechainMaster',
    durationMs: 1400,
    noteDurationMs: 1000,
    statePatch: dynamicsCharacterState,
    rmsTolerance: 0.08,
    peakTolerance: 0.12,
    minLagCorrelation: 0.95,
  },
  {
    id: 'master-drum-kick-scene',
    domain: 'drumSourceSends',
    durationMs: 900,
    statePatch: drumKickState,
    manualNotes: false,
    manualDrums: ['kick:0.8:0'],
    rmsTolerance: 0.08,
    peakTolerance: 0.12,
    minLagCorrelation: 0.95,
  },
  {
    id: 'master-pad-sidechain-kick-scene',
    domain: 'dynamicsSidechainMaster',
    durationMs: 1400,
    noteDurationMs: 1000,
    statePatch: sidechainState,
    manualDrums: ['kick:0.9:80'],
    rmsTolerance: 0.18,
    peakTolerance: 0.2,
    minLagCorrelation: 0.9,
    maxLagMs: 140,
    envelopeRmsRatioTolerance: 0.45,
    envelopePeakRatioTolerance: 0.45,
  },
  {
    id: 'master-soundscape-ocean-dry-scene',
    domain: 'soundscapeLayers',
    durationMs: 1000,
    settleMs: 1300,
    statePatch: soundscapeOceanState,
    manualNotes: false,
    rmsTolerance: 0.12,
    peakTolerance: 0.08,
    minLagCorrelation: 0.98,
    maxLagMs: 160,
    envelopePeakRatioTolerance: 0.5,
  },
  {
    id: 'master-soundscape-nature-dry-scene',
    domain: 'soundscapeLayers',
    durationMs: 1000,
    settleMs: 1300,
    statePatch: soundscapeNatureState,
    manualNotes: false,
    rmsTolerance: 0.12,
    peakTolerance: 0.08,
    minLagCorrelation: 0.98,
    maxLagMs: 160,
  },
  {
    id: 'master-soundscape-water-dry-scene',
    domain: 'soundscapeLayers',
    durationMs: 1000,
    settleMs: 1300,
    statePatch: soundscapeWaterState,
    manualNotes: false,
    rmsTolerance: 0.12,
    peakTolerance: 0.08,
    minLagCorrelation: 0.98,
    maxLagMs: 180,
  },
  {
    id: 'master-soundscape-insects-dry-scene',
    domain: 'soundscapeLayers',
    durationMs: 1000,
    settleMs: 1300,
    statePatch: soundscapeInsectsState,
    manualNotes: false,
    rmsTolerance: 0.12,
    peakTolerance: 0.08,
    minLagCorrelation: 0.98,
    maxLagMs: 180,
  },
  {
    id: 'master-soundscape-water-insects-dry-scene',
    domain: 'soundscapeLayers',
    durationMs: 1000,
    settleMs: 1300,
    statePatch: soundscapeWaterInsectsState,
    manualNotes: false,
    rmsTolerance: 0.12,
    peakTolerance: 0.08,
    minLagCorrelation: 0.95,
    maxLagMs: 180,
  },
];

function runCase(caseDef, args) {
  const command = [
    'scripts/check-web-core-sonic-parity.mjs',
    '--track=masterPostLimiter',
    `--duration-ms=${caseDef.durationMs}`,
    `--settle-ms=${caseDef.settleMs ?? 150}`,
    '--manual-trigger-delay-ms=0',
    `--state-patch=${JSON.stringify(caseDef.statePatch)}`,
    `--max-lag-ms=${caseDef.maxLagMs ?? 120}`,
    `--min-lag-correlation=${caseDef.minLagCorrelation}`,
    `--rms-tolerance=${caseDef.rmsTolerance}`,
    `--peak-tolerance=${caseDef.peakTolerance}`,
    '--envelope-gate',
  ];
  if (Array.isArray(caseDef.manualNotes)) {
    for (const manualNote of caseDef.manualNotes) command.push(`--manual-note=${manualNote}`);
  } else if (caseDef.manualNotes !== false) {
    command.push(`--manual-note=pad1:60:0.75:${caseDef.noteDurationMs ?? 1000}`);
  }
  for (const manualDrum of caseDef.manualDrums ?? []) command.push(`--manual-drum=${manualDrum}`);
  if (caseDef.envelopeRmsRatioTolerance !== undefined) command.push(`--envelope-rms-ratio-tolerance=${caseDef.envelopeRmsRatioTolerance}`);
  if (caseDef.envelopePeakRatioTolerance !== undefined) command.push(`--envelope-peak-ratio-tolerance=${caseDef.envelopePeakRatioTolerance}`);
  if (caseDef.envelopeTimeToleranceMs !== undefined) command.push(`--envelope-time-tolerance-ms=${caseDef.envelopeTimeToleranceMs}`);
  if (args.url) command.push(`--url=${args.url}`);
  else command.push(`--port=${args.port}`);

  const result = spawnSync(process.execPath, command, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    id: caseDef.id,
    domain: caseDef.domain,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function reportPathForArgs(args) {
  return args.caseIds.length > 0 ? selectedReportPath : fullReportPath;
}

function writeReport(report, args) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  const reportPath = reportPathForArgs(args);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

const args = parseArgs(process.argv.slice(2));
const selectedCases = args.caseIds.length > 0 ? cases.filter((caseDef) => args.caseIds.includes(caseDef.id)) : cases;
const selectedCaseIds = new Set(selectedCases.map((caseDef) => caseDef.id));
const missingCaseIds = args.caseIds.filter((caseId) => !selectedCaseIds.has(caseId));
if (missingCaseIds.length > 0) {
  throw new Error(`Unknown master corpus case(s): ${missingCaseIds.join(', ')}`);
}

const results = selectedCases.map((caseDef) => runCase(caseDef, args));
const failed = results.filter((result) => result.status !== 'pass');
const report = {
  schema: 'kessho-product-web-master-corpus-v1',
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? 'pass' : 'fail',
  filteredCaseIds: args.caseIds,
  cases: results.map((result) => ({
    id: result.id,
    domain: result.domain,
    track: 'masterPostLimiter',
    status: result.status,
    exitCode: result.exitCode,
  })),
};
const reportPath = writeReport(report, args);

for (const result of results) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

if (failed.length > 0) {
  throw new Error(`Kessho Product Web master corpus failed: ${failed.map((result) => result.id).join(', ')}. See ${reportPath}`);
}

console.log(`Kessho Product Web master corpus passed (${results.length} cases, report: ${reportPath})`);
