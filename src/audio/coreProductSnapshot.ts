import {
  KESSHO_PRODUCT_SCHEMA_HASH,
  KESSHO_PRODUCT_SCHEMA_VERSION,
  KESSHO_PRODUCT_SOURCE_PRESETS,
} from './generated/kesshoProductSchema';
import type { SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import {
  CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID,
  getCoreProductSoundscapeAssetDescriptorsForState,
  getDefaultCoreProductSoundscapeAssetId,
} from './coreProductAssets';
import { delayNoteToSeconds } from './delayBuses';
import { getTransportMetrics } from './transport';

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
};

type ProductLaneSnapshot = {
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
    spectralFreezeMix: number;
    spectralFreezeEnabled: boolean;
    spectralFreezeActive: boolean;
    spectralFreezeSlushy: boolean;
    spectralFreezeSpeed: number;
    spectralFreezeDecay: number;
    spectralFreezePhaseJitter: number;
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

const SNAPSHOT_BYTES = 4612;
const SOURCE_BYTES = 56;
const LANE_BYTES = 84;
const SEQUENCER_BYTES = 4 + 16 * LANE_BYTES;

function bool(value: unknown): number {
  return value ? 1 : 0;
}

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function stringFromState(state: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = state?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function delayDivisionMs(state: Record<string, unknown> | undefined, key: string, fallback: string, bpm: number): number {
  return delayNoteToSeconds(stringFromState(state, key, fallback), bpm) * 1000;
}

function delayAFilterTypeId(value: unknown): number {
  if (value === 'highpass') return 1;
  if (value === 'bandpass') return 2;
  return 0;
}

function delayBPatternId(value: unknown): number {
  switch (value) {
    case 'golden':
      return 1;
    case 'mirror':
      return 2;
    case 'dotted':
      return 3;
    case 'cascade':
    default:
      return 0;
  }
}

function delayBWarpId(value: unknown): number {
  switch (value) {
    case 'filterSweep':
      return 1;
    case 'pitchDrift':
      return 2;
    case 'grainCrossfade':
      return 3;
    case 'clean':
    default:
      return 0;
  }
}

function reverbTypeId(value: unknown): number {
  switch (value) {
    case 'plate':
      return 0;
    case 'hall':
      return 1;
    case 'darkHall':
      return 3;
    case 'dattorroPlate':
      return 4;
    case 'dattorroShimmer':
      return 5;
    case 'cathedral':
    default:
      return 2;
  }
}

function reverbQualityId(value: unknown): number {
  switch (value) {
    case 'ultra':
      return 0;
    case 'lite':
      return 2;
    case 'balanced':
    default:
      return 1;
  }
}

function reverbModCharacterId(value: unknown): number {
  switch (value) {
    case 'sine':
      return 0;
    case 'drift':
      return 1;
    case 'hybrid':
    default:
      return 2;
  }
}

function reverbSaturationModeId(value: unknown): number {
  switch (value) {
    case 'tape':
      return 1;
    case 'tube':
      return 2;
    case 'clean':
    default:
      return 0;
  }
}

function dynamicsCharacterModeId(value: unknown): number {
  switch (value) {
    case 'abyssWater':
      return 1;
    case 'shallowWater':
      return 2;
    case 'clean':
    default:
      return 0;
  }
}

function dynamicsSaturationModeId(value: unknown): number {
  switch (value) {
    case 'tape':
      return 1;
    case 'tube':
      return 2;
    case 'diode':
      return 3;
    case 'fold':
      return 4;
    case 'clean':
    default:
      return 0;
  }
}

function sidechainKeyId(value: unknown): number {
  switch (value) {
    case 'sub':
      return 1;
    case 'kick':
      return 2;
    case 'click':
      return 3;
    case 'beepHi':
      return 4;
    case 'beepLo':
      return 5;
    case 'noise':
      return 6;
    case 'membrane':
      return 7;
    case 'off':
    default:
      return 0;
  }
}

function granularShapeId(value: unknown): number {
  switch (value) {
    case 'sawUp':
      return 1;
    case 'sawDown':
      return 2;
    case 'square':
      return 3;
    case 'triangle':
    default:
      return 0;
  }
}

function granularVoiceModeId(value: unknown): number {
  switch (value) {
    case 'clean':
      return 0;
    case 'legacy':
      return 2;
    case 'granular':
    default:
      return 1;
  }
}

function granularLegacyPitchModeId(value: unknown): number {
  return value === 'random' ? 0 : 1;
}

function normalizePresetKey(key: unknown, fallbackKey: string): string {
  const text = String(key ?? fallbackKey).trim();
  if (!text) return fallbackKey;
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function sourcePresetId(sourceFamily: string, key: unknown, fallbackKey = 'default'): number {
  const normalized = normalizePresetKey(key, fallbackKey);
  const fallback = normalizePresetKey(fallbackKey, fallbackKey);
  return (
    KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === normalized)?.id ??
    KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === fallback)?.id ??
    0
  );
}

function endpointPresetId(
  sourceFamily: 'pad' | 'lead',
  morph: number,
  keyA: unknown,
  keyB: unknown,
  fallbackKey: string,
): number {
  return sourcePresetId(sourceFamily, clamp(morph, 0, 1) >= 0.5 ? keyB : keyA, fallbackKey);
}

function defaultPresetId(sourceId: number): number {
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      return sourcePresetId('pad', 'init', 'init');
    case CORE_PRODUCT_SOURCE_IDS.lead1:
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      return sourcePresetId('lead', 'soft_rhodes', 'soft_rhodes');
    case CORE_PRODUCT_SOURCE_IDS.drum:
      return sourcePresetId('drum', 'default', 'default');
    case CORE_PRODUCT_SOURCE_IDS.piano:
      return sourcePresetId('piano', 'default', 'default');
    case CORE_PRODUCT_SOURCE_IDS.soundscape:
      return sourcePresetId('soundscape', 'ocean_sample', 'ocean_sample');
    default:
      return 0;
  }
}

