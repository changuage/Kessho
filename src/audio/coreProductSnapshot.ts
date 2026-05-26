import {
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
  KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
  KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
  KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
  KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
  KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
} from './generated/kesshoProductSchema';
import { DEFAULT_REVERB_PRE_COMP, DEFAULT_STATE, type SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import {
  CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID,
  getCoreProductSoundscapeAssetDescriptorsForState,
  getPrimaryCoreProductSoundscapeAssetIdForState,
} from './coreProductAssets';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims';
import {
  delayAFilterTypeId,
  delayBPatternId,
  delayBTapeSpacingId,
  delayBWarpId,
  dynamicsCharacterModeId,
  dynamicsSaturationModeId,
  granularLegacyPitchModeId,
  granularShapeId,
  granularVoiceModeId,
  reverbModCharacterId,
  reverbQualityId,
  reverbSaturationModeId,
  reverbTypeId,
  sidechainKeyId,
} from './CoreProductModeIds';
import { assignLeadAlgorithmOverrideFields, assignLeadEnvelopeOverrideFields, emptyLeadOverrideIndices, emptyLeadOverrideValues, emptyLeadParams, exactLeadPatchFromState, hasLeadCustomPresetData, hasLeadCustomPresetEndpointData, leadAlgorithmPresetAEnabledFromState, leadEnvelopeOverrideFromState } from './CoreProductLeadPatch';
import { emptyPadOverrideIndices, emptyPadOverrideValues, emptyPadParams, exactPadPatchFromState } from './CoreProductPadPatch';
import { emptyDrumOverrideIndices, emptyDrumOverrideValues, emptyDrumParams, exactDrumPatchFromState } from './CoreProductDrumPatch';
import {
  defaultPresetId,
  drumVoiceMorphsFromState,
  drumVoicePresetIdsFromState,
  endpointPresetId,
  soundscapePresetIdFromState,
  sourcePresetId,
} from './CoreProductPresetIds';
import { getTransportMetrics } from './transport';
import { computeGranularMacroModel, type GranularMacroModel } from './granularMacroCore';
import { applyDistanceValue, applyLeadDistanceEnvelope, getVoiceDistanceKey, type DistanceVoice } from './distanceMacro';
import { getEffectiveTension } from './harmony';
import { getScaleByName, selectScaleFamily } from './scales';
import { computeGranularRuntimeSeed, createRng, getUtcBucket } from './rng';
import { isIOSLikeDevice, isMobileDevice } from '../platform';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern, euclideanPatternMask, resolveEuclidPatternParams } from './euclideanPatterns';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';
import { normalizeSequencerSwing } from './sequencerSwing';
import { delayBTapeHeadLevelsFromState, delayBTapeHeadMaskFromState, delayBTapeHeadPansFromState, delayDivisionMs } from './coreProductDelaySnapshot';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';
import {
  coreProductDrumLaneMacroDefaultsFromState,
  coreProductSynthLaneMacroDefaultsFromState,
} from './coreProductSequencerMacroDefaults';
import {
  soundscapeSnapshotPayloadFromState,
  type SoundscapeSnapshotPayload,
} from './coreProductSoundscapesSnapshot';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import type { CoreProductSnapshot, ProductGranularVoiceSnapshot, ProductLaneSnapshot, ProductSourceSnapshot } from './coreProductSnapshotTypes';
export type { CoreProductSnapshot, ProductGranularVoiceSnapshot, ProductHarmonySnapshot, ProductLaneSnapshot, ProductSoundscapeSnapshot, ProductSourceSnapshot } from './coreProductSnapshotTypes';

// SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION - this file maps app/UI state into generated Product Core fields.
export const CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY = '__coreProductClockStartDelay';
export const CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY = '__coreProductSnapshotWallSec';

const SOURCE_ORDER = [
  CORE_PRODUCT_SOURCE_IDS.pad1,
  CORE_PRODUCT_SOURCE_IDS.pad2,
  CORE_PRODUCT_SOURCE_IDS.lead1,
  CORE_PRODUCT_SOURCE_IDS.lead2,
  CORE_PRODUCT_SOURCE_IDS.drum,
  CORE_PRODUCT_SOURCE_IDS.piano,
  CORE_PRODUCT_SOURCE_IDS.soundscape,
] as const;

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

function drumDelayFilterHz(state: Record<string, unknown> | undefined): number {
  return clamp(500 * Math.pow(32, clamp(numberFromState(state, 'drumDelayFilter', 0.5), 0, 1)), 200, 12000);
}

function distanceAdjustedNumberFromState(
  state: Record<string, unknown> | undefined,
  key: keyof SliderState,
  voice: DistanceVoice,
  fallback: number,
): number {
  const base = numberFromState(state, key, fallback);
  const distanceKey = getVoiceDistanceKey(voice);
  const distance = numberFromState(state, distanceKey, 0);
  const distanceState = {
    ...(state ?? {}),
    [key]: base,
    [distanceKey]: distance,
  } as unknown as SliderState;
  return applyDistanceValue(key, distanceState, voice, distance);
}

