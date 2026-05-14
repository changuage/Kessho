import {
  KESSHO_PRODUCT_PAD_PARAM_COUNT,
  KESSHO_PRODUCT_LEAD_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
  KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
  KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
} from './generated/kesshoProductSchema';
import { DEFAULT_REVERB_PRE_COMP, type SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import {
  CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID,
  getCoreProductSoundscapeAssetDescriptorsForState,
  getPrimaryCoreProductSoundscapeAssetIdForState,
} from './coreProductAssets';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims';
import {
  defaultPresetId,
  delayAFilterTypeId,
  delayBPatternId,
  delayBWarpId,
  delayDivisionMs,
  drumVoiceMorphsFromState,
  drumVoicePresetIdsFromState,
  dynamicsCharacterModeId,
  dynamicsSaturationModeId,
  emptyLeadParams,
  emptyPadParams,
  endpointPresetId,
  exactDrumParamsFromState,
  exactLeadParamsFromState,
  exactPadParamsFromState,
  granularLegacyPitchModeId,
  granularShapeId,
  granularVoiceModeId,
  reverbModCharacterId,
  reverbQualityId,
  reverbSaturationModeId,
  reverbTypeId,
  sidechainKeyId,
  soundscapePresetIdFromState,
  sourcePresetId,
} from './CoreProductLegacyPresetCompat';
import { getTransportMetrics } from './transport';
import { computeGranularMacroModel, type GranularMacroModel } from './granularMacroCore';
import { morphWaterPresets, type WaterPresetState } from './waterPresets';
import { createHarmonyState, getEffectiveTension } from './harmony';
import { getUtcBucket } from './rng';
import { isIOSLikeDevice, isMobileDevice } from '../platform';

// SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION - this file maps app/UI state into generated Product Core fields.

type ProductSourceSnapshot = {
  enabled: boolean;
  sourceId: number;
  presetId: number;
  assetId: number;
  level: number;
  morph: number;
  distance: number;
  expression: number;
  dryGain: number;
  reverbSend: number;
  delayASend: number;
  delayBSend: number;
  granularSend: number;
  diffuseSend: number;
  postLpfHz: number;
  stereoWidth: number;
  postLpfKeyTracking: number;
  holdSeconds: number;
  exactPadParamCount: number;
  exactPadParams: number[];
  exactLeadParamCount: number;
  exactLeadParams: number[];
  exactDrumParamCount: number;
  exactDrumParams: number[];
  drumVoicePresetAIds: number[];
  drumVoicePresetBIds: number[];
  drumVoiceMorphs: number[];
};

export type ProductLaneSnapshot = {
  enabled: boolean;
  targetSourceId: number;
  stepCount: number;
  fillCount: number;
  rotation: number;
  clockDivision: number;
  swing: number;
  probability: number;
  ratchet: number;
  trigCondition: number;
  midiNote: number;
  velocity: number;
  holdSeconds: number;
  morph: number;
  distance: number;
  expression: number;
  seed: number;
  barReset: boolean;
  phraseReset: boolean;
  manualStepMaskLow: number;
  manualStepMaskHigh: number;
};

type ProductHarmonySnapshot = {
  rootMidi: number;
  scaleId: number;
  tension: number;
  chordMode: number;
  voicingMode: number;
};

type ProductGranularVoiceSnapshot = {
  enabled: boolean;
  mode: number;
  slice: number;
  speed: number;
  scanRate: number;
  reverse: boolean;
  pitch: number;
  writeFollow: number;
  density: number;
  grainSizeMs: number;
  spray: number;
  grainOctaveProbability: number;
  attackSeconds: number;
  decaySeconds: number;
  gain: number;
  pan: number;
  blur: number;
  stereoSpread: number;
  positionLfoRate: number;
  positionLfoDepth: number;
  panLfoRate: number;
  reverseLfoRate: number;
  recordLfoRate: number;
  euclidGated: boolean;
  euclidMuted: boolean;
};

export type CoreProductSnapshot = {
  transport: {
    running: boolean;
    bpm: number;
    beatsPerBar: number;
    barsPerPhrase: number;
    swing: number;
  };
  harmony: ProductHarmonySnapshot;
  sources: ProductSourceSnapshot[];
  synthLanes: ProductLaneSnapshot[];
  drumLanes: ProductLaneSnapshot[];
  journey: {
    enabled: boolean;
    morphPhase: number;
    morphRateBars: number;
  };
  fx: {
    granularMix: number;
    granularEnabled: boolean;
    granularFreeze: boolean;
    granularFreezeWithFeedback: boolean;
    granularFeedback: number;
    granularFeedbackLpfHz: number;
    granularReverbLpfHz: number;
    granularOutputLpfHz: number;
    granularBufferSeconds: number;
    granularGrainShape: number;
    granularBusDiffusion: number;
    granularTimingRandomness: number;
    granularChordBias: number;
    granularLegacyJitterMs: number;
    granularLegacyProbability: number;
    granularLegacyPitchMode: number;
    granularLegacyPitchSpread: number;
    granularLegacyMaxGrains: number;
    granularLegacyFeedback: number;
    granularVoices: ProductGranularVoiceSnapshot[];
    delayAEnabled: boolean;
    delayATimeLeftMs: number;
    delayATimeRightMs: number;
    delayAFeedback: number;
    delayAMix: number;
    delayAFilterHz: number;
    delayAFilterType: number;
    delayAModRateHz: number;
    delayAModDepthMs: number;
    delayAPingPong: boolean;
    delayADuck: number;
    delayAWidth: number;
    delayACrossFeedFilterHz: number;
    delayBEnabled: boolean;
    delayBActivity: number;
    delayBRepeats: number;
    delayBBaseTimeMs: number;
    delayBTone: number;
    delayBVibrato: number;
    delayBMix: number;
    delayBSpaceMode: number;
    delayBPattern: number;
    delayBWarp: number;
    delayBWarpIntensity: number;
    delayBSpread: number;
    reverbMix: number;
    reverbType: number;
    reverbQuality: number;
    reverbDecay: number;
    reverbSize: number;
    reverbDamping: number;
    reverbDiffusion: number;
    reverbModulation: number;
    reverbPredelayMs: number;
    reverbWidth: number;
    reverbShimmerAmount: number;
    reverbShimmerPitch: number;
    reverbSlowRateHz: number;
    reverbSlowDepth: number;
    reverbReverseAmount: number;
    reverbReverseLengthSec: number;
    reverbChorusRateHz: number;
    reverbChorusDepth: number;
    reverbModCharacter: number;
    reverbDampLow: number;
    reverbDampHigh: number;
    reverbCrossoverHz: number;
    reverbInputTone: number;
    reverbShimmerFeedback: number;
    reverbWarp: number;
    reverbCrossFeed: number;
    reverbEarlyReflections: number;
    reverbAirAbsorption: number;
    reverbSaturationMode: number;
    reverbTransientSmooth: number;
    reverbErLpFreq: number;
    reverbPreCompThreshold: number;
    reverbPreCompKnee: number;
    reverbPreCompRatio: number;
    reverbPreCompAttackMs: number;
    reverbPreCompReleaseMs: number;
    reverbPreCompMakeup: number;
    spectralFreezeMix: number;
    spectralFreezeEnabled: boolean;
    spectralFreezeActive: boolean;
    spectralFreezeSlushy: boolean;
    spectralFreezeSpeed: number;
    spectralFreezeDecay: number;
    spectralFreezePhaseJitter: number;
    spectralFreezeRouting: number;
    spectralFreezeReverbCrossfade: number;
    dynamicsDrive: number;
    dynamicsEnabled: boolean;
    dynamicsCharacterEnabled: boolean;
    dynamicsCharacterMode: number;
    dynamicsCharacterMix: number;
    dynamicsCharacterAge: number;
    dynamicsCharacterBias: number;
    dynamicsCharacterLpgAmount: number;
    dynamicsCharacterResonance: number;
    dynamicsCharacterStereo: number;
    dynamicsCharacterEnvFollow: number;
    dynamicsCharacterDepth: number;
    dynamicsCharacterRate: number;
    dynamicsCharacterDamp: number;
    dynamicsDegradeEnabled: boolean;
    dynamicsDegradeMix: number;
    dynamicsDegradeAge: number;
    dynamicsDegradeGeneration: number;
    dynamicsDegradeAlias: number;
    dynamicsDegradeWow: number;
    dynamicsDegradeFlutter: number;
    dynamicsDegradeDrift: number;
    dynamicsDegradeWobbleSpeed: number;
    dynamicsDegradeTone: number;
    dynamicsDegradeHp: number;
    dynamicsDegradeLp: number;
    dynamicsDegradeNoise: number;
    dynamicsDegradeSaturation: number;
    dynamicsDegradeCorrosion: number;
    dynamicsModSlowWow: number;
    dynamicsModSlowFlutter: number;
    dynamicsModSlowLp: number;
    dynamicsModSlowWet: number;
    dynamicsModSlowDropout: number;
    dynamicsModSlowAlias: number;
    dynamicsModFlutterWow: number;
    dynamicsModFlutterFlutter: number;
    dynamicsModFlutterLp: number;
    dynamicsModFlutterWet: number;
    dynamicsModFlutterDropout: number;
    dynamicsModFlutterAlias: number;
    dynamicsModRandomWow: number;
    dynamicsModRandomFlutter: number;
    dynamicsModRandomLp: number;
    dynamicsModRandomWet: number;
    dynamicsModRandomDropout: number;
    dynamicsModRandomAlias: number;
    dynamicsModEnvWow: number;
    dynamicsModEnvFlutter: number;
    dynamicsModEnvLp: number;
    dynamicsModEnvWet: number;
    dynamicsModEnvDropout: number;
    dynamicsModEnvAlias: number;
    dynamicsModNoiseWow: number;
    dynamicsModNoiseFlutter: number;
    dynamicsModNoiseLp: number;
    dynamicsModNoiseWet: number;
    dynamicsModNoiseDropout: number;
    dynamicsModNoiseAlias: number;
    dynamicsSaturationEnabled: boolean;
    dynamicsSaturationMode: number;
    dynamicsSaturationDrive: number;
    dynamicsSaturationTone: number;
    dynamicsSaturationBias: number;
    dynamicsEndCompEnabled: boolean;
    dynamicsEndCompThreshold: number;
    dynamicsEndCompKnee: number;
    dynamicsEndCompRatio: number;
    dynamicsEndCompAttackMs: number;
    dynamicsEndCompReleaseMs: number;
    dynamicsEndCompMakeup: number;
    dynamicsEndCompMix: number;
    dynamicsEndCompDetectorHp: number;
    dynamicsEndCompDetectorTilt: number;
    dynamicsEndCompAutoMakeup: number;
    dynamicsEndCompProgramRelease: number;
    sidechainEnabled: boolean;
    sidechainKeyA: number;
    sidechainKeyB: number;
    sidechainKeyAWeight: number;
    sidechainKeyBWeight: number;
    sidechainAmount: number;
    sidechainThreshold: number;
    sidechainRatio: number;
    sidechainKnee: number;
    sidechainAttackMs: number;
    sidechainHoldMs: number;
    sidechainReleaseMs: number;
    sidechainMakeup: number;
    sidechainMix: number;
    sidechainCurve: number;
    sidechainDetectorHp: number;
    sidechainDetectorLp: number;
    sidechainPad1Target: number;
    sidechainPad2Target: number;
    sidechainLead1Target: number;
    sidechainLead2Target: number;
    sidechainPianoTarget: number;
    sidechainGranularTarget: number;
    sidechainDelayATarget: number;
    sidechainDelayBTarget: number;
    sidechainReverbTarget: number;
  };
  routing: {
    delayAToDelayB: number;
    delayBToDelayA: number;
    delayToReverb: number;
    granularToReverb: number;
    delayAToGranular: number;
    delayBToGranular: number;
    delayBToReverb: number;
    granularToDelayA: number;
    granularToDelayB: number;
  };
  master: {
    gain: number;
    limiterCeilingDb: number;
    saturationMode: number;
    saturationDrive: number;
    saturationTone: number;
  };
  rng: {
    seed: number;
    state: number;
  };
  evolution: {
    amount: number;
    state: number;
  };
  assetRefs: number[];
  assetRefLevels: number[];
};

const SOURCE_ORDER = [
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
  CORE_PRODUCT_SOURCE_IDS.drum,
  CORE_PRODUCT_SOURCE_IDS.piano,
  CORE_PRODUCT_SOURCE_IDS.soundscape,
] as const;

const SOUNDSCAPE_ROUTE_PARAM_COUNT = 16;
const SOUNDSCAPE_ROUTE_KEYS = [
  ['oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend'],
  ['waterReverbSend', 'waterDelayASend', 'waterDelayBSend', 'granularWaterSend'],
  ['insectsReverbSend', 'insDelayASend', 'insDelayBSend', 'granularInsectsSend'],
  ['natureReverbSend', 'natureDelayASend', 'natureDelayBSend', 'granularNatureSend'],
] as const;
const SOUNDSCAPE_ROUTE_FALLBACKS = [
  [0.2, 0, 0, 0],
  [0.3, 0, 0, 0],
  [0.15, 0, 0, 0],
  [0.18, 0, 0, 0],
] as const;
const SOUNDSCAPE_PARITY_FIXTURE_PARAM = SOUNDSCAPE_ROUTE_PARAM_COUNT, SOUNDSCAPE_PARITY_PARAM_COUNT = SOUNDSCAPE_PARITY_FIXTURE_PARAM + 1;
const SOUNDSCAPES_MODULE_PARAM_COUNT = 96;
const SOUNDSCAPES_PRODUCT_PARAM_COUNT = SOUNDSCAPES_MODULE_PARAM_COUNT + 5;
const SOUNDSCAPES_SEED_NO_CHANGE = -1;
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
const SOUNDSCAPES_PRODUCT_PARAM_INDEX = {
  waterLevel: SOUNDSCAPES_MODULE_PARAM_COUNT,
  insectsLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 1,
  insects2Level: SOUNDSCAPES_MODULE_PARAM_COUNT + 2,
  insectsSharedLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 3,
  earthLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 4,
} as const;

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function drumDelaySendProfile(state: Record<string, unknown> | undefined): number {
  const sends = [
    numberFromState(state, 'drumSubDelaySend', 0),
    numberFromState(state, 'drumKickDelaySend', 0),
    numberFromState(state, 'drumClickDelaySend', 0),
    numberFromState(state, 'drumBeepHiDelaySend', 0),
    numberFromState(state, 'drumBeepLoDelaySend', 0),
    numberFromState(state, 'drumNoiseDelaySend', 0),
    numberFromState(state, 'drumMembraneDelaySend', 0),
  ].map((value) => clamp(value, 0, 1));
  const average = sends.reduce((sum, value) => sum + value, 0) / sends.length;
  const peak = Math.max(...sends, 0);
  return clamp(peak * 0.5 + average * 0.5, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveU32(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback >>> 0 || 1;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return fallback >>> 0 || 1;
  }
  const normalized = rounded >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function hashSeedMaterial(material: string): number {
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}

// SNAPSHOT_AUTHORITY: INITIAL_RNG_SEED_ONLY - ongoing RNG state must be reconciled from Product Core telemetry.
function rngSeedFromState(state: Record<string, unknown> | undefined): number {
  const explicitSeed = numberFromState(state, 'rngSeed', numberFromState(state, 'seed', Number.NaN));
  if (Number.isFinite(explicitSeed)) {
    return positiveU32(explicitSeed, 1);
  }
  const seedWindow = String(state?.seedWindow ?? 'hour');
  const randomness = numberFromState(state, 'randomness', 0.5).toFixed(4);
  const rootNote = numberFromState(state, 'rootNote', 4);
  return hashSeedMaterial(`${seedWindow}:${randomness}:${rootNote}`);
}

function rngStateFromState(state: Record<string, unknown> | undefined, seed: number): number {
  return positiveU32(numberFromState(state, 'rngState', Number.NaN), seed);
}

function transportFromState(state: Record<string, unknown> | undefined): CoreProductSnapshot['transport'] {
  if (!state) {
    return {
      running: false,
      bpm: 120,
      beatsPerBar: 4,
      barsPerPhrase: 4,
      swing: 0,
    };
  }
  const metrics = getTransportMetrics(state as Partial<SliderState>);

  return {
    running: false,
    bpm: clamp(metrics.effectiveBpm, 1, 400),
    beatsPerBar: clamp(Math.round(numberFromState(state, 'transportBeatsPerBar', 4)), 1, 32),
    barsPerPhrase: clamp(Math.round(numberFromState(state, 'transportBarsPerPhrase', 4)), 1, 256),
    swing: clamp(numberFromState(state, 'swing', 0), 0, 1),
  };
}

function rootMidiFromState(state: Record<string, unknown> | undefined): number {
  const explicitRootMidi = numberFromState(state, 'rootMidi', Number.NaN);
  if (Number.isFinite(explicitRootMidi)) {
    return clamp(explicitRootMidi, 0, 127);
  }
  const rootNote = numberFromState(state, 'rootNote', 4);
  const pitchClass = ((Math.round(rootNote) % 12) + 12) % 12;
  return 60 + pitchClass;
}

function evolveAmountFromList(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }
  let amount = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const config = item as Record<string, unknown>;
    if (config.enabled === false) continue;
    const evolution = config.evolution;
    if (typeof evolution === 'number' && Number.isFinite(evolution)) {
      amount = Math.max(amount, clamp(evolution, 0, 1));
    }
  }
  return amount;
}

function evolutionAmountFromState(state: Record<string, unknown> | undefined): number {
  const explicit = numberFromState(state, 'evolutionAmount', Number.NaN);
  if (Number.isFinite(explicit)) {
    return clamp(explicit, 0, 1);
  }
  return Math.max(
    evolveAmountFromList(state?.synthEuclidEvolveConfigs),
    evolveAmountFromList(state?.drumEuclidEvolveConfigs),
    clamp(numberFromState(state, 'granularEvolution', 0), 0, 1),
  );
}

function scaleIdFromName(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes('octatonic') || normalized.includes('phrygian') || normalized.includes('hirajoshi')) {
    return 4;
  }
  if (normalized.includes('minor') || normalized.includes('dorian') || normalized.includes('aeolian')) {
    return 2;
  }
  if (normalized.includes('pentatonic')) {
    return 3;
  }
  return 1;
}

