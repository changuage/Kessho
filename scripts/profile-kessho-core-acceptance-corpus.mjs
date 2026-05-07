#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = process.cwd();
const reportDir = resolve(root, 'docs/reports');
const jsonReportPath = resolve(reportDir, 'kessho-core-acceptance-corpus.json');
const markdownReportPath = resolve(reportDir, 'kessho-core-acceptance-corpus.md');
const parityScript = 'scripts/check-web-core-sonic-parity.mjs';

const DEFAULT_URL = 'http://127.0.0.1:4173/';

const acceptanceContract = {
  purpose: 'Practical Web Audio versus KesshoCore browser acceptance corpus for core migration parity.',
  parityScript,
  runner: 'node scripts/profile-kessho-core-acceptance-corpus.mjs --run --url=http://127.0.0.1:4173/',
  baselineCommand: 'node scripts/check-web-core-sonic-parity.mjs',
  sharedStartRequirement: 'Strict pad/manual-note cases are runnable now. Self-running drum and earth cases are gated with transient/envelope scoring for browser/core scheduling jitter.',
  stagedParity: {
    padSlice: {
      label: 'Pad Slice',
      target: 'Core pad source is close enough for migration of pad-only playback.',
      requiredCases: ['default-pad-dry', 'default-pad2-dry', 'pad-simple-dry', 'pad-reverb-tail'],
      boundaryCases: [],
      passDefinition: 'Dry pad, Pad 2, and shared reverb-tail gates pass with shared-start manual pad notes and no page errors.',
      boundaryDefinition: 'No open pad-slice boundary case remains after deterministic pre-reverb conditioning and input-synchronous reverb reset.',
    },
    fxSlice: {
      label: 'FX Slice',
      target: 'Core shared FX and master chain are close enough when fed by pad/manual deterministic input.',
      requiredCases: ['pad-delay-pingpong', 'pad-delay-reverb-bloom', 'granular-pad-cloud', 'granular-delay-return', 'dynamics-master-chain'],
      passDefinition: 'All required close/perceptual cases pass, using envelope gates for feedback-heavy tails where sample correlation is not meaningful.',
    },
    sourceSlice: {
      label: 'Source Slice',
      target: 'Core non-pad sources are close enough for lead, drums, and earth/soundscape migration.',
      requiredCases: ['lead-manual-dry', 'lead-delay-heavy', 'drum-euclid-tight', 'drum-delay-dub', 'earth-water-only', 'earth-full-nature'],
      passDefinition: 'All deterministic source cases pass; stochastic drum and earth cases pass documented transient/envelope gates.',
    },
    fullMixSlice: {
      label: 'Full Mix Slice',
      target: 'Core is close enough for representative webapp states and migration can proceed.',
      requiredCases: ['full-mix-gamelan', 'full-mix-dark-ambient'],
      passDefinition: 'Full-mix cases have no block failures, no silent enabled sources, and pass scoped perceptual/manual-review scoring.',
    },
  },
  thresholdClasses: {
    exact: 'Deterministic dry or nearly dry source. Expect tight RMS/peak thresholds and stable correlation.',
    close: 'Deterministic source through FX. Some phase/tail drift is acceptable within thresholds.',
    perceptual: 'Complex, stochastic, or feedback-heavy path. Thresholds catch gross drift; reviewer checks lag, level, and obvious character.',
    'manual-review': 'Acceptance requires listening or repeated-run judgement even if numeric thresholds pass.',
  },
  knownExclusionsDebt: [
    'This is browser Web Audio versus core-wasm acceptance only; macOS/iOS device CPU, battery, route-change, and screen-off behavior stay outside this gate.',
    'The corpus does not require bit-exact parity. It is meant to decide when core-wasm is close enough for migration.',
    'Earth/soundscape, drum sequencer, granular feedback, and full-mix cases use envelope or transient gates instead of bit-exact waveform correlation.',
    'Synth Euclidean note generation remains a webapp sequencer concern in this gate; full-mix manual captures disable it so the C++ backbone route is scored directly.',
    'Lead manual-note cases require core-wasm lead trigger support in the parity harness.',
    'Preset storage/cloud round-trip validation is out of scope here; cases use local states and local factory preset references.',
  ],
  scoring: {
    pass: [
      'The parity script exits 0 for every required expected-pass corpus case.',
      'Reference Web RMS is at or above each case minSignalRms.',
      'Normalized RMS/peak sample differences or the configured transient/envelope gate are within the per-case thresholds.',
      'The run has no page errors, non-finite samples, or unexpected silent captures.',
    ],
    review: [
      'Best-lag magnitude above 50 ms, even if RMS passes.',
      'Correlation below 0.85 on deterministic manual-note cases.',
      'Any stochastic earth/granular case that passes only with visibly unstable metrics between repeated runs.',
    ],
    block: [
      'Silent reference capture on an enabled source.',
      'Any deterministic expected-pass source case above threshold.',
      'Browser console/page errors from the parity harness or core host.',
    ],
  },
};

const knownFailureDetails = {};

const sourceMute = {
  padEnabled: false,
  pad2Enabled: false,
  synthEuclideanMasterEnabled: false,
  leadEnabled: false,
  lead2Enabled: false,
  leadRandomEnabled: false,
  pianoEnabled: false,
  drumEnabled: false,
  drumEuclidMasterEnabled: false,
  waterEnabled: false,
  insectsEnabled: false,
  insects2Enabled: false,
  birdsEnabled: false,
  birds2Enabled: false,
  frogsEnabled: false,
  oceanSampleEnabled: false,
  oceanWaveSynthEnabled: false,
  granularEnabled: false,
  granularFreeze: false,
  reverbEnabled: false,
  spectralFreezeEnabled: false,
  delayAEnabled: false,
  delayAMix: 0,
  delayAFeedback: 0,
  delayAToBSend: 0,
  delayBToASend: 0,
  delayAGranularSend: 0,
  delayBGranularSend: 0,
  masterSatDrive: 0,
  dynamicsEnabled: false,
  characterEnabled: false,
  sidechainEnabled: false,
};

const padManualChord = [
  { source: 'pad1', midi: 48, velocity: 0.72, durationMs: 1800 },
  { source: 'pad1', midi: 55, velocity: 0.68, durationMs: 1800 },
  { source: 'pad1', midi: 62, velocity: 0.62, durationMs: 1800 },
];

const padManualShort = [
  { source: 'pad1', midi: 60, velocity: 0.78, durationMs: 900 },
];

const padManualDefaultSustain = [
  { source: 'pad1', midi: 60, velocity: 0.78, durationMs: 5200 },
];

const pad2ManualDefaultSustain = [
  { source: 'pad2', midi: 60, velocity: 0.78, durationMs: 5200 },
];

const leadManualLine = [
  { source: 'lead1', midi: 72, velocity: 0.82, durationMs: 700 },
  { source: 'lead1', midi: 76, velocity: 0.75, durationMs: 650 },
];

const lead2ManualLine = [
  { source: 'lead2', midi: 67, velocity: 0.8, durationMs: 800 },
];

const drumEuclidCore = {
  drumEnabled: true,
  drumLevel: 0.72,
  drumEuclidMasterEnabled: true,
  drumEuclidBaseBPM: 120,
  drumEuclidTempo: 1,
  drumEuclidSwing: 0,
  drumEuclidDivision: 8,
  drumEuclid1Enabled: true,
  drumEuclid1Steps: 8,
  drumEuclid1Hits: 3,
  drumEuclid1Rotation: 0,
  drumEuclid1TargetKick: true,
  drumEuclid1TargetSub: false,
  drumEuclid1Level: 0.85,
  drumEuclid2Enabled: true,
  drumEuclid2Steps: 16,
  drumEuclid2Hits: 5,
  drumEuclid2Rotation: 2,
  drumEuclid2TargetBeepHi: true,
  drumEuclid2Level: 0.65,
  drumEuclid3Enabled: true,
  drumEuclid3Steps: 12,
  drumEuclid3Hits: 4,
  drumEuclid3Rotation: 1,
  drumEuclid3TargetClick: true,
  drumEuclid3Level: 0.55,
  drumEuclid4Enabled: false,
};

