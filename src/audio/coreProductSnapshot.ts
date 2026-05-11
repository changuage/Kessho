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
    dynamicsDrive: number;
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

const SNAPSHOT_BYTES = 3708;
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
      spectralFreezeMix: spectralFreezeEnabled ? clamp(numberFromState(sliderState, 'spectralFreezeMix', 0), 0, 1) : 0,
      dynamicsDrive: dynamicsEnabled ? clamp(numberFromState(sliderState, 'dynamicsDrive', 0), 0, 1) : 0,
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
  f32(snapshot.fx.dynamicsDrive);
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