function distanceAdjustedLeadHoldSecondsFromState(
  state: Record<string, unknown> | undefined,
  voice: 'lead1' | 'lead2',
  fallback: number,
): number {
  const holdKey = voice === 'lead2' ? 'lead2Hold' : 'lead1Hold';
  const hold = numberFromState(state, holdKey, fallback);
  const distance = numberFromState(state, getVoiceDistanceKey(voice), 0);
  return applyLeadDistanceEnvelope(voice, {
    attack: 0.01,
    decay: 0.8,
    sustain: 0.3,
    hold,
    release: 2,
  }, distance).hold ?? hold;
}

function positiveU32(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback >>> 0 || 1;
  const rounded = Math.round(value);
  if (rounded <= 0) return fallback >>> 0 || 1;
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

function granularRuntimeSeedFromState(state: Record<string, unknown> | undefined): number {
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  return positiveU32(computeGranularRuntimeSeed(getUtcBucket(seedWindow)), 1);
}

export function usesLegacyGranularRuntimeSeed(state: Record<string, unknown> | undefined): boolean {
  if (!booleanFromState(state, 'granularEnabled', false)) return false;
  for (let voiceNumber = 1; voiceNumber <= 4; voiceNumber += 1) {
    const prefix = `granularV${voiceNumber}`;
    const enabled = booleanFromState(state, `${prefix}Enabled`, voiceNumber === 1);
    if (!enabled) continue;
    if (granularVoiceModeId(state?.[`${prefix}Mode`]) === 2) {
      return true;
    }
  }
  return false;
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
    swing: 0,
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

const PRODUCT_HARMONY_SCALE_IDS = new Map<string, number>([['Major (Ionian)', 1], ['Aeolian', 2], ['Major Pentatonic', 3], ['Octatonic Half-Whole', 4], ['Lydian', 5], ['Mixolydian', 6], ['Minor Pentatonic', 7], ['Dorian', 8], ['Harmonic Minor', 9], ['Melodic Minor', 10], ['Phrygian Dominant', 11]]);

function scaleIdFromName(name: string): number {
  const exact = PRODUCT_HARMONY_SCALE_IDS.get(name);
  if (exact) return exact;
  const normalized = name.toLowerCase();
  if (normalized.includes('major pentatonic')) return 3;
  if (normalized.includes('minor pentatonic')) return 7;
  if (normalized.includes('harmonic minor')) return 9;
  if (normalized.includes('melodic minor')) return 10;
  if (normalized.includes('phrygian')) return 11;
  if (normalized.includes('octatonic') || normalized.includes('hirajoshi')) return 4;
  if (normalized.includes('mixolydian')) return 6;
  if (normalized.includes('lydian')) return 5;
  if (normalized.includes('dorian')) return 8;
  if (normalized.includes('minor') || normalized.includes('aeolian')) return 2;
  return 1;
}

function resolveHarmonyScaleName(state: Record<string, unknown> | undefined, tension: number): string {
  const manualScale = typeof state?.manualScale === 'string' ? state.manualScale : 'Major (Ionian)';
  if (state?.scaleMode === 'manual' && getScaleByName(manualScale)) return manualScale;
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  return selectScaleFamily(createRng(`${getUtcBucket(seedWindow)}|E_ROOT`), tension).name;
}

function scaleIdFromState(state: Record<string, unknown> | undefined, tension: number): number {
  return scaleIdFromName(resolveHarmonyScaleName(state, tension));
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
    return getScaleByName(resolveHarmonyScaleName(state, tension))?.intervals;
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

  const washBoost = clamp(numberFromState(state, 'sonicParityReverbWashBoost', 0), 0, 1);
  if (washBoost > 0.001) {
    shimmer = clamp(shimmer + washBoost * 0.15, 0, 1);
  }
  const bloomBoost = clamp(numberFromState(state, 'sonicParityReverbBloomBoost', 0), 0, 1);
  if (bloomBoost > 0.001) {
    decay = clamp(decay + bloomBoost * 0.12, 0, 1);
    shimmer = clamp(shimmer + bloomBoost * 0.1, 0, 1);
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
  return sequencerClockDivisionToNumericValue(state?.[key], fallback);
}

function defaultSequencerClockDivision(laneNumber: number): number {
  return laneNumber === 1 ? 8 : laneNumber === 2 ? 16 : laneNumber === 3 ? 12 : 4;
}

function secondsPerSequencerStep(transport: CoreProductSnapshot['transport'], clockDivision: number, tempoMultiplier: number): number {
  return (60 / Math.max(1, transport.bpm)) * 4 / Math.max(1, clockDivision) / Math.max(0.25, tempoMultiplier);
}

function timeUntilNextGlobalBoundary(periodSeconds: number, nowWallSec: number): number {
  const period = Math.max(0.001, periodSeconds);
  return clamp(Math.ceil(nowWallSec / period) * period - nowWallSec, 0, period);
}

function initialStartDelaySecondsFromState(state: Record<string, unknown> | undefined, transport: CoreProductSnapshot['transport'], clockSourceKey: 'synthEuclidClockSource' | 'drumEuclidClockSource', joinPolicyKey: 'synthEuclidJoinPolicy' | 'drumEuclidJoinPolicy', clockDivision: number, tempoMultiplier: number): number {
  if (!booleanFromState(state, CORE_PRODUCT_CLOCK_START_DELAY_STATE_KEY, false)) return -1;
  if (state?.[clockSourceKey] !== 'globalBeat') return -1;
  const periodSeconds = state?.[joinPolicyKey] === 'grid'
    ? secondsPerSequencerStep(transport, clockDivision, tempoMultiplier)
    : (60 / Math.max(1, transport.bpm)) * Math.max(1, transport.beatsPerBar);
  const nowWallSec = numberFromState(state, CORE_PRODUCT_SNAPSHOT_WALL_SEC_STATE_KEY, 0);
  return timeUntilNextGlobalBoundary(periodSeconds, nowWallSec);
}

function synthSourceIdFromState(state: Record<string, unknown> | undefined, key: string): number {
  const source = String(state?.[key] ?? 'lead').toLowerCase();
  if (source === 'lead2') return CORE_PRODUCT_SOURCE_IDS.lead2;
  if (source === 'piano') return CORE_PRODUCT_SOURCE_IDS.piano;
  if (source.startsWith('synth')) {
    const voiceIndex = Number.parseInt(source.slice('synth'.length), 10) - 1;
    const pad2Assign = Math.round(numberFromState(state, 'pad2VoiceAssign', 0)) & 0x3f;
    const pad2Enabled = booleanFromState(state, 'pad2Enabled', false);
    return pad2Enabled && voiceIndex >= 0 && voiceIndex < 6 && (pad2Assign & (1 << voiceIndex)) !== 0
      ? CORE_PRODUCT_SOURCE_IDS.pad2
      : CORE_PRODUCT_SOURCE_IDS.pad1;
  }
  return CORE_PRODUCT_SOURCE_IDS.lead1;
}

function synthSourcePadVoiceIndexFromState(state: Record<string, unknown> | undefined, key: string): number | null {
  const source = String(state?.[key] ?? '').toLowerCase();
  if (!source.startsWith('synth')) return null;
  const voiceIndex = Number.parseInt(source.slice('synth'.length), 10) - 1;
  return Number.isFinite(voiceIndex) && voiceIndex >= 0 && voiceIndex < 6 ? voiceIndex : null;
}

function synthEuclidLaneEnabled(state: Record<string, unknown> | undefined, laneNumber: number): boolean {
  return booleanFromState(state, 'synthEuclideanMasterEnabled', false) &&
    booleanFromState(state, `synthEuclid${laneNumber}Enabled`, laneNumber === 1);
}

function synthEuclidUsesSourceId(state: Record<string, unknown> | undefined, sourceId: number): boolean {
  for (let laneNumber = 1; laneNumber <= 4; laneNumber += 1) {
    if (
      synthEuclidLaneEnabled(state, laneNumber) &&
      synthSourceIdFromState(state, `synthEuclid${laneNumber}Source`) === sourceId
    ) {
      return true;
    }
  }
  return false;
}

function laneManualMaskFromPattern(
  state: Record<string, unknown> | undefined,
  prefix: string,
  steps: number,
  hits: number,
  rotation: number,
): {
  manualStepMaskLow: number;
  manualStepMaskHigh: number;
} {
  const patternMask = euclideanPatternMask(steps, hits, rotation);
  const low = numberFromState(state, `${prefix}ManualStepMaskLow`, patternMask.low);
  const high = numberFromState(state, `${prefix}ManualStepMaskHigh`, patternMask.high);
  return {
    manualStepMaskLow: low >>> 0,
    manualStepMaskHigh: high >>> 0,
  };
}

const DEFAULT_SYNTH_EUCLID_NOTE_RANGES = [
  { min: DEFAULT_STATE.synthEuclid1NoteMin, max: DEFAULT_STATE.synthEuclid1NoteMax },
  { min: DEFAULT_STATE.synthEuclid2NoteMin, max: DEFAULT_STATE.synthEuclid2NoteMax },
  { min: DEFAULT_STATE.synthEuclid3NoteMin, max: DEFAULT_STATE.synthEuclid3NoteMax },
  { min: DEFAULT_STATE.synthEuclid4NoteMin, max: DEFAULT_STATE.synthEuclid4NoteMax },
] as const;

function synthEuclidDefaultNoteRange(laneNumber: number): { min: number; max: number } {
  return DEFAULT_SYNTH_EUCLID_NOTE_RANGES[laneNumber - 1] ?? DEFAULT_SYNTH_EUCLID_NOTE_RANGES[0];
}

function synthEuclidMidiCenterFromState(state: Record<string, unknown> | undefined, laneNumber: number): number {
  const prefix = `synthEuclid${laneNumber}`;
  const fallback = synthEuclidDefaultNoteRange(laneNumber);
  const min = numberFromState(state, `${prefix}NoteMin`, fallback.min);
  const max = numberFromState(state, `${prefix}NoteMax`, fallback.max);
  return clamp((min + max) * 0.5, 0, 127);
}

function sourceDefaults(sourceId: number): ProductSourceSnapshot {
  return {
    enabled: true,
    sourceId,
    presetId: defaultPresetId(sourceId),
    sourcePresetAId: 0, sourcePresetBId: 0, leadEnvelopeOverrideEnabled: false, leadAlgorithmPresetAEnabled: false,
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
    attackSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
    decaySeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
    sustain: KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    releaseSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
    exactPadParamCount: 0,
    exactPadParams: emptyPadParams(),
    padOverrideCount: 0,
    padOverrideIndices: emptyPadOverrideIndices(),
    padOverrideValues: emptyPadOverrideValues(),
    exactLeadParamCount: 0,
    exactLeadParams: emptyLeadParams(),
    leadOverrideCount: 0,
    leadOverrideIndices: emptyLeadOverrideIndices(),
    leadOverrideValues: emptyLeadOverrideValues(),
    exactDrumParamCount: 0,
    exactDrumParams: emptyDrumParams(),
    drumOverrideCount: 0,
    drumOverrideIndices: emptyDrumOverrideIndices(),
    drumOverrideValues: emptyDrumOverrideValues(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}
function assignSourcePresetEndpoints(source: ProductSourceSnapshot, sourceFamily: 'pad' | 'lead', morph: number, keyA: unknown, keyB: unknown, fallbackKey: string): void {
  const presetA = sourcePresetId(sourceFamily, keyA, fallbackKey), presetB = sourcePresetId(sourceFamily, keyB, fallbackKey);
  source.sourcePresetAId = presetA; source.sourcePresetBId = presetB; source.morph = clamp(morph, 0, 1);
}

function generatedLeadAnchorPresetId(key: unknown, defaultKey: 'soft_rhodes' | 'gamelan'): number {
  const presetId = sourcePresetId('lead', key, '');
  return presetId !== 0 ? presetId : sourcePresetId('lead', defaultKey, defaultKey);
}

function assignLeadPresetIds(source: ProductSourceSnapshot, state: Record<string, unknown> | undefined, leadIndex: 0 | 1): void {
  const keyA = leadIndex === 0 ? state?.lead1PresetA : state?.lead2PresetC;
  const keyB = leadIndex === 0 ? state?.lead1PresetB : state?.lead2PresetD;
  const defaultA = 'soft_rhodes';
  const defaultB = 'gamelan';
  if (hasLeadCustomPresetData(state, leadIndex)) {
    const presetA = hasLeadCustomPresetEndpointData(state, leadIndex, 'a')
      ? generatedLeadAnchorPresetId(keyA, defaultA)
      : sourcePresetId('lead', keyA, defaultA);
    const presetB = hasLeadCustomPresetEndpointData(state, leadIndex, 'b')
      ? generatedLeadAnchorPresetId(keyB, defaultB)
      : sourcePresetId('lead', keyB, defaultB);
    source.sourcePresetAId = presetA;
    source.sourcePresetBId = presetB;
    source.presetId = clamp(source.morph, 0, 1) >= 0.5 ? presetB : presetA;
    source.morph = clamp(source.morph, 0, 1);
    return;
  }
  const presetA = sourcePresetId('lead', keyA, defaultA);
  const presetB = sourcePresetId('lead', keyB, defaultB);
  source.sourcePresetAId = presetA;
  source.sourcePresetBId = presetB;
  source.presetId = clamp(source.morph, 0, 1) >= 0.5 ? presetB : presetA;
  source.morph = clamp(source.morph, 0, 1);
}

function sourceFromState(
  sourceId: number,
  state: Record<string, unknown> | undefined,
  soundscapePayload?: SoundscapeSnapshotPayload,
): ProductSourceSnapshot {
  const source = sourceDefaults(sourceId);
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      source.enabled = booleanFromState(state, 'padEnabled', false) || synthEuclidUsesSourceId(state, sourceId);
      source.level = numberFromState(state, 'synthLevel', source.level);
      source.morph = numberFromState(state, 'padMorph', source.morph);
      source.distance = numberFromState(state, 'padDistance', source.distance);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'pad1ReverbSend', 'pad1', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad1Send', source.granularSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'padDiffuseSend', 'pad1', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'padPostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'padStereoWidth', source.stereoWidth);
      source.presetId = endpointPresetId('pad', source.morph, state?.padPresetA, state?.padPresetB, 'init');
      assignSourcePresetEndpoints(source, 'pad', source.morph, state?.padPresetA, state?.padPresetB, 'init');
      Object.assign(
        source,
        exactPadPatchFromState(state, 0, source.sourcePresetAId, source.sourcePresetBId, source.morph),
      );
      break;
    case CORE_PRODUCT_SOURCE_IDS.pad2:
      source.enabled = booleanFromState(state, 'pad2Enabled', false) || synthEuclidUsesSourceId(state, sourceId);
      source.level = numberFromState(state, 'pad2Level', source.level);
      source.morph = numberFromState(state, 'pad2Morph', source.morph);
      source.distance = numberFromState(state, 'pad2Distance', source.distance);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'pad2ReverbSend', 'pad2', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad2Send', source.granularSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'pad2DiffuseSend', 'pad2', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'pad2PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'pad2StereoWidth', source.stereoWidth);
      source.presetId = endpointPresetId('pad', source.morph, state?.pad2PresetA, state?.pad2PresetB, 'init');
      assignSourcePresetEndpoints(source, 'pad', source.morph, state?.pad2PresetA, state?.pad2PresetB, 'init');
      Object.assign(
        source,
        exactPadPatchFromState(state, 1, source.sourcePresetAId, source.sourcePresetBId, source.morph),
      );
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead1:
      source.enabled = booleanFromState(state, 'leadEnabled', false) || synthEuclidUsesSourceId(state, sourceId);
      source.level = distanceAdjustedNumberFromState(state, 'lead1Level', 'lead1', numberFromState(state, 'leadLevel', source.level));
      source.morph = numberFromState(state, 'lead1Morph', source.morph);
      source.distance = numberFromState(state, 'lead1Distance', source.distance);
      source.holdSeconds = distanceAdjustedLeadHoldSecondsFromState(state, 'lead1', source.holdSeconds);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'lead1ReverbSend', 'lead1', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead1Send', source.granularSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'lead1DiffuseSend', 'lead1', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead1PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead1StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead1PostLPFKeyTracking', source.postLpfKeyTracking);
      assignLeadPresetIds(source, state, 0);
      assignLeadAlgorithmOverrideFields(source, leadAlgorithmPresetAEnabledFromState(state, 0));
      assignLeadEnvelopeOverrideFields(source, leadEnvelopeOverrideFromState(state, 0));
      Object.assign(source, exactLeadPatchFromState(state, 0, source.sourcePresetAId, source.sourcePresetBId, source.morph));
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      source.enabled = booleanFromState(state, 'lead2Enabled', booleanFromState(state, 'leadEnabled', false)) || synthEuclidUsesSourceId(state, sourceId);
      source.level = distanceAdjustedNumberFromState(state, 'lead2Level', 'lead2', source.level);
      source.morph = numberFromState(state, 'lead2Morph', source.morph);
      source.distance = numberFromState(state, 'lead2Distance', source.distance);
      source.holdSeconds = distanceAdjustedLeadHoldSecondsFromState(state, 'lead2', source.holdSeconds);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'lead2ReverbSend', 'lead2', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead2Send', source.granularSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'lead2DiffuseSend', 'lead2', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead2PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead2StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead2PostLPFKeyTracking', source.postLpfKeyTracking);
      assignLeadPresetIds(source, state, 1);
      assignLeadAlgorithmOverrideFields(source, leadAlgorithmPresetAEnabledFromState(state, 1));
      assignLeadEnvelopeOverrideFields(source, leadEnvelopeOverrideFromState(state, 1));
      Object.assign(source, exactLeadPatchFromState(state, 1, source.sourcePresetAId, source.sourcePresetBId, source.morph));
      break;
    case CORE_PRODUCT_SOURCE_IDS.drum:
      source.enabled = booleanFromState(state, 'drumEnabled', false);
      source.level = numberFromState(state, 'drumLevel', source.level);
      source.reverbSend = numberFromState(state, 'drumReverbSend', source.reverbSend);
      source.delayASend = numberFromState(state, 'drumDelayASend', source.delayASend) * drumDelaySendProfile(state);
      source.delayBSend = numberFromState(state, 'drumDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularDrumSend', source.granularSend);
      source.presetId = sourcePresetId('drum', 'default', 'default');
      source.drumVoicePresetAIds = drumVoicePresetIdsFromState(state, 'a');
      source.drumVoicePresetBIds = drumVoicePresetIdsFromState(state, 'b');
      source.drumVoiceMorphs = drumVoiceMorphsFromState(state);
      Object.assign(source, exactDrumPatchFromState(state));
      break;
    case CORE_PRODUCT_SOURCE_IDS.piano:
      source.enabled = booleanFromState(state, 'pianoEnabled', false) || synthEuclidUsesSourceId(state, sourceId);
      source.assetId = CORE_PRODUCT_DEFAULT_PIANO_ASSET_ID;
      source.level = distanceAdjustedNumberFromState(state, 'pianoLevel', 'piano', source.level) * ENGINE_TRIMS.piano;
      source.distance = numberFromState(state, 'pianoDistance', source.distance);
      source.attackSeconds = numberFromState(state, 'pianoAttack', source.attackSeconds);
      source.decaySeconds = numberFromState(state, 'pianoDecay', source.decaySeconds);
      source.sustain = numberFromState(state, 'pianoSustain', source.sustain);
      source.holdSeconds = numberFromState(state, 'pianoHold', 0.2);
      source.releaseSeconds = numberFromState(state, 'pianoRelease', source.releaseSeconds);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'pianoReverbSend', 'piano', source.reverbSend);
      source.delayASend = numberFromState(state, 'pianoDelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pianoDelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPianoSend', source.granularSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'pianoDiffuseSend', 'piano', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'pianoPostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'pianoStereoWidth', source.stereoWidth);
      source.presetId = sourcePresetId('piano', 'default', 'default');
      break;
    case CORE_PRODUCT_SOURCE_IDS.soundscape:
      {
        const payload = soundscapePayload ?? soundscapeSnapshotPayloadFromState(state);
        source.enabled = payload.enabled;
        source.assetId = getPrimaryCoreProductSoundscapeAssetIdForState(state);
        source.level = 1;
        source.expression = payload.parityFixture ? 1 : source.expression;
        source.reverbSend = source.enabled ? payload.routePeaks[0] ?? 0 : source.reverbSend;
        source.delayASend = source.enabled ? payload.routePeaks[1] ?? 0 : source.delayASend;
        source.delayBSend = source.enabled ? payload.routePeaks[2] ?? 0 : source.delayBSend;
        source.granularSend = source.enabled ? payload.routePeaks[3] ?? 0 : source.granularSend;
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
  source.attackSeconds = clamp(source.attackSeconds, 0.001, 2);
  source.decaySeconds = clamp(source.decaySeconds, 0.01, 4);
  source.sustain = clamp(source.sustain, 0, 1);
  source.holdSeconds = clamp(source.holdSeconds, 0, 20);
  source.releaseSeconds = clamp(source.releaseSeconds, 0.01, 8);
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
    tempoMultiplier: 1,
    initialStartDelaySeconds: -1,
  };
}

function synthLaneFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  defaultEnabled: boolean,
  transport: CoreProductSnapshot['transport'],
): ProductLaneSnapshot {
  const prefix = `synthEuclid${laneNumber}`;
  const sourceId = synthSourceIdFromState(state, `${prefix}Source`);
  const lane = laneDefaults(sourceId, synthEuclidMidiCenterFromState(state, laneNumber));
  const macroDefaults = coreProductSynthLaneMacroDefaultsFromState(state, sourceId);
  lane.morph = macroDefaults.morph;
  lane.distance = macroDefaults.distance;
  lane.barReset = String(state?.synthEuclidJoinPolicy ?? 'bar') === 'bar';
  lane.enabled =
    booleanFromState(state, 'synthEuclideanMasterEnabled', defaultEnabled) &&
    booleanFromState(state, `${prefix}Enabled`, laneNumber === 1);
  const defaults = defaultSynthEuclidPattern(laneNumber - 1);
  const resolved = resolveEuclidPatternParams(
    String(state?.[`${prefix}Preset`] ?? 'custom'),
    numberFromState(state, `${prefix}Steps`, defaults.steps),
    numberFromState(state, `${prefix}Hits`, defaults.hits),
    numberFromState(state, `${prefix}Rotation`, defaults.rotation),
  );
  lane.stepCount = resolved.steps;
  lane.fillCount = resolved.hits;
  lane.rotation = resolved.rotation;
  lane.clockDivision = clockDivisionFromState(state, `${prefix}ClockDivision`, defaultSequencerClockDivision(laneNumber));
  lane.tempoMultiplier = clamp(numberFromState(state, 'synthEuclideanTempo', 1), 0.25, 12);
  lane.initialStartDelaySeconds = initialStartDelaySecondsFromState(
    state,
    transport,
    'synthEuclidClockSource',
    'synthEuclidJoinPolicy',
    lane.clockDivision,
    lane.tempoMultiplier,
  );
  lane.swing = normalizeSequencerSwing(numberFromState(state, `${prefix}Swing`, 0));
  lane.probability = numberFromState(state, `${prefix}Probability`, 1);
  lane.velocity = numberFromState(state, `${prefix}Level`, lane.velocity);
  lane.holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, sourceId, lane.holdSeconds);
  lane.seed = encodedPadVoiceLaneSeed(1000 + laneNumber, synthSourcePadVoiceIndexFromState(state, `${prefix}Source`));
  Object.assign(lane, laneManualMaskFromPattern(state, prefix, resolved.steps, resolved.hits, resolved.rotation));
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