const earthOff = {
  waterEnabled: false,
  insectsEnabled: false,
  insects2Enabled: false,
  birdsEnabled: false,
  birds2Enabled: false,
  frogsEnabled: false,
  oceanSampleEnabled: false,
};

const corpus = [
  {
    id: 'pad-simple-dry',
    title: 'Simple dry pad',
    group: 'simple pad',
    thresholdClass: 'close',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json',
    includeSourceState: true,
    durationMs: 5000,
    settleMs: 700,
    thresholds: { rmsTolerance: 0.04, peakTolerance: 0.22, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 500,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.35,
      peakRatioTolerance: 0.45,
    },
    manualNotes: padManualChord,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.58,
      masterVolume: 0.72,
      synthAttack: 0.05,
      synthRelease: 1.2,
      filterType: 'lowpass',
      filterCutoffMin: 1800,
      filterCutoffMax: 1800,
      filterResonance: 0.18,
      padLfo1Depth: 0,
      padLfo1Dest: 'none',
      padLfo2Depth: 0,
      padLfo2Dest: 'none',
      pad1ReverbSend: 0,
      synthReverbSend: 0,
      pad1DelayASend: 0,
    },
    intent: 'Small deterministic pad chord with no shared FX; checks envelope and level parity for a richer pad blend while default dry pads remain exact waveform sentinels.',
    readyWhen: ['pad manual notes work in both engines'],
  },
  {
    id: 'default-pad-dry',
    title: 'Default pad dry',
    group: 'default pad dry',
    thresholdClass: 'exact',
    expectedOutcome: 'pass',
    source: 'src/ui/state.ts#DEFAULT_STATE',
    includeSourceState: false,
    durationMs: 5000,
    settleMs: 700,
    thresholds: { rmsTolerance: 0.04, peakTolerance: 0.22, minSignalRms: 0.0001 },
    manualNotes: padManualDefaultSustain,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.6,
      masterVolume: 0.85,
      reverbEnabled: false,
      pad1ReverbSend: 0,
      synthReverbSend: 0,
      pad1DelayASend: 0,
      delayAEnabled: false,
      granularEnabled: false,
    },
    intent: 'The unadorned app-default pad sustain path, dried out so it is a stable migration gate without conflating the 12s release tail.',
    readyWhen: ['pad manual notes work in both engines'],
  },
  {
    id: 'default-pad2-dry',
    title: 'Default Pad 2 dry',
    group: 'default pad dry',
    thresholdClass: 'exact',
    expectedOutcome: 'pass',
    source: 'src/ui/state.ts#DEFAULT_STATE',
    includeSourceState: false,
    durationMs: 5000,
    settleMs: 700,
    thresholds: { rmsTolerance: 0.04, peakTolerance: 0.22, minSignalRms: 0.0001 },
    manualNotes: pad2ManualDefaultSustain,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      pad2Enabled: true,
      synthLevel: 0.6,
      masterVolume: 0.85,
      reverbEnabled: false,
      pad1ReverbSend: 0,
      pad2ReverbSend: 0,
      synthReverbSend: 0,
      pad1DelayASend: 0,
      pad2DelayASend: 0,
      delayAEnabled: false,
      granularEnabled: false,
    },
    intent: 'The same dry sustain gate through Pad 2 voice assignment and route selection.',
    readyWhen: ['pad2 manual notes route to the assigned Pad 2 voice in both engines'],
  },
  {
    id: 'pad-reverb-tail',
    title: 'Pad plus long reverb tail',
    group: 'pad+reverb',
    thresholdClass: 'close',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/Ethereal_Ambient.json',
    includeSourceState: true,
    durationMs: 8000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.055, peakTolerance: 0.28, minSignalRms: 0.0001 },
    manualNotes: padManualChord,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.62,
      masterVolume: 0.68,
      reverbEnabled: true,
      reverbLevel: 0.85,
      reverbType: 'cathedral',
      reverbDecay: 0.88,
      reverbSize: 2.4,
      reverbDiffusion: 0.9,
      reverbModulation: 0.25,
      predelay: 30,
      pad1ReverbSend: 0.82,
      synthReverbSend: 0.82,
    },
    intent: 'Same musical role as the dry pad, but with the shared reverb return and tail behavior active.',
    readyWhen: ['shared reverb return is represented in the core host'],
  },
  {
    id: 'pad-dark-dense',
    title: 'Dense dark pad',
    group: 'pad+reverb',
    thresholdClass: 'close',
    source: 'KesshoNativeSwift/Kessho/Presets/Dark_Textures.json',
    includeSourceState: true,
    durationMs: 8000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.065, peakTolerance: 0.3, minSignalRms: 0.0001 },
    manualNotes: padManualChord,
    statePatch: {
      ...earthOff,
      leadEnabled: false,
      drumEnabled: false,
      drumEuclidMasterEnabled: false,
      padEnabled: true,
      granularEnabled: false,
      reverbEnabled: true,
      masterVolume: 0.68,
      synthLevel: 0.55,
      pad1ReverbSend: 0.66,
      synthReverbSend: 0.66,
    },
    intent: 'Represents the darker, slower stock state used by the existing golden profile.',
    readyWhen: ['pad source and reverb path are stable'],
  },
  {
    id: 'lead-manual-dry',
    title: 'Manual dry lead',
    group: 'lead',
    thresholdClass: 'close',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/Bright_Bells.json',
    includeSourceState: true,
    durationMs: 4500,
    settleMs: 700,
    thresholds: { rmsTolerance: 0.05, peakTolerance: 0.26, minSignalRms: 0.0001 },
    manualNotes: leadManualLine,
    statePatch: {
      ...sourceMute,
      leadEnabled: true,
      lead1Level: 0.78,
      lead1PresetA: 'soft_rhodes',
      lead1PresetB: 'gamelan',
      lead1Morph: 0.45,
      lead1MorphAuto: false,
      leadTensionMode: 'locked',
      leadTensionValue: 0,
      tension: 0,
      lead1ReverbSend: 0,
      lead1DelayASend: 0,
      delayAEnabled: false,
      masterVolume: 0.74,
    },
    intent: 'Single-source 4-op lead timbre without pad, delay, or reverb masking.',
    readyWhen: ['manual lead1 trigger support exists for core-wasm parity capture'],
  },
  {
    id: 'lead-delay-heavy',
    title: 'Lead into heavy Delay A',
    group: 'delay-heavy',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/StringWaves.json',
    includeSourceState: true,
    durationMs: 7000,
    settleMs: 800,
    thresholds: { rmsTolerance: 0.07, peakTolerance: 0.32, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 500,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.45,
      peakRatioTolerance: 0.45,
    },
    manualNotes: leadManualLine,
    statePatch: {
      ...sourceMute,
      leadEnabled: true,
      lead1Level: 0.7,
      lead1PresetA: 'gamelan',
      lead1PresetB: 'soft_rhodes',
      lead1Morph: 0.72,
      lead1DelayASend: 0.95,
      delayAEnabled: true,
      delayATime: 625,
      delayAFeedback: 0.68,
      delayAMix: 0.62,
      delayAFilter: 1800,
      delayAFilterType: 'lowpass',
      delayAPingPong: true,
      delayAWidth: 0.9,
      delayAReverbSend: 0.25,
      reverbEnabled: true,
      reverbLevel: 0.35,
      masterVolume: 0.7,
    },
    intent: 'High-feedback shared Delay A with a lead source, including ping-pong width and reverb send.',
    readyWhen: ['manual lead1 trigger support exists', 'Delay A module is represented in core-wasm capture'],
  },
  {
    id: 'pad-delay-pingpong',
    title: 'Pad into ping-pong Delay A',
    group: 'delay-heavy',
    thresholdClass: 'close',
    expectedOutcome: 'pass',
    source: 'src/ui/delay/delayPresets.ts#pingPongClean',
    includeSourceState: false,
    durationMs: 6500,
    settleMs: 800,
    thresholds: { rmsTolerance: 0.06, peakTolerance: 0.3, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 250,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.45,
      peakRatioTolerance: 0.4,
    },
    manualNotes: padManualShort,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.5,
      masterVolume: 0.72,
      pad1DelayASend: 0.9,
      delayAEnabled: true,
      delayATime: 500,
      delayAFeedback: 0.62,
      delayAMix: 0.7,
      delayAFilter: 2400,
      delayAFilterType: 'lowpass',
      delayAPingPong: true,
      delayAWidth: 0.85,
      reverbEnabled: false,
      pad1ReverbSend: 0,
    },
    intent: 'Delay-heavy case that still uses current pad manual trigger support.',
    readyWhen: ['pad Delay A send and Delay A return are represented in core-wasm capture'],
  },
  {
    id: 'pad-delay-reverb-bloom',
    title: 'Pad delay into reverb bloom',
    group: 'delay+reverb',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'src/ui/delay/delayPresets.ts#chorusWash',
    includeSourceState: false,
    durationMs: 8000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.075, peakTolerance: 0.34, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 500,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.5,
      peakRatioTolerance: 0.45,
    },
    manualNotes: padManualShort,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.48,
      masterVolume: 0.7,
      pad1DelayASend: 0.78,
      delayAEnabled: true,
      delayATime: 540,
      delayAFeedback: 0.56,
      delayAMix: 0.56,
      delayAFilter: 2200,
      delayAFilterType: 'lowpass',
      delayAPingPong: false,
      delayAModRate: 0.6,
      delayAModDepth: 0.5,
      delayAWidth: 0.72,
      delayAReverbSend: 0.5,
      reverbEnabled: true,
      reverbLevel: 0.55,
      reverbDecay: 0.72,
      reverbSize: 1.8,
      reverbDiffusion: 0.8,
      pad1ReverbSend: 0.22,
    },
    intent: 'Representative combined FX case: pad excites Delay A, the delay return feeds shared reverb, and both tails must stay sane.',
    readyWhen: ['Delay A and shared reverb return are both represented in core-wasm capture'],
  },
  {
    id: 'granular-pad-cloud',
    title: 'Pad-fed granular cloud',
    group: 'granular routing',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'src/ui/granular/granularPresets.ts#classic_cloud',
    includeSourceState: false,
    durationMs: 9000,
    settleMs: 1200,
    thresholds: { rmsTolerance: 0.09, peakTolerance: 0.35, minSignalRms: 0.00008 },
    envelopeGate: {
      windowMs: 500,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.35,
      peakRatioTolerance: 1.25,
    },
    manualNotes: padManualChord,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.46,
      masterVolume: 0.68,
      granularEnabled: true,
      granularPreset: 'classic_cloud',
      granularLevel: 0.5,
      granularPad1Send: 0.85,
      granularFeedback: 0.18,
      granularReverbSend: 0.18,
      granularOutputLPF: 9000,
      reverbEnabled: true,
      reverbLevel: 0.35,
      pad1ReverbSend: 0.08,
    },
    intent: 'Pad source routed through the granular bus with a modest reverb return.',
    readyWhen: ['granular bus routing is available in core-wasm capture'],
  },
  {
    id: 'granular-delay-return',
    title: 'Delay returns through granular',
    group: 'granular routing',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/WaveOut.json',
    includeSourceState: true,
    durationMs: 9000,
    settleMs: 1200,
    thresholds: { rmsTolerance: 0.1, peakTolerance: 0.38, minSignalRms: 0.00008 },
    envelopeGate: {
      windowMs: 500,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.55,
      peakRatioTolerance: 0.5,
    },
    manualNotes: padManualShort,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.42,
      masterVolume: 0.67,
      granularEnabled: true,
      granularPreset: 'mosaic_d',
      granularLevel: 0.45,
      granularPad1Send: 0.35,
      pad1DelayASend: 0.75,
      delayAEnabled: true,
      delayATime: 430,
      delayAFeedback: 0.58,
      delayAMix: 0.52,
      delayAGranularSend: 0.45,
      delayBGranularSend: 0.25,
      reverbEnabled: true,
      reverbLevel: 0.45,
      pad1ReverbSend: 0.18,
      granularReverbSend: 0.32,
    },
    intent: 'Exercises cross-routing where the delay path becomes a granular input rather than only a wet return.',
    readyWhen: ['Delay A to granular and granular return routing are represented in core-wasm capture'],
  },
  {
    id: 'drum-euclid-tight',
    title: 'Tight Euclidean drum kit',
    group: 'drum',
    thresholdClass: 'close',
    expectedOutcome: 'pass',
    source: 'src/ui/state.ts#DEFAULT_STATE',
    includeSourceState: false,
    durationMs: 7000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.075, peakTolerance: 0.35, minSignalRms: 0.00008 },
    transientGate: {
      timeToleranceMs: 24,
      peakRatioTolerance: 0.6,
      rmsRatioTolerance: 0.45,
    },
    manualNotes: [],
    statePatch: {
      ...sourceMute,
      ...drumEuclidCore,
      masterVolume: 0.72,
      drumDelayEnabled: false,
      drumReverbSend: 0.04,
      reverbEnabled: true,
      reverbLevel: 0.22,
    },
    intent: 'Self-running drum source without delay masking; catches transient timing and level drift.',
    readyWhen: ['shared-start capture aligns self-running drum sequencer between engines'],
  },
  {
    id: 'drum-delay-dub',
    title: 'Dubbed-out drum delay',
    group: 'drum',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'src/ui/drums/drumSourcePresets.ts#dubbedOut',
    includeSourceState: false,
    durationMs: 8000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.09, peakTolerance: 0.38, minSignalRms: 0.00008 },
    transientGate: {
      timeToleranceMs: 48,
      peakRatioTolerance: 0.6,
      rmsRatioTolerance: 0.45,
    },
    manualNotes: [],
    statePatch: {
      ...sourceMute,
      ...drumEuclidCore,
      masterVolume: 0.7,
      drumDelayEnabled: true,
      drumDelayNoteL: '1/4',
      drumDelayNoteR: '1/8',
      drumDelayFeedback: 0.6,
      drumDelayMix: 0.4,
      drumDelayFilter: 0.35,
      drumSubDelaySend: 0.1,
      drumKickDelaySend: 0.3,
      drumClickDelaySend: 0.7,
      drumBeepHiDelaySend: 0.8,
      drumBeepLoDelaySend: 0.5,
      drumNoiseDelaySend: 0.9,
      drumMembraneDelaySend: 0.4,
      drumDelayASend: 0.8,
      reverbEnabled: false,
    },
    intent: 'Representative drum transients plus feedback delay smear.',
    readyWhen: ['shared-start capture aligns self-running drum sequencer', 'drum delay path is represented'],
  },
  {
    id: 'earth-water-only',
    title: 'Water-only earth bed',
    group: 'soundscape/earth',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'src/ui/earth/earthPresets.ts#waterOnly',
    includeSourceState: false,
    durationMs: 10000,
    settleMs: 1500,
    thresholds: { rmsTolerance: 0.1, peakTolerance: 0.4, minSignalRms: 0.00005 },
    envelopeGate: {
      windowMs: 5000,
      timeToleranceMs: 1200,
      rmsRatioTolerance: 0.85,
      peakRatioTolerance: 0.5,
    },
    manualNotes: [],
    statePatch: {
      ...sourceMute,
      waterEnabled: true,
      waterPreset: 1,
      waterLevel: 0.75,
      waterReverbSend: 0.12,
      natureLevel: 0.9,
      reverbEnabled: true,
      reverbLevel: 0.25,
      masterVolume: 0.72,
    },
    intent: 'Simple self-running earth layer with only water enabled.',
    readyWhen: ['shared-start capture seeds earth texture scheduling consistently'],
  },
  {
    id: 'earth-full-nature',
    title: 'Full nature earth kit',
    group: 'soundscape/earth',
    thresholdClass: 'manual-review',
    expectedOutcome: 'pass',
    source: 'src/ui/earth/earthPresets.ts#fullNature',
    includeSourceState: false,
    durationMs: 12000,
    settleMs: 1800,
    thresholds: { rmsTolerance: 0.12, peakTolerance: 0.42, minSignalRms: 0.00005 },
    envelopeGate: {
      windowMs: 3000,
      timeToleranceMs: 1200,
      rmsRatioTolerance: 0.6,
      peakRatioTolerance: 0.5,
    },
    manualNotes: [],
    statePatch: {
      ...sourceMute,
      waterEnabled: true,
      insectsEnabled: true,
      insects2Enabled: true,
      birdsEnabled: true,
      birds2Enabled: true,
      frogsEnabled: true,
      oceanSampleEnabled: true,
      waterLevel: 0.55,
      insectsLevel: 0.55,
      insects2Level: 0.4,
      birdsLevel: 0.35,
      birds2Level: 0.28,
      frogsLevel: 0.35,
      natureLevel: 0.85,
      natureReverbSend: 0.18,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 6000,
      oceanFilterResonance: 0.15,
      reverbEnabled: true,
      reverbLevel: 0.3,
      masterVolume: 0.68,
    },
    intent: 'The broadest earth/soundscape state in the corpus, with multiple stochastic layers.',
    readyWhen: ['shared-start capture seeds earth texture scheduling consistently'],
  },
  {
    id: 'soundscape-ocean-pad',
    title: 'Ocean bed plus sparse pad',
    group: 'soundscape/earth',
    thresholdClass: 'perceptual',
    source: 'KesshoNativeSwift/Kessho/Presets/WaveOut.json',
    includeSourceState: true,
    durationMs: 10000,
    settleMs: 1400,
    thresholds: { rmsTolerance: 0.11, peakTolerance: 0.4, minSignalRms: 0.00005 },
    manualNotes: padManualShort,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.28,
      oceanSampleEnabled: true,
      oceanSampleLevel: 0.22,
      oceanFilterType: 'lowpass',
      oceanFilterCutoff: 7000,
      natureLevel: 0.7,
      reverbEnabled: true,
      reverbLevel: 0.45,
      pad1ReverbSend: 0.45,
      masterVolume: 0.66,
    },
    intent: 'Hybrid musical pad and soundscape layer based on an existing full-state preset.',
    readyWhen: ['shared-start capture handles pad manual trigger and ocean sample scheduling'],
  },
  {
    id: 'dynamics-master-chain',
    title: 'Pad through dynamics and master chain',
    group: 'dynamics/master chain',
    thresholdClass: 'perceptual',
    expectedOutcome: 'pass',
    source: 'src/ui/dynamics/dynamicsPresets.ts#ambientWaterGlue',
    includeSourceState: false,
    durationMs: 8000,
    settleMs: 900,
    thresholds: { rmsTolerance: 0.08, peakTolerance: 0.34, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 250,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.25,
      peakRatioTolerance: 0.35,
    },
    manualNotes: padManualChord,
    statePatch: {
      ...sourceMute,
      padEnabled: true,
      synthLevel: 0.5,
      masterVolume: 0.68,
      reverbEnabled: false,
      pad1ReverbSend: 0,
      dynamicsEnabled: true,
      characterEnabled: true,
      characterMode: 'abyssWater',
      characterMix: 0.32,
      characterAge: 0.28,
      characterResonance: 0.35,
      characterDepth: 0.45,
      characterRate: 0.32,
      characterTone: 0.55,
      degradeEnabled: true,
      degradeMix: 0.16,
      degradeAge: 0.22,
      degradeWow: 0.05,
      degradeFlutter: 0.025,
      degradeTone: 0.5,
      dynamicsSaturationEnabled: true,
      dynamicsSaturationMode: 'tape',
      dynamicsSaturationDrive: 0.24,
      dynamicsSaturationTone: 0.48,
      dynamicsSaturationBias: 0.52,
      endCompEnabled: true,
      endCompThreshold: -18,
      endCompKnee: 16,
      endCompRatio: 1.85,
      endCompAttackMs: 24,
      endCompReleaseMs: 220,
      endCompMakeup: 1,
      endCompMix: 0.72,
      masterSatDrive: 0.12,
      masterSatMode: 'tape',
      masterSatTone: 0.5,
    },
    intent: 'Master-chain acceptance case covering Dynamics page character/degrade/saturation/end compressor plus master saturation.',
    readyWhen: ['dynamics and master-chain routing are represented in core-wasm capture'],
  },
  {
    id: 'full-mix-gamelan',
    title: 'Gamelan full mix',
    group: 'full mix',
    thresholdClass: 'manual-review',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/Gamelantest.json',
    includeSourceState: true,
    durationMs: 12000,
    settleMs: 1200,
    thresholds: { rmsTolerance: 0.12, peakTolerance: 0.42, minSignalRms: 0.0001 },
    envelopeGate: {
      windowMs: 1000,
      timeToleranceMs: 20,
      rmsRatioTolerance: 0.4,
      peakRatioTolerance: 0.45,
    },
    manualNotes: [...leadManualLine, ...padManualShort],
    statePatch: {
      padEnabled: true,
      synthLevel: 0.24,
      synthEuclideanMasterEnabled: false,
      leadEnabled: true,
      lead1Level: 0.46,
      lead1DelayASend: 0.35,
      drumEnabled: true,
      drumLevel: 0.42,
      drumEuclidMasterEnabled: true,
      drumDelayEnabled: true,
      drumDelayMix: 0.22,
      waterEnabled: false,
      insectsEnabled: false,
      oceanSampleEnabled: false,
      granularEnabled: false,
      delayAEnabled: true,
      delayAFeedback: 0.42,
      delayAMix: 0.3,
      reverbEnabled: true,
      reverbLevel: 0.32,
      masterVolume: 0.62,
    },
    intent: 'Mixed melodic, lead, drum, delay, and reverb state from an existing preset, scoped to manual synth triggers plus the represented drum backbone.',
    readyWhen: ['shared-start capture covers manual pad/lead notes, drum sequencer output, delay, and reverb'],
  },
  {
    id: 'full-mix-dark-ambient',
    title: 'Dark ambient full mix',
    group: 'full mix',
    thresholdClass: 'manual-review',
    expectedOutcome: 'pass',
    source: 'KesshoNativeSwift/Kessho/Presets/Dark_Textures.json',
    includeSourceState: true,
    durationMs: 12000,
    settleMs: 1500,
    thresholds: { rmsTolerance: 0.13, peakTolerance: 0.45, minSignalRms: 0.00008 },
    envelopeGate: {
      windowMs: 1500,
      timeToleranceMs: 50,
      rmsRatioTolerance: 0.55,
      peakRatioTolerance: 0.5,
    },
    manualNotes: padManualChord,
    statePatch: {
      padEnabled: true,
      synthLevel: 0.42,
      leadEnabled: false,
      drumEnabled: true,
      drumLevel: 0.25,
      drumEuclidMasterEnabled: true,
      drumEuclid1Enabled: true,
      drumEuclid2Enabled: true,
      drumEuclid3Enabled: false,
      granularEnabled: true,
      granularPreset: 'ambient_wash',
      granularLevel: 0.35,
      granularPad1Send: 0.55,
      waterEnabled: true,
      waterLevel: 0.28,
      oceanSampleEnabled: true,
      oceanSampleLevel: 0.18,
      reverbEnabled: true,
      reverbLevel: 0.55,
      pad1ReverbSend: 0.7,
      granularReverbSend: 0.55,
      masterVolume: 0.58,
    },
    intent: 'Dense acceptance endpoint: pad, granular, drum pulse, earth bed, and reverb all active.',
    readyWhen: ['shared-start capture covers sequencers, granular routing, earth scheduling, and reverb'],
  },
];

