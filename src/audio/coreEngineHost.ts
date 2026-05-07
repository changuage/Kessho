import type {
  EngineState,
  FxOwnershipDebugState,
  ManualSynthNoteOptions,
  RecordableTrackSource,
} from './engine';
import {
  createKesshoEngineSnapshot,
  toKesshoCorePresetPreviewScalarsV1,
} from './coreSnapshot';
import { delayNoteToSeconds } from './delayBuses';
import { resolveDynamicsTargets } from './dynamicsModel';
import { toDynamicsCharacterParamArray } from './dynamicsCharacterParams';
import { toKesshoCoreMidiEventPayload } from './coreMidiEvents';
import {
  applyDistanceValue,
  applyLeadDistanceEnvelope,
  applyPadDistanceToState,
  getVoiceDistanceValue,
} from './distanceMacro';
import {
  DEFAULT_GAMELAN,
  DEFAULT_SOFT_RHODES,
  morphPresets,
  type Lead4opFMMorphedParams,
  type Lead4opFMPreset,
} from './lead4opfm';
import { resolveDrumEuclidPatternParams, seqEuclidean } from './drumSequencer';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims';
import { computeGranularMacroModel } from './granularMacroModel';
import { getPadPreset, morphPadPresets, PAD1_TO_PAD2_KEY } from './padPresets';
import { createHarmonyState, type HarmonyParams } from './harmony';
import { createRng, getUtcBucket } from './rng';
import { midiToFreq } from './scales';
import { getEffectiveSequencerBpm, getPhraseDurationForClockSource } from './transport';
import { morphWaterPresets, type WaterPresetState } from './waterPresets';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { DEFAULT_REVERB_PRE_COMP, type SliderState } from '../ui/state';

const DYNAMICS_CHARACTER_DISABLED_CONFIG_KEY = 'dynamics-character:disabled-v1';

type PerfMetrics = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  scope?: 'worklet' | 'source';
};

type CoreWorkletPerfMessage = {
  type: 'perf';
  name: string;
  cpuPercent: number;
  peakPercent?: number;
  missPercent?: number;
  activeModules?: number;
  eventQueueDepth?: number;
  midiQueueDepth?: number;
};

type CoreWorkletMessage = Partial<Omit<CoreWorkletPerfMessage, 'type'>> & {
  type?: string;
  message?: string;
};

type PreviewNote = {
  frequency: number;
  velocity: number;
  route: number;
  delaySeconds: number;
  holdSeconds?: number;
};

type PreviewSourceConfig = {
  enabled: boolean;
  source: 'pad' | 'lead-fm' | 'drum' | 'soundscapes';
  params: number[];
  pad1PostLpfHz: number;
  pad1StereoWidth: number;
  pad2PostLpfHz: number;
  pad2StereoWidth: number;
  dryGain?: number;
  reverbSendGain?: number;
  delayASendGain?: number;
  delayBSendGain?: number;
  granularSendGain?: number;
  leadIndex?: number;
  notes: PreviewNote[];
  chords: PreviewNote[][];
  chordSeconds: number;
  noteKey: string;
  configKey: string;
  triggerInitial?: boolean;
  initialChordLeadSeconds?: number;
};

type CoreAuxSourceSlot = 'lead' | 'drum' | 'soundscapes';

type PreviewSourceGroup = {
  primary: PreviewSourceConfig | null;
  aux: Array<{
    slot: CoreAuxSourceSlot;
    config: PreviewSourceConfig | null;
  }>;
};

type ReverbModuleConfig = {
  enabled: boolean;
  params: number[];
  pad1SendGain: number;
  pad2SendGain: number;
  preCompThresholdDb: number;
  preCompKneeDb: number;
  preCompRatio: number;
  preCompAttackMs: number;
  preCompReleaseMs: number;
  inputMakeupGain: number;
  returnGain: number;
  configKey: string;
};

type DelayAModuleConfig = {
  enabled: boolean;
  params: number[];
  pad1SendGain: number;
  pad2SendGain: number;
  lead1SendGain: number;
  lead2SendGain: number;
  drumSendGain: number;
  soundscapeSendGain: number;
  configKey: string;
};

type DelayBModuleConfig = {
  enabled: boolean;
  params: number[];
  pad1SendGain: number;
  pad2SendGain: number;
  lead1SendGain: number;
  lead2SendGain: number;
  drumSendGain: number;
  soundscapeSendGain: number;
  granularInputGain: number;
  configKey: string;
};

type GranularModuleConfig = {
  enabled: boolean;
  params: number[];
  pad1SendGain: number;
  pad2SendGain: number;
  lead1SendGain: number;
  lead2SendGain: number;
  drumSendGain: number;
  soundscapeSendGain: number;
  delayASendGain: number;
  outputGain: number;
  reverbSendGain: number;
  delayAOutputSendGain: number;
  outputLpfHz: number;
  configKey: string;
};

type SpectralFreezeModuleConfig = {
  enabled: boolean;
  params: number[];
  routing: 'pre' | 'post';
  reverbCrossfade: number;
  configKey: string;
};

export type CoreEngineHostUpdateOptions = {
  presetId?: string;
  presetName?: string;
  seed?: number;
};

const coreWorkletUrl = new URL(
  `${import.meta.env.BASE_URL}worklets/kessho-core.worklet.js`,
  window.location.href,
).toString();

const coreWasmUrl = new URL(
  `${import.meta.env.BASE_URL}worklets/kessho_core.wasm`,
  window.location.href,
).toString();

