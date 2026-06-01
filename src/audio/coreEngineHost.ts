/**
 * REFERENCE HOST / A-B TESTING PATH
 *
 * This file is not the preferred Product Core production host.
 * It remains active for core-smoke, web-ts comparison, product-test,
 * parity validation, smoke tests, and other A/B workflows.
 *
 * Do not add new production dependencies here.
 * Status: Keep Active — Archive Later
 */

import type {
  DynamicsAnalyserKey,
  DynamicsVisualTelemetrySnapshot,
  EarthTextureDebugState,
  EngineState,
  FxOwnershipDebugState,
  ManualSynthNoteOptions,
  RecordableTrackSource,
} from './reference/webTs/engine';
import {
  createKesshoEngineSnapshot,
  toKesshoCorePresetPreviewScalarsV1,
} from './coreSnapshot';
import { delayNoteToSeconds } from './delayBuses';
import { resolveDynamicsTargets } from './dynamicsModel';
import { toDynamicsCharacterParamArray } from './dynamicsCharacterParams';
import { toKesshoCoreMidiEventPayload } from './coreMidiEvents';
import { EarthTexturePlayer } from './earthTexturePlayer';
import {
  applyDistanceValue,
  applyLeadDistanceEnvelope,
  applyPadDistanceToState,
  applyPianoDistanceEnvelope,
  getVoiceDistanceValue,
} from './distanceMacro';
import {
  DEFAULT_GAMELAN,
  DEFAULT_SOFT_RHODES,
  morphPresets,
  type Lead4opFMMorphedParams,
  type Lead4opFMPreset,
} from './lead4opfm';
import {
  resolveDrumEuclidPatternParams,
  seqEuclidean,
  seqLaneIndex,
} from './drumSequencer';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern } from './euclideanPatterns';
import { sequencerClockDivisionToSeconds } from './sequencerClockDivisions';
import { normalizeSequencerPitchBindingMode } from './sequencerPitchBinding';
import { normalizeSequencerPitchSettings, type SequencerPitchSettings } from './sequencerPitchSettings';
import { normalizeSequencerSwing } from './sequencerSwing';
import {
  SCALES,
  type ClockDivision,
  type DrumStepOverrides,
  type LaneDirection,
  type PitchBindingMode,
  type PitchMode,
  type ScaleName,
  type TrigCondition,
} from './drumSeqTypes';
import type { DrumEuclidEvolveConfig, DrumVoiceType } from './drumSynth';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims';
import { computeGranularMacroModel } from './granularMacroModel';
import { getPadPreset, morphPadPresets, PAD1_TO_PAD2_KEY } from './padPresets';
import { createHarmonyState, getEffectiveTension, updateHarmonyState, type HarmonyParams, type HarmonyState } from './harmony';
import { computeSeed, createRng, getUtcBucket } from './rng';
import { getScaleNotesInRange, midiToFreq } from './scales';
import {
  getEffectiveSequencerBpm,
  getPhraseDurationForClockSource,
  getTimeUntilNextBoundaryWall,
  getTransportMetrics,
  resolveProgressionPhraseClockSource,
  sampleGlobalWalkPosition,
  type TransportAnchors,
  type TransportDebugSnapshot,
} from './transport';
import { morphWaterPresets, type WaterPresetState } from './waterPresets';
import {
  choosePianoSampleVariant,
  frequencyToMidiNote,
  getNearestPianoSample,
  getPianoSamplePath,
  PIANO_SAMPLE_COUNT,
  type PianoSampleVariant,
} from './pianoSamples';
import {
  captureSynthHomeSnapshot,
  defaultSynthEvolveConfig,
  defaultSynthEvolveState,
  evolveSynthLane,
  resetSynthLaneToHome,
  type SynthEvolveConfig,
  type SynthEvolveState,
  type SynthLaneOverrides,
} from './synthSeqEvolve';
import { clampSequencerRatchet } from './seqEvolveCore';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { DEFAULT_REVERB_PRE_COMP, getStateValueFromSliderNumber, quantize, type SliderState } from '../ui/state';

const DYNAMICS_CHARACTER_DISABLED_CONFIG_KEY = 'dynamics-character:disabled-v1';
const HOST_PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT = 16;
const CORE_SOFT_STOP_SOURCE_FADE_SECONDS = 0.18;
const CORE_SOFT_STOP_CLEANUP_DELAY_MS = Math.ceil(CORE_SOFT_STOP_SOURCE_FADE_SECONDS * 1000) + 120;
type CoreEvolvedAudioSubLane = 'pitch' | 'expression' | 'morph' | 'distance';
type CoreEvolvedSubLanePatch = Partial<Record<CoreEvolvedAudioSubLane, { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;
type CoreDrumEvolvedSubLane = CoreEvolvedAudioSubLane | 'slice' | 'reverse';
type CoreDrumEvolvedSubLanePatch = Partial<Record<CoreDrumEvolvedSubLane, { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;
type CoreSynthEvolveOverridesPayload = Partial<SynthLaneOverrides> & { swing?: number; subLaneStates?: CoreEvolvedSubLanePatch; pitchSettings?: (SequencerPitchSettings | null)[] };
type CoreDrumEvolveOverridesPayload = Partial<DrumStepOverrides> & { swing?: number; subLaneStates?: CoreDrumEvolvedSubLanePatch; pitchSettings?: (SequencerPitchSettings | null)[] };

function synthEvolvedSubLaneStatePatch(overrides: SynthLaneOverrides): CoreEvolvedSubLanePatch {
  const patch: CoreEvolvedSubLanePatch = {};
  const add = (lane: CoreEvolvedAudioSubLane, values: number[] | null, direction: LaneDirection | null): void => {
    if (!Array.isArray(values)) return;
    patch[lane] = {
      enabled: true,
      steps: Math.max(1, Math.min(16, values.length)),
      direction: direction ?? 'forward',
    };
  };
  add('pitch', overrides.pitch, overrides.pitchDirection);
  add('expression', overrides.expression, overrides.expressionDirection);
  add('morph', overrides.morph, overrides.morphDirection);
  add('distance', overrides.distance, overrides.distanceDirection);
  return patch;
}

function drumStepOverrideSubLaneStatePatch(
  overrides: DrumStepOverrides,
  laneIndex: number,
  fallback?: DrumStepOverrides,
): CoreDrumEvolvedSubLanePatch {
  const patch: CoreDrumEvolvedSubLanePatch = {};
  const add = (
    lane: CoreDrumEvolvedSubLane,
    valueKey: 'pitch' | 'expression' | 'morph' | 'distance' | 'slice' | 'reverse',
    directionKey: 'pitchDirection' | 'expressionDirection' | 'morphDirection' | 'distanceDirection' | 'sliceDirection' | 'reverseDirection',
  ): void => {
    const values = overrides[valueKey]?.[laneIndex] ?? null;
    const fallbackValues = fallback?.[valueKey]?.[laneIndex] ?? null;
    const direction = overrides[directionKey]?.[laneIndex] ?? fallback?.[directionKey]?.[laneIndex] ?? 'forward';
    patch[lane] = {
      enabled: Array.isArray(values),
      steps: Math.max(1, Math.min(16, Array.isArray(values)
        ? values.length
        : Array.isArray(fallbackValues) ? fallbackValues.length : 1)),
      direction,
    };
  };
  add('pitch', 'pitch', 'pitchDirection');
  add('expression', 'expression', 'expressionDirection');
  add('morph', 'morph', 'morphDirection');
  add('distance', 'distance', 'distanceDirection');
  add('slice', 'slice', 'sliceDirection');
  add('reverse', 'reverse', 'reverseDirection');
  return patch;
}

const resolvePublicSampleUrl = (relativePath: string): string => {
  const root = new URL(import.meta.env.BASE_URL, window.location.origin);
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return new URL(`samples/${encodedPath}`, root).toString();
};

const createInactiveHostExternalInputActivity = (): CoreHostExternalInputActivity => ({
  reverbActive: false,
  delayAActive: false,
  delayBActive: false,
  granularActive: false,
});

const mergeHostExternalInputActivity = (
  left: CoreHostExternalInputActivity,
  right: CoreHostExternalInputActivity,
): CoreHostExternalInputActivity => ({
  reverbActive: left.reverbActive || right.reverbActive,
  delayAActive: left.delayAActive || right.delayAActive,
  delayBActive: left.delayBActive || right.delayBActive,
  granularActive: left.granularActive || right.granularActive,
});

function createCoreHostHaasWidenedBus(
  ctx: AudioContext,
  input: AudioNode,
  options: {
    delayMs: number;
    sideGain: number;
    centerGain: number;
    pan?: number;
  },
): GainNode {
  const output = ctx.createGain();
  output.gain.value = 1;

  const center = ctx.createGain();
  center.gain.value = options.centerGain;
  input.connect(center);
  center.connect(output);

  const panAmount = options.pan ?? 1;

  const leftGain = ctx.createGain();
  leftGain.gain.value = options.sideGain;
  const leftPanner = ctx.createStereoPanner();
  leftPanner.pan.value = -panAmount;
  input.connect(leftGain);
  leftGain.connect(leftPanner);
  leftPanner.connect(output);

  const rightDelay = ctx.createDelay(0.05);
  rightDelay.delayTime.value = Math.max(0, Math.min(0.05, options.delayMs / 1000));
  const rightGain = ctx.createGain();
  rightGain.gain.value = options.sideGain;
  const rightPanner = ctx.createStereoPanner();
  rightPanner.pan.value = panAmount;
  input.connect(rightDelay);
  rightDelay.connect(rightGain);
  rightGain.connect(rightPanner);
  rightPanner.connect(output);

  return output;
}

function coreHostBiquadFilterType(value: unknown): BiquadFilterType {
  return value === 'lowpass' || value === 'highpass' || value === 'bandpass' || value === 'notch' ||
    value === 'lowshelf' || value === 'highshelf' || value === 'peaking' || value === 'allpass'
    ? value
    : 'lowpass';
}

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

type ActiveHostPianoVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode | null;
};

type CoreHostExternalInputActivity = {
  reverbActive: boolean;
  delayAActive: boolean;
  delayBActive: boolean;
  granularActive: boolean;
};

type HostEarthTextureRuntime = {
  player: EarthTexturePlayer;
  sourceBus: GainNode;
  gateGain: GainNode;
  preFaderBus: GainNode;
  levelGain: GainNode;
  reverbSend: GainNode;
  delayASend: GainNode;
  delayBSend: GainNode;
  granularSend: GainNode;
  filter: BiquadFilterNode | null;
  stopTimer: number | null;
};

type PreviewNote = {
  frequency: number;
  velocity: number;
  route: number;
  delaySeconds: number;
  holdSeconds?: number;
  paramsOverride?: number[];
  morphOverride?: number | null;
  distanceOverride?: number | null;
  pitchOverride?: number | null;
  ratchetDecayCap?: number;
  ratchetAttackCap?: number;
};

type PreviewSourceConfig = {
  enabled: boolean;
  source: 'pad' | 'lead-fm' | 'drum' | 'soundscapes';
  params: number[];
  pad1PostLpfHz: number;
  pad1StereoWidth: number;
  pad2PostLpfHz: number;
  pad2StereoWidth: number;
  postLpfStages?: number;
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
  initialStartDelaySeconds?: number;
};

type CoreAuxSourceSlot = 'lead' | 'drum' | 'soundscapes';

type PreviewSourceGroup = {
  synthEuclid: CoreSynthEuclidPreview;
  hostPiano: CoreHostPianoPreview;
  primary: PreviewSourceConfig | null;
  aux: Array<{
    slot: CoreAuxSourceSlot;
    config: PreviewSourceConfig | null;
  }>;
};

type CoreSynthEuclidGeneratedNote = PreviewNote & {
  source: string;
  midi: number;
  laneIndex: number;
  ratchetFactor?: number;
};

type CoreLeadRandomPreview = {
  leadChords: CoreSynthEuclidGeneratedNote[][];
  pianoChords: CoreSynthEuclidGeneratedNote[][];
  loopSeconds: number;
  initialStartDelaySeconds: number;
  noteKey: string;
};

type CoreHostPianoPreview = {
  chords: PreviewNote[][];
  loopSeconds: number;
  initialStartDelaySeconds: number;
  noteKey: string;
};

type CoreSynthEuclidStepOverrides = {
  pitch: (number[] | null)[];
  pitchDirection: (LaneDirection | null)[];
  triggerToggles: Map<number, boolean>[];
  expression: (number[] | null)[];
  expressionDirection: (LaneDirection | null)[];
  expressionRanges: ({ min: number; max: number } | null)[];
  morph: (number[] | null)[];
  morphDirection: (LaneDirection | null)[];
  morphRanges: ({ min: number; max: number } | null)[];
  distance: (number[] | null)[];
  distanceDirection: (LaneDirection | null)[];
  distanceRanges: ({ min: number; max: number } | null)[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: (TrigCondition[] | null)[];
};

type CoreSynthEuclidPreview = {
  padNotes: CoreSynthEuclidGeneratedNote[];
  leadNotes: CoreSynthEuclidGeneratedNote[];
  pianoNotes: CoreSynthEuclidGeneratedNote[];
  loopSeconds: number;
  initialStartDelaySeconds: number;
  noteKey: string;
};

type CoreSynthEuclidRuntime = {
  clockDivs: readonly ClockDivision[];
  swings: readonly number[];
  stepOverrides: CoreSynthEuclidStepOverrides;
  pitchSettings: readonly { mode: PitchMode; root: number; scale: ScaleName }[];
  pitchBindingModes: readonly PitchBindingMode[];
  subLaneEnabled: readonly Record<string, boolean>[];
  noteRangeOverrides: readonly ({ min: number; max: number } | null)[];
  evolveConfigs: readonly Partial<SynthEvolveConfig>[];
  evolveStates: readonly SynthEvolveState[];
};

type CoreDrumEuclidRuntime = {
  clockDivs: readonly ClockDivision[];
  swings: readonly number[];
  stepOverrides: DrumStepOverrides;
  subLaneEnabled: readonly Record<string, boolean>[];
  morphRanges: Readonly<Partial<Record<CoreDrumVoice, { min: number; max: number } | null>>>;
  paramSHRanges: ReadonlyMap<string, { min: number; max: number }>;
};

type RuntimeWalkRange = { min: number; max: number };
type RuntimeWalkState = { position: number; velocity: number };

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
  pianoSendGain: number;
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
  pianoSendGain: number;
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
  pianoSendGain: number;
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

function normalizeEvolveWriteOffset(value: unknown, fallback: number | 'auto'): number | 'auto' {
  if (value === 'auto') return 'auto';
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return fallback;
}

function mergeEvolveMethods<T extends string>(current: Record<T, boolean>, incoming: unknown): Record<T, boolean> {
  const methods: Record<string, boolean> = { ...current };
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [key, value] of Object.entries(incoming)) {
      methods[key] = value === true;
    }
  }
  return methods as Record<T, boolean>;
}

function mergeEvolveEnabledSubLanes(incoming: unknown, current: string[] | undefined): string[] | undefined {
  if (Array.isArray(incoming)) return incoming.filter((lane): lane is string => typeof lane === 'string');
  return current ? [...current] : undefined;
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
  | 'postLpfStages'
> {
  const state = sliderState as unknown as Record<string, unknown>;
  return {
    pad1PostLpfHz: boundedNumber(state.padPostLPF, 18000, 20, 20000),
    pad1StereoWidth: boundedNumber(state.padStereoWidth, 1, 0, 1),
    pad2PostLpfHz: boundedNumber(state.pad2PostLPF, 18000, 20, 20000),
    pad2StereoWidth: boundedNumber(state.pad2StereoWidth, 1, 0, 1),
    postLpfStages: 2,
  };
}

const PAD_MODULE_PARAM_COUNT = 108;
const PAD_PARAMS_PER_PAD = 53;
const PAD_VOICE_COUNT = 6;
const PAD_PREVIEW_FALLBACK_PRESET = 'saturated_drift';
const REVERB_MODULE_PARAM_COUNT = 31;
const DELAY_A_MODULE_PARAM_COUNT = 16;
const DELAY_B_MODULE_PARAM_COUNT = 24;
const GRANULAR_MODULE_PARAM_COUNT = 143;
const SPECTRAL_FREEZE_MODULE_PARAM_COUNT = 6;
const LEAD_FM_MODULE_PARAM_COUNT = 80;
const DRUM_MODULE_PARAM_COUNT = 126;
const CORE_DRUM_DRY_TRIM = 1.0;
const CORE_DRUM_INITIAL_CHORD_LEAD_SECONDS = 640 / 48000;
const CORE_SYNTH_LANE_INDICES = [0, 1, 2, 3] as const;
const CORE_DRUM_LANE_INDICES = CORE_SYNTH_LANE_INDICES;
const CORE_DRUM_EUCLID_CLOCK_DIVS: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4'];
const CORE_DRUM_EUCLID_SWINGS = [0, 0, 0, 0] as const;
const RUNTIME_RANDOM_WALK_INTERVAL_MS = 100;
const RANDOM_WALK_MAX_CATCHUP_STEPS = 600;
const CORE_SYNTH_EUCLID_CLOCK_DIVS: ClockDivision[] = ['1/8', '1/16', '1/8T', '1/4'];
const CORE_SYNTH_EUCLID_SWINGS = [0, 0, 0, 0] as const;
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
const DELAY_B_TAPE_SPACING_VALUES: Record<string, number> = { even: 0, triplet: 1, golden: 2, silver: 3 };
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
const DRUM_VOICE_STATE_PREFIX: Record<CoreDrumVoice, string> = {
  sub: 'drumSub',
  kick: 'drumKick',
  click: 'drumClick',
  beepHi: 'drumBeepHi',
  beepLo: 'drumBeepLo',
  noise: 'drumNoise',
  membrane: 'drumMembrane',
};
const DRUM_DELAY_SEND_KEYS = [
  'drumSubDelaySend',
  'drumKickDelaySend',
  'drumClickDelaySend',
  'drumBeepHiDelaySend',
  'drumBeepLoDelaySend',
  'drumNoiseDelaySend',
  'drumMembraneDelaySend',
] as const;

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
const SOUNDSCAPES_SEED_NO_CHANGE = -1;

function getCoreDrumDelaySendProfile(state: Record<string, unknown>): number {
  const sends = DRUM_DELAY_SEND_KEYS.map((key) => boundedNumber(state[key], 0, 0, 1));
  const average = sends.reduce((sum, value) => sum + value, 0) / sends.length;
  const peak = Math.max(...sends, 0);
  return boundedNumber(peak * 0.5 + average * 0.5, 0, 0, 1);
}

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
  ['drumMembranePitchEnv', DRUM_PARAM_INDEX.membrane + 0, null, 3],
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

function clockDivToSeconds(clockDiv: ClockDivision, beatDuration: number): number {
  return sequencerClockDivisionToSeconds(clockDiv, beatDuration);
}

function clonePreviewNotes(notes: readonly PreviewNote[]): PreviewNote[] {
  return notes.map((note) => ({ ...note }));
}

function createEmptyCoreSynthStepOverrides(): CoreSynthEuclidStepOverrides {
  return {
    pitch: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    expression: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    expressionRanges: [null, null, null, null],
    morph: [null, null, null, null],
    morphDirection: [null, null, null, null],
    morphRanges: [null, null, null, null],
    distance: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    distanceRanges: [null, null, null, null],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
  };
}

function createEmptyCoreDrumStepOverrides(): DrumStepOverrides {
  return {
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
    expression: [null, null, null, null],
    pitch: [null, null, null, null],
    morph: [null, null, null, null],
    distance: [null, null, null, null],
    slice: [null, null, null, null],
    reverse: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    morphDirection: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    sliceDirection: [null, null, null, null],
    reverseDirection: [null, null, null, null],
    expressionRanges: [null, null, null, null],
    morphRanges: [null, null, null, null],
    distanceRanges: [null, null, null, null],
  };
}

function cloneCoreDrumStepOverrides(overrides: DrumStepOverrides): DrumStepOverrides {
  return {
    triggerToggles: CORE_DRUM_LANE_INDICES.map((index) => new Map(overrides.triggerToggles[index] ?? [])),
    probability: CORE_DRUM_LANE_INDICES.map((index) => overrides.probability[index] ? [...overrides.probability[index]!] : null),
    ratchet: CORE_DRUM_LANE_INDICES.map((index) => overrides.ratchet[index] ? [...overrides.ratchet[index]!] : null),
    trigCondition: CORE_DRUM_LANE_INDICES.map((index) => overrides.trigCondition?.[index] ? overrides.trigCondition[index]!.map((entry) => [entry[0], entry[1]] as TrigCondition) : null),
    expression: CORE_DRUM_LANE_INDICES.map((index) => overrides.expression[index] ? [...overrides.expression[index]!] : null),
    pitch: CORE_DRUM_LANE_INDICES.map((index) => overrides.pitch?.[index] ? [...overrides.pitch[index]!] : null),
    morph: CORE_DRUM_LANE_INDICES.map((index) => overrides.morph[index] ? [...overrides.morph[index]!] : null),
    distance: CORE_DRUM_LANE_INDICES.map((index) => overrides.distance[index] ? [...overrides.distance[index]!] : null),
    slice: CORE_DRUM_LANE_INDICES.map((index) => overrides.slice?.[index] ? [...overrides.slice[index]!] : null),
    reverse: CORE_DRUM_LANE_INDICES.map((index) => overrides.reverse?.[index] ? [...overrides.reverse[index]!] : null),
    expressionDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.expressionDirection?.[index] ?? null),
    morphDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.morphDirection?.[index] ?? null),
    distanceDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.distanceDirection?.[index] ?? null),
    pitchDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.pitchDirection?.[index] ?? null),
    sliceDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.sliceDirection?.[index] ?? null),
    reverseDirection: CORE_DRUM_LANE_INDICES.map((index) => overrides.reverseDirection?.[index] ?? null),
    expressionRanges: CORE_DRUM_LANE_INDICES.map((index) => overrides.expressionRanges?.[index] ?? null),
    morphRanges: CORE_DRUM_LANE_INDICES.map((index) => overrides.morphRanges?.[index] ?? null),
    distanceRanges: CORE_DRUM_LANE_INDICES.map((index) => overrides.distanceRanges?.[index] ?? null),
  };
}

function defaultCoreDrumEuclidEvolveConfig(): DrumEuclidEvolveConfig {
  return {
    enabled: false,
    everyBars: 4,
    evolution: 0.25,
    writeOffset: 0,
    mutationMode: 'biased',
    methods: {
      rotateDrift: true,
      swingDrift: true,
      probDrift: false,
      ghostNotes: false,
      ratchetSpray: false,
      hitDrift: false,
      pitchWalk: false,
      valueDrift: true,
      valueScramble: false,
      valueWiden: false,
      subLaneLengthDrift: false,
      subLaneDirectionFlip: false,
    },
  };
}

function directedStepIndex(length: number, direction: LaneDirection | null | undefined, hitCount: number): number {
  if (length <= 1) return 0;
  return seqLaneIndex({
    enabled: true,
    steps: length,
    direction: direction ?? 'forward',
    _ppForward: true,
  }, hitCount);
}

function sampleRange(rng: () => number, range: { min: number; max: number } | null | undefined): number | null {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const min = Math.min(range.min, range.max);
  const max = Math.max(range.min, range.max);
  return min + rng() * (max - min);
}

function coreSynthEuclidSource(state: Record<string, unknown>, lane: 1 | 2 | 3 | 4): string {
  const value = state[`synthEuclid${lane}Source`];
  return typeof value === 'string' ? value : 'lead';
}

function isCoreSynthPadSource(source: string): boolean {
  return /^synth[1-6]$/.test(source);
}

function coreEuclideanUsesPadSource(state: Record<string, unknown>): boolean {
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return false;
  return CORE_SYNTH_LANE_INDICES.some((laneIndex) => {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    return booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0) &&
      isCoreSynthPadSource(coreSynthEuclidSource(state, lane));
  });
}

function coreEuclideanUsesLead1Source(state: Record<string, unknown>): boolean {
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return false;
  return CORE_SYNTH_LANE_INDICES.some((laneIndex) => {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    const source = coreSynthEuclidSource(state, lane);
    return booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0) &&
      (source === 'lead' || source === 'lead1');
  });
}

function coreEuclideanUsesLead2Source(state: Record<string, unknown>): boolean {
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return false;
  return CORE_SYNTH_LANE_INDICES.some((laneIndex) => {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    return booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0) &&
      coreSynthEuclidSource(state, lane) === 'lead2';
  });
}

function coreEuclideanUsesPianoSource(state: Record<string, unknown>): boolean {
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return false;
  return CORE_SYNTH_LANE_INDICES.some((laneIndex) => {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    return booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0) &&
      coreSynthEuclidSource(state, lane) === 'piano';
  });
}

function coreLeadRandomSource(state: Record<string, unknown>): 'lead1' | 'lead2' | 'piano' {
  const source = state.leadRandomSource;
  return source === 'lead2' || source === 'piano' ? source : 'lead1';
}

function coreIsLeadRandomSourceEnabled(state: Record<string, unknown>): boolean {
  if (!booleanValue(state.leadRandomEnabled, false)) return false;
  const source = coreLeadRandomSource(state);
  if (source === 'lead2') return booleanValue(state.lead2Enabled, false);
  if (source === 'piano') return booleanValue(state.pianoEnabled, false);
  return booleanValue(state.leadEnabled, false);
}