const DRUM_VOICE_MASK_SEED_FLAG = 0x80000000;
const DRUM_VOICE_MASK_SEED_SHIFT = 24;
const DRUM_VOICE_MASK_SEED_PAYLOAD_MASK = 0x00ffffff;
const PAD_VOICE_SEED_FLAG = 0x40000000;
const PAD_VOICE_SEED_SHIFT = 24;
const PAD_VOICE_SEED_PAYLOAD_MASK = 0x00ffffff;

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

function encodedDrumLaneSeed(baseSeed: number, voiceIndices: readonly number[]): number {
  const mask = voiceIndices.reduce((bits, voice) => bits | (1 << clamp(Math.round(voice), 0, 6)), 0) & 0x7f;
  return (DRUM_VOICE_MASK_SEED_FLAG | (mask << DRUM_VOICE_MASK_SEED_SHIFT) | (baseSeed & DRUM_VOICE_MASK_SEED_PAYLOAD_MASK)) >>> 0;
}

function encodedPadVoiceLaneSeed(baseSeed: number, voiceIndex: number | null): number {
  if (voiceIndex == null) {
    return baseSeed >>> 0;
  }
  const encodedVoice = clamp(Math.round(voiceIndex) + 1, 1, 6);
  return (PAD_VOICE_SEED_FLAG | (encodedVoice << PAD_VOICE_SEED_SHIFT) | (baseSeed & PAD_VOICE_SEED_PAYLOAD_MASK)) >>> 0;
}

function drumLaneBaseFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  voiceIndices: readonly number[],
  defaultEnabled: boolean,
  transport: CoreProductSnapshot['transport'],
): ProductLaneSnapshot {
  const prefix = `drumEuclid${laneNumber}`;
  const voiceIndex = voiceIndices[0] ?? 1;
  const lane = laneDefaults(CORE_PRODUCT_SOURCE_IDS.drum, 36 + voiceIndex);
  const macroDefaults = coreProductDrumLaneMacroDefaultsFromState(state, voiceIndices);
  lane.morph = macroDefaults.morph;
  lane.distance = macroDefaults.distance;
  lane.barReset = String(state?.drumEuclidJoinPolicy ?? 'bar') === 'bar';
  lane.enabled =
    booleanFromState(state, 'drumEnabled', defaultEnabled) &&
    booleanFromState(state, 'drumEuclidMasterEnabled', defaultEnabled) &&
    booleanFromState(state, `${prefix}Enabled`, false);
  const defaults = defaultDrumEuclidPattern(laneNumber - 1);
  const resolved = resolveEuclidPatternParams(
    String(state?.[`${prefix}Preset`] ?? 'custom'),
    numberFromState(state, `${prefix}Steps`, defaults.steps),
    numberFromState(state, `${prefix}Hits`, defaults.hits),
    numberFromState(state, `${prefix}Rotation`, defaults.rotation),
  );
  lane.stepCount = resolved.steps;
  lane.fillCount = resolved.hits;
  lane.rotation = resolved.rotation;
  lane.clockDivision = clockDivisionFromState(
    state,
    `${prefix}ClockDivision`,
    defaultSequencerClockDivision(laneNumber),
  );
  lane.tempoMultiplier = clamp(numberFromState(state, 'drumEuclidTempo', 1), 0.25, 4);
  lane.initialStartDelaySeconds = initialStartDelaySecondsFromState(
    state,
    transport,
    'drumEuclidClockSource',
    'drumEuclidJoinPolicy',
    lane.clockDivision,
    lane.tempoMultiplier,
  );
  lane.swing = normalizeSequencerSwing(numberFromState(state, `${prefix}Swing`, numberFromState(state, 'drumEuclidSwing', 0) / 100));
  lane.probability = numberFromState(state, `${prefix}Probability`, 1);
  lane.velocity = numberFromState(state, `${prefix}Level`, numberFromState(state, 'drumLevel', 0.75));
  lane.holdSeconds = 0.08;
  lane.seed = encodedDrumLaneSeed(2000 + laneNumber * 31 + voiceIndex, voiceIndices);
  Object.assign(lane, laneManualMaskFromPattern(state, prefix, resolved.steps, resolved.hits, resolved.rotation));
  return lane;
}