function waterPresetKeyFromState(state: Record<string, unknown> | undefined): string {
  const morph = clamp(numberFromState(state, 'waterMorph', 0), 0, 1);
  const presetA = numberFromState(state, 'waterMorphA', numberFromState(state, 'waterPreset', 0));
  const presetB = numberFromState(state, 'waterMorphB', numberFromState(state, 'waterPreset', presetA));
  return `water_${clamp(Math.round(morph < 0.5 ? presetA : presetB), 0, 7)}`;
}

function soundscapePresetIdFromState(state: Record<string, unknown> | undefined): number {
  if (booleanFromState(state, 'oceanSampleEnabled', false)) return sourcePresetId('soundscape', 'ocean_sample', 'ocean_sample');
  if (booleanFromState(state, 'waterEnabled', false)) return sourcePresetId('soundscape', waterPresetKeyFromState(state), 'ocean_sample');
  if (booleanFromState(state, 'birds2Enabled', false)) return sourcePresetId('soundscape', 'birds2', 'ocean_sample');
  if (booleanFromState(state, 'birdsEnabled', false)) return sourcePresetId('soundscape', 'birds', 'ocean_sample');
  if (booleanFromState(state, 'frogsEnabled', false)) return sourcePresetId('soundscape', 'frogs', 'ocean_sample');
  if (booleanFromState(state, 'insects2Enabled', false)) return sourcePresetId('soundscape', 'insects2', 'ocean_sample');
  if (booleanFromState(state, 'insectsEnabled', false)) return sourcePresetId('soundscape', 'insects', 'ocean_sample');
  return sourcePresetId('soundscape', 'ocean_sample', 'ocean_sample');
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

function rngSeedFromState(state: Record<string, unknown> | undefined): number {
  const explicitSeed = numberFromState(state, 'rngSeed', numberFromState(state, 'seed', Number.NaN));
  if (Number.isFinite(explicitSeed)) {
    return positiveU32(explicitSeed, 1);
  }
  const seedWindow = String(state?.seedWindow ?? 'hour');
  const randomness = numberFromState(state, 'randomness', 0.5).toFixed(4);
  const rootNote = numberFromState(state, 'rootNote', 0);
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
  const rootNote = numberFromState(state, 'rootNote', 0);
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
      source.presetId = endpointPresetId('pad', source.morph, state?.padPresetA, state?.padPresetB, 'init');
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
      source.presetId = endpointPresetId('pad', source.morph, state?.pad2PresetA, state?.pad2PresetB, 'init');
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      source.enabled = booleanFromState(state, 'leadEnabled', false);
      source.level = numberFromState(state, 'lead1Level', numberFromState(state, 'leadLevel', source.level));
      source.morph = numberFromState(state, 'lead1Morph', source.morph);
      source.distance = numberFromState(state, 'lead1Distance', source.distance);
      source.reverbSend = numberFromState(state, 'lead1ReverbSend', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead1Send', source.granularSend);
      source.presetId = endpointPresetId('lead', source.morph, state?.lead1PresetA, state?.lead1PresetB, 'soft_rhodes');
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      source.enabled = booleanFromState(state, 'leadEnabled', false);
      source.level = numberFromState(state, 'lead2Level', source.level);
      source.morph = numberFromState(state, 'lead2Morph', source.morph);
      source.distance = numberFromState(state, 'lead2Distance', source.distance);
      source.reverbSend = numberFromState(state, 'lead2ReverbSend', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead2Send', source.granularSend);
      source.presetId = endpointPresetId('lead', source.morph, state?.lead2PresetC, state?.lead2PresetD, 'soft_rhodes');
      break;
    case CORE_PRODUCT_SOURCE_IDS.drum:
      source.enabled = booleanFromState(state, 'drumEnabled', false);
      source.level = numberFromState(state, 'drumLevel', source.level);
      source.reverbSend = numberFromState(state, 'drumReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'drumDelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'drumDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularDrumSend', source.granularSend);
      source.presetId = sourcePresetId('drum', 'default', 'default');
      break;
    case CORE_PRODUCT_SOURCE_IDS.piano:
      source.enabled = booleanFromState(state, 'pianoEnabled', false);
      source.assetId = CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID;
      source.level = numberFromState(state, 'pianoLevel', source.level);
      source.distance = numberFromState(state, 'pianoDistance', source.distance);
      source.reverbSend = numberFromState(state, 'pianoReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'pianoDelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pianoDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPianoSend', source.granularSend);
      source.presetId = sourcePresetId('piano', 'default', 'default');
      break;
    case CORE_PRODUCT_SOURCE_IDS.soundscape:
      source.enabled =
        booleanFromState(state, 'oceanSampleEnabled', false) ||
        booleanFromState(state, 'waterEnabled', false) ||
        booleanFromState(state, 'insectsEnabled', false) ||
        booleanFromState(state, 'insects2Enabled', false) ||
        booleanFromState(state, 'birdsEnabled', false) ||
        booleanFromState(state, 'birds2Enabled', false) ||
        booleanFromState(state, 'frogsEnabled', false);
      source.assetId = getDefaultCoreProductSoundscapeAssetId(state);
      source.level = numberFromState(state, 'natureLevel', source.level);
      source.reverbSend = numberFromState(state, 'natureReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'natureDelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'natureDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularNatureSend', source.granularSend);
      source.presetId = soundscapePresetIdFromState(state);
      break;
    default:
      break;
  }
  source.reverbSend = clamp(source.reverbSend, 0, 2);
  source.delayASend = clamp(source.delayASend, 0, 2);
  source.delayBSend = clamp(source.delayBSend, 0, 2);
  source.granularSend = clamp(source.granularSend, 0, 2);
  source.level = clamp(source.level, 0, 1.5);
  source.morph = clamp(source.morph, 0, 1);
  source.distance = clamp(source.distance, 0, 1);
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
  const lane = laneDefaults(synthSourceIdFromState(state, `${prefix}Source`), 60);
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

function granularVoiceFromState(state: Record<string, unknown> | undefined, voiceNumber: number): ProductGranularVoiceSnapshot {
  const prefix = `granularV${voiceNumber}`;
  return {
    enabled: booleanFromState(state, `${prefix}Enabled`, voiceNumber === 1),
    mode: granularVoiceModeId(state?.[`${prefix}Mode`]),
    slice: clamp(Math.round(numberFromState(state, `${prefix}Slice`, (voiceNumber - 1) * 4)), 0, 15),
    speed: clamp(numberFromState(state, `${prefix}Speed`, 1), 0, 4),
    scanRate: clamp(numberFromState(state, `${prefix}ScanRate`, 1), 0.25, 4),
    reverse: booleanFromState(state, `${prefix}Reverse`, false),
    pitch: clamp(numberFromState(state, `${prefix}Pitch`, 0), -24, 24),
    writeFollow: clamp(numberFromState(state, `${prefix}WriteFollow`, 0), 0, 1),
    density: clamp(numberFromState(state, `${prefix}Density`, 20), 1, 64),
    grainSizeMs: clamp(numberFromState(state, `${prefix}GrainSize`, 80), 10, 500),
    spray: clamp(numberFromState(state, `${prefix}Spray`, 0.3), 0, 1),
    grainOctaveProbability: clamp(numberFromState(state, `${prefix}GrainOct`, 0), 0, 1),
    attackSeconds: clamp(numberFromState(state, `${prefix}Attack`, 0.003), 0.001, 0.5),
    decaySeconds: clamp(numberFromState(state, `${prefix}Decay`, 0.5), 0.01, 4),
    gain: clamp(numberFromState(state, `${prefix}Gain`, 0.5), 0, 1),
    pan: clamp(numberFromState(state, `${prefix}Pan`, 0), -1, 1),
    blur: clamp(numberFromState(state, `${prefix}Blur`, 0), 0, 1),
    stereoSpread: clamp(numberFromState(state, `${prefix}StereoSpread`, 0.5), 0, 1),
    positionLfoRate: clamp(numberFromState(state, `${prefix}PosLFORate`, 0), 0, 1),
    positionLfoDepth: clamp(numberFromState(state, `${prefix}PosLFODepth`, 0), 0, 1),
    panLfoRate: clamp(numberFromState(state, `${prefix}PanLFORate`, 0), 0, 1),
    reverseLfoRate: clamp(numberFromState(state, `${prefix}ReverseLFORate`, 0), 0, 1),
    recordLfoRate: clamp(numberFromState(state, `${prefix}RecordLFORate`, 0), 0, 1),
    euclidGated: booleanFromState(state, `${prefix}TempoSync`, false),
    euclidMuted: false,
  };
}

export function createCoreProductSnapshot(sliderState?: Record<string, unknown>): CoreProductSnapshot {
  const transport = transportFromState(sliderState);
  const tension = clamp(numberFromState(sliderState, 'tension', 0.35), 0, 1);
  const defaultEnabled = sliderState === undefined;
  const synthLanes = synthLanesFromState(sliderState, defaultEnabled);
  const drumLanes = drumLanesFromState(sliderState, defaultEnabled);
  const sources = SOURCE_ORDER.map((sourceId) => sourceFromState(sourceId, sliderState));
  const delayBSendActive = sources.some((source) => source.delayBSend > 0.0001);
  const soundscapeSource = sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
  const rngSeed = rngSeedFromState(sliderState);
  const granularEnabled = booleanFromState(sliderState, 'granularEnabled', false);
  const delayAEnabled = booleanFromState(sliderState, 'delayAEnabled', true);
  const delayBEnabled = booleanFromState(sliderState, 'granularDelayEnabled', false);
  const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false);
  const dynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false);
  const granularTimingRandomness = numberFromState(
    sliderState,
    'granularTimingRandomness',
    numberFromState(sliderState, 'granularMacroChaos', 0.35),
  );

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
      granularMix: granularEnabled ? clamp(numberFromState(sliderState, 'granularLevel', 0), 0, 1) : 0,
      granularEnabled,
      granularFreeze: booleanFromState(sliderState, 'granularFreeze', false),
      granularFreezeWithFeedback: booleanFromState(sliderState, 'granularFreezeWithFeedback', false),
      granularFeedback: clamp(numberFromState(sliderState, 'granularFeedback', 0.1), 0, 0.85),
      granularFeedbackLpfHz: clamp(numberFromState(sliderState, 'granularFeedbackLPF', 8000), 200, 12000),
      granularBufferSeconds: clamp(numberFromState(sliderState, 'granularBufferSeconds', 16), 1, 32),
      granularGrainShape: granularShapeId(sliderState?.granularShape),
      granularBusDiffusion: clamp(numberFromState(sliderState, 'granularDiffusion', 0.5), 0, 1),
      granularTimingRandomness: clamp(granularTimingRandomness, 0, 1),
      granularChordBias: clamp(numberFromState(sliderState, 'granularChordBias', 0), 0, 1),
      granularLegacyJitterMs: clamp(numberFromState(sliderState, 'granularLegacyJitter', 10), 0, 30),
      granularLegacyProbability: clamp(numberFromState(sliderState, 'granularLegacyProbability', 0.8), 0, 1),
      granularLegacyPitchMode: granularLegacyPitchModeId(sliderState?.granularLegacyPitchMode),
      granularLegacyPitchSpread: clamp(numberFromState(sliderState, 'granularLegacyPitchSpread', 2), 0, 12),
      granularLegacyMaxGrains: clamp(Math.round(numberFromState(sliderState, 'granularLegacyMaxGrains', 64)), 0, 128),
      granularLegacyFeedback: clamp(numberFromState(sliderState, 'granularLegacyFeedback', 0.1), 0, 0.35),
      granularVoices: [1, 2, 3, 4].map((voiceNumber) => granularVoiceFromState(sliderState, voiceNumber)),
      delayAEnabled,
      delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/4', transport.bpm), 10, 5000),
      delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/8d', transport.bpm), 10, 5000),
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
        ? clamp(numberFromState(sliderState, 'granularDelayMix', numberFromState(sliderState, 'delayBMix', delayBSendActive ? 1 : 0)), 0, 1)
        : 0,
      delayBSpaceMode: sliderState?.granularSpaceMode === 'diffuse' ? 1 : 0,
      delayBPattern: delayBPatternId(sliderState?.delayBPattern),
      delayBWarp: delayBWarpId(sliderState?.delayBWarp),
      delayBWarpIntensity: clamp(numberFromState(sliderState, 'delayBWarpIntensity', 0.5), 0, 1),
      delayBSpread: clamp(numberFromState(sliderState, 'delayBSpread', 0.5), 0, 1),
      reverbMix: sliderState?.reverbEnabled === false ? 0 : clamp(numberFromState(sliderState, 'reverbLevel', 0.12), 0, 1),
      reverbType: reverbTypeId(sliderState?.reverbType),
      reverbQuality: reverbQualityId(sliderState?.reverbQuality),
      reverbDecay: clamp(numberFromState(sliderState, 'reverbDecay', 0.9), 0, 1),
      reverbSize: clamp(numberFromState(sliderState, 'reverbSize', 2), 0.5, 10),
      reverbDamping: clamp(numberFromState(sliderState, 'damping', 0.2), 0, 1),
      reverbDiffusion: clamp(numberFromState(sliderState, 'reverbDiffusion', 1), 0, 1),
      reverbModulation: clamp(numberFromState(sliderState, 'reverbModulation', 0.4), 0, 1),
      reverbPredelayMs: clamp(numberFromState(sliderState, 'predelay', 60), 0, 100),
      reverbWidth: clamp(numberFromState(sliderState, 'width', 0.85), 0, 1),
      reverbShimmerAmount: clamp(numberFromState(sliderState, 'reverbShimmer', 0), 0, 1),
      reverbShimmerPitch: clamp(numberFromState(sliderState, 'reverbShimmerPitch', 12), -24, 24),
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
      spectralFreezeMix: clamp(numberFromState(sliderState, 'spectralFreezeMix', 1), 0, 1),
      spectralFreezeEnabled,
      spectralFreezeActive: booleanFromState(sliderState, 'spectralFreezeActive', false),
      spectralFreezeSlushy: booleanFromState(sliderState, 'spectralFreezeSlushy', false),
      spectralFreezeSpeed: clamp(numberFromState(sliderState, 'spectralFreezeSpeed', 0.3), 0, 1),
      spectralFreezeDecay: clamp(numberFromState(sliderState, 'spectralFreezeDecay', 1), 0, 1),
      spectralFreezePhaseJitter: clamp(numberFromState(sliderState, 'spectralFreezePhaseJitter', 0), 0, 1),
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
      delayAToDelayB: clamp(numberFromState(sliderState, 'delayAToBSend', 0), 0, 1),
      delayBToDelayA: clamp(numberFromState(sliderState, 'delayBToASend', 0), 0, 1),
      delayToReverb: clamp(numberFromState(sliderState, 'delayAReverbSend', 0.2), 0, 1),
      granularToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.15), 0, 1),
      delayAToGranular: clamp(numberFromState(sliderState, 'delayAGranularSend', 0), 0, 1),
      delayBToGranular: clamp(numberFromState(sliderState, 'delayBGranularSend', 0), 0, 1),
      delayBToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.4), 0, 1),
    },
    master: {
      gain: numberFromState(sliderState, 'masterVolume', 0.85),
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
    assetRefs: soundscapeSource?.enabled
      ? getCoreProductSoundscapeAssetDescriptorsForState(sliderState).map((asset) => asset.assetId)
      : [],
  };
}