function scaleIdFromState(state: Record<string, unknown> | undefined, tension: number): number {
  if (state?.scaleMode === 'manual') {
    return scaleIdFromName(String(state.manualScale ?? 'Major (Ionian)'));
  }
  if (tension < 0.2) return 3;
  if (tension < 0.55) return 1;
  if (tension < 0.82) return 2;
  return 4;
}

function reverbTensionModeFromState(state: Record<string, unknown> | undefined): 'follow' | 'locked' | 'bypass' {
  const mode = state?.reverbTensionMode;
  if (mode === 'follow' || mode === 'locked') return mode;
  return 'bypass';
}

function navigatorFromGlobal(): Navigator | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

function shouldUseMobileReverbQualityOverride(state: Record<string, unknown> | undefined): boolean {
  const forced = state?.coreProductMobileDevice ?? state?.sonicParityMobileDevice;
  if (typeof forced === 'boolean') return forced;
  const nav = navigatorFromGlobal();
  return nav ? isMobileDevice(nav) || isIOSLikeDevice(nav) : false;
}

function resolveHarmonyScaleIntervals(state: Record<string, unknown> | undefined, tension: number): readonly number[] | undefined {
  try {
    const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
    const bucket = getUtcBucket(seedWindow);
    return createHarmonyState(
      `${bucket}|E_ROOT`,
      tension,
      numberFromState(state, 'chordRate', 32),
      numberFromState(state, 'voicingSpread', 0.5),
      numberFromState(state, 'detune', 8),
      state?.scaleMode === 'manual' ? 'manual' : 'auto',
      typeof state?.manualScale === 'string' ? state.manualScale : 'Major (Ionian)',
      numberFromState(state, 'rootNote', 4),
    ).scaleFamily.intervals;
  } catch {
    return undefined;
  }
}