function synthLanesFromState(
  state: Record<string, unknown> | undefined,
  defaultEnabled: boolean,
  transport: CoreProductSnapshot['transport'],
): ProductLaneSnapshot[] {
  return [1, 2, 3, 4].map((laneNumber) => synthLaneFromState(state, laneNumber, defaultEnabled, transport));
}

function drumLanesFromState(
  state: Record<string, unknown> | undefined,
  defaultEnabled: boolean,
  transport: CoreProductSnapshot['transport'],
): ProductLaneSnapshot[] {
  const lanes: ProductLaneSnapshot[] = [];
  for (const laneNumber of [1, 2, 3, 4]) {
    const prefix = `drumEuclid${laneNumber}`;
    if (lanes.length >= 16) return lanes;
    lanes.push(drumLaneBaseFromState(
      state,
      laneNumber,
      drumTargetVoiceIndices(state, prefix, laneNumber),
      defaultEnabled,
      transport,
    ));
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
  const synthLanes = synthLanesFromState(sliderState, defaultEnabled, transport);
  const drumLanes = drumLanesFromState(sliderState, defaultEnabled, transport);
  const soundscapePayload = soundscapeSnapshotPayloadFromState(sliderState);
  const sources = SOURCE_ORDER.map((sourceId) => sourceFromState(sourceId, sliderState, soundscapePayload));
  const sourceDelayASendActive = sources.some((source) => source.enabled && source.delayASend > 0.0001);
  const delayBSendActive = sources.some((source) => source.delayBSend > 0.0001);
  const sourceDelayBSendActive = sources.some((source) => source.enabled && source.delayBSend > 0.0001);
  const soundscapeSource = sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
  const soundscapeAssets = soundscapeSource?.enabled
    ? getCoreProductSoundscapeAssetDescriptorsForState(sliderState)
    : [];
  const rngSeed = rngSeedFromState(sliderState);
  const rngState = rngStateFromState(sliderState, rngSeed);
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
  const reverbEnabled = booleanFromState(sliderState, 'reverbEnabled', false);
  const granularMacroModel = computeGranularMacroModel((sliderState ?? {}) as unknown as SliderState, (key, fallback) => numberFromState(sliderState, key as string, fallback));
  const granularUsesLegacyRuntimeSeed = usesLegacyGranularRuntimeSeed(sliderState);
  const reverbParams = resolveReverbSnapshotParams(sliderState, tension);
  const delayBTapeMode = sliderState?.delayBAlgorithm === 'tapeHeads';

  return {
    transport,
    harmony: {
      rootMidi: rootMidiFromState(sliderState),
      scaleId: scaleIdFromState(sliderState, tension),
      tension,
      chordMode: numberFromState(sliderState, 'chordMode', 0),
      voicingMode: numberFromState(sliderState, 'voicingMode', 1),
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
      granularLegacyMaxGrains: clamp(Math.round(numberFromState(sliderState, 'granularLegacyMaxGrains', 64)), 0, 64),
      granularLegacyFeedback: clamp(numberFromState(sliderState, 'granularLegacyFeedback', 0.1), 0, 0.35),
      granularVoices: [1, 2, 3, 4].map((voiceNumber) => granularVoiceFromState(sliderState, voiceNumber, granularMacroModel)),
      delayAEnabled,
      delayATimeLeftMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteL', '1/8d', transport.bpm), 10, 5000),
      delayATimeRightMs: clamp(delayDivisionMs(sliderState, 'drumDelayNoteR', '1/4', transport.bpm), 10, 5000),
      delayAFeedback: clamp(numberFromState(sliderState, booleanFromState(sliderState, 'drumDelayEnabled', false) ? 'drumDelayFeedback' : 'delayAFeedback', 0.4), 0, 0.95),
      delayAMix: delayAEnabled
        ? clamp(numberFromState(sliderState, booleanFromState(sliderState, 'drumDelayEnabled', false) ? 'drumDelayMix' : 'delayAMix', 0), 0, 1)
        : 0,
      delayAFilterHz: booleanFromState(sliderState, 'drumDelayEnabled', false)
        ? drumDelayFilterHz(sliderState)
        : clamp(numberFromState(sliderState, 'delayAFilter', 2000), 200, 12000),
      delayAFilterType: delayAFilterTypeId(sliderState?.delayAFilterType),
      delayAModRateHz: numberFromState(sliderState, 'delayAModDepth', 0) > 0
        ? 0.05 + clamp(numberFromState(sliderState, 'delayAModRate', 0), 0, 1) * 4.95
        : 0,
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
      delayBSpaceMode: delayBTapeMode ? 2 : sliderState?.granularSpaceMode === 'diffuse' ? 1 : 0,
      delayBPattern: delayBTapeMode
        ? delayBTapeSpacingId(sliderState?.delayBTapeSpacing)
        : delayBPatternId(sliderState?.delayBPattern),
      delayBWarp: delayBWarpId(sliderState?.delayBWarp),
      delayBWarpIntensity: clamp(numberFromState(sliderState, 'delayBWarpIntensity', 0.5), 0, 1),
      delayBSpread: clamp(numberFromState(sliderState, 'delayBSpread', 0.5), 0, 1),
      delayBTapeHeadMask: delayBTapeHeadMaskFromState(sliderState),
      delayBTapeHeadLevels: delayBTapeHeadLevelsFromState(sliderState),
      delayBTapeHeadPans: delayBTapeHeadPansFromState(sliderState),
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
      reverbChordWash: booleanFromState(sliderState, 'reverbChordWash', false),
      reverbResolutionBloom: booleanFromState(sliderState, 'reverbResolutionBloom', false),
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
      dynamicsSaturationEnabled: booleanFromState(sliderState, 'dynamicsSaturationEnabled', false),
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
      delayToReverb: reverbEnabled && delayAEnabled
        ? clamp(numberFromState(sliderState, 'delayAReverbSend', 0.4), 0, 1)
        : 0,
      granularToReverb: reverbEnabled && granularEnabled
        ? clamp(numberFromState(sliderState, 'granularReverbSend', 0.3) * ENGINE_TRIMS.granular, 0, 4)
        : 0,
      delayAToGranular: clamp(numberFromState(sliderState, 'delayAGranularSend', 0), 0, 1),
      delayBToGranular: clamp(numberFromState(sliderState, 'delayBGranularSend', 0), 0, 1),
      delayBToReverb: clamp(numberFromState(sliderState, 'granularDelayReverbSend', 0.4), 0, 1),
      granularToDelayA,
      granularToDelayB,
    },
    master: {
      gain: clamp(numberFromState(sliderState, 'masterVolume', DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM, 0, 1.5),
      limiterCeilingDb: clamp(numberFromState(sliderState, 'masterLimiterCeilingDb', -0.5), -24, 0),
    },
    rng: {
      seed: rngSeed,
      // Web legacy-cloud parity uses the transport bucket seed, while the broader
      // Product snapshot seed continues to drive non-granular runtime state.
      state: granularUsesLegacyRuntimeSeed ? granularRuntimeSeedFromState(sliderState) : rngState,
    },
    evolution: {
      amount: evolutionAmountFromState(sliderState),
      state: numberFromState(sliderState, 'evolutionState', numberFromState(sliderState, 'seed', 1)) >>> 0,
    },
    assetRefs: soundscapeAssets.map((asset) => asset.assetId),
    assetRefLevels: soundscapeAssets.map((asset) => asset.level),
    soundscape: {
      textureParamCount: soundscapePayload.textureParamCount,
      textureParams: soundscapePayload.textureParams,
      moduleParamCount: soundscapePayload.moduleParamCount,
      moduleParams: soundscapePayload.moduleParams,
    },
  };
}

export { encodeCoreProductSnapshot, KESSHO_PRODUCT_SNAPSHOT_BYTES, KESSHO_PRODUCT_SOURCE_SNAPSHOT_BYTES } from './coreProductSnapshotEncoder';