async function fetchCoreWasmBinary(): Promise<ArrayBuffer> {
  const response = await fetch(coreWasmUrl);
  if (!response.ok) {
    throw new Error(`KesshoCore WASM fetch failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteNumber(value, fallback), min, max);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function paramConfigKey(params: readonly number[]): string {
  return params.map((value) => (Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0)).join(',');
}

function emptyFxOwners(): FxOwnershipDebugState {
  return {
    delayA: { owner: null, strength: 0, lastOrigin: null, active: false },
    delayB: { owner: null, strength: 0, lastOrigin: null, active: false },
    granular: { owner: null, strength: 0, lastOrigin: null, active: false },
    reverb: { owner: null, strength: 0, lastOrigin: null, active: false },
  };
}

function getEffectivePadState(sliderState: SliderState): SliderState {
  return applyPadDistanceToState(
    applyPadDistanceToState(sliderState, 'pad1'),
    'pad2',
  );
}

function createPadPostChainConfig(sliderState: SliderState): Pick<
  PreviewSourceConfig,
  | 'pad1PostLpfHz'
  | 'pad1StereoWidth'
  | 'pad2PostLpfHz'
  | 'pad2StereoWidth'
> {
  const state = sliderState as unknown as Record<string, unknown>;
  return {
    pad1PostLpfHz: boundedNumber(state.padPostLPF, 18000, 20, 20000),
    pad1StereoWidth: boundedNumber(state.padStereoWidth, 1, 0, 1),
    pad2PostLpfHz: boundedNumber(state.pad2PostLPF, 18000, 20, 20000),
    pad2StereoWidth: boundedNumber(state.pad2StereoWidth, 1, 0, 1),
  };
}

const PAD_MODULE_PARAM_COUNT = 108;
const PAD_PARAMS_PER_PAD = 53;
const PAD_VOICE_COUNT = 6;
const PAD_PREVIEW_FALLBACK_PRESET = 'saturated_drift';
const REVERB_MODULE_PARAM_COUNT = 30;
const DELAY_A_MODULE_PARAM_COUNT = 16;
const DELAY_B_MODULE_PARAM_COUNT = 16;
const GRANULAR_MODULE_PARAM_COUNT = 143;
const SPECTRAL_FREEZE_MODULE_PARAM_COUNT = 6;
const LEAD_FM_MODULE_PARAM_COUNT = 80;
const DRUM_MODULE_PARAM_COUNT = 126;
const CORE_DRUM_DRY_TRIM = 1.0;
const CORE_DRUM_INITIAL_CHORD_LEAD_SECONDS = 640 / 48000;
const SOUNDSCAPES_MODULE_PARAM_COUNT = 96;
const GRANULAR_VOICE_COUNT = 4;
const GRANULAR_VOICE_PARAM_COUNT = 25;
const GRANULAR_VOICE_PARAM_START = 10;
const GRANULAR_SCALE_COUNT_INDEX = GRANULAR_VOICE_PARAM_START + GRANULAR_VOICE_COUNT * GRANULAR_VOICE_PARAM_COUNT;
const GRANULAR_SCALE_INTERVALS_INDEX = GRANULAR_SCALE_COUNT_INDEX + 1;
const GRANULAR_CHORD_COUNT_INDEX = GRANULAR_SCALE_INTERVALS_INDEX + 12;
const GRANULAR_CHORD_PITCHES_INDEX = GRANULAR_CHORD_COUNT_INDEX + 1;
const GRANULAR_CHORD_BIAS_INDEX = GRANULAR_CHORD_PITCHES_INDEX + 12;
const GRANULAR_LEGACY_INDEX = GRANULAR_CHORD_BIAS_INDEX + 1;
const GRANULAR_MODE_VALUES: Record<string, number> = { clean: 0, granular: 1, legacy: 2 };
const GRANULAR_SHAPE_VALUES: Record<string, number> = { triangle: 0, sawUp: 1, sawDown: 2, square: 3 };
const GRANULAR_LEGACY_PITCH_VALUES: Record<string, number> = { random: 0, harmonic: 1 };
const DELAY_B_SPACE_MODE_VALUES: Record<string, number> = { clocked: 0, diffuse: 1 };
const DELAY_B_PATTERN_VALUES: Record<string, number> = { cascade: 0, golden: 1, mirror: 2, dotted: 3 };
const DELAY_B_WARP_VALUES: Record<string, number> = { clean: 0, filterSweep: 1, pitchDrift: 2, grainCrossfade: 3 };
const DRUM_VOICE_TYPES = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'] as const;
type CoreDrumVoice = typeof DRUM_VOICE_TYPES[number];
const DRUM_VOICE_INDEX: Record<CoreDrumVoice, number> = {
  sub: 0,
  kick: 1,
  click: 2,
  beepHi: 3,
  beepLo: 4,
  noise: 5,
  membrane: 6,
};

const DRUM_PARAM_INDEX = {
  sub: 0,
  kick: 12,
  click: 25,
  beepHi: 40,
  beepLo: 59,
  noise: 78,
  membrane: 92,
  delay: 104,
  delaySends: 110,
  trigger: 117,
  masterLevel: 122,
  reverbSend: 123,
  seed: 124,
  outputSelect: 125,
} as const;

const SOUNDSCAPES_PARAM_INDEX = {
  waterActive: 0,
  waterPreset: 1,
  waterParams: 2,
  waterLayerDetail: 16,
  waterLayerMix: 23,
  waterLayerDensity: 29,
  waterDensityLoop: 35,
  waterSurf: 42,
  waterChannels: 58,
  waterSeed: 60,
  insectsActive: 61,
  insectsEngine: 62,
  insectsParams: 63,
  insectsSeed: 77,
  insects2Active: 78,
  insects2Engine: 79,
  insects2Params: 80,
  insects2Seed: 94,
  outputSelect: 95,
} as const;

const LEAD_FM_PARAM_INDEX = {
  algorithm: 0,
  beatDetune: 1,
  carrier2Mix: 2,
  operatorStart: 3,
  operatorCount: 10,
  attack: 43,
  decay: 44,
  sustain: 45,
  release: 46,
  filterFreq: 47,
  filterQ: 48,
  filterType: 49,
  filterEnvAttack: 50,
  filterEnvDecay: 51,
  filterEnvSustain: 52,
  filterEnvRelease: 53,
  filterEnvDepth: 54,
  drive: 55,
  transientClick: 56,
  transientNoise: 57,
  transientDuration: 58,
  transientDecay: 59,
  transientFilter: 60,
  transientType: 61,
  gain: 62,
  xLevel: 63,
  xPan: 64,
  yLevel: 65,
  yPan: 66,
  lfoRate: 67,
  lfoDepth: 68,
  lfoTarget: 69,
  unisonVoices: 70,
  unisonDetune: 71,
  delayEnabled: 72,
  delayTimeL: 73,
  delayTimeR: 74,
  delayFeedback: 75,
  delayFilter: 76,
  delayMix: 77,
  delaySend: 78,
  outputSelect: 79,
} as const;

const LEAD_FM_OPERATOR_PARAM_INDEX = {
  ratio: 0,
  index: 1,
  decay: 2,
  sustain: 3,
  level: 4,
  feedback: 5,
  detune: 6,
  envRate: 7,
  modAttack: 8,
  modDelay: 9,
} as const;

const LEAD_FM_ALGORITHM_VALUES: Record<string, number> = {
  parallel: 0,
  stack: 1,
  split: 2,
  cross: 3,
  dx17: 4,
};

const LEAD_FM_FILTER_VALUES: Record<string, number> = {
  lowpass: 0,
  highpass: 1,
  bandpass: 2,
  notch: 3,
  peaking: 4,
};

const LEAD_FM_LFO_TARGET_VALUES: Record<string, number> = {
  all: 0,
  mod1: 1,
  mod2: 2,
  mod3: 3,
  mod4: 4,
  filter: 5,
  pitch: 6,
  detune: 7,
  none: 8,
};

const LEAD_FM_TRANSIENT_VALUES: Record<string, number> = {
  white: 0,
  pink: 1,
  brown: 2,
  filtered: 3,
};

const REVERB_TYPE_VALUES: Record<string, number> = {
  plate: 0,
  hall: 1,
  cathedral: 2,
  darkHall: 3,
  dattorroPlate: 4,
  dattorroShimmer: 5,
};

const REVERB_QUALITY_VALUES: Record<string, number> = {
  ultra: 0,
  balanced: 1,
  lite: 2,
};

const REVERB_MOD_CHARACTER_VALUES: Record<string, number> = {
  sine: 0,
  drift: 1,
  hybrid: 2,
};

const DELAY_A_FILTER_TYPE_VALUES: Record<string, number> = {
  lowpass: 0,
  highpass: 1,
  bandpass: 2,
};

const DRUM_CLICK_MODE_VALUES: Record<string, number> = {
  impulse: 0,
  noise: 1,
  tonal: 2,
  granular: 3,
  continuous: 4,
};

const DRUM_NOISE_FILTER_VALUES: Record<string, number> = {
  lowpass: 0,
  highpass: 1,
  bandpass: 2,
  notch: 3,
};

const DRUM_MEMBRANE_MATERIAL_VALUES: Record<string, number> = {
  skin: 0,
  metal: 1,
  wood: 2,
  glass: 3,
  plastic: 4,
};

const DRUM_PARAM_SPECS = [
  ['drumSubFreq', DRUM_PARAM_INDEX.sub + 0, null, 60],
  ['drumSubDecay', DRUM_PARAM_INDEX.sub + 1, null, 200],
  ['drumSubLevel', DRUM_PARAM_INDEX.sub + 2, null, 0.8],
  ['drumSubTone', DRUM_PARAM_INDEX.sub + 3, null, 0],
  ['drumSubShape', DRUM_PARAM_INDEX.sub + 4, null, 0],
  ['drumSubPitchEnv', DRUM_PARAM_INDEX.sub + 5, null, 0],
  ['drumSubPitchDecay', DRUM_PARAM_INDEX.sub + 6, null, 50],
  ['drumSubDrive', DRUM_PARAM_INDEX.sub + 7, null, 0],
  ['drumSubSub', DRUM_PARAM_INDEX.sub + 8, null, 0],
  ['drumSubAttack', DRUM_PARAM_INDEX.sub + 9, null, 0],
  ['drumSubVariation', DRUM_PARAM_INDEX.sub + 10, null, 0],
  ['drumSubDistance', DRUM_PARAM_INDEX.sub + 11, null, 0.5],
  ['drumKickFreq', DRUM_PARAM_INDEX.kick + 0, null, 55],
  ['drumKickPitchEnv', DRUM_PARAM_INDEX.kick + 1, null, 24],
  ['drumKickPitchDecay', DRUM_PARAM_INDEX.kick + 2, null, 60],
  ['drumKickDecay', DRUM_PARAM_INDEX.kick + 3, null, 300],
  ['drumKickLevel', DRUM_PARAM_INDEX.kick + 4, null, 0.8],
  ['drumKickClick', DRUM_PARAM_INDEX.kick + 5, null, 0.3],
  ['drumKickBody', DRUM_PARAM_INDEX.kick + 6, null, 0.5],
  ['drumKickPunch', DRUM_PARAM_INDEX.kick + 7, null, 0.5],
  ['drumKickTail', DRUM_PARAM_INDEX.kick + 8, null, 0],
  ['drumKickTone', DRUM_PARAM_INDEX.kick + 9, null, 0],
  ['drumKickAttack', DRUM_PARAM_INDEX.kick + 10, null, 0],
  ['drumKickVariation', DRUM_PARAM_INDEX.kick + 11, null, 0],
  ['drumKickDistance', DRUM_PARAM_INDEX.kick + 12, null, 0.5],
  ['drumClickDecay', DRUM_PARAM_INDEX.click + 0, null, 30],
  ['drumClickFilter', DRUM_PARAM_INDEX.click + 1, null, 4000],
  ['drumClickTone', DRUM_PARAM_INDEX.click + 2, null, 0.5],
  ['drumClickLevel', DRUM_PARAM_INDEX.click + 3, null, 0.7],
  ['drumClickResonance', DRUM_PARAM_INDEX.click + 4, null, 0.5],
  ['drumClickPitch', DRUM_PARAM_INDEX.click + 5, null, 2000],
  ['drumClickPitchEnv', DRUM_PARAM_INDEX.click + 6, null, 0],
  ['drumClickMode', DRUM_PARAM_INDEX.click + 7, DRUM_CLICK_MODE_VALUES, 0],
  ['drumClickGrainCount', DRUM_PARAM_INDEX.click + 8, null, 1],
  ['drumClickGrainSpread', DRUM_PARAM_INDEX.click + 9, null, 0],
  ['drumClickStereoWidth', DRUM_PARAM_INDEX.click + 10, null, 0],
  ['drumClickExciterColor', DRUM_PARAM_INDEX.click + 11, null, 0],
  ['drumClickAttack', DRUM_PARAM_INDEX.click + 12, null, 0],
  ['drumClickVariation', DRUM_PARAM_INDEX.click + 13, null, 0],
  ['drumClickDistance', DRUM_PARAM_INDEX.click + 14, null, 0.5],
  ['drumBeepHiFreq', DRUM_PARAM_INDEX.beepHi + 0, null, 4000],
  ['drumBeepHiAttack', DRUM_PARAM_INDEX.beepHi + 1, null, 1],
  ['drumBeepHiDecay', DRUM_PARAM_INDEX.beepHi + 2, null, 100],
  ['drumBeepHiLevel', DRUM_PARAM_INDEX.beepHi + 3, null, 0.6],
  ['drumBeepHiTone', DRUM_PARAM_INDEX.beepHi + 4, null, 0.3],
  ['drumBeepHiInharmonic', DRUM_PARAM_INDEX.beepHi + 5, null, 0],
  ['drumBeepHiPartials', DRUM_PARAM_INDEX.beepHi + 6, null, 1],
  ['drumBeepHiShimmer', DRUM_PARAM_INDEX.beepHi + 7, null, 0],
  ['drumBeepHiShimmerRate', DRUM_PARAM_INDEX.beepHi + 8, null, 4],
  ['drumBeepHiBrightness', DRUM_PARAM_INDEX.beepHi + 9, null, 0.5],
  ['drumBeepHiFeedback', DRUM_PARAM_INDEX.beepHi + 10, null, 0],
  ['drumBeepHiModEnvDecay', DRUM_PARAM_INDEX.beepHi + 11, null, 0],
  ['drumBeepHiNoiseInMod', DRUM_PARAM_INDEX.beepHi + 12, null, 0],
  ['drumBeepHiModRatio', DRUM_PARAM_INDEX.beepHi + 13, null, 2],
  ['drumBeepHiModRatioFine', DRUM_PARAM_INDEX.beepHi + 14, null, 0.01],
  ['drumBeepHiModEnvEnd', DRUM_PARAM_INDEX.beepHi + 15, null, 0.2],
  ['drumBeepHiNoiseDecay', DRUM_PARAM_INDEX.beepHi + 16, null, 0],
  ['drumBeepHiVariation', DRUM_PARAM_INDEX.beepHi + 17, null, 0],
  ['drumBeepHiDistance', DRUM_PARAM_INDEX.beepHi + 18, null, 0.5],
  ['drumBeepLoFreq', DRUM_PARAM_INDEX.beepLo + 0, null, 200],
  ['drumBeepLoAttack', DRUM_PARAM_INDEX.beepLo + 1, null, 1],
  ['drumBeepLoDecay', DRUM_PARAM_INDEX.beepLo + 2, null, 200],
  ['drumBeepLoLevel', DRUM_PARAM_INDEX.beepLo + 3, null, 0.7],
  ['drumBeepLoTone', DRUM_PARAM_INDEX.beepLo + 4, null, 0],
  ['drumBeepLoPitchEnv', DRUM_PARAM_INDEX.beepLo + 5, null, 0],
  ['drumBeepLoPitchDecay', DRUM_PARAM_INDEX.beepLo + 6, null, 50],
  ['drumBeepLoBody', DRUM_PARAM_INDEX.beepLo + 7, null, 0.3],
  ['drumBeepLoPluck', DRUM_PARAM_INDEX.beepLo + 8, null, 0],
  ['drumBeepLoPluckDamp', DRUM_PARAM_INDEX.beepLo + 9, null, 0.5],
  ['drumBeepLoModal', DRUM_PARAM_INDEX.beepLo + 10, null, 0],
  ['drumBeepLoModalQ', DRUM_PARAM_INDEX.beepLo + 11, null, 10],
  ['drumBeepLoModalInharmonic', DRUM_PARAM_INDEX.beepLo + 12, null, 0],
  ['drumBeepLoModalSpread', DRUM_PARAM_INDEX.beepLo + 13, null, 0],
  ['drumBeepLoModalCut', DRUM_PARAM_INDEX.beepLo + 14, null, 0],
  ['drumBeepLoOscGain', DRUM_PARAM_INDEX.beepLo + 15, null, 1],
  ['drumBeepLoModalGain', DRUM_PARAM_INDEX.beepLo + 16, null, 1],
  ['drumBeepLoVariation', DRUM_PARAM_INDEX.beepLo + 17, null, 0],
  ['drumBeepLoDistance', DRUM_PARAM_INDEX.beepLo + 18, null, 0.5],
  ['drumNoiseFilterFreq', DRUM_PARAM_INDEX.noise + 0, null, 2000],
  ['drumNoiseDecay', DRUM_PARAM_INDEX.noise + 1, null, 100],
  ['drumNoiseLevel', DRUM_PARAM_INDEX.noise + 2, null, 0.6],
  ['drumNoiseFilterQ', DRUM_PARAM_INDEX.noise + 3, null, 1],
  ['drumNoiseFilterType', DRUM_PARAM_INDEX.noise + 4, DRUM_NOISE_FILTER_VALUES, 0],
  ['drumNoiseAttack', DRUM_PARAM_INDEX.noise + 5, null, 1],
  ['drumNoiseFormant', DRUM_PARAM_INDEX.noise + 6, null, 0],
  ['drumNoiseBreath', DRUM_PARAM_INDEX.noise + 7, null, 0],
  ['drumNoiseFilterEnv', DRUM_PARAM_INDEX.noise + 8, null, 0],
  ['drumNoiseFilterEnvDecay', DRUM_PARAM_INDEX.noise + 9, null, 100],
  ['drumNoiseDensity', DRUM_PARAM_INDEX.noise + 10, null, 1],
  ['drumNoiseColorLFO', DRUM_PARAM_INDEX.noise + 11, null, 0],
  ['drumNoiseVariation', DRUM_PARAM_INDEX.noise + 12, null, 0],
  ['drumNoiseDistance', DRUM_PARAM_INDEX.noise + 13, null, 0.5],
  ['drumMembraneSize', DRUM_PARAM_INDEX.membrane + 0, null, 150],
  ['drumMembraneDecay', DRUM_PARAM_INDEX.membrane + 1, null, 500],
  ['drumMembraneLevel', DRUM_PARAM_INDEX.membrane + 2, null, 0.7],
  ['drumMembraneStiffness', DRUM_PARAM_INDEX.membrane + 3, null, 0.5],
  ['drumMembraneMaterial', DRUM_PARAM_INDEX.membrane + 4, DRUM_MEMBRANE_MATERIAL_VALUES, 0],
  ['drumMembraneSize', DRUM_PARAM_INDEX.membrane + 5, null, 150],
  ['drumMembraneDamping', DRUM_PARAM_INDEX.membrane + 6, null, 0.3],
  ['drumMembraneExcPos', DRUM_PARAM_INDEX.membrane + 7, null, 0.5],
  ['drumMembraneWireMix', DRUM_PARAM_INDEX.membrane + 8, null, 0],
  ['drumMembraneAttack', DRUM_PARAM_INDEX.membrane + 9, null, 1],
  ['drumMembraneVariation', DRUM_PARAM_INDEX.membrane + 10, null, 0],
  ['drumMembraneDistance', DRUM_PARAM_INDEX.membrane + 11, null, 0.5],
] as const;

const PAD_PARAM_INDEX = {
  oscAWave: 0,
  oscAOctave: 1,
  oscADetune: 2,
  oscALevel: 3,
  oscBWave: 4,
  oscBOctave: 5,
  oscBDetune: 6,
  oscBLevel: 7,
  oscMix: 8,
  subEnabled: 9,
  subOctave: 10,
  subWave: 11,
  subLevel: 12,
  noiseType: 13,
  noiseLevel: 14,
  hardness: 15,
  warmth: 16,
  presence: 17,
  foldAmount: 18,
  foldMode: 19,
  filterType: 20,
  filterCutoffMin: 21,
  filterCutoffMax: 22,
  filterResonance: 23,
  filterQ: 24,
  filterSlope: 25,
  filterKeyTracking: 26,
  filterBEnabled: 27,
  filterBType: 28,
  filterBCutoff: 29,
  filterBResonance: 30,
  filterBQ: 31,
  filterRouting: 32,
  attack: 33,
  decay: 34,
  sustain: 35,
  release: 36,
  lfo1Rate: 37,
  lfo1Depth: 38,
  lfo1Wave: 39,
  lfo1Dest: 40,
  lfo2Rate: 41,
  lfo2Depth: 42,
  lfo2Wave: 43,
  lfo2Dest: 44,
  modEnvEnabled: 45,
  modEnvAttack: 46,
  modEnvDecay: 47,
  modEnvSustain: 48,
  modEnvRelease: 49,
  modEnvDepth: 50,
  modEnvDest: 51,
  level: 52,
} as const;

const PAD_WAVE_VALUES: Record<string, number> = { sine: 0, triangle: 1, sawtooth: 2, square: 3 };
const PAD_FILTER_VALUES: Record<string, number> = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3 };
const PAD_LFO_WAVE_VALUES: Record<string, number> = {
  sine: 0,
  triangle: 1,
  sawtooth: 2,
  square: 3,
  sampleHold: 4,
  randomSmooth: 5,
  randomWalk: 6,
};
const PAD_DEST_VALUES: Record<string, number> = {
  none: 0,
  filterCutoff: 1,
  filterB: 2,
  filterBCutoff: 2,
  amplitude: 3,
  pitch: 4,
  oscBLevel: 5,
  foldAmount: 6,
};
const PAD_ROUTE_VALUES: Record<string, number> = { series: 0, aOnly: 1, bOnly: 2 };
const PAD_NOISE_VALUES: Record<string, number> = { white: 0, pink: 1 };

const PAD_PARAM_SPECS = [
  ['padOscAWave', PAD_PARAM_INDEX.oscAWave, PAD_WAVE_VALUES, 2],
  ['padOscAOctave', PAD_PARAM_INDEX.oscAOctave, null, 0],
  ['padOscADetune', PAD_PARAM_INDEX.oscADetune, null, 0],
  ['padOscALevel', PAD_PARAM_INDEX.oscALevel, null, 0.6],
  ['padOscBWave', PAD_PARAM_INDEX.oscBWave, PAD_WAVE_VALUES, 1],
  ['padOscBOctave', PAD_PARAM_INDEX.oscBOctave, null, 0],
  ['padOscBDetune', PAD_PARAM_INDEX.oscBDetune, null, 8],
  ['padOscBLevel', PAD_PARAM_INDEX.oscBLevel, null, 0.4],
  ['padOscMix', PAD_PARAM_INDEX.oscMix, null, 0.5],
  ['padSubEnabled', PAD_PARAM_INDEX.subEnabled, null, 0],
  ['padSubOctave', PAD_PARAM_INDEX.subOctave, null, -1],
  ['padSubWave', PAD_PARAM_INDEX.subWave, PAD_WAVE_VALUES, 0],
  ['padSubLevel', PAD_PARAM_INDEX.subLevel, null, 0.3],
  ['padNoiseType', PAD_PARAM_INDEX.noiseType, PAD_NOISE_VALUES, 0],
  ['padNoiseLevel', PAD_PARAM_INDEX.noiseLevel, null, 0.16],
  ['hardness', PAD_PARAM_INDEX.hardness, null, 0.45],
  ['warmth', PAD_PARAM_INDEX.warmth, null, 0.4],
  ['presence', PAD_PARAM_INDEX.presence, null, 0.4],
  ['padFoldAmount', PAD_PARAM_INDEX.foldAmount, null, 0],
  ['padFoldMode', PAD_PARAM_INDEX.foldMode, null, 0],
  ['filterType', PAD_PARAM_INDEX.filterType, PAD_FILTER_VALUES, 0],
  ['filterCutoffMin', PAD_PARAM_INDEX.filterCutoffMin, null, 80],
  ['filterCutoffMax', PAD_PARAM_INDEX.filterCutoffMax, null, 1800],
  ['filterResonance', PAD_PARAM_INDEX.filterResonance, null, 0.2],
  ['filterQ', PAD_PARAM_INDEX.filterQ, null, 1],
  ['filterSlope', PAD_PARAM_INDEX.filterSlope, null, 12],
  ['filterKeyTracking', PAD_PARAM_INDEX.filterKeyTracking, null, 0],
  ['padFilterBEnabled', PAD_PARAM_INDEX.filterBEnabled, null, 0],
  ['padFilterBType', PAD_PARAM_INDEX.filterBType, PAD_FILTER_VALUES, 2],
  ['padFilterBCutoff', PAD_PARAM_INDEX.filterBCutoff, null, 200],
  ['padFilterBResonance', PAD_PARAM_INDEX.filterBResonance, null, 0.2],
  ['padFilterBQ', PAD_PARAM_INDEX.filterBQ, null, 1],
  ['padFilterRouting', PAD_PARAM_INDEX.filterRouting, PAD_ROUTE_VALUES, 0],
  ['synthAttack', PAD_PARAM_INDEX.attack, null, 4],
  ['synthDecay', PAD_PARAM_INDEX.decay, null, 1],
  ['synthSustain', PAD_PARAM_INDEX.sustain, null, 0.8],
  ['synthRelease', PAD_PARAM_INDEX.release, null, 10],
  ['padLfo1Rate', PAD_PARAM_INDEX.lfo1Rate, null, 0.09],
  ['padLfo1Depth', PAD_PARAM_INDEX.lfo1Depth, null, 0.6],
  ['padLfo1Wave', PAD_PARAM_INDEX.lfo1Wave, PAD_LFO_WAVE_VALUES, 6],
  ['padLfo1Dest', PAD_PARAM_INDEX.lfo1Dest, PAD_DEST_VALUES, 1],
  ['padLfo2Rate', PAD_PARAM_INDEX.lfo2Rate, null, 0.5],
  ['padLfo2Depth', PAD_PARAM_INDEX.lfo2Depth, null, 0],
  ['padLfo2Wave', PAD_PARAM_INDEX.lfo2Wave, PAD_LFO_WAVE_VALUES, 0],
  ['padLfo2Dest', PAD_PARAM_INDEX.lfo2Dest, PAD_DEST_VALUES, 0],
  ['padModEnvEnabled', PAD_PARAM_INDEX.modEnvEnabled, null, 0],
  ['padModEnvAttack', PAD_PARAM_INDEX.modEnvAttack, null, 0.5],
  ['padModEnvDecay', PAD_PARAM_INDEX.modEnvDecay, null, 2],
  ['padModEnvSustain', PAD_PARAM_INDEX.modEnvSustain, null, 0],
  ['padModEnvRelease', PAD_PARAM_INDEX.modEnvRelease, null, 4],
  ['padModEnvDepth', PAD_PARAM_INDEX.modEnvDepth, null, 0.5],
  ['padModEnvDest', PAD_PARAM_INDEX.modEnvDest, PAD_DEST_VALUES, 1],
] as const;

function booleanParam(value: unknown, fallback = 0): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  return finiteNumber(value, fallback);
}

function enumParam(value: unknown, map: Record<string, number> | null, fallback: number): number {
  if (typeof value === 'string' && map && value in map) return map[value] ?? fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return finiteNumber(value, fallback);
}

function padStateKey(baseKey: string, padIndex: number): string {
  return padIndex === 0 ? baseKey : PAD1_TO_PAD2_KEY[baseKey] ?? baseKey;
}

function morphedPadParams(sliderState: SliderState, padIndex: number): Record<string, number | string | boolean> {
  const state = sliderState as unknown as Record<string, unknown>;
  const scope = padIndex === 0 ? 'pad1' : 'pad2';
  const presetAKey = padIndex === 0 ? 'padPresetA' : 'pad2PresetA';
  const presetBKey = padIndex === 0 ? 'padPresetB' : 'pad2PresetB';
  const morphKey = padIndex === 0 ? 'padMorph' : 'pad2Morph';
  const presetA = getPadPreset(String(state[presetAKey] ?? PAD_PREVIEW_FALLBACK_PRESET), scope) ??
    getPadPreset(PAD_PREVIEW_FALLBACK_PRESET, scope);
  const presetB = getPadPreset(String(state[presetBKey] ?? state[presetAKey] ?? PAD_PREVIEW_FALLBACK_PRESET), scope) ??
    presetA;

  return presetA && presetB
    ? morphPadPresets(presetA, presetB, clamp(finiteNumber(state[morphKey], 0), 0, 1))
    : {};
}

function writePadParamsForPad(
  params: number[],
  sliderState: SliderState,
  padIndex: number,
  level: number,
): void {
  const state = sliderState as unknown as Record<string, unknown>;
  const morphed = morphedPadParams(sliderState, padIndex);
  const base = padIndex * PAD_PARAMS_PER_PAD;

  for (const [baseKey, index, enumMap, fallback] of PAD_PARAM_SPECS) {
    const stateKey = padStateKey(baseKey, padIndex);
    const raw = state[stateKey] ?? morphed[baseKey] ?? fallback;
    params[base + index] = enumParam(raw, enumMap, fallback);
  }

  params[base + PAD_PARAM_INDEX.subEnabled] = booleanParam(state[padStateKey('padSubEnabled', padIndex)] ?? morphed.padSubEnabled);
  params[base + PAD_PARAM_INDEX.filterBEnabled] = booleanParam(
    state[padStateKey('padFilterBEnabled', padIndex)] ?? morphed.padFilterBEnabled,
  );
  params[base + PAD_PARAM_INDEX.modEnvEnabled] = booleanParam(
    state[padStateKey('padModEnvEnabled', padIndex)] ?? morphed.padModEnvEnabled,
  );
  params[base + PAD_PARAM_INDEX.level] = clamp(level, 0, 1);
}

function getCorePreviewHarmonyParams(sliderState: SliderState): Partial<HarmonyParams> {
  return {
    cofDriftEnabled: sliderState.cofDriftEnabled ?? false,
    cofDriftRate: sliderState.cofDriftRate ?? 2,
    cofDriftDirection: sliderState.cofDriftDirection ?? 'cw',
    cofDriftRange: sliderState.cofDriftRange ?? 3,
    chordProgressionEnabled: sliderState.chordProgressionEnabled ?? false,
    chordProgressionPattern: sliderState.chordProgressionPattern ?? [0, 3, 4, 0],
    chordProgressionSteps: sliderState.chordProgressionSteps ?? 4,
    chordProgressionStepEnabled: sliderState.chordProgressionStepEnabled ?? [true, true, true, true],
    chordProgressionPhraseMultiplier: sliderState.chordProgressionPhraseMultiplier ?? 1,
  };
}

function createInitialPadPreviewFrequencies(sliderState: SliderState): number[] {
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const phraseSeconds = getPhraseDurationForClockSource(
    sliderState,
    sliderState.harmonyClockSource ?? 'globalPhrase',
  );
  const harmonyState = createHarmonyState(
    `${bucket}|E_ROOT`,
    boundedNumber(sliderState.tension, 0.3, 0, 1),
    boundedNumber(sliderState.chordRate, 32, 1, 128),
    boundedNumber(sliderState.voicingSpread, 0.5, 0, 1),
    boundedNumber(sliderState.detune, 8, 0, 50),
    sliderState.scaleMode === 'manual' ? 'manual' : 'auto',
    typeof sliderState.manualScale === 'string' ? sliderState.manualScale : 'Major (Ionian)',
    boundedInteger(sliderState.rootNote, 4, 0, 11),
    phraseSeconds,
    getCorePreviewHarmonyParams(sliderState),
  );
  const octaveMultiplier = 2 ** boundedInteger(sliderState.synthOctave, 0, -2, 2);
  return harmonyState.currentChord.frequencies.map((frequency) => frequency * octaveMultiplier);
}

function createPadPreviewVoiceDelays(sliderState: SliderState): number[] {
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const rng = createRng(`${bucket}|E_ROOT`);
  const waveSpreadSeconds =
    boundedNumber(sliderState.waveSpread, 0.125, 0, 1) *
    boundedNumber(sliderState.chordRate, 32, 1, 128);
  return Array.from({ length: 6 }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b);
}

function createPadPreviewChords(sliderState: SliderState, velocity: number): PreviewNote[][] {
  const state = sliderState as unknown as Record<string, unknown>;
  const fallbackRoot = boundedInteger(state.rootNote, 4, 0, 11);
  const fallbackRootMidi = 48 + fallbackRoot;
  const rawFrequencies = createInitialPadPreviewFrequencies(sliderState);
  const fallbackFrequencies = [0, 7, 10, 14, 17, 24].map((interval) => midiToFreq(fallbackRootMidi + interval));
  const frequencies = rawFrequencies.length > 0 ? rawFrequencies : fallbackFrequencies;
  const pad2Assign = booleanValue(state.pad2Enabled, false)
    ? boundedInteger(state.pad2VoiceAssign, 0, 0, 63)
    : 0;
  const voiceMask = Math.max(1, boundedInteger(state.synthVoiceMask, 63, 1, 63) & ~pad2Assign);
  const enabledFrequencies = frequencies
    .slice(0, 6)
    .filter((_, index) => (voiceMask & (1 << index)) !== 0);
  const frequencyPool = enabledFrequencies.length > 0 ? enabledFrequencies : [frequencies[0] ?? midiToFreq(fallbackRootMidi)];
  const delays = createPadPreviewVoiceDelays(sliderState);
  const notes: PreviewNote[] = [];

  for (let route = 0; route < 6; route += 1) {
    if ((voiceMask & (1 << route)) === 0) continue;
    let enabledIndex = 0;
    for (let index = 0; index < route; index += 1) {
      if ((voiceMask & (1 << index)) !== 0) enabledIndex += 1;
    }
    notes.push({
      frequency: frequencyPool[enabledIndex % frequencyPool.length] ?? frequencyPool[0] ?? midiToFreq(69),
      velocity: clamp(velocity, 0.05, 1),
      route,
      delaySeconds: delays[route] ?? 0,
    });
  }

  return [notes];
}

function createPadPreviewSource(sliderState: SliderState): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  if (state.synthChordSequencerEnabled === false) return null;

  const pad1Enabled = booleanValue(state.padEnabled, true);
  const pad2Enabled = booleanValue(state.pad2Enabled, false);
  const pad1Level = pad1Enabled
    ? finiteNumber(state.synthLevel, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const pad2Level = pad2Enabled
    ? finiteNumber(state.pad2Level, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const hasPadSource = pad1Enabled || pad2Enabled;

  if (!hasPadSource) return null;

  const params = Array.from({ length: PAD_MODULE_PARAM_COUNT }, () => 0);
  writePadParamsForPad(params, sliderState, 0, pad1Level);
  writePadParamsForPad(params, sliderState, 1, pad2Level);
  params[PAD_PARAMS_PER_PAD * 2] = boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.1, 0, 1);
  params[PAD_PARAMS_PER_PAD * 2 + 1] = 0;
  const postChain = createPadPostChainConfig(sliderState);

  const chords = createPadPreviewChords(sliderState, 1);
  const notes = chords[0] ?? [];
  const noteKey = chords
    .map((chord) => chord
      .map((note) => `${note.route}:${note.frequency.toFixed(3)}:${note.velocity.toFixed(3)}:${note.delaySeconds.toFixed(4)}`)
      .join('|'))
    .join('>');
  const postKey = Object.values(postChain)
    .map((value) => Math.round(value * 1000) / 1000)
    .join(',');
  const configKey = `${noteKey}:${params.map((value) => Math.round(value * 1000) / 1000).join(',')}:${postKey}`;

  return {
    enabled: true,
    source: 'pad',
    params,
    ...postChain,
    dryGain: 1,
    notes,
    chords,
    chordSeconds: 3.5,
    noteKey,
    configKey,
  };
}

function getManualPadVoicePool(source: 'pad1' | 'pad2', sliderState: SliderState): number[] {
  const state = sliderState as unknown as Record<string, unknown>;
  const voiceMask = Math.max(1, boundedInteger(state.synthVoiceMask, 63, 1, 63) & 63);
  const pad2Assign = boundedInteger(state.pad2VoiceAssign, 0, 0, 63) & 63;
  const enabledVoices = Array.from({ length: 6 }, (_, index) => index)
    .filter((index) => (voiceMask & (1 << index)) !== 0);
  const preferredVoices = enabledVoices.filter((index) => {
    const assignedToPad2 = (pad2Assign & (1 << index)) !== 0;
    return source === 'pad2' ? assignedToPad2 : !assignedToPad2;
  });
  return preferredVoices.length > 0 ? preferredVoices : enabledVoices.length > 0 ? enabledVoices : [0];
}

function pickManualPadVoice(source: 'pad1' | 'pad2', sliderState: SliderState, cursor = 0): number {
  const pool = getManualPadVoicePool(source, sliderState);
  const normalizedCursor = ((Math.trunc(cursor) % pool.length) + pool.length) % pool.length;
  return pool[normalizedCursor] ?? pool[0] ?? 0;
}

function createManualPadSourceConfig(
  sliderState: SliderState,
  source: 'pad1' | 'pad2',
  note: ManualSynthNoteOptions,
  voiceIndexOverride?: number,
): { config: PreviewSourceConfig; triggerNote: PreviewNote } {
  const effectiveState = getEffectivePadState(sliderState);
  const state = { ...(effectiveState as unknown as Record<string, unknown>) };
  const voiceIndex = typeof voiceIndexOverride === 'number' && Number.isInteger(voiceIndexOverride)
    ? clamp(voiceIndexOverride, 0, PAD_VOICE_COUNT - 1)
    : pickManualPadVoice(source, effectiveState);
  const voiceBit = 1 << voiceIndex;
  if (source === 'pad2') {
    state.pad2Enabled = true;
    state.pad2VoiceAssign = (boundedInteger(state.pad2VoiceAssign, 0, 0, 63) | voiceBit) & 63;
  } else {
    state.padEnabled = true;
    state.pad2VoiceAssign = boundedInteger(state.pad2VoiceAssign, 0, 0, 63) & ~voiceBit;
  }

  const routedState = state as unknown as SliderState;
  const pad1Enabled = booleanValue(state.padEnabled, true);
  const pad2Enabled = booleanValue(state.pad2Enabled, false);
  const pad1Level = pad1Enabled
    ? finiteNumber(state.synthLevel, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const pad2Level = pad2Enabled
    ? finiteNumber(state.pad2Level, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const params = Array.from({ length: PAD_MODULE_PARAM_COUNT }, () => 0);
  writePadParamsForPad(params, routedState, 0, pad1Level);
  writePadParamsForPad(params, routedState, 1, pad2Level);
  params[PAD_PARAMS_PER_PAD * 2] = boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.1, 0, 1);
  params[PAD_PARAMS_PER_PAD * 2 + 1] = 0;
  const postChain = createPadPostChainConfig(routedState);

  const safeMidi = boundedInteger(note.midi, 60, 24, 108);
  const triggerNote = {
    frequency: midiToFreq(safeMidi),
    velocity: clamp(finiteNumber(note.velocity, 0.82), 0.05, 1),
    route: source === 'pad2' ? voiceIndex + PAD_VOICE_COUNT : voiceIndex,
    delaySeconds: 0,
    holdSeconds: note.durationMs === undefined ? 0 : Math.max(80, note.durationMs) / 1000,
  };
  const noteKey = `manual:${source}:${voiceIndex}`;
  const postKey = Object.values(postChain)
    .map((value) => Math.round(value * 1000) / 1000)
    .join(',');
  const configKey = `${noteKey}:${params.map((value) => Math.round(value * 1000) / 1000).join(',')}:${postKey}`;

  return {
    config: {
      enabled: true,
      source: 'pad',
      params,
      ...postChain,
      dryGain: 1,
      notes: [],
      chords: [[]],
      chordSeconds: 3600,
      noteKey,
      configKey,
      triggerInitial: false,
    },
    triggerNote,
  };
}

function getFallbackLeadPreset(value: unknown): Lead4opFMPreset {
  return value === 'gamelan' ? DEFAULT_GAMELAN : DEFAULT_SOFT_RHODES;
}

function shapeLeadDistance(distance: number): number {
  const safeDistance = clamp(distance, 0, 1);
  return 1 - Math.pow(1 - safeDistance, 2);
}

function applyLeadDistanceTimbre(
  morphed: Lead4opFMMorphedParams,
  distance: number,
): Lead4opFMMorphedParams {
  if (distance <= 1e-4) return morphed;
  const shaped = shapeLeadDistance(distance);
  return {
    ...morphed,
    filterFreq: Math.max(80, morphed.filterFreq * (1 - shaped * 0.72)),
    filterQ: Math.max(0.05, morphed.filterQ * (1 - shaped * 0.18)),
    filterEnvDepth: morphed.filterEnvDepth * (1 - shaped * 0.55),
    transientClick: morphed.transientClick * (1 - shaped * 0.92),
    transientNoise: morphed.transientNoise * (1 - shaped * 0.82),
    mod1Index: morphed.mod1Index * (1 - shaped * 0.34),
    mod2Index: morphed.mod2Index * (1 - shaped * 0.30),
    mod3Index: morphed.mod3Index * (1 - shaped * 0.24),
    mod4Index: morphed.mod4Index * (1 - shaped * 0.18),
    drive: morphed.drive * (1 - shaped * 0.62),
    carrier2Mix: morphed.carrier2Mix * (1 - shaped * 0.12),
    gain: morphed.gain * (1 - shaped * 0.15),
  };
}

function applyFilterKeyTracking(baseCutoff: number, noteFreq: number, amount: number): number {
  const safeCutoff = Number.isFinite(baseCutoff) ? baseCutoff : 18000;
  const safeAmount = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
  if (safeAmount <= 0.0001) return safeCutoff;
  const safeFreq = Number.isFinite(noteFreq) && noteFreq > 0 ? noteFreq : 261.6255653005986;
  const ratio = clamp(safeFreq / 261.6255653005986, 0.125, 8);
  return clamp(safeCutoff * Math.pow(ratio, safeAmount), 20, 20000);
}

function createLeadPostChainConfig(
  sliderState: SliderState,
  source: 'lead1' | 'lead2',
  frequency: number,
): Pick<PreviewSourceConfig, 'pad1PostLpfHz' | 'pad1StereoWidth' | 'pad2PostLpfHz' | 'pad2StereoWidth'> {
  const state = sliderState as unknown as Record<string, unknown>;
  const postLpfKey = source === 'lead2' ? 'lead2PostLPF' : 'lead1PostLPF';
  const trackingKey = source === 'lead2' ? 'lead2PostLPFKeyTracking' : 'lead1PostLPFKeyTracking';
  const widthKey = source === 'lead2' ? 'lead2StereoWidth' : 'lead1StereoWidth';
  const baseCutoff = boundedNumber(
    applyDistanceValue(postLpfKey, sliderState, source),
    18000,
    20,
    20000,
  );
  const cutoff = applyFilterKeyTracking(
    baseCutoff,
    frequency,
    boundedNumber(state[trackingKey], 0, 0, 1),
  );
  const stereoWidth = boundedNumber(
    applyDistanceValue(widthKey, sliderState, source),
    1,
    0,
    1,
  );
  return {
    pad1PostLpfHz: cutoff,
    pad1StereoWidth: stereoWidth,
    pad2PostLpfHz: cutoff,
    pad2StereoWidth: stereoWidth,
  };
}

function createLeadMorphedParams(
  sliderState: SliderState,
  source: 'lead1' | 'lead2',
): { morphed: Lead4opFMMorphedParams; holdSeconds: number } {
  const state = sliderState as unknown as Record<string, unknown>;
  const isLead2 = source === 'lead2';
  const presetA = getFallbackLeadPreset(state[isLead2 ? 'lead2PresetC' : 'lead1PresetA']);
  const presetB = getFallbackLeadPreset(state[isLead2 ? 'lead2PresetD' : 'lead1PresetB']);
  const morphT = boundedNumber(state[isLead2 ? 'lead2Morph' : 'lead1Morph'], 0, 0, 1);
  const algorithmMode = state[isLead2 ? 'lead2AlgorithmMode' : 'lead1AlgorithmMode'] === 'presetA'
    ? 'presetA'
    : 'snap';
  const useCustomAdsr = booleanValue(state[isLead2 ? 'lead2UseCustomAdsr' : 'lead1UseCustomAdsr'], false);
  const attack = boundedNumber(state[isLead2 ? 'lead2Attack' : 'lead1Attack'], 0.01, 0, 10);
  const decay = boundedNumber(state[isLead2 ? 'lead2Decay' : 'lead1Decay'], 0.8, 0, 10);
  const sustain = boundedNumber(state[isLead2 ? 'lead2Sustain' : 'lead1Sustain'], 0.3, 0, 1);
  const hold = boundedNumber(state[isLead2 ? 'lead2Hold' : 'lead1Hold'], 0.5, 0, 4);
  const release = boundedNumber(state[isLead2 ? 'lead2Release' : 'lead1Release'], 2, 0, 20);
  const baseMorphed = morphPresets(presetA, presetB, morphT, algorithmMode);
  const morphed = useCustomAdsr
    ? { ...baseMorphed, attack, decay, sustain, release }
    : baseMorphed;
  const distance = getVoiceDistanceValue(sliderState, source);
  const envelope = applyLeadDistanceEnvelope(source, {
    attack: morphed.attack ?? 0.01,
    decay: morphed.decay ?? 0.3,
    sustain: morphed.sustain ?? 0.7,
    hold,
    release: morphed.release ?? 0.5,
  }, distance);
  const distanceMorphed = applyLeadDistanceTimbre({
    ...morphed,
    attack: envelope.attack,
    decay: envelope.decay,
    sustain: envelope.sustain,
    release: envelope.release,
  }, distance);

  return {
    morphed: distanceMorphed,
    holdSeconds: envelope.hold ?? hold,
  };
}

function writeLeadFmOperatorParams(
  params: number[],
  morphed: Lead4opFMMorphedParams,
  opIndex: number,
  prefix: 'mod1' | 'mod2' | 'mod3' | 'mod4',
): void {
  const source = morphed as unknown as Record<string, unknown>;
  const base = LEAD_FM_PARAM_INDEX.operatorStart + opIndex * LEAD_FM_PARAM_INDEX.operatorCount;
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.ratio] = finiteNumber(source[`${prefix}Ratio`], 1);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.index] = finiteNumber(source[`${prefix}Index`], 0);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.decay] = finiteNumber(source[`${prefix}Decay`], 0.8);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.sustain] = finiteNumber(source[`${prefix}Sustain`], 0.1);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.level] = finiteNumber(source[`${prefix}Level`], 1);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.feedback] = finiteNumber(source[`${prefix}Feedback`], 0);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.detune] = finiteNumber(source[`${prefix}Detune`], 0);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.envRate] = finiteNumber(source[`${prefix}EnvRate`], 1);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.modAttack] = finiteNumber(source[`${prefix}ModAttack`], 0);
  params[base + LEAD_FM_OPERATOR_PARAM_INDEX.modDelay] = finiteNumber(source[`${prefix}ModDelay`], 0);
}

function createLeadFmParams(morphed: Lead4opFMMorphedParams, outputSelect: 0 | 1 | 2): number[] {
  const params = Array.from({ length: LEAD_FM_MODULE_PARAM_COUNT }, () => 0);
  params[LEAD_FM_PARAM_INDEX.algorithm] = enumParam(morphed.algorithm, LEAD_FM_ALGORITHM_VALUES, 0);
  params[LEAD_FM_PARAM_INDEX.beatDetune] = finiteNumber(morphed.beatDetune, 0);
  params[LEAD_FM_PARAM_INDEX.carrier2Mix] = finiteNumber(morphed.carrier2Mix, 0);
  writeLeadFmOperatorParams(params, morphed, 0, 'mod1');
  writeLeadFmOperatorParams(params, morphed, 1, 'mod2');
  writeLeadFmOperatorParams(params, morphed, 2, 'mod3');
  writeLeadFmOperatorParams(params, morphed, 3, 'mod4');
  params[LEAD_FM_PARAM_INDEX.attack] = finiteNumber(morphed.attack, 0.01);
  params[LEAD_FM_PARAM_INDEX.decay] = finiteNumber(morphed.decay, 0.8);
  params[LEAD_FM_PARAM_INDEX.sustain] = finiteNumber(morphed.sustain, 0.3);
  params[LEAD_FM_PARAM_INDEX.release] = finiteNumber(morphed.release, 2);
  params[LEAD_FM_PARAM_INDEX.filterFreq] = finiteNumber(morphed.filterFreq, 4000);
  params[LEAD_FM_PARAM_INDEX.filterQ] = finiteNumber(morphed.filterQ, 0.7);
  params[LEAD_FM_PARAM_INDEX.filterType] = enumParam(morphed.filterType, LEAD_FM_FILTER_VALUES, 0);
  params[LEAD_FM_PARAM_INDEX.filterEnvAttack] = finiteNumber(morphed.filterEnvAttack, 0);
  params[LEAD_FM_PARAM_INDEX.filterEnvDecay] = finiteNumber(morphed.filterEnvDecay, 0);
  params[LEAD_FM_PARAM_INDEX.filterEnvSustain] = finiteNumber(morphed.filterEnvSustain, 1);
  params[LEAD_FM_PARAM_INDEX.filterEnvRelease] = finiteNumber(morphed.filterEnvRelease, 0);
  params[LEAD_FM_PARAM_INDEX.filterEnvDepth] = finiteNumber(morphed.filterEnvDepth, 0);
  params[LEAD_FM_PARAM_INDEX.drive] = finiteNumber(morphed.drive, 0);
  params[LEAD_FM_PARAM_INDEX.transientClick] = finiteNumber(morphed.transientClick, 0);
  params[LEAD_FM_PARAM_INDEX.transientNoise] = finiteNumber(morphed.transientNoise, 0);
  params[LEAD_FM_PARAM_INDEX.transientDuration] = finiteNumber(morphed.transientDuration, 20);
  params[LEAD_FM_PARAM_INDEX.transientDecay] = finiteNumber(morphed.transientDecay, 50);
  params[LEAD_FM_PARAM_INDEX.transientFilter] = finiteNumber(morphed.transientFilter, 4000);
  params[LEAD_FM_PARAM_INDEX.transientType] = enumParam(morphed.transientType, LEAD_FM_TRANSIENT_VALUES, 0);
  params[LEAD_FM_PARAM_INDEX.gain] = finiteNumber(morphed.gain, 0.34);
  params[LEAD_FM_PARAM_INDEX.xLevel] = finiteNumber(morphed.xLevel, 1);
  params[LEAD_FM_PARAM_INDEX.xPan] = finiteNumber(morphed.xPan, -0.2);
  params[LEAD_FM_PARAM_INDEX.yLevel] = finiteNumber(morphed.yLevel, 0.9);
  params[LEAD_FM_PARAM_INDEX.yPan] = finiteNumber(morphed.yPan, 0.2);
  params[LEAD_FM_PARAM_INDEX.lfoRate] = finiteNumber(morphed.lfoRate, 0);
  params[LEAD_FM_PARAM_INDEX.lfoDepth] = finiteNumber(morphed.lfoDepth, 0);
  params[LEAD_FM_PARAM_INDEX.lfoTarget] = enumParam(morphed.lfoTarget, LEAD_FM_LFO_TARGET_VALUES, 0);
  params[LEAD_FM_PARAM_INDEX.unisonVoices] = boundedInteger(morphed.unisonVoices, 1, 1, 8);
  params[LEAD_FM_PARAM_INDEX.unisonDetune] = finiteNumber(morphed.unisonDetune, 0);
  params[LEAD_FM_PARAM_INDEX.delayEnabled] = 0;
  params[LEAD_FM_PARAM_INDEX.delayTimeL] = 0;
  params[LEAD_FM_PARAM_INDEX.delayTimeR] = 0;
  params[LEAD_FM_PARAM_INDEX.delayFeedback] = 0.4;
  params[LEAD_FM_PARAM_INDEX.delayFilter] = 4000;
  params[LEAD_FM_PARAM_INDEX.delayMix] = 0.3;
  params[LEAD_FM_PARAM_INDEX.delaySend] = 0.3;
  params[LEAD_FM_PARAM_INDEX.outputSelect] = outputSelect;
  return params;
}

function createManualLeadSourceConfig(
  sliderState: SliderState,
  source: 'lead1' | 'lead2',
  note: ManualSynthNoteOptions,
): { config: PreviewSourceConfig; triggerNote: PreviewNote } {
  const state = sliderState as unknown as Record<string, unknown>;
  const safeMidi = boundedInteger(note.midi, 60, 24, 108);
  const frequency = midiToFreq(safeMidi);
  const { morphed, holdSeconds } = createLeadMorphedParams(sliderState, source);
  const outputSelect = source === 'lead2' ? 1 : 0;
  const params = createLeadFmParams(morphed, outputSelect);
  const postChain = createLeadPostChainConfig(sliderState, source, frequency);
  const levelKey = source === 'lead2' ? 'lead2Level' : 'lead1Level';
  const reverbKey = source === 'lead2' ? 'lead2ReverbSend' : 'lead1ReverbSend';
  const delayASendKey = source === 'lead2' ? 'lead2DelayASend' : 'lead1DelayASend';
  const delayBSendKey = source === 'lead2' ? 'lead2DelayBSend' : 'lead1DelayBSend';
  const dryGain = boundedNumber(applyDistanceValue(levelKey, sliderState, source), source === 'lead2' ? 0.6 : 0.8, 0, 1.5) * ENGINE_TRIMS.lead;
  const sendCompensation = dryGain > 0.0001 ? 1 / dryGain : 0;
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(applyDistanceValue(reverbKey, sliderState, source), 0.5, 0, 1) * sendCompensation
    : 0;
  const delayASendGain = boundedNumber(state[delayASendKey], 0, 0, 1) * sendCompensation;
  const delayBSendGain = boundedNumber(state[delayBSendKey], 0, 0, 1) * sendCompensation;
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state[source === 'lead2' ? 'granularLead2Send' : 'granularLead1Send'], 0, 0, 1) * sendCompensation
    : 0;
  const triggerNote = {
    frequency,
    velocity: clamp(finiteNumber(note.velocity, 0.82), 0.05, 1),
    route: outputSelect,
    delaySeconds: 0,
    holdSeconds,
  };
  const noteKey = `manual:${source}:${safeMidi}`;
  const postKey = Object.values(postChain)
    .map((value) => Math.round(value * 1000) / 1000)
    .join(',');
  const configKey = [
    noteKey,
    Math.round(dryGain * 1_000_000) / 1_000_000,
    paramConfigKey(params),
    postKey,
    Math.round(reverbSendGain * 1_000_000) / 1_000_000,
    Math.round(delayASendGain * 1_000_000) / 1_000_000,
    Math.round(delayBSendGain * 1_000_000) / 1_000_000,
    Math.round(granularSendGain * 1_000_000) / 1_000_000,
  ].join(':');

  return {
    config: {
      enabled: true,
      source: 'lead-fm',
      params,
      ...postChain,
      dryGain,
      reverbSendGain,
      delayASendGain,
      delayBSendGain,
      granularSendGain,
      leadIndex: outputSelect,
      notes: [],
      chords: [[]],
      chordSeconds: 3600,
      noteKey,
      configKey,
      triggerInitial: false,
    },
    triggerNote,
  };
}

function writeDrumParamsFromState(params: number[], sliderState: SliderState): void {
  const state = sliderState as unknown as Record<string, unknown>;

  for (const [stateKey, index, enumMap, fallback] of DRUM_PARAM_SPECS) {
    params[index] = enumParam(state[stateKey], enumMap, fallback);
  }

  params[DRUM_PARAM_INDEX.delay + 0] = 0;
  params[DRUM_PARAM_INDEX.delay + 1] = 0;
  params[DRUM_PARAM_INDEX.delay + 2] = 0;
  params[DRUM_PARAM_INDEX.delay + 3] = boundedNumber(state.drumDelayFeedback, 0.4, 0, 0.95);
  params[DRUM_PARAM_INDEX.delay + 4] = 500 * Math.pow(32, boundedNumber(state.drumDelayFilter, 0.5, 0, 1));
  params[DRUM_PARAM_INDEX.delay + 5] = 0;
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.sub] = boundedNumber(state.drumSubDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.kick] = boundedNumber(state.drumKickDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.click] = boundedNumber(state.drumClickDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.beepHi] = boundedNumber(state.drumBeepHiDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.beepLo] = boundedNumber(state.drumBeepLoDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.noise] = boundedNumber(state.drumNoiseDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.delaySends + DRUM_VOICE_INDEX.membrane] = boundedNumber(state.drumMembraneDelaySend, 0, 0, 1);
  params[DRUM_PARAM_INDEX.trigger + 0] = -1;
  params[DRUM_PARAM_INDEX.trigger + 1] = -1;
  params[DRUM_PARAM_INDEX.trigger + 2] = 0;
  params[DRUM_PARAM_INDEX.trigger + 3] = 1.0e10;
  params[DRUM_PARAM_INDEX.trigger + 4] = 1.0e10;
  params[DRUM_PARAM_INDEX.masterLevel] = boundedNumber(state.drumLevel, 0.8, 0, 1.5) * ENGINE_TRIMS.drum;
  params[DRUM_PARAM_INDEX.reverbSend] = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.drumReverbSend, 0.1, 0, 1)
    : 0;
  params[DRUM_PARAM_INDEX.seed] = boundedInteger(state.seed, 42, 0, 1_000_000);
  params[DRUM_PARAM_INDEX.outputSelect] = 0;
}

function getCoreDrumLaneVoices(state: Record<string, unknown>, lane: 1 | 2 | 3 | 4): CoreDrumVoice[] {
  const prefix = `drumEuclid${lane}Target`;
  const hasBooleanProps = state[`${prefix}Sub`] !== undefined;
  if (hasBooleanProps) {
    return DRUM_VOICE_TYPES.filter((voice) => {
      const key = `${prefix}${voice.charAt(0).toUpperCase()}${voice.slice(1)}`;
      return booleanValue(state[key], false);
    });
  }

  const legacyTarget = state[`drumEuclid${lane}Target`];
  return DRUM_VOICE_TYPES.includes(legacyTarget as CoreDrumVoice)
    ? [legacyTarget as CoreDrumVoice]
    : [];
}

function getCoreDrumLaneStepSeconds(laneIndex: number, beatSeconds: number): number {
  if (laneIndex === 0) return beatSeconds / 2;
  if (laneIndex === 1) return beatSeconds / 4;
  if (laneIndex === 2) return beatSeconds / 3;
  return beatSeconds;
}

function createDrumPreviewNotes(sliderState: SliderState): { notes: PreviewNote[]; loopSeconds: number } {
  const state = sliderState as unknown as Record<string, unknown>;
  const bpm = boundedNumber(getEffectiveSequencerBpm(sliderState), 120, 40, 300);
  const tempo = boundedNumber(state.drumEuclidTempo, 1, 0.25, 4);
  const beatSeconds = 60 / (bpm * tempo);
  const notes: PreviewNote[] = [];
  let loopSeconds = beatSeconds * 4;

  for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    if (!booleanValue(state[`drumEuclid${lane}Enabled`], laneIndex < 3)) continue;
    const voices = getCoreDrumLaneVoices(state, lane);
    if (voices.length === 0) continue;

    const patternParams = resolveDrumEuclidPatternParams(
      typeof state[`drumEuclid${lane}Preset`] === 'string' ? String(state[`drumEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`drumEuclid${lane}Steps`], laneIndex === 2 ? 12 : laneIndex === 1 ? 16 : 8, 1, 64),
      boundedInteger(state[`drumEuclid${lane}Hits`], laneIndex === 0 ? 3 : laneIndex === 1 ? 5 : 4, 0, 64),
      boundedInteger(state[`drumEuclid${lane}Rotation`], 0, 0, 63),
    );
    const stepSeconds = getCoreDrumLaneStepSeconds(laneIndex, beatSeconds);
    const pattern = seqEuclidean(patternParams.steps, patternParams.hits, patternParams.rotation);
    const velocity = boundedNumber(state[`drumEuclid${lane}Level`], 1, 0, 1);
    loopSeconds = Math.max(loopSeconds, patternParams.steps * stepSeconds);

    for (let step = 0; step < pattern.length; step += 1) {
      if (!pattern[step]) continue;
      const voice = voices[step % voices.length] ?? voices[0];
      if (!voice) continue;
      notes.push({
        frequency: 0,
        velocity,
        route: DRUM_VOICE_INDEX[voice],
        delaySeconds: step * stepSeconds,
        holdSeconds: 0,
      });
    }
  }

  notes.sort((left, right) => left.delaySeconds - right.delaySeconds || left.route - right.route);
  return { notes, loopSeconds: Math.max(beatSeconds, loopSeconds) };
}