function parseArgs(argv) {
  const args = {
    help: false,
    write: false,
    selfCheck: false,
    list: false,
    listSlices: false,
    json: false,
    markdown: false,
    commands: false,
    run: false,
    url: DEFAULT_URL,
    caseId: '',
    sliceId: '',
    trackId: '',
    stateOverride: {},
    hasStateOverride: false,
    noFail: false,
    printTransients: false,
    allowKnownFailures: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--self-check') args.selfCheck = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--list-slices') args.listSlices = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--commands') args.commands = true;
    else if (arg === '--run') args.run = true;
    else if (arg === '--no-fail') args.noFail = true;
    else if (arg === '--print-transients') args.printTransients = true;
    else if (arg === '--allow-known-failures') args.allowKnownFailures = true;
    else if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length);
    else if (arg.startsWith('--case=')) args.caseId = arg.slice('--case='.length);
    else if (arg.startsWith('--slice=')) args.sliceId = arg.slice('--slice='.length);
    else if (arg.startsWith('--stage=')) args.sliceId = arg.slice('--stage='.length);
    else if (arg.startsWith('--track=')) args.trackId = arg.slice('--track='.length).trim();
    else if (arg.startsWith('--state-override=')) mergeStateOverride(args, arg.slice('--state-override='.length), '--state-override');
    else if (arg.startsWith('--state-patch=')) mergeStateOverride(args, arg.slice('--state-patch='.length), '--state-patch');
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.caseId && args.sliceId) {
    throw new Error('Use either --case or --slice/--stage, not both.');
  }
  if ((args.trackId || args.hasStateOverride || args.printTransients) && !args.commands && !args.run) {
    throw new Error('--track, --print-transients, and temporary state overrides are only supported with --commands or --run.');
  }

  if (!args.help && !args.write && !args.selfCheck && !args.list && !args.listSlices && !args.json && !args.markdown && !args.commands && !args.run) {
    args.help = true;
  }
  return args;
}