function quantizeShimmerPitchToScale(pitch: number, intervals: readonly number[] | undefined): number {
  if (!intervals || intervals.length === 0) return pitch;
  const octaves = Math.floor(pitch / 12);
  const rem = ((pitch % 12) + 12) % 12;
  let bestInterval = intervals[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const interval of intervals) {
    const distance = Math.abs(interval - rem);
    const circularDistance = Math.min(distance, 12 - distance);
    if (circularDistance < bestDistance) {
      bestDistance = circularDistance;
      bestInterval = interval;
    }
  }
  return octaves * 12 + bestInterval;
}

function resolveReverbSnapshotParams(state: Record<string, unknown> | undefined, tension: number) {
  const reverbTension = getEffectiveTension(
    tension,
    reverbTensionModeFromState(state),
    numberFromState(state, 'reverbTensionValue', 0),
  );
  let decay = clamp(numberFromState(state, 'reverbDecay', 0.9), 0, 1);
  let diffusion = clamp(numberFromState(state, 'reverbDiffusion', 1), 0, 1);
  let shimmer = clamp(numberFromState(state, 'reverbShimmer', 0), 0, 1);
  let shimmerPitch = clamp(numberFromState(state, 'reverbShimmerPitch', 12), -24, 24);

  if (reverbTension >= 0) {
    const inverse = 1 - reverbTension;
    decay = clamp(decay + inverse * 0.15, 0, 1);
    diffusion = clamp(diffusion + inverse * 0.1, 0, 1);
    shimmer = clamp(shimmer + reverbTension * 0.08, 0, 1);
  }

  if (booleanFromState(state, 'reverbScaleShimmer', false)) {
    shimmerPitch = clamp(quantizeShimmerPitchToScale(shimmerPitch, resolveHarmonyScaleIntervals(state, tension)), -24, 24);
  }

  return {
    decay,
    diffusion,
    shimmer,
    shimmerPitch,
  };
}

function clockDivisionFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(Math.round(value), 1, 128);
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const table: Record<string, number> = {
    '1/4': 4,
    '1/4T': 6,
    '1/8': 8,
    '1/8T': 12,
    '1/16': 16,
    '1/16T': 24,
    '1/32': 32,
    '1/32T': 48,
    '1/64': 64,
  };
  return table[value] ?? fallback;
}

function synthSourceIdFromState(state: Record<string, unknown> | undefined, key: string): number {
  const source = String(state?.[key] ?? 'lead').toLowerCase();
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'piano') return CORE_PRODUCT_SOURCE_IDS.piano;
  if (source === 'synth4' || source === 'synth5' || source === 'synth6') {
    return CORE_PRODUCT_SOURCE_IDS.pad2;
  }
  if (source.startsWith('synth')) return CORE_PRODUCT_SOURCE_IDS.pad1;
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

function laneManualMaskFromState(state: Record<string, unknown> | undefined, prefix: string): {
  manualStepMaskLow: number;
  manualStepMaskHigh: number;
} {
  const low = numberFromState(state, `${prefix}ManualStepMaskLow`, 0);
  const high = numberFromState(state, `${prefix}ManualStepMaskHigh`, 0);
  return {
    manualStepMaskLow: low >>> 0,
    manualStepMaskHigh: high >>> 0,
  };
}

function midiCenterFromState(state: Record<string, unknown> | undefined, prefix: string, fallback: number): number {
  const min = numberFromState(state, `${prefix}NoteMin`, Number.NaN);
  const max = numberFromState(state, `${prefix}NoteMax`, Number.NaN);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return clamp((min + max) * 0.5, 0, 127);
  }
  return fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteNumber(value, fallback), min, max);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function resolveWaterState(state: Record<string, unknown> | undefined): WaterPresetState {
  const presetA = boundedInteger(state?.waterMorphA ?? state?.waterPreset, 0, 0, 7);
  const presetB = boundedInteger(state?.waterMorphB ?? state?.waterPreset, presetA, 0, 7);
  const morph = boundedNumber(state?.waterMorph, 0, 0, 1);
  const morphed = morphWaterPresets(presetA, presetB, morph);
  const resolved = { ...morphed };
  for (const key of Object.keys(morphed) as Array<keyof WaterPresetState>) {
    if (typeof state?.[key] === 'number') {
      resolved[key] = Number(state[key]);
    }
  }
  return resolved;
}

function earthLayerActive(
  state: Record<string, unknown> | undefined,
  enabledKey: string,
  levelKey: string,
  fallbackLevel: number,
): boolean {
  return booleanFromState(state, enabledKey, false) && numberFromState(state, levelKey, fallbackLevel) > 0.0001;
}

function exactSoundscapesModuleParamsFromState(state: Record<string, unknown> | undefined): number[] {
  const params = Array.from({ length: KESSHO_PRODUCT_DRUM_PARAM_COUNT }, () => 0);
  const water = resolveWaterState(state);
  const waterActive = earthLayerActive(state, 'waterEnabled', 'waterLevel', 0.8);
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  const deterministicSeeds = booleanFromState(state, 'soundscapeParityFixture', false);

  params[SOUNDSCAPES_PARAM_INDEX.waterActive] = waterActive ? 1 : 0;
  params[SOUNDSCAPES_PARAM_INDEX.waterPreset] = boundedInteger(
    state?.waterMorph !== undefined
      ? (boundedNumber(state.waterMorph, 0, 0, 1) < 0.5 ? state.waterMorphA : state.waterMorphB)
      : state?.waterPreset,
    0,
    0,
    7,
  );
  [
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
  ].forEach((value, index) => {
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
  params[SOUNDSCAPES_PARAM_INDEX.waterChannels] = finiteNumber(water.waterChannelsMorph, 0);
  params[SOUNDSCAPES_PARAM_INDEX.waterChannels + 1] = finiteNumber(water.waterChannelsSpeed, 0.5);
  params[SOUNDSCAPES_PARAM_INDEX.waterSeed] = deterministicSeeds ? 12345 : SOUNDSCAPES_SEED_NO_CHANGE;

  const writeInsectsParams = (
    activeIndex: number,
    engineIndex: number,
    paramsIndex: number,
    seedIndex: number,
    prefix: 'insects' | 'insects2',
    active: boolean,
    fallbackEngine: number,
  ) => {
    params[activeIndex] = active ? 1 : 0;
    params[engineIndex] = boundedInteger(state?.[`${prefix}Engine`], fallbackEngine, 0, 6);
    [
      state?.[`${prefix}Density`],
      state?.[`${prefix}Density`],
      state?.[`${prefix}Temperature`],
      state?.[`${prefix}Temperature`],
      state?.[`${prefix}Distance`],
      state?.[`${prefix}Distance`],
      state?.[`${prefix}Proximity`],
      state?.[`${prefix}Proximity`],
      state?.[`${prefix}Antiphony`],
      state?.[`${prefix}Antiphony`],
      state?.[`${prefix}ClickRate`],
      state?.[`${prefix}ClickRate`],
      state?.[`${prefix}Motion`],
      state?.[`${prefix}Motion`],
    ].forEach((value, index) => {
      params[paramsIndex + index] = finiteNumber(value, index >= 4 && index <= 5 ? 0.3 : 0.5);
    });
    params[seedIndex] = deterministicSeeds
      ? (prefix === 'insects2' ? 67890 : 12345)
      : SOUNDSCAPES_SEED_NO_CHANGE;
  };

  writeInsectsParams(
    SOUNDSCAPES_PARAM_INDEX.insectsActive,
    SOUNDSCAPES_PARAM_INDEX.insectsEngine,
    SOUNDSCAPES_PARAM_INDEX.insectsParams,
    SOUNDSCAPES_PARAM_INDEX.insectsSeed,
    'insects',
    insectsActive,
    0,
  );
  writeInsectsParams(
    SOUNDSCAPES_PARAM_INDEX.insects2Active,
    SOUNDSCAPES_PARAM_INDEX.insects2Engine,
    SOUNDSCAPES_PARAM_INDEX.insects2Params,
    SOUNDSCAPES_PARAM_INDEX.insects2Seed,
    'insects2',
    insects2Active,
    1,
  );

  const activeCount = [waterActive, insectsActive, insects2Active].filter(Boolean).length;
  params[SOUNDSCAPES_PARAM_INDEX.outputSelect] = activeCount > 1
    ? 3
    : insects2Active
      ? 2
      : insectsActive
        ? 1
        : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.waterLevel] = waterActive ? numberFromState(state, 'waterLevel', 0.8) : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insectsLevel] = insectsActive ? numberFromState(state, 'insectsLevel', 0.7) : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insects2Level] = insects2Active ? numberFromState(state, 'insects2Level', 0.5) : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insectsSharedLevel] = numberFromState(state, 'insectsSharedLevel', 1);
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.earthLevel] = numberFromState(state, 'earthLevel', 1);
  return params;
}