function createDrumPreviewSource(sliderState: SliderState): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  if (!booleanValue(state.drumEnabled, false) || !booleanValue(state.drumEuclidMasterEnabled, false)) return null;

  const params = Array.from({ length: DRUM_MODULE_PARAM_COUNT }, () => 0);
  writeDrumParamsFromState(params, sliderState);
  const { notes, loopSeconds } = createDrumPreviewNotes(sliderState);
  if (notes.length === 0) return null;

  const noteKey = notes
    .map((note) => `${note.route}:${note.delaySeconds.toFixed(4)}:${note.velocity.toFixed(3)}`)
    .join('|');
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.drumReverbSend, 0.1, 0, 1)
    : 0;
  const delayASendGain = boundedNumber(state.drumDelayASend, 0, 0, 1);
  const delayBSendGain = boundedNumber(state.drumDelayBSend, 0, 0, 1);
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state.granularDrumSend, 0, 0, 1)
    : 0;
  const configKey = [
    'drum',
    noteKey,
    loopSeconds.toFixed(4),
    paramConfigKey(params),
    Math.round(reverbSendGain * 1_000_000) / 1_000_000,
    Math.round(delayASendGain * 1_000_000) / 1_000_000,
    Math.round(delayBSendGain * 1_000_000) / 1_000_000,
    Math.round(granularSendGain * 1_000_000) / 1_000_000,
  ].join(':');

  return {
    enabled: true,
    source: 'drum',
    params,
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    dryGain: CORE_DRUM_DRY_TRIM,
    reverbSendGain,
    delayASendGain,
    delayBSendGain,
    granularSendGain,
    notes,
    chords: [notes, notes],
    chordSeconds: loopSeconds,
    noteKey,
    configKey,
    triggerInitial: false,
    initialChordLeadSeconds: CORE_DRUM_INITIAL_CHORD_LEAD_SECONDS,
  };
}