function mergeStateOverride(args, value, flagName) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${flagName} must be valid JSON: ${detail}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${flagName} must be a JSON object.`);
  }
  args.stateOverride = {
    ...args.stateOverride,
    ...parsed,
  };
  args.hasStateOverride = true;
}

function printHelp() {
  console.log(`Usage: node scripts/profile-kessho-core-acceptance-corpus.mjs [options]

Options:
  --write                 Write docs/reports/kessho-core-acceptance-corpus.{md,json}
  --self-check            Run no-browser corpus wrapper invariants
  --list                  Print the corpus case list
  --list-slices           Print staged slice names and selected cases
  --json                  Print the resolved machine-readable report JSON
  --markdown              Print the markdown report
  --commands              Print direct check-web-core-sonic-parity commands
  --run                   Run selected cases through check-web-core-sonic-parity
  --case=<id>             Limit --commands, --run, --json, or --markdown to one case
  --slice=<id>            Limit --commands, --run, --json, or --markdown to a staged slice
                          Supported aliases: pad, pad-dry, pad-boundary, fx, source, full-mix
  --track=<id>            Capture a specific recordable bus for --commands or --run. Default: mix
  --state-override=<json> Temporary JSON state patch merged after the corpus case patch for --commands or --run
  --state-patch=<json>    Alias for --state-override in this wrapper
  --url=<url>             Existing dev server URL for --commands or --run
  --no-fail               Add --no-fail to parity-script commands/runs
  --print-transients      Forward transient summaries to parity-script commands/runs
  --allow-known-failures  Let known sonic failures summarize without failing the wrapper
  --help, -h              Show this help