function defaultSynthEuclidMidiCenter(laneNumber: number): number {
  return [82, 58, 92, 70][laneNumber - 1] ?? 82;
}

function sourceDefaults(sourceId: number): ProductSourceSnapshot {
  return {
    enabled: true,
    sourceId,
    presetId: defaultPresetId(sourceId),
    assetId: 0,
    level: 0.75,
    morph: 0,
    distance: 0,
    expression: 0.75,
    dryGain: 1,
    reverbSend: 0.12,
    delayASend: 0,
    delayBSend: 0,
    granularSend: 0,
    diffuseSend: 0,
    postLpfHz: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
    stereoWidth: KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
    postLpfKeyTracking: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    exactPadParamCount: 0,
    exactPadParams: emptyPadParams(),
    exactLeadParamCount: 0,
    exactLeadParams: emptyLeadParams(),
    exactDrumParamCount: 0,
    exactDrumParams: exactDrumParamsFromState(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}

function sourceFromState(sourceId: number, state: Record<string, unknown> | undefined): ProductSourceSnapshot {
  const source = sourceDefaults(sourceId);
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      source.enabled = booleanFromState(state, 'padEnabled', true);
      source.level = numberFromState(state, 'synthLevel', source.level);
      source.morph = numberFromState(state, 'padMorph', source.morph);
      source.distance = numberFromState(state, 'padDistance', source.distance);
      source.reverbSend = numberFromState(state, 'pad1ReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad1Send', source.granularSend);
      source.diffuseSend = numberFromState(state, 'padDiffuseSend', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'padPostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'padStereoWidth', source.stereoWidth);
      source.presetId = endpointPresetId('pad', source.morph, state?.padPresetA, state?.padPresetB, 'init');
      source.exactPadParamCount = KESSHO_PRODUCT_PAD_PARAM_COUNT;
      source.exactPadParams = exactPadParamsFromState(state, 0);
      break;
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      source.enabled = booleanFromState(state, 'pad2Enabled', false);
      source.level = numberFromState(state, 'pad2Level', source.level);
      source.morph = numberFromState(state, 'pad2Morph', source.morph);
      source.distance = numberFromState(state, 'pad2Distance', source.distance);
      source.reverbSend = numberFromState(state, 'pad2ReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad2Send', source.granularSend);
      source.diffuseSend = numberFromState(state, 'pad2DiffuseSend', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'pad2PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'pad2StereoWidth', source.stereoWidth);
      source.presetId = endpointPresetId('pad', source.morph, state?.pad2PresetA, state?.pad2PresetB, 'init');
      source.exactPadParamCount = KESSHO_PRODUCT_PAD_PARAM_COUNT;
      source.exactPadParams = exactPadParamsFromState(state, 1);
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      source.enabled = booleanFromState(state, 'leadEnabled', false);
      source.level = numberFromState(state, 'lead1Level', numberFromState(state, 'leadLevel', source.level));
      source.morph = numberFromState(state, 'lead1Morph', source.morph);
      source.distance = numberFromState(state, 'lead1Distance', source.distance);
      source.holdSeconds = numberFromState(state, 'lead1Hold', source.holdSeconds);
      source.reverbSend = numberFromState(state, 'lead1ReverbSend', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead1Send', source.granularSend);
      source.diffuseSend = numberFromState(state, 'lead1DiffuseSend', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead1PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead1StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead1PostLPFKeyTracking', source.postLpfKeyTracking);
      source.presetId = endpointPresetId('lead', source.morph, state?.lead1PresetA, state?.lead1PresetB, 'soft_rhodes');
      source.exactLeadParamCount = KESSHO_PRODUCT_LEAD_PARAM_COUNT;
      source.exactLeadParams = exactLeadParamsFromState(state, 0);
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      source.enabled = booleanFromState(state, 'lead2Enabled', booleanFromState(state, 'leadEnabled', false));
      source.level = numberFromState(state, 'lead2Level', source.level);
      source.morph = numberFromState(state, 'lead2Morph', source.morph);
      source.distance = numberFromState(state, 'lead2Distance', source.distance);
      source.holdSeconds = numberFromState(state, 'lead2Hold', source.holdSeconds);
      source.reverbSend = numberFromState(state, 'lead2ReverbSend', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead2Send', source.granularSend);
      source.diffuseSend = numberFromState(state, 'lead2DiffuseSend', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead2PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead2StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead2PostLPFKeyTracking', source.postLpfKeyTracking);
      source.presetId = endpointPresetId('lead', source.morph, state?.lead2PresetC, state?.lead2PresetD, 'soft_rhodes');
      source.exactLeadParamCount = KESSHO_PRODUCT_LEAD_PARAM_COUNT;
      source.exactLeadParams = exactLeadParamsFromState(state, 1);
      break;
    case CORE_PRODUCT_SOURCE_IDS.drum:
      source.enabled = booleanFromState(state, 'drumEnabled', false);
      source.level = numberFromState(state, 'drumLevel', source.level);
      source.reverbSend = numberFromState(state, 'drumReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'drumDelayASend', source.delayASend) * drumDelaySendProfile(state);
      source.delayBSend = numberFromState(state, 'drumDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularDrumSend', source.granularSend);
      source.presetId = sourcePresetId('drum', 'default', 'default');
      source.exactDrumParamCount = KESSHO_PRODUCT_DRUM_PARAM_COUNT;
      source.exactDrumParams = exactDrumParamsFromState(state);
      source.drumVoicePresetAIds = drumVoicePresetIdsFromState(state, 'a');
      source.drumVoicePresetBIds = drumVoicePresetIdsFromState(state, 'b');
      source.drumVoiceMorphs = drumVoiceMorphsFromState(state);
      break;
    case CORE_PRODUCT_SOURCE_IDS.piano:
      source.enabled = booleanFromState(state, 'pianoEnabled', false);
      source.assetId = CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID;
      source.level = numberFromState(state, 'pianoLevel', source.level) * ENGINE_TRIMS.piano;
      source.distance = numberFromState(state, 'pianoDistance', source.distance);
      source.holdSeconds = numberFromState(state, 'pianoHold', 0.2);
      source.reverbSend = numberFromState(state, 'pianoReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'pianoDelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pianoDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPianoSend', source.granularSend);
      source.diffuseSend = numberFromState(state, 'pianoDiffuseSend', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'pianoPostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'pianoStereoWidth', source.stereoWidth);
      source.presetId = sourcePresetId('piano', 'default', 'default');
      break;
    case CORE_PRODUCT_SOURCE_IDS.soundscape:
      {
        const oceanActive = booleanFromState(state, 'oceanSampleEnabled', false);
        const waterActive = booleanFromState(state, 'waterEnabled', false);
        const insectsActive = booleanFromState(state, 'insectsEnabled', false) || booleanFromState(state, 'insects2Enabled', false);
        const natureActive = booleanFromState(state, 'birdsEnabled', false) ||
          booleanFromState(state, 'birds2Enabled', false) || booleanFromState(state, 'frogsEnabled', false);
        const parityFixture = booleanFromState(state, 'soundscapeParityFixture', false);
        source.enabled = oceanActive || waterActive || insectsActive || natureActive;
        source.assetId = getPrimaryCoreProductSoundscapeAssetIdForState(state);
        source.level = 1;
        source.expression = parityFixture ? 1 : source.expression;
        source.exactPadParamCount = parityFixture ? SOUNDSCAPE_PARITY_PARAM_COUNT : SOUNDSCAPE_ROUTE_PARAM_COUNT;
        source.exactPadParams = emptyPadParams();
        source.exactDrumParamCount = SOUNDSCAPES_PRODUCT_PARAM_COUNT;
        source.exactDrumParams = exactSoundscapesModuleParamsFromState(state);
        if (parityFixture) source.exactPadParams[SOUNDSCAPE_PARITY_FIXTURE_PARAM] = 1;
        const layerActive = [oceanActive, waterActive, insectsActive, natureActive];
        const routePeaks = [0, 0, 0, 0];
        for (let layer = 0; layer < SOUNDSCAPE_ROUTE_KEYS.length; layer += 1) {
          const routeKeys = SOUNDSCAPE_ROUTE_KEYS[layer] ?? SOUNDSCAPE_ROUTE_KEYS[0];
          const routeFallbacks = SOUNDSCAPE_ROUTE_FALLBACKS[layer] ?? SOUNDSCAPE_ROUTE_FALLBACKS[0];
          for (let route = 0; route < routeKeys.length; route += 1) {
            const key = routeKeys[route] ?? 'oceanReverbSend';
            const value = layerActive[layer] === true
              ? clamp(numberFromState(state, key, routeFallbacks[route] ?? 0), 0, 2)
              : 0;
            source.exactPadParams[layer * 4 + route] = value;
            routePeaks[route] = Math.max(routePeaks[route] ?? 0, value);
          }
        }
        source.reverbSend = source.enabled ? routePeaks[0] ?? 0 : source.reverbSend;
        source.delayASend = source.enabled ? routePeaks[1] ?? 0 : source.delayASend;
        source.delayBSend = source.enabled ? routePeaks[2] ?? 0 : source.delayBSend;
        source.granularSend = source.enabled ? routePeaks[3] ?? 0 : source.granularSend;
        source.presetId = soundscapePresetIdFromState(state);
      }
      break;
    default:
      break;
  }
  source.reverbSend = clamp(source.reverbSend, 0, 2);
  source.delayASend = clamp(source.delayASend, 0, 2);
  source.delayBSend = clamp(source.delayBSend, 0, 2);
  source.granularSend = clamp(source.granularSend, 0, 2);
  source.diffuseSend = clamp(source.diffuseSend, 0, 2);
  source.level = clamp(source.level, 0, 1.5);
  source.morph = clamp(source.morph, 0, 1);
  source.distance = clamp(source.distance, 0, 1);
  source.postLpfHz = clamp(source.postLpfHz, 20, 20000);
  source.stereoWidth = clamp(source.stereoWidth, 0, 1);
  source.postLpfKeyTracking = clamp(source.postLpfKeyTracking, 0, 1);
  return source;
}

function laneDefaults(targetSourceId: number, midiNote: number): ProductLaneSnapshot {
  return {
    enabled: false,
    targetSourceId,
    stepCount: 16,
    fillCount: 4,
    rotation: 0,
    clockDivision: 16,
    swing: 0,
    probability: 1,
    ratchet: 1,
    trigCondition: 0,
    midiNote,
    velocity: 0.75,
    holdSeconds: 0.18,
    morph: 0,
    distance: 0,
    expression: 0.75,
    seed: 1,
    barReset: true,
    phraseReset: false,
    manualStepMaskLow: 0,
    manualStepMaskHigh: 0,
  };
}

function synthLaneFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  defaultEnabled: boolean,
): ProductLaneSnapshot {
  const prefix = `synthEuclid${laneNumber}`;
  const lane = laneDefaults(synthSourceIdFromState(state, `${prefix}Source`), defaultSynthEuclidMidiCenter(laneNumber));
  lane.enabled =
    booleanFromState(state, 'synthEuclideanMasterEnabled', defaultEnabled) &&
    booleanFromState(state, `${prefix}Enabled`, laneNumber === 1);
  lane.stepCount = numberFromState(state, `${prefix}Steps`, 16);
  lane.fillCount = numberFromState(state, `${prefix}Hits`, laneNumber === 2 ? 3 : laneNumber === 3 ? 2 : laneNumber === 4 ? 6 : 4);
  lane.rotation = numberFromState(state, `${prefix}Rotation`, laneNumber === 2 ? 1 : laneNumber === 4 ? 2 : 0);
  lane.clockDivision = clockDivisionFromState(state, `${prefix}ClockDivision`, 16);
  lane.swing = numberFromState(state, `${prefix}Swing`, 0);
  lane.probability = numberFromState(state, `${prefix}Probability`, 1);
  lane.velocity = numberFromState(state, `${prefix}Level`, lane.velocity);
  lane.midiNote = midiCenterFromState(state, prefix, lane.midiNote);
  lane.seed = 1000 + laneNumber;
  Object.assign(lane, laneManualMaskFromState(state, prefix));
  return lane;
}

const DRUM_TARGETS = [
  { suffix: 'Sub', voiceIndex: 0 },
  { suffix: 'Kick', voiceIndex: 1 },
  { suffix: 'Click', voiceIndex: 2 },
  { suffix: 'BeepHi', voiceIndex: 3 },
  { suffix: 'BeepLo', voiceIndex: 4 },
  { suffix: 'Noise', voiceIndex: 5 },
  { suffix: 'Membrane', voiceIndex: 6 },
] as const;

function defaultDrumTargetSuffix(laneNumber: number): (typeof DRUM_TARGETS)[number]['suffix'] {
  if (laneNumber === 2) return 'BeepHi';
  if (laneNumber === 3) return 'Click';
  if (laneNumber === 4) return 'Noise';
  return 'Kick';
}

function drumTargetVoiceIndices(state: Record<string, unknown> | undefined, prefix: string, laneNumber: number): number[] {
  const selected = DRUM_TARGETS
    .filter((target) => booleanFromState(state, `${prefix}Target${target.suffix}`, target.suffix === defaultDrumTargetSuffix(laneNumber)))
    .map((target) => target.voiceIndex);
  return selected.length > 0 ? selected : [1];
}

function drumLaneBaseFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  voiceIndex: number,
  defaultEnabled: boolean,
): ProductLaneSnapshot {
  const prefix = `drumEuclid${laneNumber}`;
  const lane = laneDefaults(CORE_PRODUCT_SOURCE_IDS.drum, 36 + voiceIndex);
  lane.enabled =
    booleanFromState(state, 'drumEnabled', defaultEnabled) &&
    booleanFromState(state, 'drumEuclidMasterEnabled', defaultEnabled) &&
    booleanFromState(state, `${prefix}Enabled`, false);
  lane.stepCount = numberFromState(state, `${prefix}Steps`, laneNumber === 3 ? 12 : laneNumber === 2 ? 16 : 8);
  lane.fillCount = numberFromState(state, `${prefix}Hits`, laneNumber === 1 ? 5 : laneNumber === 3 ? 5 : 3);
  lane.rotation = numberFromState(state, `${prefix}Rotation`, 0);
  lane.clockDivision = clockDivisionFromState(
    state,
    `${prefix}ClockDivision`,
    numberFromState(state, 'drumEuclidDivision', 16),
  );
  lane.swing = numberFromState(state, `${prefix}Swing`, numberFromState(state, 'drumEuclidSwing', 0) / 100);
  lane.probability = numberFromState(state, `${prefix}Probability`, 1);
  lane.velocity = numberFromState(state, `${prefix}Level`, numberFromState(state, 'drumLevel', 0.75));
  lane.holdSeconds = 0.08;
  lane.seed = 2000 + laneNumber * 31 + voiceIndex;
  Object.assign(lane, laneManualMaskFromState(state, prefix));
  return lane;
}

function synthLanesFromState(state: Record<string, unknown> | undefined, defaultEnabled: boolean): ProductLaneSnapshot[] {
  return [1, 2, 3, 4].map((laneNumber) => synthLaneFromState(state, laneNumber, defaultEnabled));
}

function drumLanesFromState(state: Record<string, unknown> | undefined, defaultEnabled: boolean): ProductLaneSnapshot[] {
  const lanes: ProductLaneSnapshot[] = [];
  for (const laneNumber of [1, 2, 3, 4]) {
    const prefix = `drumEuclid${laneNumber}`;
    for (const voiceIndex of drumTargetVoiceIndices(state, prefix, laneNumber)) {
      if (lanes.length >= 16) return lanes;
      lanes.push(drumLaneBaseFromState(state, laneNumber, voiceIndex, defaultEnabled));
    }
  }
  return lanes;
}

function granularVoiceFromState(state: Record<string, unknown> | undefined, voiceNumber: number, macro?: GranularMacroModel): ProductGranularVoiceSnapshot {
  const prefix = `granularV${voiceNumber}`;
  const voiceIndex = voiceNumber - 1;
  return {
    enabled: booleanFromState(state, `${prefix}Enabled`, voiceNumber === 1),
    mode: granularVoiceModeId(state?.[`${prefix}Mode`]),
    slice: clamp(Math.round(numberFromState(state, `${prefix}Slice`, (voiceNumber - 1) * 4)), 0, 15),
    speed: clamp(macro?.voiceSpeed[voiceIndex] ?? numberFromState(state, `${prefix}Speed`, 1), 0, 4),
    scanRate: clamp(macro?.voiceScanRate[voiceIndex] ?? numberFromState(state, `${prefix}ScanRate`, 1), 0.25, 4),
    reverse: booleanFromState(state, `${prefix}Reverse`, false),
    pitch: clamp(macro?.voicePitch[voiceIndex] ?? numberFromState(state, `${prefix}Pitch`, 0), -24, 24),
    writeFollow: clamp(numberFromState(state, `${prefix}WriteFollow`, 0), 0, 1),
    density: clamp(macro?.voiceDensity[voiceIndex] ?? numberFromState(state, `${prefix}Density`, 20), 1, 64),
    grainSizeMs: clamp(macro?.voiceGrainSize[voiceIndex] ?? numberFromState(state, `${prefix}GrainSize`, 80), 10, 500),
    spray: clamp(macro?.voiceSpray[voiceIndex] ?? numberFromState(state, `${prefix}Spray`, 0.3), 0, 1),
    grainOctaveProbability: clamp(macro?.voiceGrainOct[voiceIndex] ?? numberFromState(state, `${prefix}GrainOct`, 0), 0, 1),
    attackSeconds: clamp(macro?.voiceAttack[voiceIndex] ?? numberFromState(state, `${prefix}Attack`, 0.003), 0.001, 0.5),
    decaySeconds: clamp(macro?.voiceDecay[voiceIndex] ?? numberFromState(state, `${prefix}Decay`, 0.5), 0.01, 4),
    gain: clamp(numberFromState(state, `${prefix}Gain`, 0.5), 0, 1),
    pan: clamp(numberFromState(state, `${prefix}Pan`, 0), -1, 1),
    blur: clamp(macro?.voiceBlur[voiceIndex] ?? numberFromState(state, `${prefix}Blur`, 0), 0, 1),
    stereoSpread: clamp(numberFromState(state, `${prefix}StereoSpread`, 0.5), 0, 1),
    positionLfoRate: clamp(macro?.voicePosLFORate[voiceIndex] ?? numberFromState(state, `${prefix}PosLFORate`, 0), 0, 1),
    positionLfoDepth: clamp(macro?.voicePosLFODepth[voiceIndex] ?? numberFromState(state, `${prefix}PosLFODepth`, 0), 0, 1),
    panLfoRate: clamp(macro?.voicePanLFORate[voiceIndex] ?? numberFromState(state, `${prefix}PanLFORate`, 0), 0, 1),
    reverseLfoRate: clamp(macro?.voiceReverseLFORate[voiceIndex] ?? numberFromState(state, `${prefix}ReverseLFORate`, 0), 0, 1),
    recordLfoRate: clamp(numberFromState(state, `${prefix}RecordLFORate`, 0), 0, 1),
    euclidGated: booleanFromState(state, `${prefix}TempoSync`, false),
    euclidMuted: false,
  };
}

// SNAPSHOT_AUTHORITY: SERIALIZE_PRODUCT_STATE - one-shot snapshot assembly from generated Product Core fields.
export function createCoreProductSnapshot(sliderState?: Record<string, unknown>): CoreProductSnapshot {
  const transport = transportFromState(sliderState);
  const tension = clamp(numberFromState(sliderState, 'tension', 0.35), 0, 1);
  const defaultEnabled = sliderState === undefined;
  const synthLanes = synthLanesFromState(sliderState, defaultEnabled);
  const drumLanes = drumLanesFromState(sliderState, defaultEnabled);
  const sources = SOURCE_ORDER.map((sourceId) => sourceFromState(sourceId, sliderState));
  const sourceDelayASendActive = sources.some((source) => source.enabled && source.delayASend > 0.0001);
  const delayBSendActive = sources.some((source) => source.delayBSend > 0.0001);
  const sourceDelayBSendActive = sources.some((source) => source.enabled && source.delayBSend > 0.0001);
  const soundscapeSource = sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
  const soundscapeAssets = soundscapeSource?.enabled
    ? getCoreProductSoundscapeAssetDescriptorsForState(sliderState)
    : [];
  const rngSeed = rngSeedFromState(sliderState);
  const granularEnabled = booleanFromState(sliderState, 'granularEnabled', false);
  const granularToDelayA = clamp(numberFromState(sliderState, 'granularDelayASend', 0), 0, 1);
  const granularToDelayB = clamp(numberFromState(sliderState, 'granularDelayBSend', 0), 0, 1);
  const delayAEnabled =
    booleanFromState(sliderState, 'delayAEnabled', true) ||
    sourceDelayASendActive ||
    numberFromState(sliderState, 'delayBToASend', 0) > 0.0001 ||
    granularToDelayA > 0.0001;
  const delayBOutputDefaultActive =
    delayBSendActive ||
    numberFromState(sliderState, 'delayAToBSend', 0) > 0.0001 ||
    granularToDelayB > 0.0001;
  const delayBEnabled =
    booleanFromState(sliderState, 'granularDelayEnabled', false) ||
    sourceDelayBSendActive ||
    numberFromState(sliderState, 'delayAToBSend', 0) > 0.0001 ||
    granularToDelayB > 0.0001;
  const rawDelayAToB = clamp(numberFromState(sliderState, 'delayAToBSend', 0), 0, 1), rawDelayBToA = clamp(numberFromState(sliderState, 'delayBToASend', 0), 0, 1), delayCrossScale = rawDelayAToB * rawDelayBToA > 0.4 ? Math.sqrt(0.4 / (rawDelayAToB * rawDelayBToA)) : 1, delayBToATrim = rawDelayAToB > 0.0001 && rawDelayBToA > 0.0001 ? 0.7 : 1;
  const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false);
  const dynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false);
  const granularMacroModel = computeGranularMacroModel((sliderState ?? {}) as unknown as SliderState, (key, fallback) => numberFromState(sliderState, key as string, fallback));
  const reverbParams = resolveReverbSnapshotParams(sliderState, tension);

  return {
    transport,
    harmony: {
      rootMidi: rootMidiFromState(sliderState),
      scaleId: scaleIdFromState(sliderState, tension),
      tension,
      chordMode: numberFromState(sliderState, 'chordMode', 0),
      voicingMode: numberFromState(sliderState, 'voicingMode', 0),
    },
    sources,
    synthLanes,
    drumLanes,
    journey: {
      enabled: booleanFromState(sliderState, 'journeyEnabled', false),
      morphPhase: clamp(numberFromState(sliderState, 'journeyMorphPhase', 0), 0, 1),
      morphRateBars: clamp(numberFromState(sliderState, 'journeyMorphRateBars', 8), 0.25, 128),
    },
    fx: {
      granularMix: granularEnabled
        ? clamp(numberFromState(sliderState, 'granularLevel', 0) * ENGINE_TRIMS.granular * granularMacroModel.directLevelScale, 0, 4)
        : 0,
      granularEnabled,
      granularFreeze: booleanFromState(sliderState, 'granularFreeze', false),
      granularFreezeWithFeedback: false,
      granularFeedback: clamp(numberFromState(sliderState, 'granularFeedback', 0.1), 0, 0.85),
      granularFeedbackLpfHz: clamp(numberFromState(sliderState, 'granularFeedbackLPF', 8000), 200, 12000),
      granularReverbLpfHz: clamp(granularMacroModel.finalReverbLPF, 200, 12000),
      granularOutputLpfHz: clamp(granularMacroModel.finalOutputLPF, 200, 12000),
      granularBufferSeconds: clamp(numberFromState(sliderState, 'granularBufferSeconds', 16), 1, 32),
      granularGrainShape: granularShapeId(sliderState?.granularShape),
      granularBusDiffusion: clamp(granularMacroModel.busDiffusion, 0, 1),
      granularTimingRandomness: clamp(granularMacroModel.timingRandomness, 0, 1),
      granularChordBias: clamp(numberFromState(sliderState, 'granularChordBias', 0), 0, 1),
      granularLegacyJitterMs: clamp(numberFromState(sliderState, 'granularLegacyJitter', 10), 0, 30),
      granularLegacyProbability: clamp(numberFromState(sliderState, 'granularLegacyProbability', 0.8), 0, 1),
      granularLegacyPitchMode: granularLegacyPitchModeId(sliderState?.granularLegacyPitchMode),
      granularLegacyPitchSpread: clamp(numberFromState(sliderState, 'granularLegacyPitchSpread', 2), 0, 12),
      granularLegacyMaxGrains: clamp(Math.round(numberFromState(sliderState, 'granularLegacyMaxGrains', 64)), 0, 128),
      granularLegacyFeedback: clamp(numberFromState(sliderState, 'granularLegacyFeedback', 0.1), 0, 0.35),
      granularVoices: [1, 2, 3, 4].map((voiceNumber) => granularVoiceFromState(sliderState, voiceNumber, granularMacroModel)),
      delayAEnabled,
      delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/8d', transport.bpm), 10, 5000),
      delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/4', transport.bpm), 10, 5000),
      delayAFeedback: clamp(numberFromState(sliderState, 'delayAFeedback', 0.4), 0, 0.95),
      delayAMix: delayAEnabled ? clamp(numberFromState(sliderState, 'delayAMix', 0), 0, 1) : 0,
      delayAFilterHz: clamp(numberFromState(sliderState, 'delayAFilter', 2000), 200, 12000),
      delayAFilterType: delayAFilterTypeId(sliderState?.delayAFilterType),
      delayAModRateHz: clamp(numberFromState(sliderState, 'delayAModRate', 0) * 5, 0, 5),
      delayAModDepthMs: clamp(numberFromState(sliderState, 'delayAModDepth', 0) * 50, 0, 50),
      delayAPingPong: booleanFromState(sliderState, 'delayAPingPong', false),
      delayADuck: clamp(numberFromState(sliderState, 'delayADuck', 0), 0, 1),
      delayAWidth: clamp(numberFromState(sliderState, 'delayAWidth', 0.5), 0, 1),
      delayACrossFeedFilterHz: 200 + clamp(numberFromState(sliderState, 'delayACrossFeedFilter', 1), 0, 1) * 7800,
      delayBEnabled,
      delayBActivity: clamp(numberFromState(sliderState, 'granularDelayActivity', 0.3), 0, 1),
      delayBRepeats: clamp(numberFromState(sliderState, 'granularDelayRepeats', 0.3), 0, 0.85),
      delayBBaseTimeMs: clamp(delayDivisionMs(sliderState, 'granularDelayTime', '1/4', transport.bpm), 20, 5000),
      delayBTone: clamp(numberFromState(sliderState, 'granularDelayFilter', 0.5), 0, 1),
      delayBVibrato: clamp(numberFromState(sliderState, 'granularDelayVibrato', 0), 0, 1),
      delayBMix: delayBEnabled
        ? clamp(numberFromState(sliderState, 'granularDelayMix', numberFromState(sliderState, 'delayBMix', delayBOutputDefaultActive ? 1 : 0)), 0, 1)
        : 0,
      delayBSpaceMode: sliderState?.granularSpaceMode === 'diffuse' ? 1 : 0,
      delayBPattern: delayBPatternId(sliderState?.delayBPattern),
      delayBWarp: delayBWarpId(sliderState?.delayBWarp),
      delayBWarpIntensity: clamp(numberFromState(sliderState, 'delayBWarpIntensity', 0.5), 0, 1),
      delayBSpread: clamp(numberFromState(sliderState, 'delayBSpread', 0.5), 0, 1),
      reverbMix: sliderState?.reverbEnabled === false ? 0 : clamp(numberFromState(sliderState, 'reverbLevel', 0.12), 0, 1),
      reverbType: reverbTypeId(sliderState?.reverbType),
      reverbQuality: reverbQualityId(shouldUseMobileReverbQualityOverride(sliderState) ? 'balanced' : sliderState?.reverbQuality),
      reverbDecay: reverbParams.decay,
      reverbSize: clamp(numberFromState(sliderState, 'reverbSize', 2), 0.5, 10),
      reverbDamping: clamp(numberFromState(sliderState, 'damping', 0.2), 0, 1),
      reverbDiffusion: reverbParams.diffusion,
      reverbModulation: clamp(numberFromState(sliderState, 'reverbModulation', 0.4), 0, 1),
      reverbPredelayMs: clamp(numberFromState(sliderState, 'predelay', 60), 0, 100),
      reverbWidth: clamp(numberFromState(sliderState, 'width', 0.85), 0, 1),
      reverbShimmerAmount: reverbParams.shimmer,
      reverbShimmerPitch: reverbParams.shimmerPitch,
      reverbSlowRateHz: clamp(numberFromState(sliderState, 'reverbSlowModRate', 0.05), 0.01, 0.2),
      reverbSlowDepth: clamp(numberFromState(sliderState, 'reverbSlowModDepth', 0), 0, 1),
      reverbReverseAmount: clamp(numberFromState(sliderState, 'reverbReverse', 0), 0, 1),
      reverbReverseLengthSec: clamp(numberFromState(sliderState, 'reverbReverseLength', 2), 0.5, 16),
      reverbChorusRateHz: clamp(numberFromState(sliderState, 'reverbChorusRate', 0.5), 0.05, 2),
      reverbChorusDepth: clamp(numberFromState(sliderState, 'reverbChorusDepth', 12), 0, 40),
      reverbModCharacter: reverbModCharacterId(sliderState?.reverbModCharacter),
      reverbDampLow: clamp(numberFromState(sliderState, 'reverbDampLow', 0.1), 0, 1),
      reverbDampHigh: clamp(numberFromState(sliderState, 'reverbDampHigh', 0.3), 0, 1),
      reverbCrossoverHz: clamp(numberFromState(sliderState, 'reverbCrossoverFreq', 800), 100, 6000),
      reverbInputTone: clamp(numberFromState(sliderState, 'reverbInputTone', 0), -1, 1),
      reverbShimmerFeedback: clamp(numberFromState(sliderState, 'reverbShimmerFeedback', 0), 0, 1),
      reverbWarp: clamp(numberFromState(sliderState, 'reverbWarp', 0), 0, 1),
      reverbCrossFeed: clamp(numberFromState(sliderState, 'reverbCrossFeed', 0), 0, 1),
      reverbEarlyReflections: clamp(numberFromState(sliderState, 'reverbEarlyReflections', 0.3), 0, 1),
      reverbAirAbsorption: clamp(numberFromState(sliderState, 'reverbAirAbsorption', 0.2), 0, 1),
      reverbSaturationMode: reverbSaturationModeId(sliderState?.reverbSaturationMode),
      reverbTransientSmooth: clamp(numberFromState(sliderState, 'reverbTransientSmooth', 0), 0, 1),
      reverbErLpFreq: clamp(numberFromState(sliderState, 'reverbErLpFreq', 2500), 200, 12000),
      reverbPreCompThreshold: clamp(numberFromState(sliderState, 'reverbPreCompThreshold', DEFAULT_REVERB_PRE_COMP.threshold), -60, 0),
      reverbPreCompKnee: clamp(numberFromState(sliderState, 'reverbPreCompKnee', DEFAULT_REVERB_PRE_COMP.knee), 0, 40),
      reverbPreCompRatio: clamp(numberFromState(sliderState, 'reverbPreCompRatio', DEFAULT_REVERB_PRE_COMP.ratio), 1, 20),
      reverbPreCompAttackMs: clamp(numberFromState(sliderState, 'reverbPreCompAttackMs', DEFAULT_REVERB_PRE_COMP.attackMs), 0.1, 30),
      reverbPreCompReleaseMs: clamp(numberFromState(sliderState, 'reverbPreCompReleaseMs', DEFAULT_REVERB_PRE_COMP.releaseMs), 20, 1000),
      reverbPreCompMakeup: clamp(numberFromState(sliderState, 'reverbPreCompMakeup', DEFAULT_REVERB_PRE_COMP.makeup), 0.5, 4),
      spectralFreezeMix: clamp(numberFromState(sliderState, 'spectralFreezeMix', 1), 0, 1),
      spectralFreezeEnabled,
      spectralFreezeActive: booleanFromState(sliderState, 'spectralFreezeActive', false),
      spectralFreezeSlushy: booleanFromState(sliderState, 'spectralFreezeSlushy', false),
      spectralFreezeSpeed: clamp(numberFromState(sliderState, 'spectralFreezeSpeed', 0.3), 0, 1),
      spectralFreezeDecay: clamp(numberFromState(sliderState, 'spectralFreezeDecay', 1), 0, 1),
      spectralFreezePhaseJitter: clamp(numberFromState(sliderState, 'spectralFreezePhaseJitter', 0), 0, 1),
      spectralFreezeRouting: sliderState?.spectralFreezeRouting === 'post' ? 1 : 0,
      spectralFreezeReverbCrossfade: clamp(numberFromState(sliderState, 'spectralFreezeReverbCrossfade', 1), 0, 1),
      dynamicsDrive: dynamicsEnabled
        ? clamp(numberFromState(sliderState, 'dynamicsDrive', numberFromState(sliderState, 'dynamicsSaturationDrive', 0)), 0, 1)
        : 0,
      dynamicsEnabled,
      dynamicsCharacterEnabled: dynamicsEnabled && booleanFromState(sliderState, 'characterEnabled', false),
      dynamicsCharacterMode: dynamicsCharacterModeId(sliderState?.characterMode),
      dynamicsCharacterMix: clamp(numberFromState(sliderState, 'characterMix', 0), 0, 1),
      dynamicsCharacterAge: clamp(numberFromState(sliderState, 'characterAge', 0), 0, 1),
      dynamicsCharacterBias: clamp(numberFromState(sliderState, 'characterBias', 0.5), 0, 1),
      dynamicsCharacterLpgAmount: clamp(numberFromState(sliderState, 'characterLpgAmount', 0.5), 0, 1),
      dynamicsCharacterResonance: clamp(numberFromState(sliderState, 'characterResonance', 0.2), 0, 1),
      dynamicsCharacterStereo: clamp(numberFromState(sliderState, 'characterStereo', 0.5), 0, 1),
      dynamicsCharacterEnvFollow: clamp(numberFromState(sliderState, 'characterEnvFollow', 0), 0, 1),
      dynamicsCharacterDepth: clamp(numberFromState(sliderState, 'characterDepth', 0), 0, 1),
      dynamicsCharacterRate: clamp(numberFromState(sliderState, 'characterRate', 0.3), 0, 1),
      dynamicsCharacterDamp: clamp(numberFromState(sliderState, 'characterDamp', 0.5), 0, 1),
      dynamicsDegradeEnabled: dynamicsEnabled && booleanFromState(sliderState, 'degradeEnabled', false),
      dynamicsDegradeMix: clamp(numberFromState(sliderState, 'degradeMix', 0), 0, 1),
      dynamicsDegradeAge: clamp(numberFromState(sliderState, 'degradeAge', 0), 0, 1),
      dynamicsDegradeGeneration: clamp(numberFromState(sliderState, 'degradeGeneration', 0), 0, 1),
      dynamicsDegradeAlias: clamp(numberFromState(sliderState, 'degradeAlias', 0), 0, 1),
      dynamicsDegradeWow: clamp(numberFromState(sliderState, 'degradeWow', 0), 0, 1),
      dynamicsDegradeFlutter: clamp(numberFromState(sliderState, 'degradeFlutter', 0), 0, 1),
      dynamicsDegradeDrift: clamp(numberFromState(sliderState, 'degradeDrift', 0), 0, 1),
      dynamicsDegradeWobbleSpeed: clamp(numberFromState(sliderState, 'degradeWobbleSpeed', 0.35), 0, 1),
      dynamicsDegradeTone: clamp(numberFromState(sliderState, 'degradeTone', 0.5), 0, 1),
      dynamicsDegradeHp: clamp(numberFromState(sliderState, 'degradeHp', 0), 0, 1),
      dynamicsDegradeLp: clamp(numberFromState(sliderState, 'degradeLp', 1), 0, 1),
      dynamicsDegradeNoise: clamp(numberFromState(sliderState, 'degradeNoise', 0), 0, 1),
      dynamicsDegradeSaturation: clamp(numberFromState(sliderState, 'degradeSaturation', 0), 0, 1),
      dynamicsDegradeCorrosion: clamp(numberFromState(sliderState, 'degradeCorrosion', 0), 0, 1),
      dynamicsModSlowWow: clamp(numberFromState(sliderState, 'degradeModSlowWow', 0.18), 0, 1),
      dynamicsModSlowFlutter: clamp(numberFromState(sliderState, 'degradeModSlowFlutter', 0.02), 0, 1),
      dynamicsModSlowLp: clamp(numberFromState(sliderState, 'degradeModSlowLp', 0.12), 0, 1),
      dynamicsModSlowWet: clamp(numberFromState(sliderState, 'degradeModSlowWet', 0.03), 0, 1),
      dynamicsModSlowDropout: clamp(numberFromState(sliderState, 'degradeModSlowDropout', 0.04), 0, 1),
      dynamicsModSlowAlias: clamp(numberFromState(sliderState, 'degradeModSlowAlias', 0), 0, 1),
      dynamicsModFlutterWow: clamp(numberFromState(sliderState, 'degradeModFlutterWow', 0), 0, 1),
      dynamicsModFlutterFlutter: clamp(numberFromState(sliderState, 'degradeModFlutterFlutter', 0.12), 0, 1),
      dynamicsModFlutterLp: clamp(numberFromState(sliderState, 'degradeModFlutterLp', 0.02), 0, 1),
      dynamicsModFlutterWet: clamp(numberFromState(sliderState, 'degradeModFlutterWet', 0), 0, 1),
      dynamicsModFlutterDropout: clamp(numberFromState(sliderState, 'degradeModFlutterDropout', 0.02), 0, 1),
      dynamicsModFlutterAlias: clamp(numberFromState(sliderState, 'degradeModFlutterAlias', 0), 0, 1),
      dynamicsModRandomWow: clamp(numberFromState(sliderState, 'degradeModRandomWow', 0.04), 0, 1),
      dynamicsModRandomFlutter: clamp(numberFromState(sliderState, 'degradeModRandomFlutter', 0.03), 0, 1),
      dynamicsModRandomLp: clamp(numberFromState(sliderState, 'degradeModRandomLp', 0.14), 0, 1),
      dynamicsModRandomWet: clamp(numberFromState(sliderState, 'degradeModRandomWet', 0.02), 0, 1),
      dynamicsModRandomDropout: clamp(numberFromState(sliderState, 'degradeModRandomDropout', 0.1), 0, 1),
      dynamicsModRandomAlias: clamp(numberFromState(sliderState, 'degradeModRandomAlias', 0.02), 0, 1),
      dynamicsModEnvWow: clamp(numberFromState(sliderState, 'degradeModEnvWow', 0), 0, 1),
      dynamicsModEnvFlutter: clamp(numberFromState(sliderState, 'degradeModEnvFlutter', 0), 0, 1),
      dynamicsModEnvLp: clamp(numberFromState(sliderState, 'degradeModEnvLp', 0.08), 0, 1),
      dynamicsModEnvWet: clamp(numberFromState(sliderState, 'degradeModEnvWet', 0.04), 0, 1),
      dynamicsModEnvDropout: clamp(numberFromState(sliderState, 'degradeModEnvDropout', 0), 0, 1),
      dynamicsModEnvAlias: clamp(numberFromState(sliderState, 'degradeModEnvAlias', 0), 0, 1),
      dynamicsModNoiseWow: clamp(numberFromState(sliderState, 'degradeModNoiseWow', 0), 0, 1),
      dynamicsModNoiseFlutter: clamp(numberFromState(sliderState, 'degradeModNoiseFlutter', 0.06), 0, 1),
      dynamicsModNoiseLp: clamp(numberFromState(sliderState, 'degradeModNoiseLp', 0.02), 0, 1),
      dynamicsModNoiseWet: clamp(numberFromState(sliderState, 'degradeModNoiseWet', 0), 0, 1),
      dynamicsModNoiseDropout: clamp(numberFromState(sliderState, 'degradeModNoiseDropout', 0.06), 0, 1),
      dynamicsModNoiseAlias: clamp(numberFromState(sliderState, 'degradeModNoiseAlias', 0.02), 0, 1),
      dynamicsSaturationEnabled: dynamicsEnabled && booleanFromState(sliderState, 'dynamicsSaturationEnabled', false),
      dynamicsSaturationMode: dynamicsSaturationModeId(sliderState?.dynamicsSaturationMode),
      dynamicsSaturationDrive: clamp(numberFromState(sliderState, 'dynamicsSaturationDrive', 0), 0, 1),
      dynamicsSaturationTone: clamp(numberFromState(sliderState, 'dynamicsSaturationTone', 0.5), 0, 1),
      dynamicsSaturationBias: clamp(numberFromState(sliderState, 'dynamicsSaturationBias', 0.5), 0, 1),
      dynamicsEndCompEnabled: dynamicsEnabled && booleanFromState(sliderState, 'endCompEnabled', false),
      dynamicsEndCompThreshold: clamp(numberFromState(sliderState, 'endCompThreshold', -18), -60, 0),
      dynamicsEndCompKnee: clamp(numberFromState(sliderState, 'endCompKnee', 12), 0, 40),
      dynamicsEndCompRatio: clamp(numberFromState(sliderState, 'endCompRatio', 2), 1, 20),
      dynamicsEndCompAttackMs: clamp(numberFromState(sliderState, 'endCompAttackMs', 10), 0.1, 100),
      dynamicsEndCompReleaseMs: clamp(numberFromState(sliderState, 'endCompReleaseMs', 180), 20, 1500),
      dynamicsEndCompMakeup: clamp(numberFromState(sliderState, 'endCompMakeup', 1), 0.25, 4),
      dynamicsEndCompMix: clamp(numberFromState(sliderState, 'endCompMix', 1), 0, 1),
      dynamicsEndCompDetectorHp: clamp(numberFromState(sliderState, 'endCompDetectorHp', 0.25), 0, 1),
      dynamicsEndCompDetectorTilt: clamp(numberFromState(sliderState, 'endCompDetectorTilt', 0.5), 0, 1),
      dynamicsEndCompAutoMakeup: clamp(numberFromState(sliderState, 'endCompAutoMakeup', 0.7), 0, 1),
      dynamicsEndCompProgramRelease: clamp(numberFromState(sliderState, 'endCompProgramRelease', 0.65), 0, 1),
      sidechainEnabled: booleanFromState(sliderState, 'sidechainEnabled', false),
      sidechainKeyA: sidechainKeyId(sliderState?.sidechainKeyA),
      sidechainKeyB: sidechainKeyId(sliderState?.sidechainKeyB),
      sidechainKeyAWeight: clamp(numberFromState(sliderState, 'sidechainKeyAWeight', 1), 0, 1),
      sidechainKeyBWeight: clamp(numberFromState(sliderState, 'sidechainKeyBWeight', 0.7), 0, 1),
      sidechainAmount: clamp(numberFromState(sliderState, 'sidechainAmount', 0.5), 0, 1),
      sidechainThreshold: clamp(numberFromState(sliderState, 'sidechainThreshold', -24), -60, 0),
      sidechainRatio: clamp(numberFromState(sliderState, 'sidechainRatio', 4), 1, 20),
      sidechainKnee: clamp(numberFromState(sliderState, 'sidechainKnee', 6), 0, 40),
      sidechainAttackMs: clamp(numberFromState(sliderState, 'sidechainAttackMs', 5), 0.1, 100),
      sidechainHoldMs: clamp(numberFromState(sliderState, 'sidechainHoldMs', 20), 0, 250),
      sidechainReleaseMs: clamp(numberFromState(sliderState, 'sidechainReleaseMs', 180), 20, 1500),
      sidechainMakeup: clamp(numberFromState(sliderState, 'sidechainMakeup', 1), 0.25, 4),
      sidechainMix: clamp(numberFromState(sliderState, 'sidechainMix', 1), 0, 1),
      sidechainCurve: clamp(numberFromState(sliderState, 'sidechainCurve', 0.5), 0, 1),
      sidechainDetectorHp: clamp(numberFromState(sliderState, 'sidechainDetectorHp', 0), 0, 1),
      sidechainDetectorLp: clamp(numberFromState(sliderState, 'sidechainDetectorLp', 1), 0, 1),
      sidechainPad1Target: clamp(numberFromState(sliderState, 'sidechainPad1Target', 0), 0, 1),
      sidechainPad2Target: clamp(numberFromState(sliderState, 'sidechainPad2Target', 0), 0, 1),
      sidechainLead1Target: clamp(numberFromState(sliderState, 'sidechainLead1Target', 0), 0, 1),
      sidechainLead2Target: clamp(numberFromState(sliderState, 'sidechainLead2Target', 0), 0, 1),
      sidechainPianoTarget: clamp(numberFromState(sliderState, 'sidechainPianoTarget', 0), 0, 1),
      sidechainGranularTarget: clamp(numberFromState(sliderState, 'sidechainGranularTarget', 0), 0, 1),
      sidechainDelayATarget: clamp(numberFromState(sliderState, 'sidechainDelayATarget', 0), 0, 1),
      sidechainDelayBTarget: clamp(numberFromState(sliderState, 'sidechainDelayBTarget', 0), 0, 1),
      sidechainReverbTarget: clamp(numberFromState(sliderState, 'sidechainReverbTarget', 0), 0, 1),
    },
    routing: {
      delayAToDelayB: rawDelayAToB * delayCrossScale,
      delayBToDelayA: rawDelayBToA * delayCrossScale * delayBToATrim,
      delayToReverb: clamp(numberFromState(sliderState, 'delayAReverbSend', 0.2), 0, 1),
      granularToReverb: clamp(numberFromState(sliderState, 'granularReverbSend', 0.3) * ENGINE_TRIMS.granular, 0, 4),
      delayAToGranular: clamp(numberFromState(sliderState, 'delayAGranularSend', 0), 0, 1),
      delayBToGranular: clamp(numberFromState(sliderState, 'delayBGranularSend', 0), 0, 1),
      delayBToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.4), 0, 1),
      granularToDelayA,
      granularToDelayB,
    },
    master: {
      gain: clamp(numberFromState(sliderState, 'masterVolume', DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM, 0, 1.5),
      limiterCeilingDb: clamp(numberFromState(sliderState, 'masterLimiterCeilingDb', -0.5), -24, 0),
      saturationMode: dynamicsSaturationModeId(sliderState?.masterSatMode),
      saturationDrive: clamp(numberFromState(sliderState, 'masterSatDrive', 0), 0, 1),
      saturationTone: clamp(numberFromState(sliderState, 'masterSatTone', 0.5), 0, 1),
    },
    rng: {
      seed: rngSeed,
      state: rngStateFromState(sliderState, rngSeed),
    },
    evolution: {
      amount: evolutionAmountFromState(sliderState),
      state: numberFromState(sliderState, 'evolutionState', numberFromState(sliderState, 'seed', 1)) >>> 0,
    },
    assetRefs: soundscapeAssets.map((asset) => asset.assetId),
    assetRefLevels: soundscapeAssets.map((asset) => asset.level),
  };
}

export { encodeCoreProductSnapshot, KESSHO_PRODUCT_SNAPSHOT_BYTES, KESSHO_PRODUCT_SOURCE_SNAPSHOT_BYTES } from './coreProductSnapshotEncoder';