function resolveWaterState(sliderState: SliderState): WaterPresetState {
  const state = sliderState as unknown as Record<string, unknown>;
  const presetA = boundedInteger(state.waterMorphA ?? state.waterPreset, 0, 0, 7);
  const presetB = boundedInteger(state.waterMorphB ?? state.waterPreset, presetA, 0, 7);
  const morph = boundedNumber(state.waterMorph, 0, 0, 1);
  const morphed = morphWaterPresets(presetA, presetB, morph);
  const resolved = { ...morphed };
  for (const key of Object.keys(morphed) as Array<keyof WaterPresetState>) {
    if (typeof state[key] === 'number') {
      resolved[key] = Number(state[key]);
    }
  }
  return resolved;
}

function earthLayerActive(
  state: Record<string, unknown>,
  enabledKey: string,
  levelKey: string,
  fallbackLevel: number,
): boolean {
  return booleanValue(state[enabledKey], false) && boundedNumber(state[levelKey], fallbackLevel, 0, 1) > 0.0001;
}

function earthLayerLevel(
  state: Record<string, unknown>,
  active: boolean,
  levelKey: string,
  fallbackLevel: number,
): number {
  return active ? boundedNumber(state[levelKey], fallbackLevel, 0, 1) : 0;
}

function writeSoundscapesParamsFromState(params: number[], sliderState: SliderState): void {
  const state = sliderState as unknown as Record<string, unknown>;
  const water = resolveWaterState(sliderState);
  const waterActive = earthLayerActive(state, 'waterEnabled', 'waterLevel', 0.8);
  const oceanActive = earthLayerActive(state, 'oceanSampleEnabled', 'oceanSampleLevel', 0.5);
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  const birdsActive = earthLayerActive(state, 'birdsEnabled', 'birdsLevel', 0.45);
  const birds2Active = earthLayerActive(state, 'birds2Enabled', 'birds2Level', 0.4);
  const frogsActive = earthLayerActive(state, 'frogsEnabled', 'frogsLevel', 0.45);
  const waterEngineActive = waterActive || oceanActive;
  const insectsEngineActive = insectsActive || birdsActive || frogsActive;
  const insects2EngineActive = insects2Active || birds2Active;

  params[SOUNDSCAPES_PARAM_INDEX.waterActive] = waterEngineActive ? 1 : 0;
  params[SOUNDSCAPES_PARAM_INDEX.waterPreset] = boundedInteger(
    oceanActive && !waterActive
      ? 4
      : state.waterMorph !== undefined
        ? (boundedNumber(state.waterMorph, 0, 0, 1) < 0.5 ? state.waterMorphA : state.waterMorphB)
        : state.waterPreset,
    0,
    0,
    7,
  );

  const waterParamValues = [
    water.waterIntensity,
    water.waterIntensity,
    water.waterDistance,
    water.waterDistance,
    water.waterHardDropBaseFreq ?? water.waterBaseFreq,
    water.waterHardDropBaseFreq ?? water.waterBaseFreq,
    water.waterWaterDropBaseFreq ?? water.waterBaseFreq,
    water.waterWaterDropBaseFreq ?? water.waterBaseFreq,
    water.waterDropSize,
    water.waterDropSize,
    water.waterHardness,
    water.waterHardness,
    water.waterGlassThickness,
    water.waterGlassThickness,
  ];
  waterParamValues.forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterParams + index] = finiteNumber(value, 0.5);
  });

  [
    water.waterHardDropRate,
    water.waterHardDropLPF,
    water.waterHardDropTone,
    water.waterWaterDropRate,
    water.waterWaterDropLPF,
    water.waterBubblingRate,
    water.waterBubblingLPF,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerDetail + index] = finiteNumber(value, index % 3 === 1 ? 12000 : 1);
  });

  [
    water.waterLayerHardDrops,
    water.waterLayerWaterDrops,
    water.waterLayerTurbulence,
    water.waterLayerBubbling,
    water.waterLayerSurf,
    water.waterLayerChannels,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerMix + index] = finiteNumber(value, 0);
  });

  [0.5, 0.5, 0.5, 0.5, 1, 1].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerDensity + index] = value;
  });

  [
    water.waterDensityHardSend,
    water.waterDensityWaterSend,
    water.waterDensityBubbleSend,
    water.waterDensityFeedback,
    water.waterDensityTone,
    water.waterDensityRing,
    water.waterDensityWet,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterDensityLoop + index] = finiteNumber(value, 0.5);
  });

  [
    water.waterSurfDuration,
    water.waterSurfDuration,
    water.waterSurfInterval,
    water.waterSurfInterval,
    water.waterSurfFoam,
    water.waterSurfFoam,
    water.waterSurfProximity,
    water.waterSurfProximity,
    water.waterSurfDepth,
    water.waterSurfDepth,
    water.waterSurfBody,
    water.waterSurfBody,
    water.waterSurfSpray,
    water.waterSurfSpray,
    water.waterSurfFoamBright,
    water.waterSurfFoamBright,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterSurf + index] = finiteNumber(value, 0.5);
  });

  params[SOUNDSCAPES_PARAM_INDEX.waterChannels + 0] = finiteNumber(water.waterChannelsMorph, 0);
  params[SOUNDSCAPES_PARAM_INDEX.waterChannels + 1] = finiteNumber(water.waterChannelsSpeed, 0.5);
  params[SOUNDSCAPES_PARAM_INDEX.waterSeed] = boundedInteger(state.seed, 12345, 0, 1_000_000);

  const writeInsectParams = (
    activeIndex: number,
    engineIndex: number,
    paramsIndex: number,
    seedIndex: number,
    prefix: 'insects' | 'insects2',
    fallbackSeed: number,
  ) => {
    const active = prefix === 'insects' ? insectsEngineActive : insects2EngineActive;
    const fallbackEngine = prefix === 'insects'
      ? (!insectsActive && frogsActive && !birdsActive ? 5 : (!insectsActive && birdsActive ? 6 : 0))
      : (!insects2Active && birds2Active ? 6 : 1);
    params[activeIndex] = active ? 1 : 0;
    params[engineIndex] = boundedInteger(state[`${prefix}Engine`], fallbackEngine, 0, 6);
    const values = [
      state[`${prefix}Density`],
      state[`${prefix}Density`],
      state[`${prefix}Temperature`],
      state[`${prefix}Temperature`],
      state[`${prefix}Distance`],
      state[`${prefix}Distance`],
      state[`${prefix}Proximity`],
      state[`${prefix}Proximity`],
      state[`${prefix}Antiphony`],
      state[`${prefix}Antiphony`],
      state[`${prefix}ClickRate`],
      state[`${prefix}ClickRate`],
      state[`${prefix}Motion`],
      state[`${prefix}Motion`],
    ];
    values.forEach((value, index) => {
      params[paramsIndex + index] = finiteNumber(value, index >= 4 && index <= 5 ? 0.3 : 0.5);
    });
    params[seedIndex] = boundedInteger(state.seed, fallbackSeed, 0, 1_000_000) + (prefix === 'insects2' ? 17 : 0);
  };

  writeInsectParams(
    SOUNDSCAPES_PARAM_INDEX.insectsActive,
    SOUNDSCAPES_PARAM_INDEX.insectsEngine,
    SOUNDSCAPES_PARAM_INDEX.insectsParams,
    SOUNDSCAPES_PARAM_INDEX.insectsSeed,
    'insects',
    12345,
  );
  writeInsectParams(
    SOUNDSCAPES_PARAM_INDEX.insects2Active,
    SOUNDSCAPES_PARAM_INDEX.insects2Engine,
    SOUNDSCAPES_PARAM_INDEX.insects2Params,
    SOUNDSCAPES_PARAM_INDEX.insects2Seed,
    'insects2',
    67890,
  );

  const activeCount = [waterEngineActive, insectsEngineActive, insects2EngineActive].filter(Boolean).length;
  params[SOUNDSCAPES_PARAM_INDEX.outputSelect] = activeCount > 1
    ? 3
    : insects2EngineActive
      ? 2
      : insectsEngineActive
        ? 1
        : 0;
}