Examples:
  node scripts/profile-kessho-core-acceptance-corpus.mjs --write
  node scripts/profile-kessho-core-acceptance-corpus.mjs --self-check
  node scripts/profile-kessho-core-acceptance-corpus.mjs --list-slices
  node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --slice=pad-dry --url=http://127.0.0.1:4173/
  node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --case=pad-reverb-tail --track=reverb --state-override='{"reverbLevel":0.45}' --url=http://127.0.0.1:4173/
  node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --url=http://127.0.0.1:4173/
  node scripts/profile-kessho-core-acceptance-corpus.mjs --run --slice=pad --url=http://127.0.0.1:4173/
  node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-simple-dry --url=http://127.0.0.1:4173/
`);
}

function parsePresetJson(file) {
  const source = readFileSync(resolve(root, file), 'utf8');
  return JSON.parse(source.replace(/,\s*([}\]])/g, '$1'));
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function stageCaseIds(stage) {
  return [
    ...(stage.requiredCases ?? []),
    ...(stage.boundaryCases ?? []),
    ...(stage.optionalCases ?? []),
  ];
}

function normalizeSliceId(sliceId) {
  const key = sliceId.trim();
  const aliases = new Map([
    ['all', 'all'],
    ['pad', 'padSlice'],
    ['pad-slice', 'padSlice'],
    ['padSlice', 'padSlice'],
    ['pad-dry', 'padDry'],
    ['padDry', 'padDry'],
    ['pad-boundary', 'padBoundary'],
    ['pad-reverb', 'padBoundary'],
    ['padReverbBoundary', 'padBoundary'],
    ['fx', 'fxSlice'],
    ['fx-slice', 'fxSlice'],
    ['fxSlice', 'fxSlice'],
    ['source', 'sourceSlice'],
    ['source-slice', 'sourceSlice'],
    ['sourceSlice', 'sourceSlice'],
    ['full', 'fullMixSlice'],
    ['full-mix', 'fullMixSlice'],
    ['fullMix', 'fullMixSlice'],
    ['fullMixSlice', 'fullMixSlice'],
  ]);
  return aliases.get(key) ?? key;
}

function sliceCaseIds(sliceId) {
  const normalized = normalizeSliceId(sliceId);
  if (!normalized || normalized === 'all') return corpus.map((entry) => entry.id);
  if (normalized === 'padDry') return acceptanceContract.stagedParity.padSlice.requiredCases;
  if (normalized === 'padBoundary') return acceptanceContract.stagedParity.padSlice.boundaryCases ?? [];
  const stage = acceptanceContract.stagedParity[normalized];
  if (stage) return stageCaseIds(stage);
  throw new Error(`Unknown staged slice: ${sliceId}`);
}

function selectedCorpusEntries({ caseId = '', sliceId = '' } = {}) {
  if (caseId) {
    const selected = corpus.filter((entry) => entry.id === caseId);
    if (selected.length === 0) throw new Error(`Unknown corpus case: ${caseId}`);
    return selected;
  }

  if (sliceId) {
    const ids = sliceCaseIds(sliceId);
    const byId = new Map(corpus.map((entry) => [entry.id, entry]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(`Slice ${sliceId} references missing case(s): ${missing.join(', ')}`);
    }
    return ids.map((id) => byId.get(id));
  }

  return corpus;
}

function validateKnownFailureCatalog() {
  const byId = new Map(corpus.map((entry) => [entry.id, entry]));
  for (const entry of corpus) {
    if (entry.expectedOutcome === 'known-sonic-fail' && !knownFailureDetails[entry.id]) {
      throw new Error(`${entry.id} is marked known-sonic-fail but has no known failure detail.`);
    }
  }
  for (const caseId of Object.keys(knownFailureDetails)) {
    const entry = byId.get(caseId);
    if (!entry) throw new Error(`Known failure detail references missing case: ${caseId}`);
    if (entry.expectedOutcome !== 'known-sonic-fail') {
      throw new Error(`Known failure detail references ${caseId}, but that case is not marked known-sonic-fail.`);
    }
  }
}

function knownFailuresForCases(cases) {
  return cases
    .filter((entry) => entry.expectedOutcome === 'known-sonic-fail')
    .map((entry) => ({
      caseId: entry.id,
      ...knownFailureDetails[entry.id],
    }));
}

function resolveCases(selection = {}) {
  validateKnownFailureCatalog();
  const selected = selectedCorpusEntries(selection);

  return selected.map((entry) => {
    const sourcePath = entry.source.split('#')[0];
    const sourceExists = existsSync(resolve(root, sourcePath));
    if (!sourceExists) {
      throw new Error(`${entry.id} source is missing: ${sourcePath}`);
    }

    let sourceName = null;
    let sourceState = {};
    if (entry.includeSourceState) {
      const parsed = parsePresetJson(sourcePath);
      sourceName = parsed.name ?? null;
      sourceState = parsed.state && typeof parsed.state === 'object' ? parsed.state : {};
    }

    const resolvedStatePatch = {
      ...sourceState,
      ...entry.statePatch,
    };
    const patchJson = JSON.stringify(stableSort(resolvedStatePatch));
    const args = parityArgs(entry, patchJson);
    return {
      id: entry.id,
      title: entry.title,
      group: entry.group,
      thresholdClass: entry.thresholdClass,
      expectedOutcome: entry.expectedOutcome ?? 'candidate',
      source: entry.source,
      sourceName,
      includeSourceState: entry.includeSourceState,
      intent: entry.intent,
      durationMs: entry.durationMs,
      settleMs: entry.settleMs,
      thresholds: entry.thresholds,
      transientGate: entry.transientGate ?? null,
      envelopeGate: entry.envelopeGate ?? null,
      manualNotes: entry.manualNotes,
      readyWhen: entry.readyWhen,
      statePatchKeyCount: Object.keys(resolvedStatePatch).length,
      statePatchSha256: sha256(patchJson),
      statePatch: resolvedStatePatch,
      browserParityArgs: args,
    };
  });
}

function withTemporaryStateOverride(entry, stateOverride = {}) {
  if (!stateOverride || Object.keys(stateOverride).length === 0) return entry;
  return {
    ...entry,
    statePatch: {
      ...entry.statePatch,
      ...stateOverride,
    },
  };
}

function parityArgs(entry, patchJson, options = {}) {
  const args = [
    `--duration-ms=${entry.durationMs}`,
    `--settle-ms=${entry.settleMs}`,
    `--rms-tolerance=${entry.thresholds.rmsTolerance}`,
    `--peak-tolerance=${entry.thresholds.peakTolerance}`,
    `--min-signal-rms=${entry.thresholds.minSignalRms}`,
    `--state-patch=${patchJson}`,
  ];
  if (options.trackId) args.push(`--track=${options.trackId}`);
  for (const note of entry.manualNotes) {
    args.push(`--manual-note=${note.source}:${note.midi}:${note.velocity ?? 0.82}:${note.durationMs ?? 900}`);
  }
  if (entry.manualNotes.length > 0) {
    args.push('--manual-no-warmup');
  }
  if (entry.transientGate) {
    args.push('--transient-gate');
    args.push(`--transient-time-tolerance-ms=${entry.transientGate.timeToleranceMs}`);
    args.push(`--transient-peak-ratio-tolerance=${entry.transientGate.peakRatioTolerance}`);
    args.push(`--transient-rms-ratio-tolerance=${entry.transientGate.rmsRatioTolerance}`);
  }
  if (entry.envelopeGate) {
    args.push('--envelope-gate');
    args.push(`--envelope-window-ms=${entry.envelopeGate.windowMs}`);
    args.push(`--envelope-time-tolerance-ms=${entry.envelopeGate.timeToleranceMs}`);
    args.push(`--envelope-rms-ratio-tolerance=${entry.envelopeGate.rmsRatioTolerance}`);
    args.push(`--envelope-peak-ratio-tolerance=${entry.envelopeGate.peakRatioTolerance}`);
  }
  if (options.noFail) args.push('--no-fail');
  if (options.printTransients) args.push('--print-transients');
  return args;
}

function commandForCase(entry, url, noFail = false, trackId = '', stateOverride = {}, printTransients = false) {
  const commandEntry = withTemporaryStateOverride(entry, stateOverride);
  const patchJson = JSON.stringify(stableSort(commandEntry.statePatch));
  const args = [
    parityScript,
    `--url=${url}`,
    ...parityArgs(commandEntry, patchJson, { noFail, trackId, printTransients }),
  ];
  return ['node', ...args.map(shellQuote)].join(' ');
}

function reportJson(selection = {}) {
  const cases = resolveCases(selection);
  const contract = {
    ...acceptanceContract,
    knownFailures: knownFailuresForCases(cases),
  };
  return {
    generatedAt: new Date().toISOString(),
    contract,
    reportPaths: {
      markdown: 'docs/reports/kessho-core-acceptance-corpus.md',
      json: 'docs/reports/kessho-core-acceptance-corpus.json',
    },
    caseCount: cases.length,
    coverageGroups: Array.from(new Set(cases.map((entry) => entry.group))),
    cases,
  };
}

function formatNotes(notes) {
  if (notes.length === 0) return 'self-running';
  return notes.map((note) => `${note.source}:${note.midi}:${note.velocity ?? 0.82}:${note.durationMs ?? 900}`).join(', ');
}

function formatThresholds(thresholds) {
  return `rms ${thresholds.rmsTolerance}, peak ${thresholds.peakTolerance}, min RMS ${thresholds.minSignalRms}`;
}

function reportMarkdown(selection = {}, existingReport = null) {
  const report = existingReport ?? reportJson(selection);
  const exampleCase = report.cases.find((entry) => entry.id === 'default-pad-dry') ?? report.cases[0];
  const lines = [
    '# KesshoCore Acceptance Corpus',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Scope: practical browser parity acceptance corpus for the core migration. This is intentionally representative, not exhaustive perfect-parity coverage.',
    '',
    '## How to Run',
    '',
    'With the app dev server running:',
    '',
    '1. Start the app dev server, for example `npm run dev -- --host 127.0.0.1 --port 4173`.',
    '2. Run the corpus wrapper against that server:',
    '',
    '```sh',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --run --url=http://127.0.0.1:4173/',
    '```',
    '',
    'For an exploratory run before enforcing thresholds, add `--no-fail`. To inspect the direct browser parity commands without running them:',
    '',
    '```sh',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --url=http://127.0.0.1:4173/',
    '```',
    '',
    'Staged slice examples:',
    '',
    '```sh',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --run --slice=pad-dry --url=http://127.0.0.1:4173/',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --run --slice=pad --url=http://127.0.0.1:4173/',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --run --case=pad-reverb-tail --track=reverb --no-fail --url=http://127.0.0.1:4173/',
    '```',
    '',
    'Focused probes for closing a single boundary can capture a specific recordable bus and apply a temporary state override without changing the corpus report or case hashes:',
    '',
    '```sh',
    'node scripts/profile-kessho-core-acceptance-corpus.mjs --commands --case=pad-reverb-tail --track=reverb --state-override=\'{"reverbLevel":0.45}\' --url=http://127.0.0.1:4173/',
    '```',
    '',
    'Known-failure allowance applies only to the default mix/default corpus state. A run with `--track` or `--state-override` is treated as a fresh probe, even when the selected case has a known-failure label.',
    '',
    'Example direct browser parity command:',
    '',
    '```sh',
    exampleCase ? commandForCase(exampleCase, DEFAULT_URL, false) : '',
    '```',
    '',
    'Corpus manual-note commands pass `--manual-no-warmup` so long-release sources are not contaminated by a hidden pre-capture note.',
    '',
    '## Staged Definition',
    '',
  ];

  for (const [id, stage] of Object.entries(report.contract.stagedParity)) {
    lines.push(
      `### ${stage.label ?? id}`,
      '',
      `Target: ${stage.target}`,
      '',
      `Required cases: ${stage.requiredCases.join(', ')}`,
      '',
      `Pass definition: ${stage.passDefinition}`,
      '',
    );
    if (stage.boundaryCases?.length) {
      lines.push(
        `Boundary cases: ${stage.boundaryCases.join(', ')}`,
        '',
        `Boundary definition: ${stage.boundaryDefinition}`,
        '',
      );
    }
  }

  lines.push(
    '## Scoring',
    '',
    '- Pass: every required pass case exits 0 from `scripts/check-web-core-sonic-parity.mjs`, meets the case RMS/peak/min-signal thresholds, and has no page errors or unexpected silent captures.',
    '- Review: best-lag magnitude above 50 ms, deterministic-case correlation below 0.85, or stochastic earth/granular metrics that do not repeat within the same broad band.',
    '- Known sonic failure: a checkable case that currently fails thresholds for a known audio boundary in the default mix/default corpus state. It is still run by slice commands, and setup/capture failures are never masked.',
    '- Block: silent reference source, non-finite samples, browser harness/core-host errors, or a deterministic expected-pass case above threshold.',
    '',
    'Threshold classes:',
    '',
  );

  for (const [className, description] of Object.entries(report.contract.thresholdClasses)) {
    lines.push(`- ${className}: ${description}`);
  }

  if (report.contract.knownFailures?.length) {
    lines.push(
      '',
      'Current known failures:',
      '',
    );
    for (const failure of report.contract.knownFailures) {
      lines.push(`- ${failure.caseId}: ${failure.status} (${failure.kind}). ${failure.note}`);
    }
  }

  lines.push(
    '',
    '## Coverage',
    '',
    '| Case | Group | Class | Expected | Source | Trigger | Duration | Thresholds |',
    '| --- | --- | --- | --- | --- | --- | ---: | --- |',
  );

  for (const entry of report.cases) {
    lines.push(`| ${entry.id} | ${entry.group} | ${entry.thresholdClass} | ${entry.expectedOutcome} | ${entry.source} | ${formatNotes(entry.manualNotes)} | ${entry.durationMs} ms | ${formatThresholds(entry.thresholds)} |`);
  }

  lines.push('', '## Case Notes', '');
  for (const entry of report.cases) {
    lines.push(
      `### ${entry.id}`,
      '',
      `Title: ${entry.title}`,
      '',
      `Intent: ${entry.intent}`,
      '',
      `Ready when: ${entry.readyWhen.join('; ')}`,
      '',
      `Threshold class: ${entry.thresholdClass}`,
      '',
      `Expected outcome: ${entry.expectedOutcome}`,
      '',
      `State patch keys: ${entry.statePatchKeyCount}`,
      '',
      `State patch SHA-256: \`${entry.statePatchSha256}\``,
      '',
    );
  }

  lines.push(
    '## Notes',
    '',
    '- The JSON report includes fully resolved `statePatch` objects. For JSON state sources, the source preset state is merged first and the case patch is applied last.',
    '- Lead, drum, earth, granular, and full-mix cases are acceptance targets for the ready harness. They may fail against today\'s partial core host if the corresponding source or routing path is not exposed yet.',
    '- Keep this corpus at 10 to 20 cases. Add a new case only when it covers a materially different source, route, or failure mode.',
    '',
    '## Known Exclusions And Debt',
    '',
  );

  for (const item of report.contract.knownExclusionsDebt) {
    lines.push(`- ${item}`);
  }

  lines.push('');

  return `${lines.join('\n')}\n`;
}