function coreIsLead1RouteActive(state: Record<string, unknown>): boolean {
  return booleanValue(state.leadEnabled, false) || coreEuclideanUsesLead1Source(state);
}

function coreIsLead2RouteActive(state: Record<string, unknown>): boolean {
  return booleanValue(state.lead2Enabled, false) || coreEuclideanUsesLead2Source(state);
}

function coreIsPianoRouteActive(state: Record<string, unknown>): boolean {
  return booleanValue(state.pianoEnabled, false) || coreEuclideanUsesPianoSource(state);
}

function coreSynthEuclidPadVoiceMask(state: Record<string, unknown>): number {
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return 0;
  let mask = 0;
  for (const laneIndex of CORE_SYNTH_LANE_INDICES) {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    if (!booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0)) continue;
    const source = coreSynthEuclidSource(state, lane);
    if (!isCoreSynthPadSource(source)) continue;
    const voiceIndex = boundedInteger(Number.parseInt(source.replace('synth', ''), 10), 1, 1, PAD_VOICE_COUNT) - 1;
    mask |= 1 << voiceIndex;
  }
  return mask;
}

function pickCoreChordWeightedNote(
  rng: () => number,
  availableNotes: number[],
  chordMidiNotes: number[] | undefined,
  chordBias = 0.7,
): number {
  if (availableNotes.length === 0) return 60;
  if (!chordMidiNotes || chordMidiNotes.length === 0 || availableNotes.length <= 1) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  const chordPitchClasses = new Set(chordMidiNotes.map((note) => ((note % 12) + 12) % 12));
  const chordTones = availableNotes.filter((note) => chordPitchClasses.has(((note % 12) + 12) % 12));
  const passingTones = availableNotes.filter((note) => !chordPitchClasses.has(((note % 12) + 12) % 12));
  if (chordTones.length === 0) {
    return availableNotes[Math.floor(rng() * availableNotes.length)] ?? availableNotes[0] ?? 60;
  }
  if (passingTones.length === 0 || rng() < chordBias) {
    return chordTones[Math.floor(rng() * chordTones.length)] ?? chordTones[0] ?? 60;
  }
  return passingTones[Math.floor(rng() * passingTones.length)] ?? passingTones[0] ?? 60;
}