function createSoundscapesPreviewSource(sliderState: SliderState): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  const waterActive = earthLayerActive(state, 'waterEnabled', 'waterLevel', 0.8);
  const oceanActive = earthLayerActive(state, 'oceanSampleEnabled', 'oceanSampleLevel', 0.5);
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  const birdsActive = earthLayerActive(state, 'birdsEnabled', 'birdsLevel', 0.45);
  const birds2Active = earthLayerActive(state, 'birds2Enabled', 'birds2Level', 0.4);
  const frogsActive = earthLayerActive(state, 'frogsEnabled', 'frogsLevel', 0.45);
  if (!waterActive && !oceanActive && !insectsActive && !insects2Active && !birdsActive && !birds2Active && !frogsActive) {
    return null;
  }

  const params = Array.from({ length: SOUNDSCAPES_MODULE_PARAM_COUNT }, () => 0);
  writeSoundscapesParamsFromState(params, sliderState);

  const natureLevel = boundedNumber(state.natureLevel, 1, 0, 1);
  const insectsSharedLevel = boundedNumber(state.insectsSharedLevel, 1, 0, 1);
  const waterGain = earthLayerLevel(state, waterActive, 'waterLevel', 0.8);
  const oceanGain = earthLayerLevel(state, oceanActive, 'oceanSampleLevel', 0.5);
  const insectsGain = earthLayerLevel(state, insectsActive, 'insectsLevel', 0.7) * insectsSharedLevel;
  const insects2Gain = earthLayerLevel(state, insects2Active, 'insects2Level', 0.5) * insectsSharedLevel;
  const birdsGain = earthLayerLevel(state, birdsActive, 'birdsLevel', 0.45);
  const birds2Gain = earthLayerLevel(state, birds2Active, 'birds2Level', 0.4);
  const frogsGain = earthLayerLevel(state, frogsActive, 'frogsLevel', 0.45);
  const dryGain = Math.max(waterGain, oceanGain, insectsGain, insects2Gain, birdsGain, birds2Gain, frogsGain) * natureLevel * ENGINE_TRIMS.earth;
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? Math.max(
      waterActive ? boundedNumber(state.waterReverbSend, 0.3, 0, 1) : 0,
      oceanActive ? boundedNumber(state.oceanReverbSend, 0.3, 0, 1) : 0,
      insectsActive || insects2Active ? boundedNumber(state.insectsReverbSend, 0.15, 0, 1) : 0,
      birdsActive ? boundedNumber(state.birdsReverbSend, 0, 0, 1) : 0,
      birds2Active ? boundedNumber(state.birds2ReverbSend, 0, 0, 1) : 0,
      frogsActive ? boundedNumber(state.frogsReverbSend, 0, 0, 1) : 0,
      boundedNumber(state.natureReverbSend, 0, 0, 1),
    )
    : 0;
  const delayASendGain = Math.max(
    waterActive ? boundedNumber(state.waterDelayASend, 0, 0, 1) : 0,
    oceanActive ? boundedNumber(state.oceanDelayASend, 0, 0, 1) : 0,
    insectsActive || insects2Active ? boundedNumber(state.insDelayASend, 0, 0, 1) : 0,
    birdsActive ? boundedNumber(state.birdsDelayASend, 0, 0, 1) : 0,
    birds2Active ? boundedNumber(state.birds2DelayASend, 0, 0, 1) : 0,
    frogsActive ? boundedNumber(state.frogsDelayASend, 0, 0, 1) : 0,
    boundedNumber(state.natureDelayASend, 0, 0, 1),
  );
  const delayBSendGain = Math.max(
    waterActive ? boundedNumber(state.waterDelayBSend, 0, 0, 1) : 0,
    oceanActive ? boundedNumber(state.oceanDelayBSend, 0, 0, 1) : 0,
    insectsActive || insects2Active ? boundedNumber(state.insDelayBSend, 0, 0, 1) : 0,
    birdsActive ? boundedNumber(state.birdsDelayBSend, 0, 0, 1) : 0,
    birds2Active ? boundedNumber(state.birds2DelayBSend, 0, 0, 1) : 0,
    frogsActive ? boundedNumber(state.frogsDelayBSend, 0, 0, 1) : 0,
    boundedNumber(state.natureDelayBSend, 0, 0, 1),
  );
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? Math.max(
      waterActive ? boundedNumber(state.granularWaterSend, 0, 0, 1) : 0,
      oceanActive ? boundedNumber(state.granularWavesSend, 0, 0, 1) : 0,
      insectsActive || insects2Active ? boundedNumber(state.granularInsectsSend, 0, 0, 1) : 0,
      birdsActive || birds2Active || frogsActive ? boundedNumber(state.granularNatureSend, 0, 0, 1) : 0,
      boundedNumber(state.granularNatureSend, 0, 0, 1),
    )
    : 0;
  const noteKey = [
    waterActive ? 'water' : '',
    oceanActive ? 'ocean' : '',
    insectsActive ? 'insects' : '',
    insects2Active ? 'insects2' : '',
    birdsActive ? 'birds' : '',
    birds2Active ? 'birds2' : '',
    frogsActive ? 'frogs' : '',
  ].filter(Boolean).join('+');
  const configKey = [
    'soundscapes',
    noteKey,
    Math.round(dryGain * 1_000_000) / 1_000_000,
    Math.round(reverbSendGain * 1_000_000) / 1_000_000,
    Math.round(delayASendGain * 1_000_000) / 1_000_000,
    Math.round(delayBSendGain * 1_000_000) / 1_000_000,
    Math.round(granularSendGain * 1_000_000) / 1_000_000,
    paramConfigKey(params),
  ].join(':');

  return {
    enabled: true,
    source: 'soundscapes',
    params,
    pad1PostLpfHz: 18000,
    pad1StereoWidth: 1,
    pad2PostLpfHz: 18000,
    pad2StereoWidth: 1,
    dryGain,
    reverbSendGain,
    delayASendGain,
    delayBSendGain,
    granularSendGain,
    notes: [],
    chords: [[]],
    chordSeconds: 3600,
    noteKey,
    configKey,
    triggerInitial: false,
  };
}