function printList(selection = {}) {
  const cases = resolveCases(selection);
  for (const entry of cases) {
    console.log(`${entry.id}\t${entry.group}\t${entry.expectedOutcome}\t${entry.title}`);
  }
}

function printSlices() {
  const rows = [
    ['pad', 'Pad slice including dry pads and shared reverb tail', sliceCaseIds('pad')],
    ['pad-dry', 'Pad expected-pass gates', sliceCaseIds('pad-dry')],
    ['pad-boundary', 'Closed pad boundary cases', sliceCaseIds('pad-boundary')],
    ['fx', acceptanceContract.stagedParity.fxSlice.label, sliceCaseIds('fx')],
    ['source', acceptanceContract.stagedParity.sourceSlice.label, sliceCaseIds('source')],
    ['full-mix', acceptanceContract.stagedParity.fullMixSlice.label, sliceCaseIds('full-mix')],
  ];
  for (const [id, label, ids] of rows) {
    console.log(`${id}\t${label}\t${ids.join(', ')}`);
  }
}

function printCommands(selection, url, noFail, trackId, stateOverride, printTransients = false) {
  for (const entry of resolveCases(selection)) {
    console.log(commandForCase(entry, url, noFail, trackId, stateOverride, printTransients));
  }
}

function classifyRunResult(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const resultMatch = output.match(/Result: FAIL \((setup|sonic(?:\/[a-z-]+)?)\)/) ??
    output.match(/Sonic parity (sonic\/[a-z-]+) failure/i);
  if (resultMatch) {
    const kind = resultMatch[1];
    return {
      status: 'fail',
      kind,
      suppressed: result.status === 0,
      exitCode: kind === 'setup' ? 2 : 1,
    };
  }
  if (result.status === 0) return { status: 'pass', kind: 'pass', suppressed: false, exitCode: 0 };
  if (result.status === 2) return { status: 'fail', kind: 'setup', suppressed: false, exitCode: 2 };
  if (result.status === 1) return { status: 'fail', kind: 'sonic', suppressed: false, exitCode: 1 };
  return { status: 'fail', kind: 'setup', suppressed: false, exitCode: result.status ?? 2 };
}