export function encodeCoreProductSnapshot(snapshot: CoreProductSnapshot): ArrayBuffer {
  const buffer = new ArrayBuffer(SNAPSHOT_BYTES);
  const view = new DataView(buffer);
  let offset = 0;
  const u32 = (value: number) => {
    view.setUint32(offset, value >>> 0, true);
    offset += 4;
  };
  const i32 = (value: number) => {
    view.setInt32(offset, value | 0, true);
    offset += 4;
  };
  const f32 = (value: number) => {
    view.setFloat32(offset, Number.isFinite(value) ? value : 0, true);
    offset += 4;
  };

  u32(KESSHO_PRODUCT_SCHEMA_VERSION);
  u32(KESSHO_PRODUCT_SCHEMA_HASH);
  u32(bool(snapshot.transport.running));
  f32(snapshot.transport.bpm);
  u32(snapshot.transport.beatsPerBar);
  u32(snapshot.transport.barsPerPhrase);
  f32(snapshot.transport.swing);
  u32(0);
  f32(snapshot.harmony.rootMidi);
  u32(snapshot.harmony.scaleId);
  f32(snapshot.harmony.tension);
  u32(snapshot.harmony.chordMode);
  u32(snapshot.harmony.voicingMode);
  u32(0);

  for (let index = 0; index < 7; index += 1) {
    const source = snapshot.sources[index] ?? sourceDefaults(SOURCE_ORDER[index] ?? CORE_PRODUCT_SOURCE_IDS.pad1);
    u32(bool(source.enabled));
    u32(source.sourceId);
    u32(source.presetId);
    u32(source.assetId);
    f32(source.level);
    f32(source.morph);
    f32(source.distance);
    f32(source.expression);
    f32(source.dryGain);
    f32(source.reverbSend);
    f32(source.delayASend);
    f32(source.delayBSend);
    f32(source.granularSend);
    u32(0);
  }

  const writeSequencer = (lanes: ProductLaneSnapshot[]) => {
    const start = offset;
    u32(Math.min(lanes.length, 16));
    for (let index = 0; index < 16; index += 1) {
      const lane = lanes[index] ?? laneDefaults(CORE_PRODUCT_SOURCE_IDS.pad1, 60);
      u32(bool(lane.enabled));
      u32(lane.targetSourceId);
      u32(lane.stepCount);
      u32(lane.fillCount);
      i32(lane.rotation);
      u32(lane.clockDivision);
      f32(lane.swing);
      f32(lane.probability);
      u32(lane.ratchet);
      u32(lane.trigCondition);
      f32(lane.midiNote);
      f32(lane.velocity);
      f32(lane.holdSeconds);
      f32(lane.morph);
      f32(lane.distance);
      f32(lane.expression);
      u32(lane.seed);
      u32(bool(lane.barReset));
      u32(bool(lane.phraseReset));
      u32(lane.manualStepMaskLow);
      u32(lane.manualStepMaskHigh);
    }
    offset = start + SEQUENCER_BYTES;
  };

  writeSequencer(snapshot.synthLanes);
  writeSequencer(snapshot.drumLanes);
  u32(bool(snapshot.journey.enabled));
  f32(snapshot.journey.morphPhase);
  f32(snapshot.journey.morphRateBars);
  u32(0);
  f32(snapshot.fx.granularMix);
  u32(bool(snapshot.fx.granularEnabled));
  u32(bool(snapshot.fx.granularFreeze));
  u32(bool(snapshot.fx.granularFreezeWithFeedback));
  f32(snapshot.fx.granularFeedback);
  f32(snapshot.fx.granularFeedbackLpfHz);
  f32(snapshot.fx.granularBufferSeconds);
  u32(snapshot.fx.granularGrainShape >>> 0);
  f32(snapshot.fx.granularBusDiffusion);
  f32(snapshot.fx.granularTimingRandomness);
  f32(snapshot.fx.granularChordBias);
  f32(snapshot.fx.granularLegacyJitterMs);
  f32(snapshot.fx.granularLegacyProbability);
  u32(snapshot.fx.granularLegacyPitchMode >>> 0);
  f32(snapshot.fx.granularLegacyPitchSpread);
  u32(snapshot.fx.granularLegacyMaxGrains >>> 0);
  f32(snapshot.fx.granularLegacyFeedback);
  for (let index = 0; index < 4; index += 1) {
    const voice = snapshot.fx.granularVoices[index] ?? granularVoiceFromState(undefined, index + 1);
    u32(bool(voice.enabled));
    u32(voice.mode >>> 0);
    u32(voice.slice >>> 0);
    f32(voice.speed);
    f32(voice.scanRate);
    u32(bool(voice.reverse));
    f32(voice.pitch);
    f32(voice.writeFollow);
    f32(voice.density);
    f32(voice.grainSizeMs);
    f32(voice.spray);
    f32(voice.grainOctaveProbability);
    f32(voice.attackSeconds);
    f32(voice.decaySeconds);
    f32(voice.gain);
    f32(voice.pan);
    f32(voice.blur);
    f32(voice.stereoSpread);
    f32(voice.positionLfoRate);
    f32(voice.positionLfoDepth);
    f32(voice.panLfoRate);
    f32(voice.reverseLfoRate);
    f32(voice.recordLfoRate);
    u32(bool(voice.euclidGated));
    u32(bool(voice.euclidMuted));
  }
  u32(bool(snapshot.fx.delayAEnabled));
  f32(snapshot.fx.delayATimeLeftMs);
  f32(snapshot.fx.delayATimeRightMs);
  f32(snapshot.fx.delayAFeedback);
  f32(snapshot.fx.delayAMix);
  f32(snapshot.fx.delayAFilterHz);
  u32(snapshot.fx.delayAFilterType >>> 0);
  f32(snapshot.fx.delayAModRateHz);
  f32(snapshot.fx.delayAModDepthMs);
  u32(bool(snapshot.fx.delayAPingPong));
  f32(snapshot.fx.delayADuck);
  f32(snapshot.fx.delayAWidth);
  f32(snapshot.fx.delayACrossFeedFilterHz);
  u32(bool(snapshot.fx.delayBEnabled));
  f32(snapshot.fx.delayBActivity);
  f32(snapshot.fx.delayBRepeats);
  f32(snapshot.fx.delayBBaseTimeMs);
  f32(snapshot.fx.delayBTone);
  f32(snapshot.fx.delayBVibrato);
  f32(snapshot.fx.delayBMix);
  u32(snapshot.fx.delayBSpaceMode >>> 0);
  u32(snapshot.fx.delayBPattern >>> 0);
  u32(snapshot.fx.delayBWarp >>> 0);
  f32(snapshot.fx.delayBWarpIntensity);
  f32(snapshot.fx.delayBSpread);
  f32(snapshot.fx.reverbMix);
  u32(snapshot.fx.reverbType >>> 0);
  u32(snapshot.fx.reverbQuality >>> 0);
  f32(snapshot.fx.reverbDecay);
  f32(snapshot.fx.reverbSize);
  f32(snapshot.fx.reverbDamping);
  f32(snapshot.fx.reverbDiffusion);
  f32(snapshot.fx.reverbModulation);
  f32(snapshot.fx.reverbPredelayMs);
  f32(snapshot.fx.reverbWidth);
  f32(snapshot.fx.reverbShimmerAmount);
  f32(snapshot.fx.reverbShimmerPitch);
  f32(snapshot.fx.reverbSlowRateHz);
  f32(snapshot.fx.reverbSlowDepth);
  f32(snapshot.fx.reverbReverseAmount);
  f32(snapshot.fx.reverbReverseLengthSec);
  f32(snapshot.fx.reverbChorusRateHz);
  f32(snapshot.fx.reverbChorusDepth);
  u32(snapshot.fx.reverbModCharacter >>> 0);
  f32(snapshot.fx.reverbDampLow);
  f32(snapshot.fx.reverbDampHigh);
  f32(snapshot.fx.reverbCrossoverHz);
  f32(snapshot.fx.reverbInputTone);
  f32(snapshot.fx.reverbShimmerFeedback);
  f32(snapshot.fx.reverbWarp);
  f32(snapshot.fx.reverbCrossFeed);
  f32(snapshot.fx.reverbEarlyReflections);
  f32(snapshot.fx.reverbAirAbsorption);
  u32(snapshot.fx.reverbSaturationMode >>> 0);
  f32(snapshot.fx.reverbTransientSmooth);
  f32(snapshot.fx.reverbErLpFreq);
  f32(snapshot.fx.spectralFreezeMix);
  u32(bool(snapshot.fx.spectralFreezeEnabled));
  u32(bool(snapshot.fx.spectralFreezeActive));
  u32(bool(snapshot.fx.spectralFreezeSlushy));
  f32(snapshot.fx.spectralFreezeSpeed);
  f32(snapshot.fx.spectralFreezeDecay);
  f32(snapshot.fx.spectralFreezePhaseJitter);
  f32(snapshot.fx.dynamicsDrive);
  u32(bool(snapshot.fx.dynamicsEnabled));
  u32(bool(snapshot.fx.dynamicsCharacterEnabled));
  u32(snapshot.fx.dynamicsCharacterMode >>> 0);
  f32(snapshot.fx.dynamicsCharacterMix);
  f32(snapshot.fx.dynamicsCharacterAge);
  f32(snapshot.fx.dynamicsCharacterBias);
  f32(snapshot.fx.dynamicsCharacterLpgAmount);
  f32(snapshot.fx.dynamicsCharacterResonance);
  f32(snapshot.fx.dynamicsCharacterStereo);
  f32(snapshot.fx.dynamicsCharacterEnvFollow);
  f32(snapshot.fx.dynamicsCharacterDepth);
  f32(snapshot.fx.dynamicsCharacterRate);
  f32(snapshot.fx.dynamicsCharacterDamp);
  u32(bool(snapshot.fx.dynamicsDegradeEnabled));
  f32(snapshot.fx.dynamicsDegradeMix);
  f32(snapshot.fx.dynamicsDegradeAge);
  f32(snapshot.fx.dynamicsDegradeGeneration);
  f32(snapshot.fx.dynamicsDegradeAlias);
  f32(snapshot.fx.dynamicsDegradeWow);
  f32(snapshot.fx.dynamicsDegradeFlutter);
  f32(snapshot.fx.dynamicsDegradeDrift);
  f32(snapshot.fx.dynamicsDegradeWobbleSpeed);
  f32(snapshot.fx.dynamicsDegradeTone);
  f32(snapshot.fx.dynamicsDegradeHp);
  f32(snapshot.fx.dynamicsDegradeLp);
  f32(snapshot.fx.dynamicsDegradeNoise);
  f32(snapshot.fx.dynamicsDegradeSaturation);
  f32(snapshot.fx.dynamicsDegradeCorrosion);
  f32(snapshot.fx.dynamicsModSlowWow);
  f32(snapshot.fx.dynamicsModSlowFlutter);
  f32(snapshot.fx.dynamicsModSlowLp);
  f32(snapshot.fx.dynamicsModSlowWet);
  f32(snapshot.fx.dynamicsModSlowDropout);
  f32(snapshot.fx.dynamicsModSlowAlias);
  f32(snapshot.fx.dynamicsModFlutterWow);
  f32(snapshot.fx.dynamicsModFlutterFlutter);
  f32(snapshot.fx.dynamicsModFlutterLp);
  f32(snapshot.fx.dynamicsModFlutterWet);
  f32(snapshot.fx.dynamicsModFlutterDropout);
  f32(snapshot.fx.dynamicsModFlutterAlias);
  f32(snapshot.fx.dynamicsModRandomWow);
  f32(snapshot.fx.dynamicsModRandomFlutter);
  f32(snapshot.fx.dynamicsModRandomLp);
  f32(snapshot.fx.dynamicsModRandomWet);
  f32(snapshot.fx.dynamicsModRandomDropout);
  f32(snapshot.fx.dynamicsModRandomAlias);
  f32(snapshot.fx.dynamicsModEnvWow);
  f32(snapshot.fx.dynamicsModEnvFlutter);
  f32(snapshot.fx.dynamicsModEnvLp);
  f32(snapshot.fx.dynamicsModEnvWet);
  f32(snapshot.fx.dynamicsModEnvDropout);
  f32(snapshot.fx.dynamicsModEnvAlias);
  f32(snapshot.fx.dynamicsModNoiseWow);
  f32(snapshot.fx.dynamicsModNoiseFlutter);
  f32(snapshot.fx.dynamicsModNoiseLp);
  f32(snapshot.fx.dynamicsModNoiseWet);
  f32(snapshot.fx.dynamicsModNoiseDropout);
  f32(snapshot.fx.dynamicsModNoiseAlias);
  u32(bool(snapshot.fx.dynamicsSaturationEnabled));
  u32(snapshot.fx.dynamicsSaturationMode >>> 0);
  f32(snapshot.fx.dynamicsSaturationDrive);
  f32(snapshot.fx.dynamicsSaturationTone);
  f32(snapshot.fx.dynamicsSaturationBias);
  u32(bool(snapshot.fx.dynamicsEndCompEnabled));
  f32(snapshot.fx.dynamicsEndCompThreshold);
  f32(snapshot.fx.dynamicsEndCompKnee);
  f32(snapshot.fx.dynamicsEndCompRatio);
  f32(snapshot.fx.dynamicsEndCompAttackMs);
  f32(snapshot.fx.dynamicsEndCompReleaseMs);
  f32(snapshot.fx.dynamicsEndCompMakeup);
  f32(snapshot.fx.dynamicsEndCompMix);
  f32(snapshot.fx.dynamicsEndCompDetectorHp);
  f32(snapshot.fx.dynamicsEndCompDetectorTilt);
  f32(snapshot.fx.dynamicsEndCompAutoMakeup);
  f32(snapshot.fx.dynamicsEndCompProgramRelease);
  u32(bool(snapshot.fx.sidechainEnabled));
  u32(snapshot.fx.sidechainKeyA >>> 0);
  u32(snapshot.fx.sidechainKeyB >>> 0);
  f32(snapshot.fx.sidechainKeyAWeight);
  f32(snapshot.fx.sidechainKeyBWeight);
  f32(snapshot.fx.sidechainAmount);
  f32(snapshot.fx.sidechainThreshold);
  f32(snapshot.fx.sidechainRatio);
  f32(snapshot.fx.sidechainKnee);
  f32(snapshot.fx.sidechainAttackMs);
  f32(snapshot.fx.sidechainHoldMs);
  f32(snapshot.fx.sidechainReleaseMs);
  f32(snapshot.fx.sidechainMakeup);
  f32(snapshot.fx.sidechainMix);
  f32(snapshot.fx.sidechainCurve);
  f32(snapshot.fx.sidechainDetectorHp);
  f32(snapshot.fx.sidechainDetectorLp);
  f32(snapshot.fx.sidechainPad1Target);
  f32(snapshot.fx.sidechainPad2Target);
  f32(snapshot.fx.sidechainLead1Target);
  f32(snapshot.fx.sidechainLead2Target);
  f32(snapshot.fx.sidechainPianoTarget);
  f32(snapshot.fx.sidechainGranularTarget);
  f32(snapshot.fx.sidechainDelayATarget);
  f32(snapshot.fx.sidechainDelayBTarget);
  f32(snapshot.fx.sidechainReverbTarget);
  f32(snapshot.routing.delayAToDelayB);
  f32(snapshot.routing.delayBToDelayA);
  f32(snapshot.routing.delayToReverb);
  f32(snapshot.routing.granularToReverb);
  f32(snapshot.routing.delayAToGranular);
  f32(snapshot.routing.delayBToGranular);
  f32(snapshot.routing.delayBToReverb);
  f32(0);
  f32(snapshot.master.gain);
  f32(snapshot.master.limiterCeilingDb);
  u32(snapshot.master.saturationMode);
  f32(snapshot.master.saturationDrive);
  f32(snapshot.master.saturationTone);
  u32(snapshot.rng.seed);
  u32(snapshot.rng.state);
  f32(snapshot.evolution.amount);
  u32(snapshot.evolution.state);
  for (let i = 0; i < 32; i += 1) u32(snapshot.assetRefs[i] ?? 0);
  for (let i = 0; i < 32; i += 1) u32(0);

  if (offset !== SNAPSHOT_BYTES) {
    throw new Error(`Kessho Product snapshot encoder wrote ${offset} bytes; expected ${SNAPSHOT_BYTES}`);
  }
  return buffer;
}

export const KESSHO_PRODUCT_SNAPSHOT_BYTES = SNAPSHOT_BYTES;
export const KESSHO_PRODUCT_SOURCE_SNAPSHOT_BYTES = SOURCE_BYTES;