function granularStateNumber(state: Record<string, unknown>, key: keyof SliderState, fallback: number): number {
  return finiteNumber(state[key as string], fallback);
}

function writeGranularParamsFromState(params: number[], sliderState: SliderState, enabled: boolean): void {
  const state = sliderState as unknown as Record<string, unknown>;
  const macroModel = computeGranularMacroModel(sliderState, (key, fallback) =>
    granularStateNumber(state, key, fallback),
  );

  params[0] = enabled ? 1 : 0;
  params[1] = booleanValue(state.granularFreeze, false) ? 1 : 0;
  params[2] = 0;
  params[3] = enabled ? 1 : 0;
  params[4] = boundedNumber(state.granularFeedback, 0.1, 0, 0.85);
  params[5] = boundedNumber(state.granularFeedbackLPF, 8000, 200, 12000);
  params[6] = boundedNumber(state.granularBufferSeconds, 16, 4, 16);
  params[7] = enumParam(state.granularShape, GRANULAR_SHAPE_VALUES, 0);
  params[8] = macroModel.busDiffusion;
  params[9] = macroModel.timingRandomness;

  for (let voice = 0; voice < GRANULAR_VOICE_COUNT; voice += 1) {
    const voiceNumber = voice + 1;
    const base = GRANULAR_VOICE_PARAM_START + voice * GRANULAR_VOICE_PARAM_COUNT;
    const prefix = `granularV${voiceNumber}`;
    params[base + 0] = booleanValue(state[`${prefix}Enabled`], voice === 0) ? 1 : 0;
    params[base + 1] = enumParam(state[`${prefix}Mode`], GRANULAR_MODE_VALUES, 1);
    params[base + 2] = boundedInteger(state[`${prefix}Slice`], voice * 4, 0, 15);
    params[base + 3] = macroModel.voiceSpeed[voice] ?? 1;
    params[base + 4] = macroModel.voiceScanRate[voice] ?? 1;
    params[base + 5] = booleanValue(state[`${prefix}Reverse`], false) ? 1 : 0;
    params[base + 6] = macroModel.voicePitch[voice] ?? 0;
    params[base + 7] = boundedNumber(state[`${prefix}WriteFollow`], 0, 0, 1);
    params[base + 8] = macroModel.voiceDensity[voice] ?? 20;
    params[base + 9] = macroModel.voiceGrainSize[voice] ?? 80;
    params[base + 10] = macroModel.voiceSpray[voice] ?? 0.3;
    params[base + 11] = macroModel.voiceGrainOct[voice] ?? 0;
    params[base + 12] = macroModel.voiceAttack[voice] ?? 0.003;
    params[base + 13] = macroModel.voiceDecay[voice] ?? 0.5;
    params[base + 14] = boundedNumber(state[`${prefix}Gain`], 0.5, 0, 1);
    params[base + 15] = boundedNumber(state[`${prefix}Pan`], 0, -1, 1);
    params[base + 16] = macroModel.voiceBlur[voice] ?? 0;
    params[base + 17] = boundedNumber(state[`${prefix}StereoSpread`], 0.5, 0, 1);
    params[base + 18] = macroModel.voicePosLFORate[voice] ?? 0;
    params[base + 19] = macroModel.voicePosLFODepth[voice] ?? 0;
    params[base + 20] = macroModel.voicePanLFORate[voice] ?? 0;
    params[base + 21] = macroModel.voiceReverseLFORate[voice] ?? 0;
    params[base + 22] = boundedNumber(state[`${prefix}RecordLFORate`], 0, 0, 1);
    params[base + 23] = booleanValue(state[`${prefix}TempoSync`], false) ? 1 : 0;
    params[base + 24] = 0;
  }

  params[GRANULAR_SCALE_COUNT_INDEX] = 0;
  params[GRANULAR_CHORD_COUNT_INDEX] = 0;
  params[GRANULAR_CHORD_BIAS_INDEX] = boundedNumber(state.granularChordBias, 0, 0, 1);
  params[GRANULAR_LEGACY_INDEX + 0] = boundedNumber(state.granularLegacyJitter, 10, 0, 30);
  params[GRANULAR_LEGACY_INDEX + 1] = boundedNumber(state.granularLegacyProbability, 0.8, 0, 1);
  params[GRANULAR_LEGACY_INDEX + 2] = enumParam(state.granularLegacyPitchMode, GRANULAR_LEGACY_PITCH_VALUES, 1);
  params[GRANULAR_LEGACY_INDEX + 3] = boundedNumber(state.granularLegacyPitchSpread, 2, 0, 12);
  params[GRANULAR_LEGACY_INDEX + 4] = boundedInteger(state.granularLegacyMaxGrains, 64, 0, 128);
  params[GRANULAR_LEGACY_INDEX + 5] = boundedNumber(state.granularLegacyFeedback, 0.1, 0, 0.35);
}

function createGranularModuleConfig(sliderState: SliderState): GranularModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const macroModel = computeGranularMacroModel(sliderState, (key, fallback) =>
    granularStateNumber(state, key, fallback),
  );
  const granularEnabled = booleanValue(state.granularEnabled, false);
  const pad1SendGain = granularEnabled && booleanValue(state.padEnabled, true)
    ? boundedNumber(state.granularPad1Send, 1, 0, 1)
    : 0;
  const pad2SendGain = granularEnabled && booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.granularPad2Send, 0, 0, 1)
    : 0;
  const lead1SendGain = granularEnabled && booleanValue(state.leadEnabled, false)
    ? boundedNumber(state.granularLead1Send, 0, 0, 1)
    : 0;
  const lead2SendGain = granularEnabled && booleanValue(state.lead2Enabled, false)
    ? boundedNumber(state.granularLead2Send, 0, 0, 1)
    : 0;
  const drumSendGain = granularEnabled && booleanValue(state.drumEnabled, false)
    ? boundedNumber(state.granularDrumSend, 0, 0, 1)
    : 0;
  const soundscapeSendGain = granularEnabled
    ? Math.max(
      booleanValue(state.waterEnabled, false) ? boundedNumber(state.granularWaterSend, 0, 0, 1) : 0,
      booleanValue(state.oceanSampleEnabled, false) ? boundedNumber(state.granularWavesSend, 0, 0, 1) : 0,
      booleanValue(state.insectsEnabled, false) || booleanValue(state.insects2Enabled, false)
        ? boundedNumber(state.granularInsectsSend, 0, 0, 1)
        : 0,
      booleanValue(state.birdsEnabled, false) || booleanValue(state.birds2Enabled, false) || booleanValue(state.frogsEnabled, false)
        ? boundedNumber(state.granularNatureSend, 0, 0, 1)
        : 0,
      boundedNumber(state.granularNatureSend, 0, 0, 1),
    )
    : 0;
  const delayASendGain = granularEnabled
    ? boundedNumber(state.delayAGranularSend, 0, 0, 1)
    : 0;
  const hasInput = [
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    delayASendGain,
  ].some((value) => value > 0.0001);
  const enabled = granularEnabled && hasInput;
  const params = Array.from({ length: GRANULAR_MODULE_PARAM_COUNT }, () => 0);
  writeGranularParamsFromState(params, sliderState, enabled);
  const outputGain = enabled
    ? boundedNumber(state.granularLevel, 0.5, 0, 1) * ENGINE_TRIMS.granular * macroModel.directLevelScale
    : 0;
  const reverbSendGain = enabled && booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.granularReverbSend, 0.3, 0, 1) * ENGINE_TRIMS.granular
    : 0;
  const delayAOutputSendGain = enabled
    ? boundedNumber(state.granularDelayASend, 0, 0, 1)
    : 0;
  const outputLpfHz = boundedNumber(macroModel.finalOutputLPF, 12000, 200, 12000);
  const gainKey = [
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    delayASendGain,
    outputGain,
    reverbSendGain,
    delayAOutputSendGain,
    outputLpfHz,
  ]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(':');

  return {
    enabled,
    params,
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    delayASendGain,
    outputGain,
    reverbSendGain,
    delayAOutputSendGain,
    outputLpfHz,
    configKey: enabled ? `granular:${gainKey}:${paramConfigKey(params)}` : 'granular:disabled-v1',
  };
}

function createCorePreviewSource(sliderState: SliderState): PreviewSourceConfig | null {
  return createPadPreviewSource(sliderState);
}

function createCorePreviewSourceGroup(sliderState: SliderState): PreviewSourceGroup {
  return {
    primary: createCorePreviewSource(sliderState),
    aux: [
      { slot: 'lead', config: null },
      { slot: 'drum', config: createDrumPreviewSource(sliderState) },
      { slot: 'soundscapes', config: createSoundscapesPreviewSource(sliderState) },
    ],
  };
}

function createReverbModuleConfig(sliderState: SliderState): ReverbModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const pad1Active = booleanValue(state.padEnabled, true);
  const pad2Active = booleanValue(state.pad2Enabled, false);
  const reverbEnabled = booleanValue(state.reverbEnabled, true);
  const spectralFreezeEnabled = booleanValue(state.spectralFreezeEnabled, false);
  const reverbReturnEnabled = reverbEnabled || spectralFreezeEnabled;
  const pad1SendGain = reverbEnabled && pad1Active
    ? boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.7, 0, 1)
    : 0;
  const pad2SendGain = reverbEnabled && pad2Active
    ? boundedNumber(state.pad2ReverbSend ?? state.synthReverbSend, 0.7, 0, 1)
    : 0;
  const returnGain = reverbReturnEnabled
    ? boundedNumber(state.reverbLevel, 0.5, 0, 1) * ENGINE_TRIMS.reverb
    : 0;
  const inputMakeupGain = reverbReturnEnabled
    ? boundedNumber(state.reverbPreCompMakeup, DEFAULT_REVERB_PRE_COMP.makeup, 0.5, 4)
    : 1;
  const preCompThresholdDb = boundedNumber(state.reverbPreCompThreshold, DEFAULT_REVERB_PRE_COMP.threshold, -60, 0);
  const preCompKneeDb = boundedNumber(state.reverbPreCompKnee, DEFAULT_REVERB_PRE_COMP.knee, 0, 40);
  const preCompRatio = boundedNumber(state.reverbPreCompRatio, DEFAULT_REVERB_PRE_COMP.ratio, 1, 20);
  const preCompAttackMs = boundedNumber(state.reverbPreCompAttackMs, DEFAULT_REVERB_PRE_COMP.attackMs, 0.1, 30);
  const preCompReleaseMs = boundedNumber(state.reverbPreCompReleaseMs, DEFAULT_REVERB_PRE_COMP.releaseMs, 20, 1000);
  const enabled = reverbReturnEnabled;

  const params = Array.from({ length: REVERB_MODULE_PARAM_COUNT }, () => 0);
  params[0] = enumParam(state.reverbType, REVERB_TYPE_VALUES, 1);
  params[1] = enumParam(state.reverbQuality, REVERB_QUALITY_VALUES, 1);
  params[2] = boundedNumber(state.reverbDecay, 0.8, 0, 1);
  params[3] = boundedNumber(state.reverbSize, 1.5, 0, 3);
  params[4] = boundedNumber(state.damping, 0.5, 0, 1);
  params[5] = boundedNumber(state.reverbDiffusion, 0.8, 0, 1);
  params[6] = boundedNumber(state.reverbModulation, 0.3, 0, 1);
  params[7] = boundedNumber(state.predelay, 20, 0, 1000);
  params[8] = boundedNumber(state.width, 0.8, 0, 1);
  params[9] = boundedNumber(state.reverbShimmer, 0, 0, 1);
  params[10] = boundedNumber(state.reverbShimmerPitch, 12, -24, 36);
  params[11] = boundedNumber(state.reverbSlowModRate, 0.05, 0, 20);
  params[12] = boundedNumber(state.reverbSlowModDepth, 0, 0, 1);
  params[13] = boundedNumber(state.reverbReverse, 0, 0, 1);
  params[14] = boundedNumber(state.reverbReverseLength, 2, 0, 30);
  params[15] = boundedNumber(state.reverbChorusRate, 0.5, 0, 20);
  params[16] = boundedNumber(state.reverbChorusDepth, 12, 0, 100);
  params[17] = enumParam(state.reverbModCharacter, REVERB_MOD_CHARACTER_VALUES, 2);
  params[18] = boundedNumber(state.reverbDampLow, 0.1, 0, 1);
  params[19] = boundedNumber(state.reverbDampHigh, 0.3, 0, 1);
  params[20] = boundedNumber(state.reverbCrossoverFreq, 800, 20, 20000);
  params[21] = boundedNumber(state.reverbInputTone, 0, -1, 1);
  params[22] = boundedNumber(state.reverbShimmerFeedback, 0, 0, 1);
  params[23] = boundedNumber(state.reverbWarp, 0, 0, 1);
  params[24] = boundedNumber(state.reverbCrossFeed, 0, 0, 1);
  params[25] = boundedNumber(state.reverbEarlyReflections, 0.3, 0, 1);
  params[26] = boundedNumber(state.reverbAirAbsorption, 0.2, 0, 1);
  params[27] = state.reverbSaturationMode === 'tape' ? 1 : state.reverbSaturationMode === 'tube' ? 2 : 0;
  params[28] = boundedNumber(state.reverbTransientSmooth, 0, 0, 1);
  params[29] = boundedNumber(state.reverbErLpFreq, 2500, 20, 20000);

  const gainKey = [
    pad1SendGain,
    pad2SendGain,
    preCompThresholdDb,
    preCompKneeDb,
    preCompRatio,
    preCompAttackMs,
    preCompReleaseMs,
    inputMakeupGain,
    returnGain,
  ]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(':');
  return {
    enabled,
    params,
    pad1SendGain,
    pad2SendGain,
    preCompThresholdDb,
    preCompKneeDb,
    preCompRatio,
    preCompAttackMs,
    preCompReleaseMs,
    inputMakeupGain,
    returnGain,
    configKey: enabled ? `reverb:${gainKey}:${paramConfigKey(params)}` : 'reverb:disabled-v1',
  };
}