function isDefaultKnownFailureContext(trackId, hasStateOverride) {
  return !hasStateOverride && (!trackId || trackId === 'mix');
}

function runCases(selection, url, noFail, allowKnownFailures, trackId, stateOverride = {}, hasStateOverride = false, printTransients = false) {
  const cases = resolveCases(selection);
  const summary = [];
  let exitCode = 0;
  for (const entry of cases) {
    const runEntry = withTemporaryStateOverride(entry, stateOverride);
    console.log(`\n== ${entry.id}: ${entry.title} ==`);
    if (trackId) console.log(`Temporary track override: ${trackId}`);
    if (hasStateOverride) console.log(`Temporary state override keys: ${Object.keys(stateOverride).sort().join(', ')}`);
    const patchJson = JSON.stringify(stableSort(runEntry.statePatch));
    const args = [
      parityScript,
      `--url=${url}`,
      ...parityArgs(runEntry, patchJson, { noFail, trackId, printTransients }),
    ];
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    const classified = classifyRunResult(result);
    const expectedKnownFailure = entry.expectedOutcome === 'known-sonic-fail';
    const defaultKnownFailureContext = isDefaultKnownFailureContext(trackId, hasStateOverride);
    const allowedKnownFailure = allowKnownFailures &&
      expectedKnownFailure &&
      defaultKnownFailureContext &&
      classified.status === 'fail' &&
      classified.kind === 'sonic';
    const suppressedByNoFail = classified.status === 'fail' && classified.kind === 'sonic' && classified.suppressed;
    summary.push({
      id: entry.id,
      expectedOutcome: entry.expectedOutcome,
      status: classified.status,
      kind: classified.kind,
      suppressed: classified.suppressed,
      allowedKnownFailure,
      defaultKnownFailureContext,
    });

    if (classified.status === 'fail' && !allowedKnownFailure && !suppressedByNoFail && exitCode === 0) {
      exitCode = classified.exitCode || (classified.kind === 'setup' ? 2 : 1);
    }
  }

  console.log('\nAcceptance corpus run summary');
  for (const item of summary) {
    const suffix = item.allowedKnownFailure
      ? ' (allowed known sonic failure)'
      : item.expectedOutcome === 'known-sonic-fail' && !item.defaultKnownFailureContext
        ? ' (known-failure label not applied to temporary probe)'
      : item.suppressed
        ? ' (not enforced by --no-fail)'
        : '';
    console.log(`  ${item.id}: ${item.status}${item.status === 'fail' ? `/${item.kind}` : ''} expected=${item.expectedOutcome}${suffix}`);
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

function writeReports() {
  mkdirSync(reportDir, { recursive: true });
  const report = reportJson();
  writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownReportPath, reportMarkdown({}, report));
  console.log(`Wrote ${markdownReportPath}`);
  console.log(`Wrote ${jsonReportPath}`);
}

function runSelfCheck() {
  let assertions = 0;
  const assert = (condition, message) => {
    assertions += 1;
    if (!condition) throw new Error(`Self-check failed: ${message}`);
  };
  const assertThrows = (fn, message) => {
    assertions += 1;
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`Self-check failed: ${message}`);
  };

  validateKnownFailureCatalog();

  const padSlice = resolveCases({ sliceId: 'pad' });
  assert(padSlice.map((entry) => entry.id).join(',') === 'default-pad-dry,default-pad2-dry,pad-simple-dry,pad-reverb-tail', 'pad slice order and membership stay staged');

  const dryReport = reportJson({ caseId: 'default-pad-dry' });
  assert(dryReport.contract.knownFailures.length === 0, 'expected-pass case does not inherit known failures');

  const boundaryReport = reportJson({ caseId: 'pad-reverb-tail' });
  assert(boundaryReport.contract.knownFailures.length === 0, 'closed pad-reverb-tail case is no longer listed as a known failure');

  const [boundaryCase] = resolveCases({ caseId: 'pad-reverb-tail' });
  const originalHash = boundaryCase.statePatchSha256;
  const originalReverbLevel = boundaryCase.statePatch.reverbLevel;
  const probeCommand = commandForCase(
    boundaryCase,
    DEFAULT_URL,
    false,
    'reverb',
    { reverbLevel: 0.45, pad1ReverbSend: 0.4 },
  );
  assert(probeCommand.includes("'--track=reverb'"), 'focused probe forwards track override');
  assert(probeCommand.includes('"reverbLevel":0.45'), 'focused probe applies temporary reverbLevel override');
  assert(probeCommand.includes('"pad1ReverbSend":0.4'), 'focused probe applies temporary pad send override');
  assert(boundaryCase.statePatchSha256 === originalHash, 'temporary probe does not rewrite case hash');
  assert(boundaryCase.statePatch.reverbLevel === originalReverbLevel, 'temporary probe does not mutate resolved case state');

  const parsedOverride = parseArgs([
    '--commands',
    '--case=pad-reverb-tail',
    '--state-override={"reverbLevel":0.45}',
    '--state-patch={"pad1ReverbSend":0.4}',
  ]);
  assert(parsedOverride.hasStateOverride, 'temporary override flags mark override context');
  assert(parsedOverride.stateOverride.reverbLevel === 0.45 && parsedOverride.stateOverride.pad1ReverbSend === 0.4, 'temporary override aliases merge in flag order');

  const [delayCase] = resolveCases({ caseId: 'pad-delay-pingpong' });
  const delayCommand = commandForCase(delayCase, DEFAULT_URL);
  assert(delayCommand.includes("'--envelope-gate'"), 'Delay A feedback case forwards envelope gate');
  assert(delayCase.envelopeGate.rmsRatioTolerance === 0.45, 'Delay A feedback case keeps explicit envelope tolerance');

  const [simplePadCase] = resolveCases({ caseId: 'pad-simple-dry' });
  const simplePadCommand = commandForCase(simplePadCase, DEFAULT_URL);
  assert(simplePadCommand.includes("'--envelope-gate'"), 'simple pad case forwards envelope gate');
  assert(simplePadCase.thresholdClass === 'close', 'simple pad case is a close envelope sentinel while default pads stay exact');

  const [tightDrumCase] = resolveCases({ caseId: 'drum-euclid-tight' });
  assert(tightDrumCase.transientGate.timeToleranceMs === 24, 'tight drum transient timing allows one browser quantum of shared-start offset');
  const [dubDrumCase] = resolveCases({ caseId: 'drum-delay-dub' });
  assert(dubDrumCase.transientGate.timeToleranceMs === 48, 'dub drum transient timing allows feedback-smear threshold jitter');
  const [granularPadCase] = resolveCases({ caseId: 'granular-pad-cloud' });
  assert(granularPadCase.envelopeGate.peakRatioTolerance === 1.25, 'granular pad cloud tolerates low-level peak-ratio spikes');

  assertThrows(
    () => parseArgs(['--markdown', '--case=pad-reverb-tail', '--state-override={"reverbLevel":0.45}']),
    'temporary overrides are rejected for report generation',
  );

  assert(isDefaultKnownFailureContext('', false), 'empty track default context allows known-failure label');
  assert(isDefaultKnownFailureContext('mix', false), 'explicit mix track allows known-failure label');
  assert(!isDefaultKnownFailureContext('reverb', false), 'focused track does not apply known-failure label');
  assert(!isDefaultKnownFailureContext('', true), 'state override does not apply known-failure label');

  const setupFailure = classifyRunResult({ status: 2, stdout: '', stderr: '' });
  assert(setupFailure.kind === 'setup' && setupFailure.exitCode === 2, 'setup exit code classification is preserved');
  const sonicFailure = classifyRunResult({ status: 1, stdout: '  Result: FAIL (sonic)', stderr: '' });
  assert(sonicFailure.kind === 'sonic' && sonicFailure.exitCode === 1, 'sonic exit code classification is preserved');
  const suppressedFailure = classifyRunResult({ status: 0, stdout: '  Result: FAIL (sonic) [not enforced due to --no-fail]', stderr: '' });
  assert(suppressedFailure.kind === 'sonic' && suppressedFailure.suppressed, 'suppressed sonic failure remains distinguishable');
  const coreOutputFailure = classifyRunResult({ status: 1, stdout: '', stderr: 'Sonic parity sonic/core-output failure: core-wasm capture has non-finite core output' });
  assert(coreOutputFailure.kind === 'sonic/core-output' && coreOutputFailure.exitCode === 1, 'core output failures keep their sonic subkind');

  console.log(`Acceptance corpus self-check passed (${assertions} assertions).`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const selection = { caseId: args.caseId, sliceId: args.sliceId };
  if (args.help) {
    printHelp();
    return;
  }
  if (args.write) writeReports();
  if (args.selfCheck) runSelfCheck();
  if (args.list) printList(selection);
  if (args.listSlices) printSlices();
  if (args.json) console.log(JSON.stringify(reportJson(selection), null, 2));
  if (args.markdown) process.stdout.write(reportMarkdown(selection));
  if (args.commands) printCommands(selection, args.url, args.noFail, args.trackId, args.stateOverride, args.printTransients);
  if (args.run) runCases(selection, args.url, args.noFail, args.allowKnownFailures, args.trackId, args.stateOverride, args.hasStateOverride, args.printTransients);
}

main();