function coreSynthEuclidInitialStartDelaySeconds(
  state: Record<string, unknown>,
  bpm: number,
  laneStepSeconds: number,
): number {
  if (state.synthEuclidJoinPolicy === 'grid') {
    return laneStepSeconds;
  }
  const beatSeconds = 60 / Math.max(1, bpm);
  const beatsPerBar = boundedNumber(state.transportBeatsPerBar, 4, 1, 16);
  return beatSeconds * beatsPerBar;
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

function createPadParamsOverride(
  sliderState: SliderState,
  route: number,
  pad1Level: number,
  pad2Level: number,
  morphOverride: number | null | undefined,
  distanceOverride: number | null | undefined,
): number[] | undefined {
  if (morphOverride == null && distanceOverride == null) return undefined;
  const padIndex = route >= PAD_VOICE_COUNT ? 1 : 0;
  let triggerState = sliderState;
  if (distanceOverride != null) {
    triggerState = applyPadDistanceToState(
      sliderState,
      padIndex === 0 ? 'pad1' : 'pad2',
      clamp(distanceOverride, 0, 1),
    );
  }
  if (morphOverride != null) {
    triggerState = {
      ...triggerState,
      [padIndex === 0 ? 'padMorph' : 'pad2Morph']: clamp(morphOverride, 0, 1),
    } as SliderState;
  }

  const params = Array.from({ length: PAD_MODULE_PARAM_COUNT }, () => 0);
  writePadParamsForPad(params, triggerState, 0, pad1Level);
  writePadParamsForPad(params, triggerState, 1, pad2Level);
  const state = triggerState as unknown as Record<string, unknown>;
  params[PAD_PARAMS_PER_PAD * 2] = boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.1, 0, 1);
  params[PAD_PARAMS_PER_PAD * 2 + 1] = 0;
  return params;
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

function createCorePreviewHarmonyState(sliderState: SliderState): HarmonyState {
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const phraseSeconds = getPhraseDurationForClockSource(
    sliderState,
    sliderState.harmonyClockSource ?? 'globalPhrase',
  );
  return createHarmonyState(
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
}

function corePreviewHarmonySeedMaterial(sliderState: SliderState): string {
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  return `${bucket}|${JSON.stringify(sliderState)}|E_ROOT`;
}

function getCoreHarmonyPhraseSeconds(sliderState: SliderState): number {
  return getPhraseDurationForClockSource(
    sliderState,
    sliderState.harmonyClockSource ?? 'globalPhrase',
  );
}

function getCoreHarmonyTickSeconds(sliderState: SliderState): number {
  const phraseSeconds = getCoreHarmonyPhraseSeconds(sliderState);
  const chordRateSeconds = boundedNumber(sliderState.chordRate, 32, 1, 128);
  if (chordRateSeconds < phraseSeconds) {
    const chordsPerPhrase = Math.max(2, Math.round(phraseSeconds / chordRateSeconds));
    return phraseSeconds / chordsPerPhrase;
  }
  return phraseSeconds;
}

function getCoreHarmonyInitialStartDelaySeconds(
  sliderState: SliderState,
  anchors: TransportAnchors | null,
): number {
  if ((sliderState.harmonySyncPolicy ?? 'nextPhrase') !== 'nextPhrase' || !anchors) return 0;
  return getTimeUntilNextBoundaryWall(
    sliderState.harmonyClockSource ?? 'globalPhrase',
    getCoreHarmonyTickSeconds(sliderState),
    anchors,
  );
}

function getCoreHarmonyInitialChordLeadSeconds(
  sliderState: SliderState,
  anchors: TransportAnchors | null,
): number {
  const tickSeconds = getCoreHarmonyTickSeconds(sliderState);
  const nextBoundarySeconds = getCoreHarmonyInitialStartDelaySeconds(sliderState, anchors);
  if (nextBoundarySeconds <= 0.02 || nextBoundarySeconds >= tickSeconds) return 0;
  return Math.max(0, tickSeconds - nextBoundarySeconds);
}

function getCoreHarmonyPreviewTickCount(sliderState: SliderState): number {
  const phraseSeconds = getCoreHarmonyPhraseSeconds(sliderState);
  const chordRateSeconds = boundedNumber(sliderState.chordRate, 32, 1, 128);
  const chordsPerPhrase = chordRateSeconds < phraseSeconds
    ? Math.max(2, Math.round(phraseSeconds / chordRateSeconds))
    : 1;
  const phrasesPerChord = Math.max(1, Math.round(chordRateSeconds / phraseSeconds));
  const progressionSteps = sliderState.chordProgressionEnabled
    ? Math.max(1, boundedInteger(sliderState.chordProgressionSteps, 4, 1, 16)) *
      Math.max(1, boundedInteger(sliderState.chordProgressionPhraseMultiplier, 1, 1, 8))
    : 1;
  const driftPhrases = sliderState.cofDriftEnabled
    ? Math.max(1, boundedInteger(sliderState.cofDriftRate, 2, 1, 32)) *
      Math.max(2, boundedInteger(sliderState.cofDriftRange, 3, 1, 6) * 2)
    : 1;
  const phraseSpan = clamp(Math.max(4, phrasesPerChord * 4, progressionSteps, driftPhrases), 4, 64);
  return clamp(Math.ceil(phraseSpan * chordsPerPhrase), 2, 128);
}

function advanceCorePreviewHarmonyState(
  harmonyState: HarmonyState,
  sliderState: SliderState,
  tickIndex: number,
): HarmonyState {
  const phraseSeconds = getCoreHarmonyPhraseSeconds(sliderState);
  const tickSeconds = getCoreHarmonyTickSeconds(sliderState);
  const ticksPerPhrase = Math.max(1, Math.round(phraseSeconds / tickSeconds));
  const phraseIndex = Math.floor(tickIndex / ticksPerPhrase);
  const isPhraseBoundary = tickIndex % ticksPerPhrase === 0;
  return updateHarmonyState(
    harmonyState,
    corePreviewHarmonySeedMaterial(sliderState),
    phraseIndex,
    boundedNumber(sliderState.tension, 0.3, 0, 1),
    boundedNumber(sliderState.chordRate, 32, 1, 128),
    boundedNumber(sliderState.voicingSpread, 0.5, 0, 1),
    boundedNumber(sliderState.detune, 8, 0, 50),
    sliderState.scaleMode === 'manual' ? 'manual' : 'auto',
    typeof sliderState.manualScale === 'string' ? sliderState.manualScale : 'Major (Ionian)',
    boundedInteger(sliderState.rootNote, 4, 0, 11),
    phraseSeconds,
    getCorePreviewHarmonyParams(sliderState),
    phraseIndex,
    isPhraseBoundary,
  );
}

function createPadPreviewVoiceDelays(sliderState: SliderState, seedSuffix = ''): number[] {
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const rng = createRng(`${bucket}|E_ROOT`);
  const chordIndex = Number(/^:(\d+)$/.exec(seedSuffix)?.[1] ?? 0);
  for (let skip = 0; skip < chordIndex * PAD_VOICE_COUNT; skip += 1) {
    rng();
  }
  const waveSpreadSeconds =
    boundedNumber(sliderState.waveSpread, 0.125, 0, 1) *
    boundedNumber(sliderState.chordRate, 32, 1, 128);
  return Array.from({ length: 6 }, () => rng() * waveSpreadSeconds).sort((a, b) => a - b);
}

function createPadPreviewChordNotes(
  sliderState: SliderState,
  velocity: number,
  rawFrequencies: readonly number[],
  seedSuffix = '',
): PreviewNote[] {
  const state = sliderState as unknown as Record<string, unknown>;
  const fallbackRoot = boundedInteger(state.rootNote, 4, 0, 11);
  const fallbackRootMidi = 48 + fallbackRoot;
  const fallbackFrequencies = [0, 7, 10, 14, 17, 24].map((interval) => midiToFreq(fallbackRootMidi + interval));
  const frequencies = rawFrequencies.length > 0 ? rawFrequencies : fallbackFrequencies;
  const pad2Assign = booleanValue(state.pad2Enabled, false)
    ? boundedInteger(state.pad2VoiceAssign, 0, 0, 63)
    : 0;
  const euclidVoiceMask = coreSynthEuclidPadVoiceMask(state);
  const voiceMask = boundedInteger(state.synthVoiceMask, 63, 1, 63) & ~pad2Assign & ~euclidVoiceMask;
  if (voiceMask === 0) return [];
  const enabledFrequencies = frequencies
    .slice(0, 6)
    .filter((_, index) => (voiceMask & (1 << index)) !== 0);
  const frequencyPool = enabledFrequencies.length > 0 ? enabledFrequencies : [frequencies[0] ?? midiToFreq(fallbackRootMidi)];
  const delays = createPadPreviewVoiceDelays(sliderState, seedSuffix);
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

  return notes;
}

function createPadPreviewChords(sliderState: SliderState, velocity: number): PreviewNote[][] {
  const octaveMultiplier = 2 ** boundedInteger(sliderState.synthOctave, 0, -2, 2);
  const tickCount = getCoreHarmonyPreviewTickCount(sliderState);
  const chords: PreviewNote[][] = [];
  let harmonyState = createCorePreviewHarmonyState(sliderState);

  for (let tickIndex = 0; tickIndex < tickCount; tickIndex += 1) {
    if (tickIndex > 0) {
      harmonyState = advanceCorePreviewHarmonyState(harmonyState, sliderState, tickIndex);
    }
    const frequencies = harmonyState.currentChord.frequencies.map((frequency) => frequency * octaveMultiplier);
    chords.push(createPadPreviewChordNotes(
      sliderState,
      velocity,
      frequencies,
      tickIndex === 0 ? '' : `:${tickIndex}`,
    ));
  }

  return chords.length > 0 ? chords : [[]];
}

function createEmptySynthEuclidPreview(): CoreSynthEuclidPreview {
  return {
    padNotes: [],
    leadNotes: [],
    pianoNotes: [],
    loopSeconds: 0,
    initialStartDelaySeconds: 0,
    noteKey: 'synth-euclid:off',
  };
}

function chooseCoreSynthEuclidMidi(
  sliderState: SliderState,
  harmonyState: HarmonyState,
  rng: () => number,
  laneIndex: number,
  noteRangeOverride: { min: number; max: number } | null = null,
): number {
  const state = sliderState as unknown as Record<string, unknown>;
  const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
  const noteMin = noteRangeOverride
    ? boundedInteger(noteRangeOverride.min, laneIndex === 1 ? 76 : laneIndex === 2 ? 52 : laneIndex === 3 ? 88 : 64, 24, 108)
    : boundedInteger(state[`synthEuclid${lane}NoteMin`], laneIndex === 1 ? 76 : laneIndex === 2 ? 52 : laneIndex === 3 ? 88 : 64, 24, 108);
  const noteMax = noteRangeOverride
    ? boundedInteger(noteRangeOverride.max, laneIndex === 1 ? 88 : laneIndex === 2 ? 64 : laneIndex === 3 ? 96 : 76, 24, 108)
    : boundedInteger(state[`synthEuclid${lane}NoteMax`], laneIndex === 1 ? 88 : laneIndex === 2 ? 64 : laneIndex === 3 ? 96 : 76, 24, 108);
  const low = Math.min(noteMin, noteMax);
  const high = Math.max(noteMin, noteMax);
  const scale = harmonyState.scaleFamily;
  const availableNotes = scale
    ? getScaleNotesInRange(scale, low, high, harmonyState.effectiveRoot)
    : [];
  const notes = availableNotes.length > 0
    ? availableNotes
    : [Math.round((low + high) * 0.5)];
  const synthLeadTension = getEffectiveTension(
    boundedNumber(state.tension, 0.3, 0, 1),
    state.synthEuclidTensionMode === 'locked' || state.synthEuclidTensionMode === 'bypass' ? state.synthEuclidTensionMode : 'follow',
    boundedNumber(state.synthEuclidTensionValue, 0, -0.5, 0.5),
  );
  const chordBias = 0.9 - (synthLeadTension < 0 ? 0 : synthLeadTension) * 0.4;
  return clamp(
    pickCoreChordWeightedNote(rng, notes, harmonyState.currentChord?.midiNotes, chordBias),
    24,
    108,
  );
}

function createSynthEuclidPreview(
  sliderState: SliderState,
  runtime: CoreSynthEuclidRuntime,
): CoreSynthEuclidPreview {
  const state = sliderState as unknown as Record<string, unknown>;
  if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return createEmptySynthEuclidPreview();

  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const harmonyState = createCorePreviewHarmonyState(sliderState);
  const bpm = boundedNumber(getEffectiveSequencerBpm(sliderState), 120, 40, 300);
  const tempo = boundedNumber(state.synthEuclideanTempo, 1, 0.25, 12);
  const beatSeconds = 60 / (bpm * tempo);
  const rng = createRng(`${bucket}|E_ROOT|core-synth-euclid`);
  const stepOverrides = runtime.stepOverrides;
  const pad2Assign = booleanValue(state.pad2Enabled, false)
    ? boundedInteger(state.pad2VoiceAssign, 0, 0, 63)
    : 0;
  const padNotes: CoreSynthEuclidGeneratedNote[] = [];
  const leadNotes: CoreSynthEuclidGeneratedNote[] = [];
  const pianoNotes: CoreSynthEuclidGeneratedNote[] = [];
  const laneCycleEndSeconds: number[] = [];
  let initialStartDelaySeconds = Number.POSITIVE_INFINITY;
  const formatKeyPart = (value: number | null | undefined) => (
    value == null || !Number.isFinite(value)
      ? 'n'
      : (Math.round(value * 1000) / 1000).toFixed(3)
  );

  for (const laneIndex of CORE_SYNTH_LANE_INDICES) {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    if (!booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0)) continue;

    const source = coreSynthEuclidSource(state, lane);
    if (!isCoreSynthPadSource(source) && source !== 'lead' && source !== 'lead1' && source !== 'lead2' && source !== 'piano') continue;

    const defaultPattern = defaultSynthEuclidPattern(laneIndex);
    const patternParams = resolveDrumEuclidPatternParams(
      typeof state[`synthEuclid${lane}Preset`] === 'string' ? String(state[`synthEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`synthEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
      boundedInteger(state[`synthEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
      boundedInteger(state[`synthEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
    );
    const basePattern = seqEuclidean(patternParams.steps, patternParams.hits, patternParams.rotation);
    const triggerToggles = stepOverrides.triggerToggles[laneIndex];
    const pattern = triggerToggles && triggerToggles.size > 0
      ? basePattern.map((hit, step) => triggerToggles.has(step) ? triggerToggles.get(step)! : hit)
      : basePattern;
    const clockDiv = runtime.clockDivs[laneIndex] ?? CORE_SYNTH_EUCLID_CLOCK_DIVS[laneIndex] ?? '1/8';
    const stepSeconds = clockDivToSeconds(clockDiv, beatSeconds);
    const laneInitialStartDelaySeconds = coreSynthEuclidInitialStartDelaySeconds(state, bpm, stepSeconds);
    initialStartDelaySeconds = Math.min(initialStartDelaySeconds, laneInitialStartDelaySeconds);
    const swing = normalizeSequencerSwing(runtime.swings[laneIndex]);
    const laneLevel = boundedNumber(state[`synthEuclid${lane}Level`], laneIndex === 1 ? 0.6 : laneIndex === 3 ? 0.5 : 0.8, 0, 1);
    const laneProbability = boundedNumber(state[`synthEuclid${lane}Probability`], 1, 0, 1);
    const laneSubLanes = runtime.subLaneEnabled[laneIndex] ?? {};
    const pitchValues = laneSubLanes.pitch === true ? stepOverrides.pitch[laneIndex] : null;
    const pitchDirection = stepOverrides.pitchDirection[laneIndex] ?? 'forward';
    const pitchBindingMode = runtime.pitchBindingModes[laneIndex] ?? 'polyrhythmic';
    const expressionValues = laneSubLanes.expression === true ? stepOverrides.expression[laneIndex] : null;
    const expressionDirection = stepOverrides.expressionDirection[laneIndex] ?? 'forward';
    const expressionRange = laneSubLanes.expression === true ? stepOverrides.expressionRanges[laneIndex] : null;
    const morphValues = laneSubLanes.morph === true ? stepOverrides.morph[laneIndex] : null;
    const morphDirection = stepOverrides.morphDirection[laneIndex] ?? 'forward';
    const morphRange = laneSubLanes.morph === true ? stepOverrides.morphRanges[laneIndex] : null;
    const distanceValues = laneSubLanes.distance === true ? stepOverrides.distance[laneIndex] : null;
    const distanceDirection = stepOverrides.distanceDirection[laneIndex] ?? 'forward';
    const distanceRange = laneSubLanes.distance === true ? stepOverrides.distanceRanges[laneIndex] : null;
    const probabilityValues = laneSubLanes.probability !== false ? stepOverrides.probability[laneIndex] : null;
    const ratchetValues = laneSubLanes.ratchet !== false ? stepOverrides.ratchet[laneIndex] : null;
    const trigConditions = stepOverrides.trigCondition[laneIndex];
    const cycleRepeats = getTrigConditionCycleRepeats(trigConditions);
    const noteRangeOverride = runtime.noteRangeOverrides[laneIndex];
    const trigVisitCounts = new Array(pattern.length).fill(0);
    let stepTime = 0;
    let hitCount = 0;

    for (let cycle = 0; cycle < cycleRepeats; cycle += 1) {
      for (let step = 0; step < pattern.length; step += 1) {
        const swingOffset = step % 2 === 1 ? stepSeconds * swing * 0.5 : 0;
        if (pattern[step]) {
          const hitPhase = hitCount;
          hitCount += 1;
          trigVisitCounts[step] = (trigVisitCounts[step] ?? 0) + 1;
          const condition = trigConditions?.[step] ?? [1, 1];
          const visit = trigVisitCounts[step] ?? 1;
          const trigPassed = condition[1] <= 1 || (((visit - 1) % condition[1]) + 1 === condition[0]);
          const stepProbability = probabilityValues
            ? boundedNumber(probabilityValues[step], 1, 0, 1)
            : 1;
          if (!trigPassed || rng() > clamp(laneProbability * stepProbability, 0, 1)) {
            stepTime += stepSeconds;
            continue;
          }

          let midi: number | null = null;
          if (pitchValues && pitchValues.length > 0) {
            const pitchIndex = pitchBindingMode === 'sequence'
              ? seqLaneIndex(
                { enabled: true, steps: pitchValues.length, direction: pitchDirection, _ppForward: true },
                step,
              )
              : seqLaneIndex(
                { enabled: true, steps: pitchValues.length, direction: pitchDirection, _ppForward: true },
                hitPhase,
              );
            const pitch = pitchValues[pitchIndex];
            if (typeof pitch === 'number' && Number.isFinite(pitch)) {
              midi = clamp(Math.round(pitch), 24, 108);
            }
          }
          if (midi === null) {
            midi = chooseCoreSynthEuclidMidi(sliderState, harmonyState, rng, laneIndex, noteRangeOverride);
          }

          const expressionValue = expressionRange
            ? expressionRange.min + rng() * (expressionRange.max - expressionRange.min)
            : expressionValues && expressionValues.length > 0
              ? finiteNumber(
                expressionValues[seqLaneIndex(
                  { enabled: true, steps: expressionValues.length, direction: expressionDirection, _ppForward: true },
                  hitPhase,
                )],
                1,
              )
              : 1;
          const velocity = clamp(expressionValue, 0, 1) * laneLevel;
          const morphOverride = morphRange
            ? clamp(morphRange.min + rng() * (morphRange.max - morphRange.min), 0, 1)
            : morphValues && morphValues.length > 0
              ? clamp(
                finiteNumber(
                  morphValues[seqLaneIndex(
                    { enabled: true, steps: morphValues.length, direction: morphDirection, _ppForward: true },
                    hitPhase,
                  )],
                  0,
                ),
                0,
                1,
              )
              : null;
          const distanceOverride = distanceRange
            ? clamp(distanceRange.min + rng() * (distanceRange.max - distanceRange.min), 0, 1)
            : distanceValues && distanceValues.length > 0
              ? clamp(
                finiteNumber(
                  distanceValues[seqLaneIndex(
                    { enabled: true, steps: distanceValues.length, direction: distanceDirection, _ppForward: true },
                    hitPhase,
                  )],
                  0,
                ),
                0,
                1,
              )
              : null;
          const ratchet = clampSequencerRatchet(
            ratchetValues && ratchetValues.length > 0
              ? finiteNumber(
                ratchetValues[seqLaneIndex(
                  { enabled: true, steps: ratchetValues.length, direction: expressionDirection, _ppForward: true },
                  hitPhase,
                )],
                1,
              )
              : 1,
          );

          if (isCoreSynthPadSource(source)) {
            const voiceIndex = boundedInteger(Number.parseInt(source.replace('synth', ''), 10), 1, 1, PAD_VOICE_COUNT) - 1;
            const isPad2 = (pad2Assign & (1 << voiceIndex)) !== 0;
            const attack = boundedNumber(isPad2 ? state.pad2Attack : state.synthAttack, 0.1, 0, 10);
            const decay = boundedNumber(isPad2 ? state.pad2Decay : state.synthDecay, 0.3, 0, 10);
            const holdSeconds = attack + decay + Math.max(0.1, (attack + decay) * 0.5);
            for (let repeat = 0; repeat < ratchet; repeat += 1) {
              padNotes.push({
                source,
                midi,
                laneIndex,
                frequency: midiToFreq(midi),
                velocity: clamp(velocity, 0.05, 1),
                route: voiceIndex + (isPad2 ? PAD_VOICE_COUNT : 0),
                delaySeconds: laneInitialStartDelaySeconds + stepTime + swingOffset + (repeat * stepSeconds / ratchet),
                holdSeconds,
                distanceOverride,
                morphOverride,
              });
            }
          } else if (source === 'piano') {
            const pianoDistance = distanceOverride ?? getVoiceDistanceValue(sliderState, 'piano');
            const pianoEnv = applyPianoDistanceEnvelope({
              attack: boundedNumber(state.pianoAttack, 0.005, 0.001, 2),
              decay: boundedNumber(state.pianoDecay, 0.65, 0.01, 4),
              sustain: boundedNumber(state.pianoSustain, 0.72, 0, 1),
              hold: boundedNumber(state.pianoHold, 0.2, 0, 4),
              release: boundedNumber(state.pianoRelease, 1.4, 0.01, 8),
            }, pianoDistance);
            for (let repeat = 0; repeat < ratchet; repeat += 1) {
              pianoNotes.push({
                source,
                midi,
                laneIndex,
                frequency: midiToFreq(midi),
                velocity: clamp(velocity, 0.05, 1),
                route: 0,
                delaySeconds: laneInitialStartDelaySeconds + stepTime + swingOffset + (repeat * stepSeconds / ratchet),
                holdSeconds: pianoEnv.hold ?? boundedNumber(state.pianoHold, 0.2, 0, 4),
                distanceOverride,
                morphOverride,
              });
            }
          } else {
            const leadSource = source === 'lead2' ? 'lead2' : 'lead1';
            const leadState = morphOverride === null
              ? sliderState
              : {
                ...sliderState,
                [leadSource === 'lead2' ? 'lead2Morph' : 'lead1Morph']: morphOverride,
              } as SliderState;
            const { holdSeconds } = createLeadMorphedParams(leadState, leadSource, morphOverride, distanceOverride);
            const ratchetFactor = ratchet > 1 ? 1 / ratchet : 1;
            for (let repeat = 0; repeat < ratchet; repeat += 1) {
              leadNotes.push({
                source,
                midi,
                laneIndex,
                frequency: midiToFreq(midi),
                velocity: clamp(velocity, 0.05, 1),
                route: leadSource === 'lead2' ? 1 : 0,
                delaySeconds: laneInitialStartDelaySeconds + stepTime + swingOffset + (repeat * stepSeconds / ratchet),
                holdSeconds,
                distanceOverride,
                morphOverride,
                ratchetFactor,
              });
            }
          }
        }

        stepTime += stepSeconds;
      }
    }

    laneCycleEndSeconds.push(laneInitialStartDelaySeconds + stepTime);
  }

  const allNotes = [...padNotes, ...leadNotes, ...pianoNotes];
  const hasNotes = allNotes.length > 0;
  const startDelay = hasNotes && Number.isFinite(initialStartDelaySeconds)
    ? Math.max(0, initialStartDelaySeconds)
    : 0;
  if (startDelay > 0) {
    for (const note of allNotes) {
      note.delaySeconds = Math.max(0, note.delaySeconds - startDelay);
    }
  }
  padNotes.sort((left, right) => left.delaySeconds - right.delaySeconds || left.route - right.route || left.laneIndex - right.laneIndex);
  leadNotes.sort((left, right) => left.delaySeconds - right.delaySeconds || left.route - right.route || left.laneIndex - right.laneIndex);
  pianoNotes.sort((left, right) => left.delaySeconds - right.delaySeconds || left.route - right.route || left.laneIndex - right.laneIndex);
  const loopSeconds = hasNotes
    ? Math.max(beatSeconds, ...laneCycleEndSeconds.map((value) => Math.max(0, value - startDelay)))
    : 0;
  const noteKey = allNotes
    .map((note) => [
      note.source,
      note.route,
      note.midi,
      note.delaySeconds.toFixed(4),
      note.velocity.toFixed(3),
      note.holdSeconds?.toFixed(4) ?? '0',
      formatKeyPart(note.distanceOverride),
      formatKeyPart(note.morphOverride),
    ].join(':'))
    .join('|');
  const timingKey = `synth-euclid:${state.synthEuclidClockSource ?? 'localBeat'}:${state.synthEuclidJoinPolicy ?? 'bar'}:${startDelay.toFixed(4)}:${loopSeconds.toFixed(4)}`;

  return {
    padNotes,
    leadNotes,
    pianoNotes,
    loopSeconds,
    initialStartDelaySeconds: startDelay,
    noteKey: noteKey.length > 0 ? `${timingKey}:${noteKey}` : 'synth-euclid:empty',
  };
}

function createEmptyLeadRandomPreview(): CoreLeadRandomPreview {
  return {
    leadChords: [],
    pianoChords: [],
    loopSeconds: 0,
    initialStartDelaySeconds: 0,
    noteKey: 'lead-random:off',
  };
}

function createLeadRandomPreview(
  sliderState: SliderState,
  anchors: TransportAnchors | null,
): CoreLeadRandomPreview {
  const state = sliderState as unknown as Record<string, unknown>;
  if (!coreIsLeadRandomSourceEnabled(state)) return createEmptyLeadRandomPreview();

  const randomSource = coreLeadRandomSource(state);
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const bucket = getUtcBucket(seedWindow);
  const phraseClock = sliderState.leadRandomClockSource ?? 'globalPhrase';
  const phraseSeconds = getPhraseDurationForClockSource(sliderState, phraseClock);
  const density = boundedNumber(state.lead1Density, 0.5, 0.1, 12);
  const baseOctaveOffset = boundedInteger(state.lead1Octave, 1, -1, 2);
  const octaveRange = boundedInteger(state.lead1OctaveRange, 2, 1, 4);
  const baseLow = 64 + baseOctaveOffset * 12;
  const baseHigh = baseLow + octaveRange * 12;
  const leadTension = getEffectiveTension(
    boundedNumber(state.tension, 0.3, 0, 1),
    state.leadTensionMode === 'locked' || state.leadTensionMode === 'bypass' ? state.leadTensionMode : 'follow',
    boundedNumber(state.leadTensionValue, 0, -0.5, 0.5),
  );
  const chordBias = leadTension < 0 ? 0.9 : 0.9 - leadTension * 0.4;
  const phraseCount = clamp(
    Math.max(
      4,
      sliderState.chordProgressionEnabled
        ? boundedInteger(sliderState.chordProgressionSteps, 4, 1, 16) *
          boundedInteger(sliderState.chordProgressionPhraseMultiplier, 1, 1, 8)
        : 1,
      boundedNumber(sliderState.chordRate, 32, 1, 128) > phraseSeconds
        ? Math.round(boundedNumber(sliderState.chordRate, 32, 1, 128) / phraseSeconds) * 4
        : 4,
    ),
    4,
    64,
  );
  const initialStartDelaySeconds =
    (sliderState.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase' && anchors
      ? getTimeUntilNextBoundaryWall(phraseClock, phraseSeconds, anchors)
      : 0;
  let harmonyState = createCorePreviewHarmonyState(sliderState);
  const leadChords: CoreSynthEuclidGeneratedNote[][] = [];
  const pianoChords: CoreSynthEuclidGeneratedNote[][] = [];

  for (let phraseIndex = 0; phraseIndex < phraseCount; phraseIndex += 1) {
    if (phraseIndex > 0) {
      harmonyState = updateHarmonyState(
        harmonyState,
        corePreviewHarmonySeedMaterial(sliderState),
        phraseIndex,
        boundedNumber(sliderState.tension, 0.3, 0, 1),
        boundedNumber(sliderState.chordRate, 32, 1, 128),
        boundedNumber(sliderState.voicingSpread, 0.5, 0, 1),
        boundedNumber(sliderState.detune, 8, 0, 50),
        sliderState.scaleMode === 'manual' ? 'manual' : 'auto',
        typeof sliderState.manualScale === 'string' ? sliderState.manualScale : 'Major (Ionian)',
        boundedInteger(sliderState.rootNote, 4, 0, 11),
        getCoreHarmonyPhraseSeconds(sliderState),
        getCorePreviewHarmonyParams(sliderState),
        phraseIndex,
        true,
      );
    }

    const rng = createRng(`${bucket}|E_ROOT|core-lead-random|phrase:${phraseIndex}`);
    const availableNotes = getScaleNotesInRange(
      harmonyState.scaleFamily,
      Math.max(24, baseLow),
      Math.min(108, baseHigh),
      harmonyState.effectiveRoot,
    );
    const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
    const phraseLeadNotes: CoreSynthEuclidGeneratedNote[] = [];
    const phrasePianoNotes: CoreSynthEuclidGeneratedNote[] = [];

    for (let noteIndex = 0; noteIndex < notesThisPhrase; noteIndex += 1) {
      if (availableNotes.length === 0) continue;
      const midi = pickCoreChordWeightedNote(rng, availableNotes, harmonyState.currentChord?.midiNotes, chordBias);
      const frequency = midiToFreq(midi);
      const velocity = 0.5 + rng() * 0.4;
      const delaySeconds = rng() * phraseSeconds;

      if (randomSource === 'piano') {
        phrasePianoNotes.push({
          source: 'piano',
          midi,
          laneIndex: -1,
          frequency,
          velocity,
          route: 0,
          delaySeconds,
        });
      } else {
        const { holdSeconds } = createLeadMorphedParams(sliderState, randomSource);
        phraseLeadNotes.push({
          source: randomSource,
          midi,
          laneIndex: -1,
          frequency,
          velocity,
          route: randomSource === 'lead2' ? 1 : 0,
          delaySeconds,
          holdSeconds,
        });
      }
    }

    phraseLeadNotes.sort((left, right) => left.delaySeconds - right.delaySeconds);
    phrasePianoNotes.sort((left, right) => left.delaySeconds - right.delaySeconds);
    if (randomSource === 'piano') {
      pianoChords.push(phrasePianoNotes);
    } else {
      leadChords.push(phraseLeadNotes);
    }
  }

  const keyChords = randomSource === 'piano' ? pianoChords : leadChords;
  const noteKey = keyChords
    .map((chord, phraseIndex) => chord
      .map((note) => `${phraseIndex}:${note.source}:${note.midi}:${note.velocity.toFixed(3)}:${note.delaySeconds.toFixed(4)}`)
      .join('|'))
    .join('>');

  return {
    leadChords,
    pianoChords,
    loopSeconds: phraseSeconds,
    initialStartDelaySeconds,
    noteKey: noteKey.length > 0
      ? `lead-random:${randomSource}:${phraseClock}:${sliderState.leadRandomSyncPolicy ?? 'nextPhrase'}:${phraseSeconds.toFixed(4)}:${noteKey}`
      : 'lead-random:empty',
  };
}

function createHostPianoPreview(
  synthEuclid: CoreSynthEuclidPreview,
  leadRandom: CoreLeadRandomPreview,
): CoreHostPianoPreview {
  const euclidNotes = synthEuclid.pianoNotes.map(({ source: _source, midi: _midi, laneIndex: _laneIndex, ...note }) => note);
  const hasRandomPiano = leadRandom.pianoChords.length > 0;
  const hasEuclidPiano = euclidNotes.length > 0 && synthEuclid.loopSeconds > 0;

  if (!hasRandomPiano && !hasEuclidPiano) {
    return {
      chords: [],
      loopSeconds: 0,
      initialStartDelaySeconds: 0,
      noteKey: 'host-piano:off',
    };
  }

  if (hasRandomPiano) {
    const chords = leadRandom.pianoChords.map((chord) => [
      ...chord.map(({ source: _source, midi: _midi, laneIndex: _laneIndex, ...note }) => note),
      ...clonePreviewNotes(euclidNotes),
    ]);
    return {
      chords,
      loopSeconds: leadRandom.loopSeconds,
      initialStartDelaySeconds: leadRandom.initialStartDelaySeconds,
      noteKey: `host-piano:${leadRandom.noteKey}:${synthEuclid.noteKey}`,
    };
  }

  return {
    chords: [euclidNotes],
    loopSeconds: synthEuclid.loopSeconds,
    initialStartDelaySeconds: synthEuclid.initialStartDelaySeconds,
    noteKey: `host-piano:${synthEuclid.noteKey}`,
  };
}

function createPadPreviewSource(
  sliderState: SliderState,
  synthEuclid: CoreSynthEuclidPreview,
  anchors: TransportAnchors | null = null,
): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  const chordSequencerEnabled = state.synthChordSequencerEnabled === true;
  const rawPadEuclidNotes = synthEuclid.padNotes.map(({ source: _source, midi: _midi, laneIndex: _laneIndex, ...note }) => note);

  const pad1Enabled = booleanValue(state.padEnabled, true);
  const pad2Enabled = booleanValue(state.pad2Enabled, false);
  const padEuclidUsesPad1 = rawPadEuclidNotes.some((note) => note.route < PAD_VOICE_COUNT);
  const padEuclidUsesPad2 = rawPadEuclidNotes.some((note) => note.route >= PAD_VOICE_COUNT);
  const pad1Level = pad1Enabled || padEuclidUsesPad1
    ? finiteNumber(state.synthLevel, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const pad2Level = pad2Enabled || padEuclidUsesPad2
    ? finiteNumber(state.pad2Level, 0.6) * ENGINE_TRIMS.pad
    : 0;
  const hasPadSource = pad1Enabled || pad2Enabled || rawPadEuclidNotes.length > 0;

  if (!hasPadSource) return null;

  const params = Array.from({ length: PAD_MODULE_PARAM_COUNT }, () => 0);
  writePadParamsForPad(params, sliderState, 0, pad1Level);
  writePadParamsForPad(params, sliderState, 1, pad2Level);
  params[PAD_PARAMS_PER_PAD * 2] = boundedNumber(state.pad1ReverbSend ?? state.synthReverbSend, 0.1, 0, 1);
  params[PAD_PARAMS_PER_PAD * 2 + 1] = 0;
  const postChain = createPadPostChainConfig(sliderState);

  const padChordSets = chordSequencerEnabled
    ? createPadPreviewChords(sliderState, 1)
    : [[]];
  const chordNotes = padChordSets[0] ?? [];
  const padEuclidNotes = rawPadEuclidNotes.map((note) => ({
    ...note,
    paramsOverride: createPadParamsOverride(
      sliderState,
      note.route,
      pad1Level,
      pad2Level,
      note.morphOverride,
      note.distanceOverride,
    ),
  }));
  const notes = [...chordNotes, ...padEuclidNotes];
  if (notes.length === 0) return null;
  const chordSeconds = padEuclidNotes.length > 0 && synthEuclid.loopSeconds > 0
    ? synthEuclid.loopSeconds
    : getCoreHarmonyTickSeconds(sliderState);
  const chords = padEuclidNotes.length > 0
    ? padChordSets.map((chordSet) => [...chordSet, ...clonePreviewNotes(padEuclidNotes)])
    : padChordSets;
  const noteKey = chords
    .map((chord) => chord
      .map((note) => `${note.route}:${note.frequency.toFixed(3)}:${note.velocity.toFixed(3)}:${note.delaySeconds.toFixed(4)}:${note.holdSeconds?.toFixed(4) ?? '0'}`)
      .join('|'))
    .join('>');
  const harmonyTimingKey = `harmony:${sliderState.harmonyClockSource ?? 'globalPhrase'}:${sliderState.harmonySyncPolicy ?? 'nextPhrase'}:${chordSeconds.toFixed(4)}`;
  const sourceNoteKey = `${harmonyTimingKey}:${noteKey}:${synthEuclid.noteKey}`;
  const postKey = Object.values(postChain)
    .map((value) => Math.round(value * 1000) / 1000)
    .join(',');
  const configKey = [
    sourceNoteKey,
    synthEuclid.initialStartDelaySeconds.toFixed(4),
    params.map((value) => Math.round(value * 1000) / 1000).join(','),
    postKey,
  ].join(':');

  return {
    enabled: true,
    source: 'pad',
    params,
    ...postChain,
    dryGain: 1,
    notes,
    chords,
    chordSeconds,
    noteKey: sourceNoteKey,
    configKey,
    initialStartDelaySeconds: padEuclidNotes.length > 0
      ? synthEuclid.initialStartDelaySeconds
      : 0,
    initialChordLeadSeconds: padEuclidNotes.length > 0
      ? undefined
      : getCoreHarmonyInitialChordLeadSeconds(sliderState, anchors),
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

function applyManualPadVoiceRoute(
  sliderState: SliderState,
  source: 'pad1' | 'pad2',
  voiceIndex: number,
): SliderState {
  const state = { ...(sliderState as unknown as Record<string, unknown>) };
  const voiceBit = 1 << clamp(voiceIndex, 0, PAD_VOICE_COUNT - 1);
  if (source === 'pad2') {
    state.pad2Enabled = true;
    state.pad2VoiceAssign = (boundedInteger(state.pad2VoiceAssign, 0, 0, 63) | voiceBit) & 63;
  } else {
    state.padEnabled = true;
    state.pad2VoiceAssign = boundedInteger(state.pad2VoiceAssign, 0, 0, 63) & ~voiceBit;
  }
  return state as unknown as SliderState;
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

function createManualPadBatchSourceConfig(
  sliderState: SliderState,
  source: 'pad1' | 'pad2',
  notes: ManualSynthNoteOptions[],
  voiceIndices: number[],
): { config: PreviewSourceConfig; triggerNotes: PreviewNote[] } {
  const effectiveState = getEffectivePadState(sliderState);
  let routedState = effectiveState;
  for (const voiceIndex of voiceIndices) {
    routedState = applyManualPadVoiceRoute(routedState, source, voiceIndex);
  }

  const state = routedState as unknown as Record<string, unknown>;
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
  const triggerNotes = notes.map((note, index) => {
    const voiceIndex = clamp(voiceIndices[index] ?? 0, 0, PAD_VOICE_COUNT - 1);
    const safeMidi = boundedInteger(note.midi, 60, 24, 108);
    return {
      frequency: midiToFreq(safeMidi),
      velocity: clamp(finiteNumber(note.velocity, 0.82), 0.05, 1),
      route: source === 'pad2' ? voiceIndex + PAD_VOICE_COUNT : voiceIndex,
      delaySeconds: 0,
      holdSeconds: note.durationMs === undefined ? 0 : Math.max(80, note.durationMs) / 1000,
    };
  });
  const noteKey = `manual:${source}:batch:${voiceIndices.map((voiceIndex) => clamp(voiceIndex, 0, PAD_VOICE_COUNT - 1)).join(',')}`;
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
    triggerNotes,
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
): Pick<PreviewSourceConfig, 'pad1PostLpfHz' | 'pad1StereoWidth' | 'pad2PostLpfHz' | 'pad2StereoWidth' | 'postLpfStages'> {
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
    postLpfStages: 2,
  };
}

function createLeadMorphedParams(
  sliderState: SliderState,
  source: 'lead1' | 'lead2',
  morphOverride: number | null = null,
  distanceOverride: number | null = null,
): { morphed: Lead4opFMMorphedParams; holdSeconds: number } {
  const state = sliderState as unknown as Record<string, unknown>;
  const isLead2 = source === 'lead2';
  const presetA = getFallbackLeadPreset(state[isLead2 ? 'lead2PresetC' : 'lead1PresetA']);
  const presetB = getFallbackLeadPreset(state[isLead2 ? 'lead2PresetD' : 'lead1PresetB']);
  const morphT = morphOverride == null
    ? boundedNumber(state[isLead2 ? 'lead2Morph' : 'lead1Morph'], 0, 0, 1)
    : clamp(morphOverride, 0, 1);
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
  const distance = distanceOverride == null
    ? getVoiceDistanceValue(sliderState, source)
    : clamp(distanceOverride, 0, 1);
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

function createLeadParamsOverride(
  sliderState: SliderState,
  source: 'lead1' | 'lead2',
  outputSelect: 0 | 1 | 2,
  morphOverride: number | null | undefined,
  distanceOverride: number | null | undefined,
  ratchetFactor: number = 1,
): number[] | undefined {
  const factor = Number.isFinite(ratchetFactor) ? clamp(ratchetFactor, 0.02, 1) : 1;
  if (morphOverride == null && distanceOverride == null && factor >= 0.999) return undefined;
  const { morphed } = createLeadMorphedParams(
    sliderState,
    source,
    morphOverride ?? null,
    distanceOverride ?? null,
  );
  const ratchetMorphed = factor >= 0.999
    ? morphed
    : {
      ...morphed,
      attack: (morphed.attack ?? 0.01) * factor,
      decay: (morphed.decay ?? 0.3) * factor,
      release: (morphed.release ?? 0.5) * factor,
    };
  return createLeadFmParams(ratchetMorphed, outputSelect);
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
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(applyDistanceValue(reverbKey, sliderState, source), 0.5, 0, 1)
    : 0;
  const delayASendGain = boundedNumber(state[delayASendKey], 0, 0, 1);
  const delayBSendGain = boundedNumber(state[delayBSendKey], 0, 0, 1);
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state[source === 'lead2' ? 'granularLead2Send' : 'granularLead1Send'], 0, 0, 1)
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

function createLeadEuclidPreviewSource(
  sliderState: SliderState,
  synthEuclid: CoreSynthEuclidPreview,
  leadRandom: CoreLeadRandomPreview,
): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  const rawEuclidLeadNotes = synthEuclid.leadNotes.map(({ source, midi: _midi, laneIndex: _laneIndex, ...note }) => ({
    ...note,
    source: source === 'lead2' ? 'lead2' as const : 'lead1' as const,
  }));
  const rawRandomLeadChords = leadRandom.leadChords.map((chord) => chord.map(({ source, midi: _midi, laneIndex: _laneIndex, ...note }) => ({
    ...note,
    source: source === 'lead2' ? 'lead2' as const : 'lead1' as const,
  })));
  const rawRandomLeadNotes = rawRandomLeadChords.flat();
  if (rawEuclidLeadNotes.length === 0 && rawRandomLeadNotes.length === 0) return null;

  const allRawLeadNotes = [...rawEuclidLeadNotes, ...rawRandomLeadNotes];
  const usesLead1 = allRawLeadNotes.some((note) => note.route === 0 || note.source === 'lead1');
  const usesLead2 = allRawLeadNotes.some((note) => note.route === 1 || note.source === 'lead2');
  const leadSource: 'lead1' | 'lead2' = usesLead1 ? 'lead1' : 'lead2';
  const firstFrequency = allRawLeadNotes[0]?.frequency ?? midiToFreq(60);
  const { morphed } = createLeadMorphedParams(sliderState, leadSource);
  const outputSelect: 0 | 1 | 2 = usesLead1 && usesLead2 ? 2 : usesLead2 ? 1 : 0;
  const params = createLeadFmParams(morphed, outputSelect);
  const postChain = createLeadPostChainConfig(sliderState, leadSource, firstFrequency);
  const toLeadPreviewNote = ({ source, ratchetFactor, ...note }: typeof allRawLeadNotes[number]): PreviewNote => ({
    ...note,
    paramsOverride: createLeadParamsOverride(
      sliderState,
      source,
      outputSelect,
      note.morphOverride,
      note.distanceOverride,
      ratchetFactor,
    ),
  });
  const leadNotes = rawEuclidLeadNotes.map(toLeadPreviewNote);
  const randomLeadChords = rawRandomLeadChords.map((chord) => chord.map(toLeadPreviewNote));

  const lead1Level = usesLead1 ? boundedNumber(applyDistanceValue('lead1Level', sliderState, 'lead1'), 0.8, 0, 1.5) : 0;
  const lead2Level = usesLead2 ? boundedNumber(applyDistanceValue('lead2Level', sliderState, 'lead2'), 0.6, 0, 1.5) : 0;
  const dryGain = Math.max(lead1Level, lead2Level) * ENGINE_TRIMS.lead;
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? Math.max(
      usesLead1 ? boundedNumber(applyDistanceValue('lead1ReverbSend', sliderState, 'lead1'), 0.5, 0, 1) : 0,
      usesLead2 ? boundedNumber(applyDistanceValue('lead2ReverbSend', sliderState, 'lead2'), 0.5, 0, 1) : 0,
    )
    : 0;
  const delayASendGain = Math.max(
    usesLead1 ? boundedNumber(state.lead1DelayASend, 0, 0, 1) : 0,
    usesLead2 ? boundedNumber(state.lead2DelayASend, 0, 0, 1) : 0,
  );
  const delayBSendGain = Math.max(
    usesLead1 ? boundedNumber(state.lead1DelayBSend, 0, 0, 1) : 0,
    usesLead2 ? boundedNumber(state.lead2DelayBSend, 0, 0, 1) : 0,
  );
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? Math.max(
      usesLead1 ? boundedNumber(state.granularLead1Send, 0, 0, 1) : 0,
      usesLead2 ? boundedNumber(state.granularLead2Send, 0, 0, 1) : 0,
    )
    : 0;
  const hasRandomLead = randomLeadChords.length > 0;
  const chords = hasRandomLead
    ? randomLeadChords.map((chord) => [...chord, ...clonePreviewNotes(leadNotes)])
    : [leadNotes, clonePreviewNotes(leadNotes)];
  const chordSeconds = hasRandomLead
    ? leadRandom.loopSeconds
    : synthEuclid.loopSeconds;
  const initialStartDelaySeconds = hasRandomLead
    ? leadRandom.initialStartDelaySeconds
    : synthEuclid.initialStartDelaySeconds;
  const noteKey = chords
    .map((chord) => chord
      .map((note) => `${note.route}:${note.frequency.toFixed(3)}:${note.velocity.toFixed(3)}:${note.delaySeconds.toFixed(4)}:${note.holdSeconds?.toFixed(4) ?? '0'}`)
      .join('|'))
    .join('>');
  const sourceNoteKey = `lead-preview:${leadRandom.noteKey}:${synthEuclid.noteKey}:${noteKey}`;
  const postKey = Object.values(postChain)
    .map((value) => Math.round(value * 1000) / 1000)
    .join(',');
  const configKey = [
    sourceNoteKey,
    chordSeconds.toFixed(4),
    outputSelect,
    Math.round(dryGain * 1_000_000) / 1_000_000,
    paramConfigKey(params),
    postKey,
    Math.round(reverbSendGain * 1_000_000) / 1_000_000,
    Math.round(delayASendGain * 1_000_000) / 1_000_000,
    Math.round(delayBSendGain * 1_000_000) / 1_000_000,
    Math.round(granularSendGain * 1_000_000) / 1_000_000,
  ].join(':');

  return {
    enabled: true,
    source: 'lead-fm',
    params,
    ...postChain,
    dryGain,
    reverbSendGain,
    delayASendGain,
    delayBSendGain,
    granularSendGain,
    leadIndex: usesLead2 && !usesLead1 ? 1 : 0,
    notes: leadNotes,
    chords,
    chordSeconds,
    noteKey: sourceNoteKey,
    configKey,
    triggerInitial: true,
    initialStartDelaySeconds,
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

function getCoreDrumLaneStepSeconds(
  laneIndex: number,
  beatSeconds: number,
  runtime: CoreDrumEuclidRuntime,
): number {
  const clockDiv = runtime.clockDivs[laneIndex] ?? CORE_DRUM_EUCLID_CLOCK_DIVS[laneIndex] ?? '1/8';
  return clockDivToSeconds(clockDiv, beatSeconds);
}

function getCoreDrumParamSHRange(
  runtime: CoreDrumEuclidRuntime,
  voice: CoreDrumVoice,
  suffix: string,
): { min: number; max: number } | null {
  return runtime.paramSHRanges.get(`${DRUM_VOICE_STATE_PREFIX[voice]}${suffix}`) ?? null;
}

function getTrigConditionCycleRepeats(
  trigCondition: TrigCondition[] | null | undefined,
): number {
  if (!trigCondition) return 1;
  let repeats = 1;
  for (const entry of trigCondition) {
    if (!entry) continue;
    const denominator = Math.max(1, Math.min(16, Math.round(entry[1] ?? 1)));
    repeats = Math.max(repeats, denominator);
  }
  return repeats;
}

function createDrumPreviewNotes(
  sliderState: SliderState,
  runtime: CoreDrumEuclidRuntime,
): { notes: PreviewNote[]; loopSeconds: number } {
  const state = sliderState as unknown as Record<string, unknown>;
  const bpm = boundedNumber(getEffectiveSequencerBpm(sliderState), 120, 40, 300);
  const tempo = boundedNumber(state.drumEuclidTempo, 1, 0.25, 4);
  const beatSeconds = 60 / (bpm * tempo);
  const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
  const rng = createRng(`${getUtcBucket(seedWindow)}|E_ROOT|core-drum-euclid`);
  const notes: PreviewNote[] = [];
  let loopSeconds = beatSeconds * 4;

  for (const laneIndex of CORE_DRUM_LANE_INDICES) {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    if (!booleanValue(state[`drumEuclid${lane}Enabled`], laneIndex < 3)) continue;
    const voices = getCoreDrumLaneVoices(state, lane);
    if (voices.length === 0) continue;

    const defaultPattern = defaultDrumEuclidPattern(laneIndex);
    const patternParams = resolveDrumEuclidPatternParams(
      typeof state[`drumEuclid${lane}Preset`] === 'string' ? String(state[`drumEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`drumEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
      boundedInteger(state[`drumEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
      boundedInteger(state[`drumEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
    );
    const stepSeconds = getCoreDrumLaneStepSeconds(laneIndex, beatSeconds, runtime);
    const basePattern = seqEuclidean(patternParams.steps, patternParams.hits, patternParams.rotation);
    const triggerToggles = runtime.stepOverrides.triggerToggles[laneIndex];
    const pattern = triggerToggles && triggerToggles.size > 0
      ? basePattern.map((hit, step) => triggerToggles.has(step) ? triggerToggles.get(step)! : hit)
      : basePattern;
    const laneLevel = boundedNumber(state[`drumEuclid${lane}Level`], 1, 0, 1);
    const laneProbability = boundedNumber(state[`drumEuclid${lane}Probability`], 1, 0, 1);
    const laneSwing = normalizeSequencerSwing(runtime.swings[laneIndex]);
    const laneSubLanes = runtime.subLaneEnabled[laneIndex] ?? {};
    const expressionValues = laneSubLanes.expression === true ? runtime.stepOverrides.expression[laneIndex] : null;
    const expressionDirection = runtime.stepOverrides.expressionDirection[laneIndex] ?? 'forward';
    const expressionRange = laneSubLanes.expression === true ? runtime.stepOverrides.expressionRanges?.[laneIndex] ?? null : null;
    const morphValues = laneSubLanes.morph === true ? runtime.stepOverrides.morph[laneIndex] : null;
    const morphDirection = runtime.stepOverrides.morphDirection[laneIndex] ?? 'forward';
    const morphRange = laneSubLanes.morph === true ? runtime.stepOverrides.morphRanges?.[laneIndex] ?? null : null;
    const distanceValues = laneSubLanes.distance === true ? runtime.stepOverrides.distance[laneIndex] : null;
    const distanceDirection = runtime.stepOverrides.distanceDirection[laneIndex] ?? 'forward';
    const distanceRange = laneSubLanes.distance === true ? runtime.stepOverrides.distanceRanges?.[laneIndex] ?? null : null;
    const pitchValues = laneSubLanes.pitch === true ? runtime.stepOverrides.pitch[laneIndex] : null;
    const pitchDirection = runtime.stepOverrides.pitchDirection[laneIndex] ?? 'forward';
    const probabilityValues = laneSubLanes.probability !== false ? runtime.stepOverrides.probability[laneIndex] : null;
    const ratchetValues = laneSubLanes.ratchet !== false ? runtime.stepOverrides.ratchet[laneIndex] : null;
    const trigCondition = laneSubLanes.trigCondition !== false ? runtime.stepOverrides.trigCondition[laneIndex] : null;
    const cycleRepeats = getTrigConditionCycleRepeats(trigCondition);
    let hitCount = 0;

    loopSeconds = Math.max(loopSeconds, patternParams.steps * stepSeconds * cycleRepeats);

    for (let cycle = 0; cycle < cycleRepeats; cycle += 1) {
      const cycleDelaySeconds = cycle * patternParams.steps * stepSeconds;
      for (let step = 0; step < pattern.length; step += 1) {
        if (!pattern[step]) continue;

        const trig: TrigCondition = trigCondition?.[step] ?? [1, 1];
        const numerator = Math.max(1, Math.round(trig[0] ?? 1));
        const denominator = Math.max(1, Math.round(trig[1] ?? 1));
        const visitCount = cycle + 1;
        const trigCondPassed = denominator <= 1 || (((visitCount - 1) % denominator) + 1 === numerator);
        const stepProbability = probabilityValues && probabilityValues.length > 0
          ? clamp(finiteNumber(probabilityValues[step % probabilityValues.length], 1), 0, 1)
          : 1;
        if (!trigCondPassed || rng() > laneProbability * stepProbability) continue;

        const voice = voices[Math.max(0, Math.min(voices.length - 1, Math.floor(rng() * voices.length)))] ?? voices[0];
        if (!voice) continue;

        const expressionSample = sampleRange(rng, expressionRange);
        const expressionIndex = expressionValues && expressionValues.length > 0
          ? directedStepIndex(expressionValues.length, expressionDirection, hitCount)
          : 0;
        const velocitySource = expressionSample ?? (expressionValues?.[expressionIndex] ?? 1);
        const velocity = clamp(finiteNumber(velocitySource, 1), 0, 1) * laneLevel;

        const morphSample = sampleRange(rng, morphRange) ?? sampleRange(rng, runtime.morphRanges[voice]);
        const morphIndex = morphValues && morphValues.length > 0
          ? directedStepIndex(morphValues.length, morphDirection, hitCount)
          : 0;
        const morphOverride = morphSample ?? (morphValues?.[morphIndex] ?? null);

        const distanceSample = sampleRange(rng, distanceRange) ?? sampleRange(rng, getCoreDrumParamSHRange(runtime, voice, 'Distance'));
        const distanceIndex = distanceValues && distanceValues.length > 0
          ? directedStepIndex(distanceValues.length, distanceDirection, hitCount)
          : 0;
        const distanceOverride = distanceSample ?? (distanceValues?.[distanceIndex] ?? null);

        const pitchIndex = pitchValues && pitchValues.length > 0
          ? directedStepIndex(pitchValues.length, pitchDirection, hitCount)
          : 0;
        const pitchOverride = pitchValues?.[pitchIndex] ?? null;

        const ratchetIndex = ratchetValues && ratchetValues.length > 0
          ? directedStepIndex(ratchetValues.length, expressionDirection, hitCount)
          : 0;
        const ratchet = clampSequencerRatchet(ratchetValues?.[ratchetIndex]);
        const ratchetWindow = stepSeconds / ratchet;
        const swingOffset = step % 2 === 1 ? stepSeconds * laneSwing * 0.5 : 0;

        for (let ratchetIndex = 0; ratchetIndex < ratchet; ratchetIndex += 1) {
          notes.push({
            frequency: 0,
            velocity,
            route: DRUM_VOICE_INDEX[voice],
            delaySeconds: cycleDelaySeconds + step * stepSeconds + swingOffset + ratchetIndex * ratchetWindow,
            holdSeconds: 0,
            morphOverride,
            distanceOverride,
            pitchOverride,
            ratchetDecayCap: ratchet > 1 ? ratchetWindow * 0.8 : undefined,
            ratchetAttackCap: ratchet > 1 ? ratchetWindow * 0.15 : undefined,
          });
        }
        hitCount += 1;
      }
    }
  }

  notes.sort((left, right) => left.delaySeconds - right.delaySeconds || left.route - right.route);
  return { notes, loopSeconds: Math.max(beatSeconds, loopSeconds) };
}

function getCoreDrumInitialStartDelaySeconds(
  sliderState: SliderState,
  runtime: CoreDrumEuclidRuntime,
  anchors: TransportAnchors | null,
): number {
  if (!anchors) return 0;
  const state = sliderState as unknown as Record<string, unknown>;
  const clockSource = sliderState.drumEuclidClockSource ?? 'localBeat';
  const joinPolicy = sliderState.drumEuclidJoinPolicy ?? 'bar';
  if (joinPolicy === 'bar') {
    return getTimeUntilNextBoundaryWall(
      clockSource,
      getTransportMetrics(sliderState).barDurationSec,
      anchors,
    );
  }

  const bpm = boundedNumber(getEffectiveSequencerBpm(sliderState), 120, 40, 300);
  const tempo = boundedNumber(state.drumEuclidTempo, 1, 0.25, 4);
  const beatSeconds = 60 / (bpm * tempo);
  let shortestStepSeconds = beatSeconds;
  for (const laneIndex of CORE_DRUM_LANE_INDICES) {
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    if (!booleanValue(state[`drumEuclid${lane}Enabled`], laneIndex < 3)) continue;
    if (getCoreDrumLaneVoices(state, lane).length === 0) continue;
    shortestStepSeconds = Math.min(
      shortestStepSeconds,
      getCoreDrumLaneStepSeconds(laneIndex, beatSeconds, runtime),
    );
  }
  return getTimeUntilNextBoundaryWall(clockSource, shortestStepSeconds, anchors);
}

function createDrumPreviewSource(
  sliderState: SliderState,
  runtime: CoreDrumEuclidRuntime,
  anchors: TransportAnchors | null = null,
): PreviewSourceConfig | null {
  const state = sliderState as unknown as Record<string, unknown>;
  if (!booleanValue(state.drumEnabled, false) || !booleanValue(state.drumEuclidMasterEnabled, false)) return null;

  const params = Array.from({ length: DRUM_MODULE_PARAM_COUNT }, () => 0);
  writeDrumParamsFromState(params, sliderState);
  const { notes, loopSeconds } = createDrumPreviewNotes(sliderState, runtime);
  if (notes.length === 0) return null;
  const initialStartDelaySeconds = getCoreDrumInitialStartDelaySeconds(sliderState, runtime, anchors);

  const noteKey = notes
    .map((note) => [
      note.route,
      note.delaySeconds.toFixed(4),
      note.velocity.toFixed(3),
      note.morphOverride == null ? 'm' : note.morphOverride.toFixed(3),
      note.distanceOverride == null ? 'd' : note.distanceOverride.toFixed(3),
      note.pitchOverride == null ? 'p' : note.pitchOverride.toFixed(3),
      note.ratchetDecayCap == null ? 'r' : note.ratchetDecayCap.toFixed(5),
    ].join(':'))
    .join('|');
  const drumTimingKey = `drum:${sliderState.drumEuclidClockSource ?? 'localBeat'}:${sliderState.drumEuclidJoinPolicy ?? 'bar'}:${loopSeconds.toFixed(4)}`;
  const sourceNoteKey = `${drumTimingKey}:${noteKey}`;
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.drumReverbSend, 0.1, 0, 1)
    : 0;
  const delayASendGain = getCoreDrumDelaySendProfile(state) * boundedNumber(state.drumDelayASend, 0, 0, 1);
  const delayBSendGain = boundedNumber(state.drumDelayBSend, 0, 0, 1);
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state.granularDrumSend, 0, 0, 1)
    : 0;
  const configKey = [
    'drum',
    sourceNoteKey,
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
    noteKey: sourceNoteKey,
    configKey,
    triggerInitial: true,
    initialStartDelaySeconds,
    initialChordLeadSeconds: CORE_DRUM_INITIAL_CHORD_LEAD_SECONDS,
  };
}

function createManualDrumPreviewSource(sliderState: SliderState): PreviewSourceConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const params = Array.from({ length: DRUM_MODULE_PARAM_COUNT }, () => 0);
  writeDrumParamsFromState(params, sliderState);
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? boundedNumber(state.drumReverbSend, 0.1, 0, 1)
    : 0;
  const delayASendGain = getCoreDrumDelaySendProfile(state) * boundedNumber(state.drumDelayASend, 0, 0, 1);
  const delayBSendGain = boundedNumber(state.drumDelayBSend, 0, 0, 1);
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? boundedNumber(state.granularDrumSend, 0, 0, 1)
    : 0;
  const gainKey = [
    reverbSendGain,
    delayASendGain,
    delayBSendGain,
    granularSendGain,
  ].map((value) => Math.round(value * 1_000_000) / 1_000_000).join(':');

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
    notes: [],
    chords: [[]],
    chordSeconds: 3600,
    noteKey: 'manual-drum',
    configKey: `drum-manual:${gainKey}:${paramConfigKey(params)}`,
    triggerInitial: false,
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
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  const deterministicSeeds = booleanValue(state.soundscapeParityFixture, false);
  const waterEngineActive = waterActive;
  const insectsEngineActive = insectsActive;
  const insects2EngineActive = insects2Active;

  params[SOUNDSCAPES_PARAM_INDEX.waterActive] = waterEngineActive ? 1 : 0;
  params[SOUNDSCAPES_PARAM_INDEX.waterPreset] = boundedInteger(
    state.waterMorph !== undefined
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
  params[SOUNDSCAPES_PARAM_INDEX.waterSeed] = deterministicSeeds ? 12345 : SOUNDSCAPES_SEED_NO_CHANGE;

  const writeInsectParams = (
    activeIndex: number,
    engineIndex: number,
    paramsIndex: number,
    seedIndex: number,
    prefix: 'insects' | 'insects2',
  ) => {
    const active = prefix === 'insects' ? insectsEngineActive : insects2EngineActive;
    const fallbackEngine = prefix === 'insects'
      ? 0
      : 1;
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
    params[seedIndex] = deterministicSeeds
      ? (prefix === 'insects2' ? 67890 : 12345)
      : SOUNDSCAPES_SEED_NO_CHANGE;
  };

  writeInsectParams(
    SOUNDSCAPES_PARAM_INDEX.insectsActive,
    SOUNDSCAPES_PARAM_INDEX.insectsEngine,
    SOUNDSCAPES_PARAM_INDEX.insectsParams,
    SOUNDSCAPES_PARAM_INDEX.insectsSeed,
    'insects',
  );
  writeInsectParams(
    SOUNDSCAPES_PARAM_INDEX.insects2Active,
    SOUNDSCAPES_PARAM_INDEX.insects2Engine,
    SOUNDSCAPES_PARAM_INDEX.insects2Params,
    SOUNDSCAPES_PARAM_INDEX.insects2Seed,
    'insects2',
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
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  if (!waterActive && !insectsActive && !insects2Active) {
    return null;
  }

  const params = Array.from({ length: SOUNDSCAPES_MODULE_PARAM_COUNT }, () => 0);
  writeSoundscapesParamsFromState(params, sliderState);

  const natureLevel = boundedNumber(state.natureLevel, 1, 0, 1);
  const insectsSharedLevel = boundedNumber(state.insectsSharedLevel, 1, 0, 1);
  const waterGain = earthLayerLevel(state, waterActive, 'waterLevel', 0.8);
  const insectsGain = earthLayerLevel(state, insectsActive, 'insectsLevel', 0.7) * insectsSharedLevel;
  const insects2Gain = earthLayerLevel(state, insects2Active, 'insects2Level', 0.5) * insectsSharedLevel;
  const dryGain = Math.max(waterGain, insectsGain, insects2Gain) * natureLevel * ENGINE_TRIMS.earth;
  const reverbSendGain = booleanValue(state.reverbEnabled, true)
    ? Math.max(
      waterActive ? boundedNumber(state.waterReverbSend, 0.3, 0, 1) : 0,
      insectsActive || insects2Active ? boundedNumber(state.insectsReverbSend, 0.15, 0, 1) : 0,
      boundedNumber(state.natureReverbSend, 0, 0, 1),
    )
    : 0;
  const delayASendGain = Math.max(
    waterActive ? boundedNumber(state.waterDelayASend, 0, 0, 1) : 0,
    insectsActive || insects2Active ? boundedNumber(state.insDelayASend, 0, 0, 1) : 0,
    boundedNumber(state.natureDelayASend, 0, 0, 1),
  );
  const delayBSendGain = Math.max(
    waterActive ? boundedNumber(state.waterDelayBSend, 0, 0, 1) : 0,
    insectsActive || insects2Active ? boundedNumber(state.insDelayBSend, 0, 0, 1) : 0,
    boundedNumber(state.natureDelayBSend, 0, 0, 1),
  );
  const granularSendGain = booleanValue(state.granularEnabled, false)
    ? Math.max(
      waterActive ? boundedNumber(state.granularWaterSend, 0, 0, 1) : 0,
      insectsActive || insects2Active ? boundedNumber(state.granularInsectsSend, 0, 0, 1) : 0,
      boundedNumber(state.granularNatureSend, 0, 0, 1),
    )
    : 0;
  const noteKey = [
    waterActive ? 'water' : '',
    insectsActive ? 'insects' : '',
    insects2Active ? 'insects2' : '',
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
  params[GRANULAR_LEGACY_INDEX + 4] = boundedInteger(state.granularLegacyMaxGrains, 64, 0, 64);
  params[GRANULAR_LEGACY_INDEX + 5] = boundedNumber(state.granularLegacyFeedback, 0.1, 0, 0.35);
}

function createGranularModuleConfig(sliderState: SliderState): GranularModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const macroModel = computeGranularMacroModel(sliderState, (key, fallback) =>
    granularStateNumber(state, key, fallback),
  );
  const granularEnabled = booleanValue(state.granularEnabled, false);
  const pad1SendGain = granularEnabled && (booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state))
    ? boundedNumber(state.granularPad1Send, 1, 0, 1)
    : 0;
  const pad2SendGain = granularEnabled && booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.granularPad2Send, 0, 0, 1)
    : 0;
  const pianoSendGain = granularEnabled && coreIsPianoRouteActive(state)
    ? boundedNumber(state.granularPianoSend, 0, 0, 1)
    : 0;
  const lead1SendGain = granularEnabled && coreIsLead1RouteActive(state)
    ? boundedNumber(state.granularLead1Send, 0, 0, 1)
    : 0;
  const lead2SendGain = granularEnabled && coreIsLead2RouteActive(state)
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
    pianoSendGain,
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
    pianoSendGain,
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
    pianoSendGain,
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

function createCorePreviewSource(
  sliderState: SliderState,
  synthEuclid: CoreSynthEuclidPreview,
  anchors: TransportAnchors | null = null,
): PreviewSourceConfig | null {
  return createPadPreviewSource(sliderState, synthEuclid, anchors);
}

function createCorePreviewSourceGroup(
  sliderState: SliderState,
  synthEuclidRuntime: CoreSynthEuclidRuntime,
  drumEuclidRuntime: CoreDrumEuclidRuntime,
  anchors: TransportAnchors | null = null,
): PreviewSourceGroup {
  const synthEuclid = createSynthEuclidPreview(sliderState, synthEuclidRuntime);
  const leadRandom = createLeadRandomPreview(sliderState, anchors);
  return {
    synthEuclid,
    hostPiano: createHostPianoPreview(synthEuclid, leadRandom),
    primary: createCorePreviewSource(sliderState, synthEuclid, anchors),
    aux: [
      { slot: 'lead', config: createLeadEuclidPreviewSource(sliderState, synthEuclid, leadRandom) },
      { slot: 'drum', config: createDrumPreviewSource(sliderState, drumEuclidRuntime, anchors) },
      { slot: 'soundscapes', config: createSoundscapesPreviewSource(sliderState) },
    ],
  };
}

function createReverbModuleConfig(sliderState: SliderState): ReverbModuleConfig {
  const state = sliderState as unknown as Record<string, unknown>;
  const pad1Active = booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state);
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
  params[30] = boundedNumber(state.reverbBloom, 0, -1, 1);

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
  const pad1SendGain = (booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state))
    ? boundedNumber(state.pad1DelayASend ?? state.padDelayASend, 0, 0, 1)
    : 0;
  const pad2SendGain = booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.pad2DelayASend ?? state.padDelayASend, 0, 0, 1)
    : 0;
  const pianoSendGain = coreIsPianoRouteActive(state)
    ? boundedNumber(state.pianoDelayASend, 0, 0, 1)
    : 0;
  const lead1SendGain = coreIsLead1RouteActive(state)
    ? boundedNumber(state.lead1DelayASend, 0, 0, 1)
    : 0;
  const lead2SendGain = coreIsLead2RouteActive(state)
    ? boundedNumber(state.lead2DelayASend, 0, 0, 1)
    : 0;
  const drumSendGain = booleanValue(state.drumEnabled, false)
    ? getCoreDrumDelaySendProfile(state) * boundedNumber(state.drumDelayASend, 0, 0, 1)
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
    pianoSendGain > 0.0001 ||
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

  const gainKey = [pad1SendGain, pad2SendGain, pianoSendGain, lead1SendGain, lead2SendGain, drumSendGain, soundscapeSendGain]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(':');
  return {
    enabled,
    params,
    pad1SendGain,
    pad2SendGain,
    pianoSendGain,
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
  const pad1SendGain = delayBArmed && (booleanValue(state.padEnabled, true) || coreEuclideanUsesPadSource(state))
    ? boundedNumber(state.pad1DelayBSend ?? state.padDelayBSend, 0, 0, 1)
    : 0;
  const pad2SendGain = delayBArmed && booleanValue(state.pad2Enabled, false)
    ? boundedNumber(state.pad2DelayBSend ?? state.padDelayBSend, 0, 0, 1)
    : 0;
  const pianoSendGain = delayBArmed && coreIsPianoRouteActive(state)
    ? boundedNumber(state.pianoDelayBSend, 0, 0, 1)
    : 0;
  const lead1SendGain = delayBArmed && coreIsLead1RouteActive(state)
    ? boundedNumber(state.lead1DelayBSend, 0, 0, 1)
    : 0;
  const lead2SendGain = delayBArmed && coreIsLead2RouteActive(state)
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
    pianoSendGain > 0.0001 ||
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
  const tapeMode = state.delayBAlgorithm === 'tapeHeads';
  const tapeHeadEnabled = [
    booleanValue(state.delayBTapeHead1Enabled, true),
    booleanValue(state.delayBTapeHead2Enabled, true),
    booleanValue(state.delayBTapeHead3Enabled, true),
    booleanValue(state.delayBTapeHead4Enabled, true),
  ];
  const tapeHeadLevels = [
    boundedNumber(state.delayBTapeHead1Level, 0.72, 0, 1),
    boundedNumber(state.delayBTapeHead2Level, 0.8, 0, 1),
    boundedNumber(state.delayBTapeHead3Level, 0.88, 0, 1),
    boundedNumber(state.delayBTapeHead4Level, 1, 0, 1),
  ];
  const tapeHeadPans = [
    boundedNumber(state.delayBTapeHead1Pan, 0.28, 0, 1),
    boundedNumber(state.delayBTapeHead2Pan, 0.72, 0, 1),
    boundedNumber(state.delayBTapeHead3Pan, 0.38, 0, 1),
    boundedNumber(state.delayBTapeHead4Pan, 0.62, 0, 1),
  ];
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
  params[10] = tapeMode ? 2 : enumParam(macroModel.spaceMode, DELAY_B_SPACE_MODE_VALUES, 0);
  params[11] = tapeMode
    ? enumParam(state.delayBTapeSpacing, DELAY_B_TAPE_SPACING_VALUES, 0)
    : enumParam(state.delayBPattern, DELAY_B_PATTERN_VALUES, 0);
  params[12] = enumParam(state.delayBWarp, DELAY_B_WARP_VALUES, 0);
  params[13] = boundedNumber(state.delayBWarpIntensity, 0.5, 0, 1);
  params[14] = spread;
  params[15] = tapeHeadEnabled.reduce((mask, active, index) => active ? mask | (1 << index) : mask, 0);
  tapeHeadLevels.forEach((value, index) => {
    params[16 + index] = value;
  });
  tapeHeadPans.forEach((value, index) => {
    params[20 + index] = value;
  });

  const gainKey = [
    pad1SendGain,
    pad2SendGain,
    pianoSendGain,
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
    pianoSendGain,
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
  private hostPianoOutput: GainNode | null = null;
  private hostPianoReverbSend: GainNode | null = null;
  private hostPianoDelayASend: GainNode | null = null;
  private hostPianoDelayBSend: GainNode | null = null;
  private hostPianoGranularSend: GainNode | null = null;
  private hostPianoExternalInputs: CoreHostExternalInputActivity = createInactiveHostExternalInputActivity();
  private hostEarthExternalInputs: CoreHostExternalInputActivity = createInactiveHostExternalInputActivity();
  private hostEarthTextures: Record<'waves' | 'birds' | 'birds2' | 'frogs', HostEarthTextureRuntime | null> = {
    waves: null,
    birds: null,
    birds2: null,
    frogs: null,
  };
  private limiter: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isRunning = false;
  private isStarting = false;
  private perfMonitorEnabled = false;
  private perfData: Record<string, PerfMetrics> = {};
  private onPerfUpdate: ((data: Record<string, PerfMetrics>) => void) | null = null;
  private onStateChange: ((state: EngineState) => void) | null = null;
  private snapshotOptions: CoreEngineHostUpdateOptions = {};
  private lastSliderState: SliderState | null = null;
  private transportAnchors: TransportAnchors | null = null;
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
  private drumEuclidClockDivs: ClockDivision[] = [...CORE_DRUM_EUCLID_CLOCK_DIVS];
  private drumEuclidSwings: number[] = [...CORE_DRUM_EUCLID_SWINGS];
  private drumStepOverrides: DrumStepOverrides = createEmptyCoreDrumStepOverrides();
  private drumHomeStepOverrides: DrumStepOverrides = createEmptyCoreDrumStepOverrides();
  private drumHomePitchSettings: (SequencerPitchSettings | null)[] = [null, null, null, null];
  private drumHomePitchScaleQuantize: (boolean | null)[] = [null, null, null, null];
  private drumHomePitchSubLaneStates: ({ steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null)[] = [null, null, null, null];
  private drumSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private drumEvolveConfigs: DrumEuclidEvolveConfig[] = [
    defaultCoreDrumEuclidEvolveConfig(),
    defaultCoreDrumEuclidEvolveConfig(),
    defaultCoreDrumEuclidEvolveConfig(),
    defaultCoreDrumEuclidEvolveConfig(),
  ];
  private drumMorphRanges: Partial<Record<CoreDrumVoice, { min: number; max: number } | null>> = {};
  private drumParamSHRanges = new Map<string, { min: number; max: number }>();
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  private onDrumMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;
  private onDrumParamSHTrigger: ((voice: DrumVoiceType, key: string, position: number) => void) | null = null;
  private onDrumEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onDrumStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private onDrumEvolveOverridesChanged: ((laneIndex: number, overrides: CoreDrumEvolveOverridesPayload) => void) | null = null;
  private synthEuclidClockDivs: ClockDivision[] = [...CORE_SYNTH_EUCLID_CLOCK_DIVS];
  private synthEuclidSwings: number[] = [...CORE_SYNTH_EUCLID_SWINGS];
  private synthStepOverrides: CoreSynthEuclidStepOverrides = createEmptyCoreSynthStepOverrides();
  private synthEvolveConfigs: SynthEvolveConfig[] = [
    defaultSynthEvolveConfig(),
    defaultSynthEvolveConfig(),
    defaultSynthEvolveConfig(),
    defaultSynthEvolveConfig(),
  ];
  private synthEvolveStates: SynthEvolveState[] = [
    defaultSynthEvolveState(),
    defaultSynthEvolveState(),
    defaultSynthEvolveState(),
    defaultSynthEvolveState(),
  ];
  private synthPitchSettings: { mode: PitchMode; root: number; scale: ScaleName }[] = [
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ];
  private synthPitchBindingModes: PitchBindingMode[] = ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'];
  private synthNoteRangeOverrides: ({ min: number; max: number } | null)[] = [null, null, null, null];
  private synthSubLaneEnabled: Record<string, boolean>[] = [{}, {}, {}, {}];
  private onSynthEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onSynthEvolveOverridesChanged: ((laneIndex: number, overrides: CoreSynthEvolveOverridesPayload) => void) | null = null;
  private onSynthNoteRangeEvolved: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null = null;
  private synthEuclidLiveEvolveTimer: number | null = null;
  private synthEuclidLiveEvolveKey: string | null = null;
  private synthEuclidLiveEvolveNextAtMs: number[] = [0, 0, 0, 0];
  private synthEuclidLiveEvolveBars: number[] = [0, 0, 0, 0];
  private synthEuclidLiveEvolveRng: (() => number) | null = null;
  private hostPianoEuclidConfigKey: string | null = null;
  private hostPianoEuclidTimers = new Set<number>();
  private activeHostPianoVoices = new Set<ActiveHostPianoVoice>();
  private softStopCleanupTimers = new Set<number>();
  private readonly hostPianoBuffers: Record<PianoSampleVariant, Map<number, AudioBuffer>> = {
    regular: new Map(),
    short: new Map(),
  };
  private readonly hostPianoBufferPromises: Record<PianoSampleVariant, Map<number, Promise<AudioBuffer | null>>> = {
    regular: new Map(),
    short: new Map(),
  };
  private readonly hostPianoBufferLastUsed: Record<PianoSampleVariant, Map<number, number>> = {
    regular: new Map(),
    short: new Map(),
  };
  private hostPianoBufferUseSequence = 0;
  private dualRanges: Partial<Record<string, { min: number; max: number }>> = {};
  private runtimeWalkRanges: Partial<Record<string, RuntimeWalkRange>> = {};
  private runtimeWalkStates = new Map<string, RuntimeWalkState>();
  private runtimeWalkPositions: Record<string, number> = {};
  private runtimeRandomWalkTimer: number | null = null;
  private runtimeRandomWalkLastUpdateMs = 0;
  private onRuntimeWalkPositionsChange: ((positions: Record<string, number>) => void) | null = null;
  private onJourneyMorphClockFrame: ((now: number) => void) | null = null;
  private journeyMorphClockActive = false;
  private journeyMorphClockRaf: number | null = null;
  private journeyMorphClockTimeout: number | null = null;

  async start(sliderState: SliderState, options?: CoreEngineHostUpdateOptions): Promise<void> {
    if (this.isStarting) return;
    if (this.isRunning) {
      this.updateParams(sliderState, options);
      return;
    }

    this.isStarting = true;
    this.resetTransportAnchors();

    try {
      if (this.ctx && this.node && this.masterGain && this.ctx.state !== 'closed') {
        this.applyCoreState(sliderState, options);
        this.node.port.postMessage({ type: 'enablePerf', enabled: this.perfMonitorEnabled });
        this.node.port.postMessage({ type: 'start' });

        if (this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }

        this.isRunning = true;
        this.notifyStateChange();
        return;
      }

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
        numberOfInputs: 4,
        numberOfOutputs: 9,
        outputChannelCount: [2, 2, 2, 2, 2, 2, 2, 2, 2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: {
          wasmBinary: coreWasmBinary,
        },
      });
      this.node.port.onmessage = (event) => this.handleWorkletMessage(event.data);

      this.masterGain = new GainNode(this.ctx, { gain: 0 });
      this.hostPianoOutput = new GainNode(this.ctx, { gain: 1 });
      this.limiter = new DynamicsCompressorNode(this.ctx, {
        threshold: -3,
        knee: 0,
        ratio: 20,
        attack: 0.001,
        release: 0.1,
      });
      this.outputGain = new GainNode(this.ctx, { gain: 1 });
      this.analyser = new AnalyserNode(this.ctx, { fftSize: 1024 });
      this.hostPianoReverbSend = new GainNode(this.ctx, { gain: 0 });
      this.hostPianoDelayASend = new GainNode(this.ctx, { gain: 0 });
      this.hostPianoDelayBSend = new GainNode(this.ctx, { gain: 0 });
      this.hostPianoGranularSend = new GainNode(this.ctx, { gain: 0 });
      this.hostPianoOutput.connect(this.masterGain);
      this.hostPianoOutput.connect(this.hostPianoReverbSend).connect(this.node, 0, 0);
      this.hostPianoOutput.connect(this.hostPianoDelayASend).connect(this.node, 0, 1);
      this.hostPianoOutput.connect(this.hostPianoDelayBSend).connect(this.node, 0, 2);
      this.hostPianoOutput.connect(this.hostPianoGranularSend).connect(this.node, 0, 3);
      this.node.connect(this.masterGain).connect(this.limiter).connect(this.analyser).connect(this.outputGain).connect(this.ctx.destination);

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
    if (this.isStarting) {
      this.teardownCoreGraph();
      return;
    }
    if (!this.isRunning) return;
    if (!this.ctx || !this.node) {
      this.teardownCoreGraph();
      return;
    }

    try {
      this.clearHostPianoEuclidTimers();
      this.stopSynthEuclidLiveEvolve();
      this.synthNoteRangeOverrides = [null, null, null, null];
      this.softStopActiveHostPianoVoices(CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopHostPianoFxSends(CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.stopHostEarthTextures();
      this.stopRuntimeRandomWalk();
      this.stopJourneyMorphClock();
      this.node.port.postMessage({
        type: 'softStop',
        fadeSeconds: CORE_SOFT_STOP_SOURCE_FADE_SECONDS,
      });
    } catch {
      // Best-effort shutdown; stale worklet ports are expected during teardown.
    }

    this.isRunning = false;
    this.isStarting = false;
    this.resetConfigCaches();
    this.notifyStateChange();
  }

  dispose(): void {
    this.teardownCoreGraph();
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

  private clearHostPianoEuclidTimers(): void {
    for (const timer of this.hostPianoEuclidTimers) {
      window.clearTimeout(timer);
    }
    this.hostPianoEuclidTimers.clear();
  }

  private clearSoftStopCleanupTimers(): void {
    for (const timer of this.softStopCleanupTimers) {
      window.clearTimeout(timer);
    }
    this.softStopCleanupTimers.clear();
  }

  private softStopGainNode(gainNode: GainNode | null, fadeSeconds: number): void {
    const context = this.ctx;
    const param = gainNode?.gain;
    if (!context || !param) return;
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSeconds));
  }

  private softStopHostPianoFxSends(fadeSeconds: number): void {
    this.softStopGainNode(this.hostPianoReverbSend, fadeSeconds);
    this.softStopGainNode(this.hostPianoDelayASend, fadeSeconds);
    this.softStopGainNode(this.hostPianoDelayBSend, fadeSeconds);
    this.softStopGainNode(this.hostPianoGranularSend, fadeSeconds);
    this.hostPianoExternalInputs = createInactiveHostExternalInputActivity();
    this.postHostExternalInputState();
  }

  private postHostExternalInputState(): void {
    const node = this.node;
    if (!node) return;
    const activity = mergeHostExternalInputActivity(this.hostPianoExternalInputs, this.hostEarthExternalInputs);
    node.port.postMessage({
      type: 'configureExternalInputs',
      reverbActive: activity.reverbActive,
      delayAActive: activity.delayAActive,
      delayBActive: activity.delayBActive,
      granularActive: activity.granularActive,
    });
  }

  private createEarthTextureSeed(layer: string, state: SliderState): string {
    const seedWindow = state.seedWindow === 'day' ? 'day' : 'hour';
    const seedValue = (state as unknown as Record<string, unknown>).seed;
    const seed = Number.isFinite(Number(seedValue)) ? Math.trunc(Number(seedValue)) : 42;
    return `${getUtcBucket(seedWindow)}|${seed}|earth-texture|${layer}`;
  }

  private createHostEarthTextureRuntime(config: {
    fileName: string;
    sliceDuration: number;
    fadeTime: number;
    density: number;
    randomSeed?: string | null;
    delayMs: number;
    sideGain: number;
    centerGain: number;
    pan?: number;
    filter?: boolean;
  }): HostEarthTextureRuntime | null {
    const ctx = this.ctx;
    const node = this.node;
    const masterGain = this.masterGain;
    if (!ctx || !node || !masterGain) return null;

    const sourceBus = ctx.createGain();
    sourceBus.gain.value = 1;
    const gateGain = ctx.createGain();
    gateGain.gain.value = 0;
    sourceBus.connect(gateGain);

    const filter = config.filter ? ctx.createBiquadFilter() : null;
    let widenedInput: AudioNode = gateGain;
    if (filter) {
      filter.type = 'lowpass';
      filter.frequency.value = 8000;
      filter.Q.value = 1.5;
      gateGain.connect(filter);
      widenedInput = filter;
    }

    const preFaderBus = createCoreHostHaasWidenedBus(ctx, widenedInput, {
      delayMs: config.delayMs,
      sideGain: config.sideGain,
      centerGain: config.centerGain,
      pan: config.pan,
    });
    const levelGain = ctx.createGain();
    const reverbSend = ctx.createGain();
    const delayASend = ctx.createGain();
    const delayBSend = ctx.createGain();
    const granularSend = ctx.createGain();
    levelGain.gain.value = 0;
    reverbSend.gain.value = 0;
    delayASend.gain.value = 0;
    delayBSend.gain.value = 0;
    granularSend.gain.value = 0;

    preFaderBus.connect(levelGain).connect(masterGain);
    preFaderBus.connect(reverbSend).connect(node, 0, 0);
    preFaderBus.connect(delayASend).connect(node, 0, 1);
    preFaderBus.connect(delayBSend).connect(node, 0, 2);
    preFaderBus.connect(granularSend).connect(node, 0, 3);

    return {
      player: new EarthTexturePlayer(ctx, sourceBus, {
        fileName: config.fileName,
        sliceDuration: config.sliceDuration,
        fadeTime: config.fadeTime,
        density: config.density,
        randomSeed: config.randomSeed,
      }),
      sourceBus,
      gateGain,
      preFaderBus,
      levelGain,
      reverbSend,
      delayASend,
      delayBSend,
      granularSend,
      filter,
      stopTimer: null,
    };
  }

  private ensureHostEarthTextures(): void {
    if (!this.hostEarthTextures.waves) {
      this.hostEarthTextures.waves = this.createHostEarthTextureRuntime({
        fileName: 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
        sliceDuration: 22,
        fadeTime: 5.5,
        density: 0.38,
        delayMs: 10,
        sideGain: 0.24,
        centerGain: 0.8,
        pan: 0.85,
        filter: true,
      });
    }
    if (!this.hostEarthTextures.birds) {
      this.hostEarthTextures.birds = this.createHostEarthTextureRuntime({
        fileName: 'Alps Birds 2_noiseremoval_441_m.ogg',
        sliceDuration: 20,
        fadeTime: 3.2,
        density: 0.45,
        delayMs: 13,
        sideGain: 0.42,
        centerGain: 0.56,
      });
    }
    if (!this.hostEarthTextures.birds2) {
      this.hostEarthTextures.birds2 = this.createHostEarthTextureRuntime({
        fileName: 'Fujian Birds 2_441_m_normalized.ogg',
        sliceDuration: 20,
        fadeTime: 3.1,
        density: 0.48,
        delayMs: 15,
        sideGain: 0.45,
        centerGain: 0.5,
      });
    }
    if (!this.hostEarthTextures.frogs) {
      this.hostEarthTextures.frogs = this.createHostEarthTextureRuntime({
        fileName: 'Fujian_Frogs_m_441_normalized.ogg',
        sliceDuration: 18,
        fadeTime: 2.6,
        density: 0.52,
        delayMs: 12,
        sideGain: 0.36,
        centerGain: 0.68,
      });
    }
  }

  private updateHostEarthTextureRuntime(
    runtime: HostEarthTextureRuntime | null,
    options: {
      enabled: boolean;
      level: number;
      masterLevel: number;
      earthLevel: number;
      reverbSend: number;
      delayASend: number;
      delayBSend: number;
      granularSend: number;
      sliceDuration: number;
      density: number;
      randomSeed?: string | null;
      now: number;
      smoothTime: number;
    },
  ): CoreHostExternalInputActivity {
    if (!runtime) return createInactiveHostExternalInputActivity();

    const enabled = options.enabled && options.level > 0.0001;
    const levelScale = enabled ? options.level * options.masterLevel : 0;
    const dryGain = levelScale * options.earthLevel * ENGINE_TRIMS.earth;
    const reverbGain = levelScale > 0.0001 ? options.reverbSend * levelScale : 0;
    const delayAGain = levelScale > 0.0001 ? options.delayASend * levelScale : 0;
    const delayBGain = levelScale > 0.0001 ? options.delayBSend * levelScale : 0;
    const granularGain = levelScale > 0.0001 ? options.granularSend * levelScale : 0;
    const gateTarget = enabled ? 1 : 0;

    runtime.gateGain.gain.setTargetAtTime(gateTarget, options.now, 0.08);
    runtime.levelGain.gain.setTargetAtTime(dryGain, options.now, options.smoothTime);
    runtime.reverbSend.gain.setTargetAtTime(reverbGain, options.now, options.smoothTime);
    runtime.delayASend.gain.setTargetAtTime(delayAGain, options.now, options.smoothTime);
    runtime.delayBSend.gain.setTargetAtTime(delayBGain, options.now, options.smoothTime);
    runtime.granularSend.gain.setTargetAtTime(granularGain, options.now, options.smoothTime);
    runtime.player.update({
      sliceDuration: options.sliceDuration,
      density: options.density,
      randomSeed: options.randomSeed,
    });

    const shouldRun = enabled && (
      dryGain > 0.0001 ||
      reverbGain > 0.0001 ||
      delayAGain > 0.0001 ||
      delayBGain > 0.0001 ||
      granularGain > 0.0001
    );

    if (shouldRun) {
      if (runtime.stopTimer !== null) {
        window.clearTimeout(runtime.stopTimer);
        runtime.stopTimer = null;
      }
      void runtime.player.start();
    } else if (runtime.stopTimer === null) {
      runtime.stopTimer = window.setTimeout(() => {
        runtime.stopTimer = null;
        runtime.player.stop();
      }, 450);
    }

    return {
      reverbActive: reverbGain > 0.0001,
      delayAActive: delayAGain > 0.0001,
      delayBActive: delayBGain > 0.0001,
      granularActive: granularGain > 0.0001,
    };
  }

  private configureHostEarthTextures(sliderState: SliderState): void {
    const context = this.ctx;
    if (!context || !this.node || !this.masterGain) return;
    this.ensureHostEarthTextures();

    const state = sliderState as unknown as Record<string, unknown>;
    const now = context.currentTime;
    const smoothTime = 0.015;
    const reverbEnabled = booleanValue(state.reverbEnabled, true);
    const granularEnabled = booleanValue(state.granularEnabled, false);
    const earthLevel = boundedNumber(state.earthLevel, 1, 0, 1);
    const natureLevel = boundedNumber(state.natureLevel, 1, 0, 1);
    const waves = this.hostEarthTextures.waves;
    if (waves?.filter) {
      waves.filter.type = coreHostBiquadFilterType(state.oceanFilterType);
      waves.filter.frequency.setTargetAtTime(
        boundedNumber(state.oceanFilterCutoff, 8000, 80, 20000),
        now,
        smoothTime,
      );
      waves.filter.Q.setTargetAtTime(
        0.5 + boundedNumber(state.oceanFilterResonance, 0.1, 0, 1) * 10,
        now,
        smoothTime,
      );
    }

    let activity = createInactiveHostExternalInputActivity();
    activity = mergeHostExternalInputActivity(activity, this.updateHostEarthTextureRuntime(waves, {
      enabled: booleanValue(state.oceanSampleEnabled, false),
      level: boundedNumber(state.oceanSampleLevel, 0, 0, 1),
      masterLevel: 1,
      earthLevel,
      reverbSend: reverbEnabled ? boundedNumber(state.oceanReverbSend, 0.3, 0, 1) : 0,
      delayASend: boundedNumber(state.oceanDelayASend, 0, 0, 1),
      delayBSend: boundedNumber(state.oceanDelayBSend, 0, 0, 1),
      granularSend: granularEnabled ? boundedNumber(state.granularWavesSend, 0, 0, 1) : 0,
      sliceDuration: boundedNumber(state.oceanSliceDuration, 22, 1, 120),
      density: boundedNumber(state.oceanSliceDensity, 0.38, 0, 1),
      randomSeed: this.createEarthTextureSeed('ocean', sliderState),
      now,
      smoothTime,
    }));

    activity = mergeHostExternalInputActivity(activity, this.updateHostEarthTextureRuntime(this.hostEarthTextures.birds, {
      enabled: booleanValue(state.birdsEnabled, false),
      level: boundedNumber(state.birdsLevel, 0, 0, 1),
      masterLevel: natureLevel,
      earthLevel,
      reverbSend: reverbEnabled ? boundedNumber(state.natureReverbSend, 0, 0, 1) : 0,
      delayASend: boundedNumber(state.natureDelayASend, 0, 0, 1),
      delayBSend: boundedNumber(state.natureDelayBSend, 0, 0, 1),
      granularSend: granularEnabled ? boundedNumber(state.granularNatureSend, 0, 0, 1) : 0,
      sliceDuration: boundedNumber(state.birdsSliceDuration, 20, 1, 120),
      density: boundedNumber(state.birdsSliceDensity, 0.45, 0, 1),
      randomSeed: this.createEarthTextureSeed('birds', sliderState),
      now,
      smoothTime,
    }));

    activity = mergeHostExternalInputActivity(activity, this.updateHostEarthTextureRuntime(this.hostEarthTextures.birds2, {
      enabled: booleanValue(state.birds2Enabled, false),
      level: boundedNumber(state.birds2Level, 0, 0, 1),
      masterLevel: natureLevel,
      earthLevel,
      reverbSend: reverbEnabled ? boundedNumber(state.natureReverbSend, 0, 0, 1) : 0,
      delayASend: boundedNumber(state.natureDelayASend, 0, 0, 1),
      delayBSend: boundedNumber(state.natureDelayBSend, 0, 0, 1),
      granularSend: granularEnabled ? boundedNumber(state.granularNatureSend, 0, 0, 1) : 0,
      sliceDuration: boundedNumber(state.birds2SliceDuration, 20, 1, 120),
      density: boundedNumber(state.birds2SliceDensity, 0.48, 0, 1),
      randomSeed: this.createEarthTextureSeed('birds2', sliderState),
      now,
      smoothTime,
    }));

    activity = mergeHostExternalInputActivity(activity, this.updateHostEarthTextureRuntime(this.hostEarthTextures.frogs, {
      enabled: booleanValue(state.frogsEnabled, false),
      level: boundedNumber(state.frogsLevel, 0, 0, 1),
      masterLevel: natureLevel,
      earthLevel,
      reverbSend: reverbEnabled ? boundedNumber(state.natureReverbSend, 0, 0, 1) : 0,
      delayASend: boundedNumber(state.natureDelayASend, 0, 0, 1),
      delayBSend: boundedNumber(state.natureDelayBSend, 0, 0, 1),
      granularSend: granularEnabled ? boundedNumber(state.granularNatureSend, 0, 0, 1) : 0,
      sliceDuration: boundedNumber(state.frogsSliceDuration, 18, 1, 120),
      density: boundedNumber(state.frogsSliceDensity, 0.52, 0, 1),
      randomSeed: this.createEarthTextureSeed('frogs', sliderState),
      now,
      smoothTime,
    }));

    this.hostEarthExternalInputs = activity;
    this.postHostExternalInputState();
  }

  private stopHostEarthTextures(): void {
    for (const runtime of Object.values(this.hostEarthTextures)) {
      if (!runtime) continue;
      if (runtime.stopTimer !== null) {
        window.clearTimeout(runtime.stopTimer);
        runtime.stopTimer = null;
      }
      try { runtime.player.stop(); } catch { /* stale texture player */ }
      this.softStopGainNode(runtime.gateGain, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopGainNode(runtime.levelGain, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopGainNode(runtime.reverbSend, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopGainNode(runtime.delayASend, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopGainNode(runtime.delayBSend, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
      this.softStopGainNode(runtime.granularSend, CORE_SOFT_STOP_SOURCE_FADE_SECONDS);
    }
    this.hostEarthExternalInputs = createInactiveHostExternalInputActivity();
    this.postHostExternalInputState();
  }

  private disconnectHostEarthTextures(): void {
    for (const runtime of Object.values(this.hostEarthTextures)) {
      if (!runtime) continue;
      if (runtime.stopTimer !== null) {
        window.clearTimeout(runtime.stopTimer);
        runtime.stopTimer = null;
      }
      try { runtime.player.stop(); } catch { /* stale texture player */ }
      try { runtime.sourceBus.disconnect(); } catch { /* stale texture bus */ }
      try { runtime.gateGain.disconnect(); } catch { /* stale texture gate */ }
      try { runtime.filter?.disconnect(); } catch { /* stale texture filter */ }
      try { runtime.preFaderBus.disconnect(); } catch { /* stale texture bus */ }
      try { runtime.levelGain.disconnect(); } catch { /* stale texture gain */ }
      try { runtime.reverbSend.disconnect(); } catch { /* stale texture send */ }
      try { runtime.delayASend.disconnect(); } catch { /* stale texture send */ }
      try { runtime.delayBSend.disconnect(); } catch { /* stale texture send */ }
      try { runtime.granularSend.disconnect(); } catch { /* stale texture send */ }
    }
    this.hostEarthTextures = {
      waves: null,
      birds: null,
      birds2: null,
      frogs: null,
    };
    this.hostEarthExternalInputs = createInactiveHostExternalInputActivity();
  }

  private softStopActiveHostPianoVoices(fadeSeconds: number): void {
    const context = this.ctx;
    if (!context) {
      this.stopActiveHostPianoVoices();
      return;
    }
    const now = context.currentTime;
    for (const voice of Array.from(this.activeHostPianoVoices)) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSeconds));
      } catch {
        // Stale gain envelopes are expected during repeated stops.
      }
      const cleanupTimer = window.setTimeout(() => {
        this.softStopCleanupTimers.delete(cleanupTimer);
        if (!this.activeHostPianoVoices.has(voice)) return;
        try { voice.source.stop(); } catch { /* stale piano source */ }
        try { voice.source.disconnect(); } catch { /* stale piano source */ }
        try { voice.gain.disconnect(); } catch { /* stale piano gain */ }
        try { voice.filter?.disconnect(); } catch { /* stale piano filter */ }
        this.activeHostPianoVoices.delete(voice);
      }, CORE_SOFT_STOP_CLEANUP_DELAY_MS);
      this.softStopCleanupTimers.add(cleanupTimer);
    }
  }

  private stopActiveHostPianoVoices(): void {
    for (const voice of this.activeHostPianoVoices) {
      try { voice.source.stop(); } catch { /* stale piano source */ }
      try { voice.source.disconnect(); } catch { /* stale piano source */ }
      try { voice.gain.disconnect(); } catch { /* stale piano gain */ }
      try { voice.filter?.disconnect(); } catch { /* stale piano filter */ }
    }
    this.activeHostPianoVoices.clear();
  }

  private resetConfigCaches(): void {
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
    this.hostPianoEuclidConfigKey = null;
    this.perfData = {};
    this.onPerfUpdate?.({});
  }

  private teardownCoreGraph(): void {
    if (!this.isRunning && !this.isStarting && !this.ctx) return;

    try {
      this.clearHostPianoEuclidTimers();
      this.clearSoftStopCleanupTimers();
      this.stopSynthEuclidLiveEvolve();
      this.synthNoteRangeOverrides = [null, null, null, null];
      this.stopActiveHostPianoVoices();
      this.disconnectHostEarthTextures();
      this.stopRuntimeRandomWalk();
      this.stopJourneyMorphClock();
      this.node?.port.postMessage({ type: 'stop' });
      this.node?.port.close();
      this.node?.disconnect();
      this.hostPianoOutput?.disconnect();
      this.hostPianoReverbSend?.disconnect();
      this.hostPianoDelayASend?.disconnect();
      this.hostPianoDelayBSend?.disconnect();
      this.hostPianoGranularSend?.disconnect();
      this.masterGain?.disconnect();
      this.limiter?.disconnect();
      this.analyser?.disconnect();
      this.outputGain?.disconnect();
      void this.ctx?.close();
    } catch {
      // Best-effort shutdown; stale worklet ports are expected during teardown.
    }

    this.node = null;
    this.masterGain = null;
    this.hostPianoOutput = null;
    this.hostPianoReverbSend = null;
    this.hostPianoDelayASend = null;
    this.hostPianoDelayBSend = null;
    this.hostPianoGranularSend = null;
    this.hostPianoExternalInputs = createInactiveHostExternalInputActivity();
    this.hostEarthExternalInputs = createInactiveHostExternalInputActivity();
    this.limiter = null;
    this.outputGain = null;
    this.analyser = null;
    this.ctx = null;
    this.isRunning = false;
    this.isStarting = false;
    this.transportAnchors = null;
    this.resetConfigCaches();
    this.notifyStateChange();
  }

  private markHostPianoBufferUsed(variant: PianoSampleVariant, index: number): void {
    this.hostPianoBufferLastUsed[variant].set(index, ++this.hostPianoBufferUseSequence);
  }

  private evictHostPianoBuffers(
    variant: PianoSampleVariant,
    protectedIndices: ReadonlySet<number> = new Set<number>(),
  ): void {
    const buffers = this.hostPianoBuffers[variant];
    const lastUsed = this.hostPianoBufferLastUsed[variant];
    while (buffers.size > HOST_PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT) {
      let evictionIndex: number | null = null;
      let evictionAge = Infinity;
      for (const index of buffers.keys()) {
        if (protectedIndices.has(index)) continue;
        const age = lastUsed.get(index) ?? 0;
        if (age < evictionAge) {
          evictionAge = age;
          evictionIndex = index;
        }
      }
      if (evictionIndex === null) break;
      buffers.delete(evictionIndex);
      lastUsed.delete(evictionIndex);
    }
  }

  private async loadHostPianoSample(variant: PianoSampleVariant, index: number): Promise<AudioBuffer | null> {
    const context = this.ctx;
    if (!context) return null;
    const safeIndex = Math.max(1, Math.min(PIANO_SAMPLE_COUNT, Math.round(index)));
    const existing = this.hostPianoBuffers[variant].get(safeIndex);
    if (existing) {
      this.markHostPianoBufferUsed(variant, safeIndex);
      return existing;
    }

    const pending = this.hostPianoBufferPromises[variant].get(safeIndex);
    if (pending) return pending;

    const samplePath = getPianoSamplePath(variant, safeIndex);
    const loadPromise = (async () => {
      try {
        const response = await fetch(resolvePublicSampleUrl(samplePath));
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
        this.hostPianoBuffers[variant].set(safeIndex, decoded);
        this.markHostPianoBufferUsed(variant, safeIndex);
        this.evictHostPianoBuffers(variant, new Set([safeIndex, ...this.hostPianoBufferPromises[variant].keys()]));
        return decoded;
      } catch {
        return null;
      } finally {
        this.hostPianoBufferPromises[variant].delete(safeIndex);
      }
    })();

    this.hostPianoBufferPromises[variant].set(safeIndex, loadPromise);
    return loadPromise;
  }

  private async ensureHostPianoSamplePairLoaded(index: number): Promise<void> {
    await Promise.all([
      this.loadHostPianoSample('regular', index),
      this.loadHostPianoSample('short', index),
    ]);
  }

  private async playHostPianoNote(
    frequency: number,
    velocity: number,
    sliderState: SliderState,
    distanceOverride: number | null = null,
  ): Promise<void> {
    const context = this.ctx;
    const output = this.hostPianoOutput;
    if (!context || !output || !coreIsPianoRouteActive(sliderState as unknown as Record<string, unknown>)) return;

    const midiNote = frequencyToMidiNote(frequency);
    const { index, sampleMidi } = getNearestPianoSample(midiNote);
    const preferredVariant = choosePianoSampleVariant(midiNote, velocity);
    const fallbackVariant: PianoSampleVariant = preferredVariant === 'regular' ? 'short' : 'regular';
    const buffer =
      await this.loadHostPianoSample(preferredVariant, index) ??
      await this.loadHostPianoSample(fallbackVariant, index);
    if (!buffer) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const playbackRate = Math.pow(2, (midiNote - sampleMidi) / 12);
    source.playbackRate.setValueAtTime(playbackRate, now);

    const state = sliderState as unknown as Record<string, unknown>;
    const pianoDistance = Math.max(0, Math.min(1, distanceOverride ?? getVoiceDistanceValue(sliderState, 'piano')));
    const pianoEnv = applyPianoDistanceEnvelope({
      attack: boundedNumber(state.pianoAttack, 0.005, 0.001, 2),
      decay: boundedNumber(state.pianoDecay, 0.65, 0.01, 4),
      sustain: boundedNumber(state.pianoSustain, 0.72, 0, 1),
      hold: boundedNumber(state.pianoHold, 0.2, 0, 4),
      release: boundedNumber(state.pianoRelease, 1.4, 0.01, 8),
    }, pianoDistance);
    const attack = Math.max(0.001, pianoEnv.attack);
    const decay = Math.max(0.01, pianoEnv.decay);
    const sustain = Math.max(0, Math.min(1, pianoEnv.sustain));
    const hold = Math.max(0, pianoEnv.hold ?? 0);
    const release = Math.max(0.01, pianoEnv.release);
    const triggeredPianoLevel = applyDistanceValue('pianoLevel', sliderState, 'piano', pianoDistance);
    const peak = Math.max(0.001, Math.min(1.25, velocity * triggeredPianoLevel * ENGINE_TRIMS.piano));
    const sustainLevel = peak * sustain;

    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      boundedNumber(applyDistanceValue('pianoPostLPF', sliderState, 'piano', pianoDistance), 16000, 20, 20000),
      now,
    );
    filter.Q.value = 0.707;

    source.connect(gain);
    gain.connect(filter);
    filter.connect(output);

    const attackEnd = now + attack;
    const decayEnd = attackEnd + decay;
    const holdEnd = decayEnd + hold;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);
    gain.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
    gain.gain.setValueAtTime(sustainLevel, holdEnd);
    gain.gain.linearRampToValueAtTime(0.0001, holdEnd + release);

    const activeVoice: ActiveHostPianoVoice = { source, gain, filter };
    this.activeHostPianoVoices.add(activeVoice);
    source.onended = () => {
      this.activeHostPianoVoices.delete(activeVoice);
      try { source.disconnect(); } catch { /* stale piano source */ }
      try { gain.disconnect(); } catch { /* stale piano gain */ }
      try { filter.disconnect(); } catch { /* stale piano filter */ }
    };

    source.start(now);
    const sourceDuration = buffer.duration / Math.max(0.01, playbackRate);
    source.stop(now + Math.min(sourceDuration, attack + decay + hold + release + 0.25));
  }

  private configureHostPianoFxSends(sliderState: SliderState): void {
    const context = this.ctx;
    if (!context || !this.node) return;
    const state = sliderState as unknown as Record<string, unknown>;
    const pianoActive = coreIsPianoRouteActive(state);
    const reverbGain = pianoActive && booleanValue(state.reverbEnabled, true)
      ? boundedNumber(applyDistanceValue('pianoReverbSend', sliderState, 'piano'), 0.35, 0, 1)
      : 0;
    const delayAGain = pianoActive
      ? boundedNumber(state.pianoDelayASend, 0, 0, 1)
      : 0;
    const delayBGain = pianoActive && booleanValue(state.granularDelayEnabled, false)
      ? boundedNumber(state.pianoDelayBSend, 0, 0, 1)
      : 0;
    const granularGain = pianoActive && booleanValue(state.granularEnabled, false)
      ? boundedNumber(state.granularPianoSend, 0, 0, 1)
      : 0;
    const now = context.currentTime;
    const smoothTime = 0.015;
    this.hostPianoReverbSend?.gain.setTargetAtTime(reverbGain, now, smoothTime);
    this.hostPianoDelayASend?.gain.setTargetAtTime(delayAGain, now, smoothTime);
    this.hostPianoDelayBSend?.gain.setTargetAtTime(delayBGain, now, smoothTime);
    this.hostPianoGranularSend?.gain.setTargetAtTime(granularGain, now, smoothTime);
    this.hostPianoExternalInputs = {
      reverbActive: reverbGain > 0.0001,
      delayAActive: delayAGain > 0.0001,
      delayBActive: delayBGain > 0.0001,
      granularActive: granularGain > 0.0001,
    };
    this.postHostExternalInputState();
  }

  private configureHostPianoEuclid(sliderState: SliderState, hostPiano: CoreHostPianoPreview): void {
    const chords = hostPiano.chords;
    const notes = chords.flat();
    const configKey = notes.length > 0
      ? `${hostPiano.noteKey}:${hostPiano.loopSeconds.toFixed(4)}`
      : 'host-piano-euclid:off';
    if (this.hostPianoEuclidConfigKey === configKey) return;

    this.clearHostPianoEuclidTimers();
    this.hostPianoEuclidConfigKey = configKey;
    if (notes.length === 0 || hostPiano.loopSeconds <= 0) return;

    const playbackState = { ...sliderState };
    const uniqueSampleIndices = new Set(notes.map((note) => getNearestPianoSample(frequencyToMidiNote(note.frequency)).index));
    for (const index of uniqueSampleIndices) {
      void this.ensureHostPianoSamplePairLoaded(index);
    }

    const scheduleCycle = (chordIndex = 0) => {
      const chord = chords[chordIndex] ?? [];
      for (const note of chord) {
        const timer = window.setTimeout(() => {
          this.hostPianoEuclidTimers.delete(timer);
          void this.playHostPianoNote(note.frequency, note.velocity, playbackState, note.distanceOverride ?? null);
        }, Math.max(0, note.delaySeconds * 1000));
        this.hostPianoEuclidTimers.add(timer);
      }

      const nextChordIndex = (chordIndex + 1) % Math.max(1, chords.length);
      const nextCycleTimer = window.setTimeout(() => {
        this.hostPianoEuclidTimers.delete(nextCycleTimer);
        scheduleCycle(nextChordIndex);
      }, Math.max(100, hostPiano.loopSeconds * 1000));
      this.hostPianoEuclidTimers.add(nextCycleTimer);
    };

    const firstCycleTimer = window.setTimeout(() => {
      this.hostPianoEuclidTimers.delete(firstCycleTimer);
      scheduleCycle(0);
    }, Math.max(0, hostPiano.initialStartDelaySeconds * 1000));
    this.hostPianoEuclidTimers.add(firstCycleTimer);
  }

  private stopSynthEuclidLiveEvolve(): void {
    if (this.synthEuclidLiveEvolveTimer !== null) {
      window.clearTimeout(this.synthEuclidLiveEvolveTimer);
      this.synthEuclidLiveEvolveTimer = null;
    }
    this.synthEuclidLiveEvolveKey = null;
    this.synthEuclidLiveEvolveNextAtMs = [0, 0, 0, 0];
    this.synthEuclidLiveEvolveBars = [0, 0, 0, 0];
    this.resetSynthEuclidEvolveBarCounters();
  }

  private resetSynthEuclidEvolveBarCounters(): void {
    for (const state of this.synthEvolveStates) {
      state.lastEvolveBar = 0;
    }
  }

  private getSynthLiveEvolveLaneCycleMs(sliderState: SliderState): (number | null)[] {
    const state = sliderState as unknown as Record<string, unknown>;
    if (!booleanValue(state.synthEuclideanMasterEnabled, false)) return [null, null, null, null];
    const bpm = boundedNumber(getEffectiveSequencerBpm(sliderState), 120, 40, 300);
    const tempo = boundedNumber(state.synthEuclideanTempo, 1, 0.25, 12);
    const beatSeconds = 60 / (bpm * tempo);
    return CORE_SYNTH_LANE_INDICES.map((laneIndex) => {
      const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
      const config = this.synthEvolveConfigs[laneIndex];
      if (!config?.enabled || !booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0)) return null;
      const defaultPattern = defaultSynthEuclidPattern(laneIndex);
      const patternParams = resolveDrumEuclidPatternParams(
        typeof state[`synthEuclid${lane}Preset`] === 'string' ? String(state[`synthEuclid${lane}Preset`]) : 'custom',
        boundedInteger(state[`synthEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
        boundedInteger(state[`synthEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
        boundedInteger(state[`synthEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
      );
      const clockDiv = this.synthEuclidClockDivs[laneIndex] ?? CORE_SYNTH_EUCLID_CLOCK_DIVS[laneIndex] ?? '1/8';
      const stepSeconds = clockDivToSeconds(clockDiv, beatSeconds);
      const swing = normalizeSequencerSwing(this.synthEuclidSwings[laneIndex]);
      const swingSteps = Math.floor(patternParams.steps / 2);
      const cycleSeconds = patternParams.steps * stepSeconds + swingSteps * stepSeconds * swing * 0.5;
      return Math.max(250, cycleSeconds * 1000);
    });
  }

  private synthLiveEvolveKey(sliderState: SliderState, cycleMs: readonly (number | null)[]): string {
    const state = sliderState as unknown as Record<string, unknown>;
    const configKey = this.synthEvolveConfigs
      .map((config) => `${config.enabled ? 1 : 0}:${config.everyBars}:${config.evolution}:${config.writeOffset}:${config.mutationMode}:${Object.entries(config.methods).filter(([, enabled]) => enabled).map(([key]) => key).join(',')}:${(config.enabledSubLanes ?? []).join(',')}`)
      .join('|');
    const laneKey = CORE_SYNTH_LANE_INDICES
      .map((laneIndex) => {
        const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
        const defaultPattern = defaultSynthEuclidPattern(laneIndex);
        return [
          booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0) ? 1 : 0,
          state[`synthEuclid${lane}Preset`] ?? 'custom',
          state[`synthEuclid${lane}Steps`] ?? defaultPattern.steps,
          state[`synthEuclid${lane}Hits`] ?? defaultPattern.hits,
          state[`synthEuclid${lane}Rotation`] ?? defaultPattern.rotation,
          this.synthEuclidClockDivs[laneIndex] ?? '',
          Math.round((this.synthEuclidSwings[laneIndex] ?? 0) * 1000),
          Math.round((cycleMs[laneIndex] ?? 0) * 1000) / 1000,
        ].join(':');
      })
      .join('|');
    return `${getEffectiveSequencerBpm(sliderState)}:${state.synthEuclideanTempo ?? 1}:${configKey}:${laneKey}`;
  }

  private syncSynthEuclidLiveEvolve(sliderState: SliderState): void {
    if (!this.ctx) {
      this.stopSynthEuclidLiveEvolve();
      return;
    }
    const cycleMs = this.getSynthLiveEvolveLaneCycleMs(sliderState);
    if (!cycleMs.some((value) => value !== null)) {
      this.stopSynthEuclidLiveEvolve();
      return;
    }
    const key = this.synthLiveEvolveKey(sliderState, cycleMs);
    const nowMs = performance.now();
    if (key !== this.synthEuclidLiveEvolveKey) {
      if (this.synthEuclidLiveEvolveTimer !== null) {
        window.clearTimeout(this.synthEuclidLiveEvolveTimer);
        this.synthEuclidLiveEvolveTimer = null;
      }
      this.synthEuclidLiveEvolveKey = key;
      this.synthEuclidLiveEvolveBars = [0, 0, 0, 0];
      this.synthEuclidLiveEvolveNextAtMs = cycleMs.map((value) => value == null ? 0 : nowMs + value);
      this.resetSynthEuclidEvolveBarCounters();
    }
    this.armSynthEuclidLiveEvolveTimer(cycleMs);
  }

  private armSynthEuclidLiveEvolveTimer(cycleMs = this.getSynthLiveEvolveLaneCycleMs(this.lastSliderState ?? ({} as SliderState))): void {
    if (this.synthEuclidLiveEvolveTimer !== null) return;
    const nowMs = performance.now();
    const nextAt = cycleMs
      .map((value, index) => value == null ? null : this.synthEuclidLiveEvolveNextAtMs[index])
      .filter((value): value is number => typeof value === 'number' && value > 0);
    if (nextAt.length === 0) return;
    const delayMs = Math.max(20, Math.min(...nextAt) - nowMs);
    this.synthEuclidLiveEvolveTimer = window.setTimeout(() => this.handleSynthEuclidLiveEvolveTick(), delayMs);
  }

  private handleSynthEuclidLiveEvolveTick(): void {
    this.synthEuclidLiveEvolveTimer = null;
    const baseState = this.lastSliderState;
    if (!baseState || !this.ctx) {
      this.stopSynthEuclidLiveEvolve();
      return;
    }
    const sliderState = this.getEffectiveRuntimeRandomWalkState(this.getEffectiveDualRangeState(baseState));
    const cycleMs = this.getSynthLiveEvolveLaneCycleMs(sliderState);
    const nowMs = performance.now();
    let changed = false;
    for (const laneIndex of CORE_SYNTH_LANE_INDICES) {
      const laneCycleMs = cycleMs[laneIndex];
      let nextAt = this.synthEuclidLiveEvolveNextAtMs[laneIndex] ?? 0;
      if (laneCycleMs == null || nextAt <= 0) continue;
      if (nextAt > nowMs + 10) continue;
      let bar = this.synthEuclidLiveEvolveBars[laneIndex] ?? 0;
      while (nextAt <= nowMs + 10) {
        nextAt += laneCycleMs;
        bar += 1;
      }
      this.synthEuclidLiveEvolveNextAtMs[laneIndex] = nextAt;
      this.synthEuclidLiveEvolveBars[laneIndex] = bar;
      changed = this.evolveSynthEuclidLaneAtBoundary(laneIndex, sliderState, bar) || changed;
    }
    if (changed) {
      this.reapplyLastState();
    }
    this.armSynthEuclidLiveEvolveTimer(cycleMs);
  }

  private evolveSynthEuclidLaneAtBoundary(laneIndex: number, sliderState: SliderState, bar: number): boolean {
    const state = sliderState as unknown as Record<string, unknown>;
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    const config = this.synthEvolveConfigs[laneIndex];
    if (!config?.enabled || !booleanValue(state[`synthEuclid${lane}Enabled`], laneIndex === 0)) return false;
    const source = coreSynthEuclidSource(state, lane);
    const isPadSource = isCoreSynthPadSource(source);
    const evolveTension = isPadSource
      ? getEffectiveTension(
        boundedNumber(state.tension, 0.3, -1, 1),
        state.padTensionMode === 'locked' || state.padTensionMode === 'bypass' ? state.padTensionMode : 'follow',
        boundedNumber(state.padTensionValue, 0, -1, 1),
      )
      : getEffectiveTension(
        boundedNumber(state.tension, 0.3, -1, 1),
        state.synthEuclidTensionMode === 'locked' || state.synthEuclidTensionMode === 'bypass' ? state.synthEuclidTensionMode : 'follow',
        boundedNumber(state.synthEuclidTensionValue, 0, -1, 1),
      );
    const laneOverrides = this.extractSynthLaneOverrides(laneIndex);
    const pitchSettings = this.synthPitchSettings[laneIndex];
    if (laneOverrides.pitch && pitchSettings && pitchSettings.mode !== 'noteRange') {
      laneOverrides.pitch = this.midiToOffsets(laneOverrides.pitch, pitchSettings);
    }
    const defaultPattern = defaultSynthEuclidPattern(laneIndex);
    const patternParams = resolveDrumEuclidPatternParams(
      typeof state[`synthEuclid${lane}Preset`] === 'string' ? String(state[`synthEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`synthEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
      boundedInteger(state[`synthEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
      boundedInteger(state[`synthEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
    );
    const noteRangeOverride = this.synthNoteRangeOverrides[laneIndex];
    const noteMin = noteRangeOverride?.min ?? boundedInteger(state[`synthEuclid${lane}NoteMin`], laneIndex === 1 ? 76 : laneIndex === 2 ? 52 : laneIndex === 3 ? 88 : 64, 24, 108);
    const noteMax = noteRangeOverride?.max ?? boundedInteger(state[`synthEuclid${lane}NoteMax`], laneIndex === 1 ? 88 : laneIndex === 2 ? 64 : laneIndex === 3 ? 96 : 76, 24, 108);
    const uiEnabledSubLanes = this.synthSubLaneEnabled[laneIndex] ?? {};
    const enabledSubLanes = (config.enabledSubLanes ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'])
      .filter((subLane) => subLane === 'probability' || subLane === 'ratchet' || uiEnabledSubLanes[subLane] === true);
    const seedWindow = sliderState.seedWindow === 'day' ? 'day' : 'hour';
    this.synthEuclidLiveEvolveRng ??= createRng(`${getUtcBucket(seedWindow)}|E_ROOT|core-synth-euclid-live-evolve`);
    const evolveState = this.synthEvolveStates[laneIndex] ?? defaultSynthEvolveState();
    this.synthEvolveStates[laneIndex] = evolveState;
    if (!evolveState.homePitchSettings && pitchSettings) evolveState.homePitchSettings = { ...pitchSettings };
    const result = evolveSynthLane(
      laneOverrides,
      { ...config, enabledSubLanes },
      evolveState,
      bar,
      this.synthEuclidLiveEvolveRng,
      {
        effectiveTension: Math.max(0, evolveTension),
        swing: this.synthEuclidSwings[laneIndex] ?? 0,
        steps: patternParams.steps,
        scaleIntervals: pitchSettings?.mode === 'notes' ? (SCALES[pitchSettings.scale] || [0, 2, 4, 5, 7, 9, 11]) : undefined,
        pitchMode: pitchSettings?.mode,
        noteRangeMin: noteMin,
        noteRangeMax: noteMax,
      },
    );
    if (!result.changed) return false;
    const offsetOverrides = result.overrides;
    const storedOverrides: SynthLaneOverrides = { ...offsetOverrides };
    if (offsetOverrides.pitch && pitchSettings && pitchSettings.mode !== 'noteRange') {
      storedOverrides.pitch = this.offsetsToMidi(offsetOverrides.pitch, pitchSettings);
    }
    this.applySynthLaneOverrides(laneIndex, storedOverrides);
    this.synthEuclidSwings[laneIndex] = result.swing;
    this.onSynthEvolveTrigger?.(laneIndex);
    const subLaneStates = synthEvolvedSubLaneStatePatch(offsetOverrides);
    this.onSynthEvolveOverridesChanged?.(laneIndex, {
      ...offsetOverrides,
      swing: result.swing,
      ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
    });
    if (result.noteRangeMin !== undefined && result.noteRangeMax !== undefined) {
      this.synthNoteRangeOverrides[laneIndex] = { min: result.noteRangeMin, max: result.noteRangeMax };
      this.onSynthNoteRangeEvolved?.(laneIndex, result.noteRangeMin, result.noteRangeMax);
    }
    return true;
  }

  updateParams(sliderState: SliderState, options?: CoreEngineHostUpdateOptions): void {
    this.applyCoreState(sliderState, options);
    this.notifyStateChange();
  }

  setDrumEuclidClockDivs(divs: ClockDivision[]): void {
    const next = CORE_DRUM_LANE_INDICES.map((index) =>
      divs[index] ?? this.drumEuclidClockDivs[index] ?? CORE_DRUM_EUCLID_CLOCK_DIVS[index] ?? '1/8',
    );
    if (next.every((value, index) => value === this.drumEuclidClockDivs[index])) return;
    this.drumEuclidClockDivs = next;
    this.reapplyLastState();
  }

  setDrumEuclidSwings(swings: number[]): void {
    const next = CORE_DRUM_LANE_INDICES.map((index) =>
      normalizeSequencerSwing(swings[index], this.drumEuclidSwings[index] ?? 0),
    );
    if (next.every((value, index) => value === this.drumEuclidSwings[index])) return;
    this.drumEuclidSwings = next;
    this.reapplyLastState();
  }

  setDrumStepOverrides(overrides: DrumStepOverrides): void {
    this.drumStepOverrides = cloneCoreDrumStepOverrides(overrides);
    const homeIsEmpty = this.drumHomeStepOverrides.triggerToggles.every((toggles) => toggles.size === 0) &&
      this.drumHomeStepOverrides.expression.every((values) => !values) &&
      this.drumHomeStepOverrides.morph.every((values) => !values) &&
      this.drumHomeStepOverrides.distance.every((values) => !values) &&
      this.drumHomeStepOverrides.pitch.every((values) => !values);
    if (homeIsEmpty) {
      this.drumHomeStepOverrides = cloneCoreDrumStepOverrides(overrides);
    }
    this.reapplyLastState();
  }

  setSequencerPresetHomeSnapshots(): void {
    this.drumHomeStepOverrides = cloneCoreDrumStepOverrides(this.drumStepOverrides);
    for (const index of CORE_SYNTH_LANE_INDICES) this.captureCurrentSynthLaneHome(index);
  }

  captureSynthEuclidLaneHome(laneIndex: number, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    this.captureCurrentSynthLaneHome(Math.max(0, Math.min(CORE_SYNTH_LANE_INDICES.length - 1, Math.trunc(laneIndex))), pitchState);
  }

  captureDrumEuclidLaneHome(laneIndex: number, pitchSettings?: SequencerPitchSettings | null, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    const index = Math.max(0, Math.min(CORE_DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const current = cloneCoreDrumStepOverrides(this.drumHomeStepOverrides);
    const source = cloneCoreDrumStepOverrides(this.drumStepOverrides);
    for (const key of Object.keys(current) as (keyof DrumStepOverrides)[]) {
      (current[key] as unknown[])[index] = source[key]?.[index] ?? null;
    }
    this.drumHomeStepOverrides = current;
    if (pitchSettings) {
      this.drumHomePitchSettings[index] = normalizeSequencerPitchSettings(pitchSettings, this.drumHomePitchSettings[index] ?? undefined);
    }
    if (pitchState) {
      this.drumHomePitchSubLaneStates[index] = { steps: pitchState.steps, direction: pitchState.direction, scaleQuantize: pitchState.scaleQuantize };
      if (typeof pitchState.scaleQuantize === 'boolean') this.drumHomePitchScaleQuantize[index] = pitchState.scaleQuantize;
    }
  }

  setDrumSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.drumSubLaneEnabled = CORE_DRUM_LANE_INDICES.map((index) => ({ ...(states[index] ?? {}) }));
    this.reapplyLastState();
  }

  setDrumEuclidEvolveConfigs(configs: Partial<DrumEuclidEvolveConfig>[]): void {
    this.drumEvolveConfigs = CORE_DRUM_LANE_INDICES.map((index) => {
      const current = this.drumEvolveConfigs[index] ?? defaultCoreDrumEuclidEvolveConfig();
      const incoming = configs[index] ?? {};
      const enabledSubLanes = mergeEvolveEnabledSubLanes(incoming.enabledSubLanes, current.enabledSubLanes);
      return {
        ...current,
        enabled: incoming.enabled === undefined ? current.enabled : incoming.enabled === true,
        everyBars: typeof incoming.everyBars === 'number' && Number.isFinite(incoming.everyBars)
          ? Math.max(1, Math.round(incoming.everyBars))
          : current.everyBars,
        evolution: typeof incoming.evolution === 'number' && Number.isFinite(incoming.evolution)
          ? Math.max(0, Math.min(1, incoming.evolution))
          : current.evolution,
        writeOffset: normalizeEvolveWriteOffset(incoming.writeOffset, current.writeOffset),
        mutationMode: incoming.mutationMode === 'strict' ? 'strict' : incoming.mutationMode === 'biased' ? 'biased' : current.mutationMode,
        methods: mergeEvolveMethods(current.methods, incoming.methods),
        ...(enabledSubLanes ? { enabledSubLanes } : {}),
      };
    });
    this.reapplyLastState();
  }

  setDrumMorphRange(voice: DrumVoiceType, range: { min: number; max: number } | null): void {
    if (!DRUM_VOICE_TYPES.includes(voice as CoreDrumVoice)) return;
    const coreVoice = voice as CoreDrumVoice;
    this.drumMorphRanges[coreVoice] = range ? { min: range.min, max: range.max } : null;
    this.reapplyLastState();
  }

  setDrumParamSHRange(key: string, range: { min: number; max: number } | null): void {
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
      this.drumParamSHRanges.set(key, { min: range.min, max: range.max });
    } else {
      this.drumParamSHRanges.delete(key);
    }
    this.reapplyLastState();
  }

  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void): void {
    this.onDrumTrigger = callback;
  }

  setDrumMorphTriggerCallback(callback: (voice: DrumVoiceType, morphPosition: number) => void): void {
    this.onDrumMorphTrigger = callback;
  }

  setDrumParamSHTriggerCallback(callback: (voice: DrumVoiceType, key: string, position: number) => void): void {
    this.onDrumParamSHTrigger = callback;
  }

  setDrumEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void): void {
    this.onDrumEvolveTrigger = callback;
  }

  setDrumStepPositionCallback(callback: (steps: number[], hitCounts: number[]) => void): void {
    this.onDrumStepPositionChange = callback;
    this.onDrumStepPositionChange?.([0, 0, 0, 0], [0, 0, 0, 0]);
  }

  setDrumEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: CoreDrumEvolveOverridesPayload) => void): void {
    this.onDrumEvolveOverridesChanged = callback;
  }

  resetDrumEuclidLaneHome(laneIndex: number): void {
    const index = Math.max(0, Math.min(CORE_DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const previous = this.drumStepOverrides;
    const restored = cloneCoreDrumStepOverrides(this.drumStepOverrides);
    const home = this.drumHomeStepOverrides;
    restored.triggerToggles[index] = new Map(home.triggerToggles[index] ?? []);
    restored.probability[index] = home.probability[index] ? [...home.probability[index]!] : null;
    restored.ratchet[index] = home.ratchet[index] ? [...home.ratchet[index]!] : null;
    restored.trigCondition[index] = home.trigCondition[index] ? home.trigCondition[index]!.map((entry) => [entry[0], entry[1]] as TrigCondition) : null;
    restored.expression[index] = home.expression[index] ? [...home.expression[index]!] : null;
    restored.pitch[index] = home.pitch[index] ? [...home.pitch[index]!] : null;
    restored.morph[index] = home.morph[index] ? [...home.morph[index]!] : null;
    restored.distance[index] = home.distance[index] ? [...home.distance[index]!] : null;
    restored.slice[index] = home.slice[index] ? [...home.slice[index]!] : null;
    restored.reverse[index] = home.reverse[index] ? [...home.reverse[index]!] : null;
    restored.expressionDirection[index] = home.expressionDirection?.[index] ?? null;
    restored.pitchDirection[index] = home.pitchDirection?.[index] ?? null;
    restored.morphDirection[index] = home.morphDirection?.[index] ?? null;
    restored.distanceDirection[index] = home.distanceDirection?.[index] ?? null;
    restored.sliceDirection[index] = home.sliceDirection?.[index] ?? null;
    restored.reverseDirection[index] = home.reverseDirection?.[index] ?? null;
    restored.expressionRanges![index] = home.expressionRanges?.[index] ?? null;
    restored.morphRanges![index] = home.morphRanges?.[index] ?? null;
    restored.distanceRanges![index] = home.distanceRanges?.[index] ?? null;
    this.drumStepOverrides = restored;
    const pitchSettings = this.drumHomePitchSettings[index]
      ? [null, null, null, null].map((_, lane) => lane === index ? { ...this.drumHomePitchSettings[index]! } : null)
      : null;
    const subLaneStates = drumStepOverrideSubLaneStatePatch(restored, index, previous);
    if (this.drumHomePitchSubLaneStates[index]) {
      subLaneStates.pitch = { ...(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }), ...this.drumHomePitchSubLaneStates[index]! };
    }
    this.onDrumEvolveOverridesChanged?.(index, {
      ...restored,
      swing: this.drumEuclidSwings[index] ?? 0,
      subLaneStates,
      ...(pitchSettings ? { pitchSettings } : {}),
    });
    this.reapplyLastState();
  }

  diceDrumEuclidLane(laneIndex: number, intensity: number = 1): void {
    const index = Math.max(0, Math.min(CORE_DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const steps = this.getDrumLaneStepCount(index);
    const amount = clamp(finiteNumber(intensity, 1), 0, 1);
    const rng = Math.random;
    const next = cloneCoreDrumStepOverrides(this.drumStepOverrides);
    const toggles = new Map<number, boolean>();
    const hitTarget = Math.max(1, Math.round(steps * (0.15 + rng() * 0.55)));
    const pattern = seqEuclidean(steps, hitTarget, Math.floor(rng() * steps));
    for (let step = 0; step < steps; step += 1) {
      if (rng() < amount) toggles.set(step, pattern[step] ?? false);
    }
    next.triggerToggles[index] = toggles;
    next.probability[index] = Array.from({ length: steps }, () => clamp(0.55 + rng() * 0.45, 0, 1));
    next.ratchet[index] = Array.from({ length: steps }, () => rng() < 0.2 * amount ? 2 + Math.floor(rng() * 3) : 1);
    next.expression[index] = Array.from({ length: steps }, () => clamp(0.55 + rng() * 0.45, 0, 1));
    next.pitch[index] = Array.from({ length: steps }, () => Math.round((rng() - 0.5) * 14 * amount));
    next.morph[index] = Array.from({ length: steps }, () => clamp(rng(), 0, 1));
    next.distance[index] = Array.from({ length: steps }, () => clamp(rng(), 0, 1));
    this.drumStepOverrides = next;
    this.drumHomeStepOverrides = cloneCoreDrumStepOverrides(next);
    this.onDrumEvolveTrigger?.(index);
    this.onDrumEvolveOverridesChanged?.(index, {
      ...next,
      swing: this.drumEuclidSwings[index] ?? 0,
      subLaneStates: drumStepOverrideSubLaneStatePatch(next, index),
    });
    this.reapplyLastState();
  }

  getDrumVoiceAnalyser(_voice: DrumVoiceType): AnalyserNode | undefined {
    return undefined;
  }

  async triggerDrumVoice(voice: DrumVoiceType, velocity: number = 0.8, externalState?: SliderState): Promise<void> {
    if (!DRUM_VOICE_TYPES.includes(voice as CoreDrumVoice)) return;
    const baseState = externalState ?? this.lastSliderState;
    if (!baseState) return;
    const sliderState = { ...baseState, drumEnabled: true } as SliderState;
    if (!this.isRunning && !this.isStarting) {
      await this.start(sliderState);
    }
    const node = this.node;
    if (!node) return;
    const playbackState = this.getEffectiveRuntimeRandomWalkState(this.getEffectiveDualRangeState(sliderState));
    this.configureAuxPreviewSource('drum', createManualDrumPreviewSource(playbackState));
    const coreVoice = voice as CoreDrumVoice;
    node.port.postMessage({
      type: 'triggerAuxSourceNote',
      slot: 'drum',
      note: {
        frequency: 0,
        velocity: clamp(finiteNumber(velocity, 0.8), 0, 1),
        route: DRUM_VOICE_INDEX[coreVoice],
        delaySeconds: 0,
        holdSeconds: 0,
      },
    });
    const morphRange = this.drumMorphRanges[coreVoice];
    if (morphRange) {
      this.onDrumMorphTrigger?.(voice, (morphRange.min + morphRange.max) * 0.5);
    }
    const distanceRange = getCoreDrumParamSHRange({
      clockDivs: this.drumEuclidClockDivs,
      swings: this.drumEuclidSwings,
      stepOverrides: this.drumStepOverrides,
      subLaneEnabled: this.drumSubLaneEnabled,
      morphRanges: this.drumMorphRanges,
      paramSHRanges: this.drumParamSHRanges,
    }, coreVoice, 'Distance');
    if (distanceRange) {
      this.onDrumParamSHTrigger?.(voice, `${DRUM_VOICE_STATE_PREFIX[coreVoice]}Distance`, (distanceRange.min + distanceRange.max) * 0.5);
    }
    this.onDrumTrigger?.(voice, velocity);
  }

  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    const normalizedRanges: Partial<Record<string, { min: number; max: number }>> = {};
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      normalizedRanges[key] = {
        min: Math.min(range.min, range.max),
        max: Math.max(range.min, range.max),
      };
    }
    this.dualRanges = normalizedRanges;
    this.reapplyLastState();
  }

  setRuntimeWalkRanges(ranges: Partial<Record<string, RuntimeWalkRange>>): void {
    const nextRanges: Partial<Record<string, RuntimeWalkRange>> = {};
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      nextRanges[key] = { min: Math.min(range.min, range.max), max: Math.max(range.min, range.max) };
      if (!this.runtimeWalkStates.has(key)) {
        this.runtimeWalkStates.set(key, {
          position: Math.random(),
          velocity: (Math.random() - 0.5) * 0.02,
        });
      }
    }
    for (const key of Array.from(this.runtimeWalkStates.keys())) {
      if (!nextRanges[key]) this.runtimeWalkStates.delete(key);
    }
    this.runtimeWalkRanges = nextRanges;
    this.emitRuntimeWalkPositions(true);
    this.syncRuntimeRandomWalk();
    this.reapplyLastState();
  }

  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null): void {
    this.onRuntimeWalkPositionsChange = callback;
    if (callback) callback({ ...this.runtimeWalkPositions });
  }

  setVisualTelemetryActive(_active: boolean): void {
    // Core smoke host already mirrors visual state in-process.
  }

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null): void {
    this.onJourneyMorphClockFrame = callback;
    if (!callback) this.stopJourneyMorphClock();
  }

  private resetTransportAnchors(): TransportAnchors {
    const nowWallSec = Date.now() / 1000;
    const nowCtxSec = this.ctx?.currentTime ?? 0;
    const anchors = {
      localPhraseWallStartSec: nowWallSec,
      localBeatWallStartSec: nowWallSec,
      localBeatCtxStartSec: nowCtxSec,
    };
    this.transportAnchors = anchors;
    return anchors;
  }

  private ensureTransportAnchors(): TransportAnchors {
    return this.transportAnchors ?? this.resetTransportAnchors();
  }

  private getCorePreviewBucket(state: SliderState): string {
    return getUtcBucket(state.seedWindow === 'day' ? 'day' : 'hour');
  }

  private getCorePreviewHarmonyState(state: SliderState | null = this.lastSliderState): HarmonyState | null {
    if (!state) return null;
    return createCorePreviewHarmonyState(state);
  }

  private getTransportDebugStateInternal(nowWallSec: number = Date.now() / 1000): TransportDebugSnapshot | null {
    const state = this.lastSliderState;
    if (!state) return null;

    const anchors = this.ensureTransportAnchors();
    const clockSource = state.harmonyClockSource ?? 'globalPhrase';
    const phraseSeconds = getPhraseDurationForClockSource(state, clockSource);
    const metrics = getTransportMetrics(state);
    const nextPhraseBoundaryIn = getTimeUntilNextBoundaryWall(
      clockSource,
      phraseSeconds,
      anchors,
      nowWallSec,
    );

    const chordRateSeconds = boundedNumber(state.chordRate, 32, 1, 128);
    const nextHarmonyEventIn = chordRateSeconds < phraseSeconds
      ? getTimeUntilNextBoundaryWall(
        clockSource,
        phraseSeconds / Math.max(2, Math.round(phraseSeconds / chordRateSeconds)),
        anchors,
        nowWallSec,
      )
      : nextPhraseBoundaryIn;

    const progressionSource = resolveProgressionPhraseClockSource(
      state.chordProgressionClockSource ?? 'harmony',
      clockSource,
    );
    const progressionPhraseSeconds = getPhraseDurationForClockSource(state, progressionSource);
    const progressionStepSeconds = progressionPhraseSeconds * Math.max(1, state.chordProgressionPhraseMultiplier ?? 1);
    const nextProgressionStepIn = state.chordProgressionEnabled
      ? getTimeUntilNextBoundaryWall(progressionSource, progressionStepSeconds, anchors, nowWallSec)
      : null;

    return {
      effectiveBpm: metrics.effectiveBpm,
      effectivePhraseSeconds: phraseSeconds,
      nextPhraseBoundaryIn,
      nextHarmonyEventIn,
      nextProgressionStepIn,
    };
  }

  startJourneyMorphClock(): void {
    if (this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;
    this.journeyMorphClockActive = true;
    this.scheduleJourneyMorphClockTick();
  }

  stopJourneyMorphClock(): void {
    this.journeyMorphClockActive = false;
    this.cancelJourneyMorphClockTick();
  }

  private cancelJourneyMorphClockTick(): void {
    if (this.journeyMorphClockRaf !== null) {
      window.cancelAnimationFrame(this.journeyMorphClockRaf);
      this.journeyMorphClockRaf = null;
    }
    if (this.journeyMorphClockTimeout !== null) {
      window.clearTimeout(this.journeyMorphClockTimeout);
      this.journeyMorphClockTimeout = null;
    }
  }

  resetCofDrift(): void {
    if (this.lastSliderState) {
      this.lastSliderState = { ...this.lastSliderState, cofCurrentStep: 0 };
      this.reapplyLastState();
    }
    this.notifyStateChange();
  }

  getTransportDebugState(): TransportDebugSnapshot | null {
    return this.getTransportDebugStateInternal();
  }

  getEarthTextureDebugState(): EarthTextureDebugState {
    return {
      waves: this.hostEarthTextures.waves?.player.getDebugSnapshot() ?? null,
      birds: this.hostEarthTextures.birds?.player.getDebugSnapshot() ?? null,
      birds2: this.hostEarthTextures.birds2?.player.getDebugSnapshot() ?? null,
      frogs: this.hostEarthTextures.frogs?.player.getDebugSnapshot() ?? null,
    };
  }

  getDynamicsAnalyser(_key: DynamicsAnalyserKey): AnalyserNode | null {
    return null;
  }

  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    return {
      contextTime: this.ctx?.currentTime ?? 0,
      endCompHandledByWorklet: false,
      endCompReductionDb: 0,
      worklet: null,
      sidechainEvents: [],
    };
  }

  getLeadMorphedParams(lead: 1 | 2): Lead4opFMMorphedParams | null {
    const state = this.lastSliderState;
    if (!state) return null;
    return createLeadMorphedParams(state, lead === 2 ? 'lead2' : 'lead1').morphed;
  }

  setLeadExpressionCallback(callback: (expression: { lead1: number; lead2: number }) => void): void {
    void callback;
  }

  setLeadMorphCallback(callback: (morph: { lead1: number; lead2: number }) => void): void {
    void callback;
  }

  setPadMorphTriggerCallback(callback: (morphPosition: number) => void): void {
    void callback;
  }

  setPad2MorphTriggerCallback(callback: (morphPosition: number) => void): void {
    void callback;
  }

  setLeadDistanceCallback(callback: (distance: { lead1: number; lead2: number }) => void): void {
    void callback;
  }

  setPadDistanceTriggerCallback(callback: (distance: number) => void): void {
    void callback;
  }

  setPad2DistanceTriggerCallback(callback: (distance: number) => void): void {
    void callback;
  }

  setPianoDistanceTriggerCallback(callback: (distance: number) => void): void {
    void callback;
  }

  setLeadDelayCallback(callback: (delay: { lead1: string; lead2: string }) => void): void {
    void callback;
  }

  setGranularSHTriggerCallback(callback: (positions: Record<string, number>) => void): void {
    void callback;
  }

  private getEffectiveDualRangeState(baseState: SliderState): SliderState {
    const entries = Object.entries(this.dualRanges);
    if (entries.length === 0) return baseState;
    const timeSource = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const bucket = Math.floor(timeSource / RUNTIME_RANDOM_WALK_INTERVAL_MS);
    const rng = createRng(`${this.snapshotOptions.seed ?? 42}|${baseState.seedWindow}|core-dual-ranges|${bucket}`);
    const nextState = { ...baseState } as SliderState;
    const nextRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;
    for (const [key, range] of entries) {
      if (!range) continue;
      const paramKey = key as keyof SliderState;
      const numericValue = quantize(paramKey, range.min + rng() * (range.max - range.min));
      nextRecord[key] = getStateValueFromSliderNumber(paramKey, numericValue) as SliderState[keyof SliderState];
    }
    return nextState;
  }

  private getEffectiveRuntimeRandomWalkState(baseState: SliderState): SliderState {
    const walkEntries = Object.entries(this.runtimeWalkRanges);
    if (walkEntries.length === 0) return baseState;
    const nextState = { ...baseState } as SliderState;
    const nextRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;
    for (const [key, range] of walkEntries) {
      if (!range) continue;
      const position = this.runtimeWalkStates.get(key)?.position ?? 0.5;
      const paramKey = key as keyof SliderState;
      const numericValue = quantize(paramKey, range.min + position * (range.max - range.min));
      nextRecord[key] = getStateValueFromSliderNumber(paramKey, numericValue) as SliderState[keyof SliderState];
    }
    return nextState;
  }

  private emitRuntimeWalkPositions(force = false): void {
    const nextPositions: Record<string, number> = {};
    for (const key of Object.keys(this.runtimeWalkRanges)) {
      nextPositions[key] = this.runtimeWalkStates.get(key)?.position ?? 0.5;
    }
    let changed = force || Object.keys(nextPositions).length !== Object.keys(this.runtimeWalkPositions).length;
    if (!changed) {
      for (const [key, position] of Object.entries(nextPositions)) {
        if (Math.abs((this.runtimeWalkPositions[key] ?? 0.5) - position) > 0.0005) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    this.runtimeWalkPositions = nextPositions;
    this.onRuntimeWalkPositionsChange?.({ ...nextPositions });
  }

  private startRuntimeRandomWalk(): void {
    if (this.runtimeRandomWalkTimer !== null) {
      window.clearInterval(this.runtimeRandomWalkTimer);
      this.runtimeRandomWalkTimer = null;
    }
    this.runtimeRandomWalkLastUpdateMs = performance.now();
    this.runtimeRandomWalkTimer = window.setInterval(() => {
      const sourceState = this.lastSliderState;
      const now = performance.now();
      if (!sourceState) {
        this.runtimeRandomWalkLastUpdateMs = now;
        return;
      }
      const elapsedMs = Math.max(0, now - this.runtimeRandomWalkLastUpdateMs);
      this.runtimeRandomWalkLastUpdateMs = now;
      const speed = Math.max(0.01, sourceState.randomWalkSpeed ?? 1);
      const globalWalk = sourceState.randomWalkMode === 'globalWalk';
      const localStepCount = globalWalk
        ? 1
        : Math.max(1, Math.min(RANDOM_WALK_MAX_CATCHUP_STEPS, Math.round(elapsedMs / RUNTIME_RANDOM_WALK_INTERVAL_MS) || 1));
      let changed = false;
      for (const key of Object.keys(this.runtimeWalkRanges)) {
        const walkState = this.runtimeWalkStates.get(key) ?? { position: 0.5, velocity: 0 };
        let nextPosition = walkState.position;
        let nextVelocity = walkState.velocity;
        if (globalWalk) {
          nextPosition = sampleGlobalWalkPosition(key, speed, sourceState.seedWindow);
          nextVelocity = 0;
        } else {
          for (let step = 0; step < localStepCount; step += 1) {
            nextVelocity += (Math.random() - 0.5) * 0.01 * speed;
            nextVelocity *= 0.98;
            nextVelocity = clamp(nextVelocity, -0.05 * speed, 0.05 * speed);
            nextPosition += nextVelocity;
            if (nextPosition < 0) {
              nextPosition = 0;
              nextVelocity = Math.abs(nextVelocity);
            } else if (nextPosition > 1) {
              nextPosition = 1;
              nextVelocity = -Math.abs(nextVelocity);
            }
          }
        }
        if (Math.abs(walkState.position - nextPosition) > 0.0005 || Math.abs(walkState.velocity - nextVelocity) > 0.0005) {
          changed = true;
          this.runtimeWalkStates.set(key, { position: nextPosition, velocity: nextVelocity });
        }
      }
      if (!changed) return;
      this.emitRuntimeWalkPositions();
      this.reapplyLastState();
    }, RUNTIME_RANDOM_WALK_INTERVAL_MS);
  }

  private stopRuntimeRandomWalk(): void {
    if (this.runtimeRandomWalkTimer !== null) {
      window.clearInterval(this.runtimeRandomWalkTimer);
      this.runtimeRandomWalkTimer = null;
    }
    this.runtimeRandomWalkLastUpdateMs = 0;
  }

  private syncRuntimeRandomWalk(): void {
    const hasRuntimeWalks = Object.keys(this.runtimeWalkRanges).length > 0;
    if (!hasRuntimeWalks || !this.lastSliderState) {
      this.stopRuntimeRandomWalk();
      this.emitRuntimeWalkPositions(true);
      return;
    }
    if (this.runtimeRandomWalkTimer === null) {
      this.startRuntimeRandomWalk();
    }
  }

  private scheduleJourneyMorphClockTick(): void {
    if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;
    const tick = (now: number) => {
      this.journeyMorphClockRaf = null;
      this.journeyMorphClockTimeout = null;
      if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;
      this.onJourneyMorphClockFrame(now);
      if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;
      if (document.visibilityState === 'visible') {
        this.journeyMorphClockRaf = window.requestAnimationFrame(tick);
        return;
      }
      if (!this.isRunning) {
        this.stopJourneyMorphClock();
        return;
      }
      this.journeyMorphClockTimeout = window.setTimeout(() => tick(performance.now()), 50);
    };
    if (document.visibilityState === 'visible') {
      this.journeyMorphClockRaf = window.requestAnimationFrame(tick);
      return;
    }
    if (!this.isRunning) {
      this.stopJourneyMorphClock();
      return;
    }
    this.journeyMorphClockTimeout = window.setTimeout(() => tick(performance.now()), 50);
  }

  private getDrumLaneStepCount(laneIndex: number): number {
    const state = this.lastSliderState as unknown as Record<string, unknown> | null;
    if (!state) return this.drumStepOverrides.expression[laneIndex]?.length ?? 16;
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    const defaultPattern = defaultDrumEuclidPattern(laneIndex);
    const params = resolveDrumEuclidPatternParams(
      typeof state[`drumEuclid${lane}Preset`] === 'string' ? String(state[`drumEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`drumEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
      boundedInteger(state[`drumEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
      boundedInteger(state[`drumEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
    );
    return Math.max(1, params.steps);
  }

  setSynthEuclidClockDivs(divs: ClockDivision[]): void {
    const next = CORE_SYNTH_LANE_INDICES.map((index) =>
      divs[index] ?? this.synthEuclidClockDivs[index] ?? CORE_SYNTH_EUCLID_CLOCK_DIVS[index] ?? '1/8',
    );
    if (next.every((value, index) => value === this.synthEuclidClockDivs[index])) return;
    this.synthEuclidClockDivs = next;
    this.reapplyLastState();
  }

  setSynthEuclidSwings(swings: number[]): void {
    const next = CORE_SYNTH_LANE_INDICES.map((index) =>
      normalizeSequencerSwing(swings[index], this.synthEuclidSwings[index] ?? 0),
    );
    if (next.every((value, index) => value === this.synthEuclidSwings[index])) return;
    this.synthEuclidSwings = next;
    this.reapplyLastState();
  }

  setSynthStepOverrides(overrides: {
    pitch: (number[] | null)[];
    pitchDirection: (LaneDirection | null)[];
    triggerToggles?: Map<number, boolean>[];
    expression?: (number[] | null)[];
    expressionDirection?: (LaneDirection | null)[];
    expressionRanges?: ({ min: number; max: number } | null)[];
    morph?: (number[] | null)[];
    morphDirection?: (LaneDirection | null)[];
    morphRanges?: ({ min: number; max: number } | null)[];
    distance?: (number[] | null)[];
    distanceDirection?: (LaneDirection | null)[];
    distanceRanges?: ({ min: number; max: number } | null)[];
    probability?: (number[] | null)[];
    ratchet?: (number[] | null)[];
    trigCondition?: (TrigCondition[] | null)[];
  }): void {
    this.synthStepOverrides = {
      pitch: CORE_SYNTH_LANE_INDICES.map((index) => overrides.pitch[index] ? [...overrides.pitch[index]!] : null),
      pitchDirection: CORE_SYNTH_LANE_INDICES.map((index) => overrides.pitchDirection[index] ?? null),
      triggerToggles: CORE_SYNTH_LANE_INDICES.map((index) => new Map(overrides.triggerToggles?.[index] ?? this.synthStepOverrides.triggerToggles[index] ?? [])),
      expression: CORE_SYNTH_LANE_INDICES.map((index) => overrides.expression?.[index] ? [...overrides.expression[index]!] : this.synthStepOverrides.expression[index] ?? null),
      expressionDirection: CORE_SYNTH_LANE_INDICES.map((index) => overrides.expressionDirection?.[index] ?? this.synthStepOverrides.expressionDirection[index] ?? null),
      expressionRanges: CORE_SYNTH_LANE_INDICES.map((index) => overrides.expressionRanges?.[index] ?? this.synthStepOverrides.expressionRanges[index] ?? null),
      morph: CORE_SYNTH_LANE_INDICES.map((index) => overrides.morph?.[index] ? [...overrides.morph[index]!] : this.synthStepOverrides.morph[index] ?? null),
      morphDirection: CORE_SYNTH_LANE_INDICES.map((index) => overrides.morphDirection?.[index] ?? this.synthStepOverrides.morphDirection[index] ?? null),
      morphRanges: CORE_SYNTH_LANE_INDICES.map((index) => overrides.morphRanges?.[index] ?? this.synthStepOverrides.morphRanges[index] ?? null),
      distance: CORE_SYNTH_LANE_INDICES.map((index) => overrides.distance?.[index] ? [...overrides.distance[index]!] : this.synthStepOverrides.distance[index] ?? null),
      distanceDirection: CORE_SYNTH_LANE_INDICES.map((index) => overrides.distanceDirection?.[index] ?? this.synthStepOverrides.distanceDirection[index] ?? null),
      distanceRanges: CORE_SYNTH_LANE_INDICES.map((index) => overrides.distanceRanges?.[index] ?? this.synthStepOverrides.distanceRanges[index] ?? null),
      probability: CORE_SYNTH_LANE_INDICES.map((index) => overrides.probability?.[index] ? [...overrides.probability[index]!] : this.synthStepOverrides.probability[index] ?? null),
      ratchet: CORE_SYNTH_LANE_INDICES.map((index) => overrides.ratchet?.[index] ? [...overrides.ratchet[index]!] : this.synthStepOverrides.ratchet[index] ?? null),
      trigCondition: CORE_SYNTH_LANE_INDICES.map((index) => overrides.trigCondition?.[index] ? [...overrides.trigCondition[index]!] : this.synthStepOverrides.trigCondition[index] ?? null),
    };
    this.reapplyLastState();
  }

  setSynthEuclidEvolveConfigs(configs: Partial<SynthEvolveConfig>[]): void {
    this.synthEvolveConfigs = CORE_SYNTH_LANE_INDICES.map((index) => {
      const current = this.synthEvolveConfigs[index] ?? defaultSynthEvolveConfig();
      const incoming = configs[index] ?? {};
      const enabledSubLanes = mergeEvolveEnabledSubLanes(incoming.enabledSubLanes, current.enabledSubLanes);
      return {
        ...current,
        enabled: incoming.enabled === undefined ? current.enabled : incoming.enabled === true,
        everyBars: typeof incoming.everyBars === 'number' && Number.isFinite(incoming.everyBars)
          ? Math.max(1, Math.round(incoming.everyBars))
          : current.everyBars,
        evolution: typeof incoming.evolution === 'number' && Number.isFinite(incoming.evolution)
          ? Math.max(0, Math.min(1, incoming.evolution))
          : current.evolution,
        writeOffset: normalizeEvolveWriteOffset(incoming.writeOffset, current.writeOffset),
        mutationMode: incoming.mutationMode === 'strict' ? 'strict' : incoming.mutationMode === 'biased' ? 'biased' : current.mutationMode,
        methods: mergeEvolveMethods(current.methods, incoming.methods),
        ...(enabledSubLanes ? { enabledSubLanes } : {}),
      };
    });
    // Re-sync the live evolve timer so a disabled config stops the timer immediately
    if (this.lastSliderState) {
      this.syncSynthEuclidLiveEvolve(this.lastSliderState);
    }
  }

  setSynthSubLaneEnabled(states: Record<string, boolean>[]): void {
    this.synthSubLaneEnabled = CORE_SYNTH_LANE_INDICES.map((index) => ({ ...(states[index] ?? {}) }));
    this.reapplyLastState();
  }

  setSynthEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void): void {
    this.onSynthEvolveTrigger = callback;
  }

  setSynthEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: CoreSynthEvolveOverridesPayload) => void): void {
    this.onSynthEvolveOverridesChanged = callback;
  }

  setSynthPitchSettings(settings: { mode: PitchMode; root: number; scale: ScaleName }[]): void {
    this.synthPitchSettings = CORE_SYNTH_LANE_INDICES.map((index) =>
      normalizeSequencerPitchSettings(settings[index], this.synthPitchSettings[index]),
    );
    this.reapplyLastState();
  }

  setSynthPitchBindingModes(modes: PitchBindingMode[]): void {
    this.synthPitchBindingModes = CORE_SYNTH_LANE_INDICES.map((index) =>
      normalizeSequencerPitchBindingMode(modes[index], this.synthPitchBindingModes[index] ?? 'polyrhythmic'),
    );
    this.reapplyLastState();
  }

  setSynthNoteRangeEvolvedCallback(callback: (laneIndex: number, noteMin: number, noteMax: number) => void): void {
    this.onSynthNoteRangeEvolved = callback;
  }

  resetSynthEuclidLaneHome(laneIndex: number): void {
    const index = Math.max(0, Math.min(CORE_SYNTH_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const state = this.synthEvolveStates[index];
    if (!state?.home) return;

    const restored = resetSynthLaneToHome(this.extractSynthLaneOverrides(index), state);
    const pitchSettings = state.homePitchSettings ?? this.synthPitchSettings[index];
    const stored: SynthLaneOverrides = { ...restored };
    if (restored.pitch && pitchSettings && pitchSettings.mode !== 'noteRange') {
      stored.pitch = this.offsetsToMidi(restored.pitch, pitchSettings);
    }
    this.applySynthLaneOverrides(index, stored);
    this.synthEuclidSwings[index] = state.homeSwing ?? this.synthEuclidSwings[index] ?? 0;
    const subLaneStates = synthEvolvedSubLaneStatePatch(restored);
    if (state.homePitchSubLaneState) {
      subLaneStates.pitch = { ...(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }), ...state.homePitchSubLaneState };
    }
    this.onSynthEvolveOverridesChanged?.(index, {
      ...restored,
      swing: state.homeSwing,
      ...(pitchSettings ? { pitchSettings: [null, null, null, null].map((_, lane) => lane === index ? { ...pitchSettings } : null) } : {}),
      ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
    });
    if (state.homeNoteRangeMin !== null && state.homeNoteRangeMax !== null) {
      this.synthNoteRangeOverrides[index] = null;
      this.onSynthNoteRangeEvolved?.(index, state.homeNoteRangeMin, state.homeNoteRangeMax);
    }
    this.reapplyLastState();
  }

  private captureCurrentSynthLaneHome(index: number, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    const state = this.synthEvolveStates[index] ?? defaultSynthEvolveState();
    this.synthEvolveStates[index] = state;
    const current = this.extractSynthLaneOverrides(index);
    const pitchSettings = this.synthPitchSettings[index];
    if (current.pitch && pitchSettings && pitchSettings.mode !== 'noteRange') current.pitch = this.midiToOffsets(current.pitch, pitchSettings);
    state.home = captureSynthHomeSnapshot(current);
    state.homeSwing = this.synthEuclidSwings[index] ?? 0;
    state.homePitchSettings = pitchSettings ? { ...pitchSettings } : null;
    state.homePitchScaleQuantize = typeof pitchState?.scaleQuantize === 'boolean' ? pitchState.scaleQuantize : null;
    state.homePitchSubLaneState = pitchState ? { steps: pitchState.steps, direction: pitchState.direction, scaleQuantize: pitchState.scaleQuantize } : null;
    const lane = (index + 1) as 1 | 2 | 3 | 4;
    const sliderState = this.lastSliderState as Record<string, unknown> | null;
    if (pitchSettings?.mode === 'noteRange' && sliderState) {
      const override = this.synthNoteRangeOverrides[index];
      state.homeNoteRangeMin = override?.min ?? boundedInteger(sliderState[`synthEuclid${lane}NoteMin`], index === 1 ? 76 : index === 2 ? 52 : index === 3 ? 88 : 64, 24, 108);
      state.homeNoteRangeMax = override?.max ?? boundedInteger(sliderState[`synthEuclid${lane}NoteMax`], index === 1 ? 88 : index === 2 ? 64 : index === 3 ? 96 : 76, 24, 108);
    } else {
      state.homeNoteRangeMin = null;
      state.homeNoteRangeMax = null;
    }
  }

  diceSynthEuclidLane(laneIndex: number, intensity: number = 1): void {
    const index = Math.max(0, Math.min(CORE_SYNTH_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const steps = this.getSynthLaneStepCount(index);
    const rng = Math.random;
    const amount = clamp(finiteNumber(intensity, 1), 0, 1);
    const current = this.extractSynthLaneOverrides(index);
    const pitchSettings = this.synthPitchSettings[index];
    const currentPitchOffsets = current.pitch && pitchSettings && pitchSettings.mode !== 'noteRange'
      ? this.midiToOffsets(current.pitch, pitchSettings)
      : current.pitch;
    const nextOffsets = Array.from({ length: steps }, (_, step) => {
      const base = currentPitchOffsets?.[step % (currentPitchOffsets.length || 1)] ?? 0;
      return Math.round(base * (1 - amount) + Math.round((rng() - 0.5) * 14) * amount);
    });
    const next: SynthLaneOverrides = {
      pitch: nextOffsets,
      pitchDirection: null,
      triggerToggles: new Map<number, boolean>(),
      expression: Array.from({ length: steps }, () => clamp(0.55 + rng() * 0.45, 0, 1)),
      expressionDirection: null,
      morph: Array.from({ length: steps }, () => clamp(rng(), 0, 1)),
      morphDirection: null,
      distance: Array.from({ length: steps }, () => clamp(rng(), 0, 1)),
      distanceDirection: null,
      probability: Array.from({ length: steps }, () => clamp(0.55 + rng() * 0.45, 0, 1)),
      ratchet: Array.from({ length: steps }, () => rng() < 0.2 * amount ? 2 + Math.floor(rng() * 3) : 1),
      trigCondition: current.trigCondition ? current.trigCondition.map((entry) => [entry[0], entry[1]]) : null,
    };
    for (let step = 0; step < steps; step += 1) {
      if (rng() < 0.25 * amount) next.triggerToggles.set(step, rng() > 0.35);
    }

    const stored: SynthLaneOverrides = { ...next };
    if (next.pitch && pitchSettings && pitchSettings.mode !== 'noteRange') {
      stored.pitch = this.offsetsToMidi(next.pitch, pitchSettings);
    }
    this.applySynthLaneOverrides(index, stored);
    this.onSynthEvolveTrigger?.(index);
    const subLaneStates = synthEvolvedSubLaneStatePatch(next);
    this.onSynthEvolveOverridesChanged?.(index, {
      ...next,
      swing: this.synthEuclidSwings[index] ?? 0,
      ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
    });
    const state = this.synthEvolveStates[index];
    if (state) {
      state.home = captureSynthHomeSnapshot(next);
      state.homeSwing = this.synthEuclidSwings[index] ?? 0;
    }
    this.reapplyLastState();
  }

  private getSynthLaneStepCount(laneIndex: number): number {
    const state = this.lastSliderState as unknown as Record<string, unknown> | null;
    if (!state) return this.synthStepOverrides.pitch[laneIndex]?.length ?? 16;
    const lane = (laneIndex + 1) as 1 | 2 | 3 | 4;
    const defaultPattern = defaultSynthEuclidPattern(laneIndex);
    const params = resolveDrumEuclidPatternParams(
      typeof state[`synthEuclid${lane}Preset`] === 'string' ? String(state[`synthEuclid${lane}Preset`]) : 'custom',
      boundedInteger(state[`synthEuclid${lane}Steps`], defaultPattern.steps, 1, 64),
      boundedInteger(state[`synthEuclid${lane}Hits`], defaultPattern.hits, 0, 64),
      boundedInteger(state[`synthEuclid${lane}Rotation`], defaultPattern.rotation, 0, 63),
    );
    return Math.max(1, params.steps);
  }

  private extractSynthLaneOverrides(laneIndex: number): SynthLaneOverrides {
    const ov = this.synthStepOverrides;
    return {
      pitch: ov.pitch[laneIndex] ? [...ov.pitch[laneIndex]!] : null,
      pitchDirection: ov.pitchDirection[laneIndex] ?? null,
      triggerToggles: new Map(ov.triggerToggles[laneIndex] ?? []),
      expression: ov.expression[laneIndex] ? [...ov.expression[laneIndex]!] : null,
      expressionDirection: ov.expressionDirection[laneIndex] ?? null,
      morph: ov.morph[laneIndex] ? [...ov.morph[laneIndex]!] : null,
      morphDirection: ov.morphDirection[laneIndex] ?? null,
      distance: ov.distance[laneIndex] ? [...ov.distance[laneIndex]!] : null,
      distanceDirection: ov.distanceDirection[laneIndex] ?? null,
      probability: ov.probability[laneIndex] ? [...ov.probability[laneIndex]!] : null,
      ratchet: ov.ratchet[laneIndex] ? [...ov.ratchet[laneIndex]!] : null,
      trigCondition: ov.trigCondition[laneIndex] ? ov.trigCondition[laneIndex]!.map((entry) => [entry[0], entry[1]]) : null,
    };
  }

  private applySynthLaneOverrides(laneIndex: number, ov: SynthLaneOverrides): void {
    this.synthStepOverrides.pitch[laneIndex] = ov.pitch ? [...ov.pitch] : null;
    this.synthStepOverrides.pitchDirection[laneIndex] = ov.pitchDirection;
    this.synthStepOverrides.triggerToggles[laneIndex] = new Map(ov.triggerToggles);
    this.synthStepOverrides.expression[laneIndex] = ov.expression ? [...ov.expression] : null;
    this.synthStepOverrides.expressionDirection[laneIndex] = ov.expressionDirection;
    this.synthStepOverrides.morph[laneIndex] = ov.morph ? [...ov.morph] : null;
    this.synthStepOverrides.morphDirection[laneIndex] = ov.morphDirection;
    this.synthStepOverrides.distance[laneIndex] = ov.distance ? [...ov.distance] : null;
    this.synthStepOverrides.distanceDirection[laneIndex] = ov.distanceDirection;
    this.synthStepOverrides.probability[laneIndex] = ov.probability ? [...ov.probability] : null;
    this.synthStepOverrides.ratchet[laneIndex] = ov.ratchet ? [...ov.ratchet] : null;
    this.synthStepOverrides.trigCondition[laneIndex] = ov.trigCondition ? ov.trigCondition.map((entry) => [entry[0], entry[1]]) : null;
  }

  private midiToOffsets(midi: number[], settings: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (settings.mode === 'notes') {
      const intervals = SCALES[settings.scale] || SCALES.Major;
      return midi.map((note) => {
        const semitone = note - settings.root;
        const octave = Math.floor(semitone / 12);
        const pitchClass = ((semitone % 12) + 12) % 12;
        let bestDegree = 0;
        let bestDistance = Infinity;
        for (let degree = 0; degree < intervals.length; degree += 1) {
          const distance = Math.abs((intervals[degree] ?? 0) - pitchClass);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestDegree = degree;
          }
        }
        return octave * intervals.length + bestDegree;
      });
    }
    return midi.map((note) => note - settings.root);
  }

  private offsetsToMidi(offsets: number[], settings: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (settings.mode === 'notes') {
      const intervals = SCALES[settings.scale] || SCALES.Major;
      return offsets.map((degree) => {
        const octave = Math.floor(degree / intervals.length);
        const index = ((degree % intervals.length) + intervals.length) % intervals.length;
        return clamp(settings.root + octave * 12 + (intervals[index] ?? 0), 0, 127);
      });
    }
    return offsets.map((offset) => clamp(settings.root + offset, 0, 127));
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
            : note.source === 'piano'
              ? 'piano'
              : null;
    if (!source) return;

    const baseSliderState = externalState ?? this.lastSliderState;
    if (!baseSliderState) return;

    const sliderState = source === 'lead1'
      ? { ...baseSliderState, leadEnabled: true }
      : source === 'lead2'
        ? { ...baseSliderState, lead2Enabled: true }
        : source === 'piano'
          ? { ...baseSliderState, pianoEnabled: true }
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

    if (source === 'piano') {
      await this.ensureHostPianoSamplePairLoaded(getNearestPianoSample(note.midi).index);
      await this.playHostPianoNote(
        midiToFreq(boundedInteger(note.midi, 60, 24, 108)),
        clamp(finiteNumber(note.velocity, 0.82), 0.05, 1),
        sliderState,
      );
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

    let routedState = sliderState;
    const voiceIndices: number[] = [];
    for (let index = 0; index < notes.length; index += 1) {
      const voiceIndex = this.pickManualPadVoice(source, getEffectivePadState(routedState));
      voiceIndices.push(voiceIndex);
      routedState = applyManualPadVoiceRoute(routedState, source, voiceIndex);
    }
    const { config, triggerNotes } = createManualPadBatchSourceConfig(sliderState, source, notes, voiceIndices);
    this.configurePreviewSource(config);
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

  setOutputGain(target: number, durationSeconds = 0): void {
    const context = this.ctx;
    const gain = this.outputGain?.gain;
    if (!context || !gain) return;
    const now = context.currentTime;
    const value = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 1));
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (durationSeconds > 0) {
      gain.linearRampToValueAtTime(value, now + Math.max(0.01, durationSeconds));
    } else {
      gain.setValueAtTime(value, now);
    }
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
      piano: { node: this.hostPianoOutput },
      reverb: { node: this.node, outputIndex: 1 },
      delayAOut: { node: this.node, outputIndex: 2 },
      dynamics: { node: this.masterGain },
    };
  }

  getState(): EngineState {
    const harmonyState = this.getCorePreviewHarmonyState();
    const bucket = this.lastSliderState ? this.getCorePreviewBucket(this.lastSliderState) : '';
    return {
      isRunning: this.isRunning,
      harmonyState,
      currentSeed: bucket ? computeSeed(bucket, 'E_ROOT') : 0,
      currentBucket: bucket,
      currentFilterFreq: 0,
      currentLfoValue: 0,
      currentLfo2Value: 0,
      cofCurrentStep: harmonyState?.cof.currentStep ?? 0,
      fxOwners: emptyFxOwners(),
      transportDebug: this.getTransportDebugStateInternal(),
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

  private reapplyLastState(): void {
    if (this.lastSliderState) {
      this.applyCoreState(this.lastSliderState);
    }
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

    if (!this.isRunning && !this.isStarting) return;

    this.syncRuntimeRandomWalk();

    if (!context || !node || !masterGain) return;

    const runtimeSliderState = this.getEffectiveRuntimeRandomWalkState(this.getEffectiveDualRangeState(sliderState));
    const snapshot = createKesshoEngineSnapshot(runtimeSliderState, this.snapshotOptions);
    const scalars = toKesshoCorePresetPreviewScalarsV1(snapshot);
    const bpm = clamp(finiteNumber(scalars.bpm, 120), 40, 300);
    const state = runtimeSliderState as unknown as Record<string, unknown>;
    const masterLevel = clamp(
      finiteNumber(state.masterVolume, DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM,
      0,
      1.5,
    );
    const padState = getEffectivePadState(runtimeSliderState);
    const previewSources = createCorePreviewSourceGroup(padState, {
      clockDivs: this.synthEuclidClockDivs,
      swings: this.synthEuclidSwings,
      stepOverrides: this.synthStepOverrides,
      pitchSettings: this.synthPitchSettings,
      pitchBindingModes: this.synthPitchBindingModes,
      subLaneEnabled: this.synthSubLaneEnabled,
      noteRangeOverrides: this.synthNoteRangeOverrides,
      evolveConfigs: this.synthEvolveConfigs,
      evolveStates: this.synthEvolveStates,
    }, {
      clockDivs: this.drumEuclidClockDivs,
      swings: this.drumEuclidSwings,
      stepOverrides: this.drumStepOverrides,
      subLaneEnabled: this.drumSubLaneEnabled,
      morphRanges: this.drumMorphRanges,
      paramSHRanges: this.drumParamSHRanges,
    }, this.ensureTransportAnchors());
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
    const dynamicsTargets = resolveDynamicsTargets(runtimeSliderState, context.sampleRate);

    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setTargetAtTime(masterLevel, context.currentTime, 0.015);
    node.port.postMessage({ type: 'applySnapshot', snapshot: coreSnapshot });
    this.configurePreviewSources(previewSources);
    this.configureHostPianoFxSends(padState);
    this.configureHostEarthTextures(padState);
    this.configureHostPianoEuclid(padState, previewSources.hostPiano);
    this.syncSynthEuclidLiveEvolve(padState);
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