function createSpectralFreezeModuleConfig(sliderState: SliderState): SpectralFreezeModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const enabled = booleanValue(state.spectralFreezeEnabled, false);
  const routing = state.spectralFreezeRouting === 'post' ? 'post' : 'pre';
  const reverbCrossfade = boundedNumber(state.spectralFreezeReverbCrossfade, 0.5, 0, 1);
  const params = Array.from({ length: SPECTRAL_FREEZE_MODULE_PARAM_COUNT }, () => 0);
  params[0] = booleanValue(state.spectralFreezeActive, false) ? 1 : 0;
  params[1] = booleanValue(state.spectralFreezeSlushy, false) ? 1 : 0;
  params[2] = boundedNumber(state.spectralFreezeSpeed, 0.3, 0, 1);
  params[3] = boundedNumber(state.spectralFreezeMix, 1, 0, 1);
  params[4] = 1 - boundedNumber(state.spectralFreezeDecay, 1, 0, 1);
  params[5] = boundedNumber(state.spectralFreezePhaseJitter, 0, 0, 1);
  const routingKey = [
    routing,
    Math.round(reverbCrossfade * 1_000_000) / 1_000_000,
  ].join(':');

  return {
    enabled,
    params,
    routing,
    reverbCrossfade,
    configKey: enabled ? `spectral-freeze:${routingKey}:${paramConfigKey(params)}` : 'spectral-freeze:disabled-v1',
  };
}

function createDelayAModuleConfig(sliderState: SliderState): DelayAModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const bpm = getEffectiveSequencerBpm(sliderState);
  const delayNoteL = typeof state.drumDelayNoteL === 'string' ? state.drumDelayNoteL : '1/8d';
  const delayNoteR = typeof state.drumDelayNoteR === 'string' ? state.drumDelayNoteR : '1/4';
  const pad1SendGain = booleanValue(state.padEnabled, true)
    ? boundedNumber(state.pad1DelayASend ?? state.padDelayASend, 0, 0, 1)
    : 0;
  const pad2SendGain = booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.pad2DelayASend ?? state.padDelayASend, 0, 0, 1)
    : 0;
  const lead1SendGain = booleanValue(state.leadEnabled, false)
    ? boundedNumber(state.lead1DelayASend, 0, 0, 1)
    : 0;
  const lead2SendGain = booleanValue(state.lead2Enabled, false)
    ? boundedNumber(state.lead2DelayASend, 0, 0, 1)
    : 0;
  const drumSendGain = booleanValue(state.drumEnabled, false)
    ? boundedNumber(state.drumDelayASend, 0, 0, 1)
    : 0;
  const soundscapeSendGain = Math.max(
    booleanValue(state.waterEnabled, false) ? boundedNumber(state.waterDelayASend, 0, 0, 1) : 0,
    booleanValue(state.oceanSampleEnabled, false) ? boundedNumber(state.oceanDelayASend, 0, 0, 1) : 0,
    booleanValue(state.insectsEnabled, false) || booleanValue(state.insects2Enabled, false)
      ? boundedNumber(state.insDelayASend, 0, 0, 1)
      : 0,
    booleanValue(state.birdsEnabled, false) ? boundedNumber(state.birdsDelayASend, 0, 0, 1) : 0,
    booleanValue(state.birds2Enabled, false) ? boundedNumber(state.birds2DelayASend, 0, 0, 1) : 0,
    booleanValue(state.frogsEnabled, false) ? boundedNumber(state.frogsDelayASend, 0, 0, 1) : 0,
    boundedNumber(state.natureDelayASend, 0, 0, 1),
  );
  const granularDelayASend = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state.granularDelayASend, 0, 0, 1)
    : 0;
  const enabled = pad1SendGain > 0.0001 ||
    pad2SendGain > 0.0001 ||
    lead1SendGain > 0.0001 ||
    lead2SendGain > 0.0001 ||
    drumSendGain > 0.0001 ||
    soundscapeSendGain > 0.0001 ||
    granularDelayASend > 0.0001 ||
    boundedNumber(state.delayBToASend, 0, 0, 1) > 0.0001;
  const delayModDepth = boundedNumber(state.delayAModDepth, 0, 0, 1);
  const delayCrossFeedFilter = boundedNumber(state.delayACrossFeedFilter, 1, 0, 1);
  const delayAToB = boundedNumber(state.delayAToBSend, 0, 0, 1);
  const delayBToA = boundedNumber(state.delayBToASend, 0, 0, 1);
  const crossFeedProduct = delayAToB * delayBToA;
  const safeAToB = crossFeedProduct > 0.4
    ? delayAToB * Math.sqrt(0.4 / crossFeedProduct)
    : delayAToB;

  const params = Array.from({ length: DELAY_A_MODULE_PARAM_COUNT }, () => 0);
  params[0] = enabled ? 1 : 0;
  params[1] = delayNoteToSeconds(delayNoteL, bpm) * 1000;
  params[2] = delayNoteToSeconds(delayNoteR, bpm) * 1000;
  params[3] = boundedNumber(state.delayAFeedback, 0.4, 0, 0.95);
  params[4] = boundedNumber(state.delayAMix, 0.35, 0, 1);
  params[5] = boundedNumber(state.delayAFilter, 2000, 200, 12000);
  params[6] = enumParam(state.delayAFilterType, DELAY_A_FILTER_TYPE_VALUES, 0);
  params[7] = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.delayAReverbSend, 0.4, 0, 1)
    : 0;
  params[8] = delayModDepth > 0 ? 0.05 + boundedNumber(state.delayAModRate, 0, 0, 1) * 4.95 : 0;
  params[9] = delayModDepth * 50;
  params[10] = booleanValue(state.delayAPingPong, false) ? 1 : 0;
  params[11] = boundedNumber(state.delayADuck, 0, 0, 1);
  params[12] = boundedNumber(state.delayAWidth, 0.5, 0, 1);
  params[13] = safeAToB;
  params[14] = 200 * Math.pow(40, delayCrossFeedFilter);
  params[15] = boundedNumber(state.delayAGranularSend, 0, 0, 1);

  const gainKey = [pad1SendGain, pad2SendGain, lead1SendGain, lead2SendGain, drumSendGain, soundscapeSendGain]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(':');
  return {
    enabled,
    params,
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    configKey: enabled ? `delay-a:${gainKey}:${paramConfigKey(params)}` : 'delay-a:disabled-v1',
  };
}

function createDelayBModuleConfig(sliderState: SliderState): DelayBModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const bpm = getEffectiveSequencerBpm(sliderState);
  const delayBArmed = booleanValue(state.granularDelayEnabled, false);
  const pad1SendGain = delayBArmed && booleanValue(state.padEnabled, true)
    ? boundedNumber(state.pad1DelayBSend ?? state.padDelayBSend, 0, 0, 1)
    : 0;
  const pad2SendGain = delayBArmed && booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.pad2DelayBSend ?? state.padDelayBSend, 0, 0, 1)
    : 0;
  const lead1SendGain = delayBArmed && booleanValue(state.leadEnabled, false)
    ? boundedNumber(state.lead1DelayBSend, 0, 0, 1)
    : 0;
  const lead2SendGain = delayBArmed && booleanValue(state.lead2Enabled, false)
    ? boundedNumber(state.lead2DelayBSend, 0, 0, 1)
    : 0;
  const drumSendGain = delayBArmed && booleanValue(state.drumEnabled, false)
    ? boundedNumber(state.drumDelayBSend, 0, 0, 1)
    : 0;
  const soundscapeSendGain = delayBArmed
    ? Math.max(
      booleanValue(state.waterEnabled, false) ? boundedNumber(state.waterDelayBSend, 0, 0, 1) : 0,
      booleanValue(state.oceanSampleEnabled, false) ? boundedNumber(state.oceanDelayBSend, 0, 0, 1) : 0,
      booleanValue(state.insectsEnabled, false) || booleanValue(state.insects2Enabled, false)
        ? boundedNumber(state.insDelayBSend, 0, 0, 1)
        : 0,
      booleanValue(state.birdsEnabled, false) ? boundedNumber(state.birdsDelayBSend, 0, 0, 1) : 0,
      booleanValue(state.birds2Enabled, false) ? boundedNumber(state.birds2DelayBSend, 0, 0, 1) : 0,
      booleanValue(state.frogsEnabled, false) ? boundedNumber(state.frogsDelayBSend, 0, 0, 1) : 0,
      boundedNumber(state.natureDelayBSend, 0, 0, 1),
    )
    : 0;
  const delayAToB = delayBArmed ? boundedNumber(state.delayAToBSend, 0, 0, 1) : 0;
  const delayBToA = delayBArmed ? boundedNumber(state.delayBToASend, 0, 0, 1) : 0;
  const crossFeedProduct = delayAToB * delayBToA;
  const safeBToA = crossFeedProduct > 0.4
    ? delayBToA * Math.sqrt(0.4 / crossFeedProduct)
    : delayBToA;
  const delayBGranularSend = delayBArmed ? boundedNumber(state.delayBGranularSend, 0, 0, 1) : 0;
  const granularInputGain = delayBArmed && booleanValue(state.granularEnabled, false) && delayBGranularSend < 0.0001
    ? boundedNumber(state.granularDelayBSend, 0, 0, 1)
    : 0;
  const enabled = delayBArmed && (
    pad1SendGain > 0.0001 ||
    pad2SendGain > 0.0001 ||
    lead1SendGain > 0.0001 ||
    lead2SendGain > 0.0001 ||
    drumSendGain > 0.0001 ||
    soundscapeSendGain > 0.0001 ||
    granularInputGain > 0.0001 ||
    delayAToB > 0.0001
  );
  const delayNote = typeof state.granularDelayTime === 'string' ? state.granularDelayTime : '1/4';
  const baseMs = delayNoteToSeconds(delayNote, bpm) * 1000;
  const spread = boundedNumber(state.delayBSpread, 0.5, 0, 1);
  const tone = boundedNumber(state.granularDelayFilter, 0.5, 0, 1);
  const vibrato = boundedNumber(state.granularDelayVibrato, 0, 0, 1);
  const macroModel = computeGranularMacroModel(sliderState, (key, fallback) =>
    boundedNumber(state[key], fallback, 0, 1),
  );
  const params = Array.from({ length: DELAY_B_MODULE_PARAM_COUNT }, () => 0);
  params[0] = enabled ? 1 : 0;
  params[1] = boundedNumber(state.granularDelayActivity, 0.3, 0, 1);
  params[2] = boundedNumber(state.granularDelayRepeats, 0.3, 0, 0.85);
  params[3] = baseMs;
  params[4] = tone;
  params[5] = vibrato;
  params[6] = boundedNumber(state.granularDelayMix, 1, 0, 1);
  params[7] = enabled && booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.granularDelayReverbSend, 0.4, 0, 1)
    : 0;
  params[8] = enabled && granularInputGain < 0.0001 ? delayBGranularSend : 0;
  params[9] = safeBToA;
  params[10] = enumParam(macroModel.spaceMode, DELAY_B_SPACE_MODE_VALUES, 0);
  params[11] = enumParam(state.delayBPattern, DELAY_B_PATTERN_VALUES, 0);
  params[12] = enumParam(state.delayBWarp, DELAY_B_WARP_VALUES, 0);
  params[13] = boundedNumber(state.delayBWarpIntensity, 0.5, 0, 1);
  params[14] = spread;
  params[15] = 0;

  const gainKey = [
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    granularInputGain,
  ]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(':');
  return {
    enabled,
    params,
    pad1SendGain,
    pad2SendGain,
    lead1SendGain,
    lead2SendGain,
    drumSendGain,
    soundscapeSendGain,
    granularInputGain,
    configKey: enabled ? `delay-b:${gainKey}:${paramConfigKey(params)}` : 'delay-b:disabled-v1',
  };
}

export class CoreEngineHost {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isRunning = false;
  private isStarting = false;
  private perfMonitorEnabled = false;
  private perfData: Record<string, PerfMetrics> = {};
  private onPerfUpdate: ((data: Record<string, PerfMetrics>) => void) | null = null;
  private onStateChange: ((state: EngineState) => void) | null = null;
  private snapshotOptions: CoreEngineHostUpdateOptions = {};
  private lastSliderState: SliderState | null = null;
  private lastDynamicsModuleConfigKey: string | null = null;
  private lastPreviewSourceConfigKey: string | null = null;
  private lastAuxPreviewSourceConfigKeys: Record<CoreAuxSourceSlot, string | null> = {
    lead: null,
    drum: null,
    soundscapes: null,
  };
  private lastReverbModuleConfigKey: string | null = null;
  private lastDelayAModuleConfigKey: string | null = null;
  private lastDelayBModuleConfigKey: string | null = null;
  private lastGranularModuleConfigKey: string | null = null;
  private lastSpectralFreezeModuleConfigKey: string | null = null;
  private manualPadVoiceCursor: Record<'pad1' | 'pad2', number> = { pad1: 0, pad2: 0 };

  async start(sliderState: SliderState, options?: CoreEngineHostUpdateOptions): Promise<void> {
    if (this.isStarting) return;
    if (this.isRunning) {
      this.updateParams(sliderState, options);
      return;
    }

    this.isStarting = true;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported in this browser');
      }

      this.ctx = new AudioContextClass({ latencyHint: 'interactive' });
      const [coreWasmBinary] = await Promise.all([
        fetchCoreWasmBinary(),
        this.ctx.audioWorklet.addModule(coreWorkletUrl),
      ]);

      this.node = new AudioWorkletNode(this.ctx, 'kessho-core', {
        numberOfInputs: 0,
        numberOfOutputs: 9,
        outputChannelCount: [2, 2, 2, 2, 2, 2, 2, 2, 2],
        processorOptions: {
          wasmBinary: coreWasmBinary,
        },
      });
      this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);

      this.masterGain = new GainNode(this.ctx, { gain: 0 });
      this.limiter = new DynamicsCompressorNode(this.ctx, {
        threshold: -3,
        knee: 0,
        ratio: 20,
        attack: 0.001,
        release: 0.1,
      });
      this.analyser = new AnalyserNode(this.ctx, { fftSize: 1024 });
      this.node.connect(this.masterGain).connect(this.limiter).connect(this.analyser).connect(this.ctx.destination);

      await this.waitForReady();
      this.applyCoreState(sliderState, options);
      this.node.port.postMessage({ type: 'enablePerf', enabled: this.perfMonitorEnabled });
      this.node.port.postMessage({ type: 'start' });

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isRunning = true;
      this.notifyStateChange();
    } finally {
      this.isStarting = false;
    }
  }

  stop(): void {
    if (!this.isRunning && !this.isStarting && !this.ctx) return;

    try {
      this.node?.port.postMessage({ type: 'stop' });
      this.node?.port.close();
      this.node?.disconnect();
      this.masterGain?.disconnect();
      this.limiter?.disconnect();
      this.analyser?.disconnect();
      void this.ctx?.close();
    } catch {
      // Best-effort shutdown; stale worklet ports are expected during teardown.
    }

    this.node = null;
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
    this.ctx = null;
    this.isRunning = false;
    this.isStarting = false;
    this.lastDynamicsModuleConfigKey = null;
    this.lastPreviewSourceConfigKey = null;
    this.lastAuxPreviewSourceConfigKeys = {
      lead: null,
      drum: null,
      soundscapes: null,
    };
    this.lastReverbModuleConfigKey = null;
    this.lastDelayAModuleConfigKey = null;
    this.lastDelayBModuleConfigKey = null;
    this.lastGranularModuleConfigKey = null;
    this.lastSpectralFreezeModuleConfigKey = null;
    this.perfData = {};
    this.onPerfUpdate?.({});
    this.notifyStateChange();
  }

  dispose(): void {
    this.stop();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resetSonicParityFx(): void {
    this.node?.port.postMessage({ type: 'resetParityFx' });
  }

  updateParams(sliderState: SliderState, options?: CoreEngineHostUpdateOptions): void {
    this.applyCoreState(sliderState, options);
  }

  pushMidiMessage(message: KesshoMidiMessage): void {
    const context = this.ctx;
    const node = this.node;
    if (!context || !node) return;

    const event = toKesshoCoreMidiEventPayload(message, {
      sampleRate: context.sampleRate,
      currentTimeSeconds: context.currentTime,
    });
    node.port.postMessage({ type: 'midiEvent', event });
  }

  private pickManualPadVoice(source: 'pad1' | 'pad2', sliderState: SliderState): number {
    const pool = getManualPadVoicePool(source, sliderState);
    const cursor = this.manualPadVoiceCursor[source] % pool.length;
    const voiceIndex = pickManualPadVoice(source, sliderState, cursor);
    this.manualPadVoiceCursor[source] = (cursor + 1) % pool.length;
    return voiceIndex;
  }

  async auditionSynthNote(note: ManualSynthNoteOptions, externalState?: SliderState): Promise<void> {
    const source = note.source === 'pad2'
      ? 'pad2'
      : note.source === 'pad1'
        ? 'pad1'
        : note.source === 'lead2'
          ? 'lead2'
          : note.source === 'lead1'
            ? 'lead1'
            : null;
    if (!source) return;

    const baseSliderState = externalState ?? this.lastSliderState;
    if (!baseSliderState) return;

    const sliderState = source === 'lead1'
      ? { ...baseSliderState, leadEnabled: true }
      : source === 'lead2'
        ? { ...baseSliderState, lead2Enabled: true }
        : baseSliderState;
    if (!sliderState) return;

    if (!this.isRunning && !this.isStarting) {
      await this.start(sliderState);
    }

    const node = this.node;
    if (!node) return;

    if (source === 'lead1' || source === 'lead2') {
      const { config, triggerNote } = createManualLeadSourceConfig(sliderState, source, note);
      this.configureDelayAModule(createDelayAModuleConfig(sliderState));
      this.configureDelayBModule(createDelayBModuleConfig(sliderState));
      this.configureGranularModule(createGranularModuleConfig(sliderState));
      this.configureReverbModule(createReverbModuleConfig(sliderState));
      this.configureSpectralFreezeModule(createSpectralFreezeModuleConfig(sliderState));
      this.configureAuxPreviewSource('lead', config);
      node.port.postMessage({
        type: 'triggerAuxSourceNote',
        slot: 'lead',
        note: triggerNote,
      });
      return;
    }

    const voiceIndex = this.pickManualPadVoice(source, getEffectivePadState(sliderState));
    const { config, triggerNote } = createManualPadSourceConfig(sliderState, source, note, voiceIndex);
    this.configurePreviewSource(config);
    node.port.postMessage({
      type: 'triggerSourceNote',
      note: triggerNote,
    });
  }

  async auditionSynthNotes(notes: ManualSynthNoteOptions[], externalState?: SliderState): Promise<void> {
    if (!Array.isArray(notes) || notes.length === 0) return;

    const firstSource = notes[0]?.source;
    const canBatchPad = (
      (firstSource === 'pad1' || firstSource === 'pad2') &&
      notes.every((note) => note.source === firstSource)
    );
    if (!canBatchPad) {
      for (const note of notes) {
        await this.auditionSynthNote(note, externalState);
      }
      return;
    }

    const source = firstSource as 'pad1' | 'pad2';
    const sliderState = externalState ?? this.lastSliderState;
    if (!sliderState) return;

    if (!this.isRunning && !this.isStarting) {
      await this.start(sliderState);
    }

    const node = this.node;
    if (!node) return;

    const triggerNotes: PreviewNote[] = [];
    for (const note of notes) {
      const voiceIndex = this.pickManualPadVoice(source, getEffectivePadState(sliderState));
      const { config, triggerNote } = createManualPadSourceConfig(sliderState, source, note, voiceIndex);
      this.configurePreviewSource(config);
      triggerNotes.push(triggerNote);
    }
    for (const triggerNote of triggerNotes) {
      node.port.postMessage({
        type: 'triggerSourceNote',
        note: triggerNote,
      });
    }
  }

  setPerfMonitorEnabled(enabled: boolean): void {
    this.perfMonitorEnabled = enabled;
    this.node?.port.postMessage({ type: 'enablePerf', enabled });
  }

  setPerfUpdateCallback(callback: ((data: Record<string, PerfMetrics>) => void) | null): void {
    this.onPerfUpdate = callback;
    if (callback) {
      callback({ ...this.perfData });
    }
  }

  setStateChangeCallback(callback: ((state: EngineState) => void) | null): void {
    this.onStateChange = callback;
    this.notifyStateChange();
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  getLimiterNode(): DynamicsCompressorNode | null {
    return this.limiter;
  }

  getMediaStream(): MediaStream | null {
    return null;
  }

  getRecordableBusNodes(): Record<string, RecordableTrackSource> {
    return {
      pad1: { node: this.node, outputIndex: 3 },
      pad2: { node: this.node, outputIndex: 4 },
      pad1Pre: { node: this.node, outputIndex: 5 },
      reverbFeed: { node: this.node, outputIndex: 6 },
      lead1: { node: this.node, outputIndex: 7 },
      lead2: { node: this.node, outputIndex: 8 },
      reverb: { node: this.node, outputIndex: 1 },
      delayAOut: { node: this.node, outputIndex: 2 },
      dynamics: { node: this.masterGain },
    };
  }

  getState(): EngineState {
    return {
      isRunning: this.isRunning,
      harmonyState: null,
      currentSeed: 1,
      currentBucket: 'core-wasm',
      currentFilterFreq: 0,
      currentLfoValue: 0,
      currentLfo2Value: 0,
      cofCurrentStep: 0,
      fxOwners: emptyFxOwners(),
      transportDebug: null,
    };
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const node = this.node;
      if (!node) {
        reject(new Error('KesshoCore node was not created'));
        return;
      }

      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out waiting for KesshoCore worklet'));
      }, 5000);

      const previousHandler = node.port.onmessage;
      node.port.onmessage = (event) => {
        const message = event.data;
        if (message?.type === 'ready') {
          window.clearTimeout(timeout);
          node.port.onmessage = (nextEvent) => this.handleWorkletMessage(nextEvent.data);
          resolve();
          return;
        }
        if (message?.type === 'error') {
          window.clearTimeout(timeout);
          reject(new Error(String(message.message ?? 'KesshoCore worklet error')));
          return;
        }
        if (typeof previousHandler === 'function') {
          previousHandler.call(node.port, event);
        }
      };
    });
  }

  private applyCoreState(sliderState: SliderState, options?: CoreEngineHostUpdateOptions): void {
    const context = this.ctx;
    const node = this.node;
    const masterGain = this.masterGain;
    this.lastSliderState = sliderState;

    if (options?.presetId || options?.presetName || typeof options?.seed === 'number') {
      this.snapshotOptions = {
        ...this.snapshotOptions,
        ...options,
      };
    }

    if (!context || !node || !masterGain) return;

    const snapshot = createKesshoEngineSnapshot(sliderState, this.snapshotOptions);
    const scalars = toKesshoCorePresetPreviewScalarsV1(snapshot);
    const bpm = clamp(finiteNumber(scalars.bpm, 120), 40, 300);
    const state = sliderState as unknown as Record<string, unknown>;
    const masterLevel = clamp(
      finiteNumber(state.masterVolume, DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM,
      0,
      1.5,
    );
    const padState = getEffectivePadState(sliderState);
    const previewSources = createCorePreviewSourceGroup(padState);
    const reverbConfig = createReverbModuleConfig(padState);
    const delayAConfig = createDelayAModuleConfig(padState);
    const delayBConfig = createDelayBModuleConfig(padState);
    const granularConfig = createGranularModuleConfig(padState);
    const spectralFreezeConfig = createSpectralFreezeModuleConfig(padState);
    const coreSnapshot = {
      ...scalars,
      masterGain: 1,
      renderMode: 0,
      smokeFrequencyHz: clamp(finiteNumber(scalars.smokeFrequencyHz, bpm * 2), 80, 880),
      smokeAmplitude: 0,
    };
    const dynamicsTargets = resolveDynamicsTargets(sliderState, context.sampleRate);

    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setTargetAtTime(masterLevel, context.currentTime, 0.015);
    node.port.postMessage({ type: 'applySnapshot', snapshot: coreSnapshot });
    this.configurePreviewSources(previewSources);
    this.configureDelayAModule(delayAConfig);
    this.configureDelayBModule(delayBConfig);
    this.configureGranularModule(granularConfig);
    this.configureReverbModule(reverbConfig);
    this.configureSpectralFreezeModule(spectralFreezeConfig);
    this.configureDynamicsModule(dynamicsTargets);
  }

  private configurePreviewSource(config: PreviewSourceConfig | null): void {
    const node = this.node;
    if (!node) return;

    const configKey = config?.configKey ?? 'none';
    if (this.lastPreviewSourceConfigKey === configKey) return;

    this.lastPreviewSourceConfigKey = configKey;
    node.port.postMessage(config ? {
      type: 'configureSource',
      ...config,
    } : {
      type: 'configureSource',
      enabled: false,
      source: 'none',
    });
  }

  private configureAuxPreviewSource(slot: CoreAuxSourceSlot, config: PreviewSourceConfig | null): void {
    const node = this.node;
    if (!node) return;

    const configKey = config?.configKey ?? 'none';
    if (this.lastAuxPreviewSourceConfigKeys[slot] === configKey) return;

    this.lastAuxPreviewSourceConfigKeys[slot] = configKey;
    node.port.postMessage(config ? {
      type: 'configureAuxSource',
      slot,
      ...config,
    } : {
      type: 'configureAuxSource',
      slot,
      enabled: false,
      source: 'none',
    });
  }

  private configurePreviewSources(group: PreviewSourceGroup): void {
    this.configurePreviewSource(group.primary);
    for (const { slot, config } of group.aux) {
      this.configureAuxPreviewSource(slot, config);
    }
  }

  private configureDynamicsModule(targets: ReturnType<typeof resolveDynamicsTargets>): void {
    const node = this.node;
    if (!node) return;

    const enabled = targets.routing.characterPathActive;
    const params = enabled ? toDynamicsCharacterParamArray(targets) : undefined;
    const configKey = enabled ? `dynamics-character:${paramConfigKey(params ?? [])}` : DYNAMICS_CHARACTER_DISABLED_CONFIG_KEY;
    if (this.lastDynamicsModuleConfigKey === configKey) return;

    this.lastDynamicsModuleConfigKey = configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'dynamics-character',
      enabled,
      params,
    });
  }

  private configureReverbModule(config: ReverbModuleConfig): void {
    const node = this.node;
    if (!node) return;

    if (this.lastReverbModuleConfigKey === config.configKey) return;

    this.lastReverbModuleConfigKey = config.configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'reverb',
      enabled: config.enabled,
      params: config.enabled ? config.params : undefined,
      pad1SendGain: config.pad1SendGain,
      pad2SendGain: config.pad2SendGain,
      preCompThresholdDb: config.preCompThresholdDb,
      preCompKneeDb: config.preCompKneeDb,
      preCompRatio: config.preCompRatio,
      preCompAttackMs: config.preCompAttackMs,
      preCompReleaseMs: config.preCompReleaseMs,
      inputMakeupGain: config.inputMakeupGain,
      returnGain: config.returnGain,
    });
  }

  private configureDelayAModule(config: DelayAModuleConfig): void {
    const node = this.node;
    if (!node) return;

    if (this.lastDelayAModuleConfigKey === config.configKey) return;

    this.lastDelayAModuleConfigKey = config.configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'delay-a',
      enabled: config.enabled,
      params: config.enabled ? config.params : undefined,
      pad1SendGain: config.pad1SendGain,
      pad2SendGain: config.pad2SendGain,
      lead1SendGain: config.lead1SendGain,
      lead2SendGain: config.lead2SendGain,
      drumSendGain: config.drumSendGain,
      soundscapeSendGain: config.soundscapeSendGain,
    });
  }

  private configureDelayBModule(config: DelayBModuleConfig): void {
    const node = this.node;
    if (!node) return;

    if (this.lastDelayBModuleConfigKey === config.configKey) return;

    this.lastDelayBModuleConfigKey = config.configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'delay-b',
      enabled: config.enabled,
      params: config.enabled ? config.params : undefined,
      pad1SendGain: config.pad1SendGain,
      pad2SendGain: config.pad2SendGain,
      lead1SendGain: config.lead1SendGain,
      lead2SendGain: config.lead2SendGain,
      drumSendGain: config.drumSendGain,
      soundscapeSendGain: config.soundscapeSendGain,
      granularInputGain: config.granularInputGain,
    });
  }

  private configureGranularModule(config: GranularModuleConfig): void {
    const node = this.node;
    if (!node) return;

    if (this.lastGranularModuleConfigKey === config.configKey) return;

    this.lastGranularModuleConfigKey = config.configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'granular',
      enabled: config.enabled,
      params: config.enabled ? config.params : undefined,
      pad1SendGain: config.pad1SendGain,
      pad2SendGain: config.pad2SendGain,
      lead1SendGain: config.lead1SendGain,
      lead2SendGain: config.lead2SendGain,
      drumSendGain: config.drumSendGain,
      soundscapeSendGain: config.soundscapeSendGain,
      delayASendGain: config.delayASendGain,
      outputGain: config.outputGain,
      reverbSendGain: config.reverbSendGain,
      delayAOutputSendGain: config.delayAOutputSendGain,
      outputLpfHz: config.outputLpfHz,
    });
  }

  private configureSpectralFreezeModule(config: SpectralFreezeModuleConfig): void {
    const node = this.node;
    if (!node) return;

    if (this.lastSpectralFreezeModuleConfigKey === config.configKey) return;

    this.lastSpectralFreezeModuleConfigKey = config.configKey;
    node.port.postMessage({
      type: 'configureModule',
      module: 'spectral-freeze',
      enabled: config.enabled,
      params: config.enabled ? config.params : undefined,
      routing: config.routing,
      reverbCrossfade: config.reverbCrossfade,
    });
  }

  private handleWorkletMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const message = data as CoreWorkletMessage;

    if (message.type === 'error') {
      console.warn('[KesshoCore]', message.message);
      return;
    }

    if (message.type !== 'perf' || typeof message.name !== 'string' || typeof message.cpuPercent !== 'number') {
      return;
    }

    const avgPercent = Math.round(message.cpuPercent * 10) / 10;
    const peakPercent = Math.round(finiteNumber(message.peakPercent, message.cpuPercent) * 10) / 10;
    const missPercent = Math.round(finiteNumber(message.missPercent, 0) * 10) / 10;
    this.perfData[message.name] = {
      avgPercent,
      peakPercent,
      missPercent,
      scope: 'worklet',
    };
    this.perfData['kessho-core-events'] = {
      avgPercent: finiteNumber(message.eventQueueDepth, 0),
      peakPercent: finiteNumber(message.midiQueueDepth, 0),
      missPercent: null,
      scope: 'source',
    };
    this.onPerfUpdate?.({ ...this.perfData });
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getState());
  }
}

export const coreEngineHost = new CoreEngineHost();

(window as unknown as Record<string, unknown>).__coreEngineHost = coreEngineHost;
