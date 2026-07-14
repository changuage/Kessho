import { KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ, KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING, KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS, KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH, KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN, KESSHO_PRODUCT_DRUM_VOICE_COUNT } from './generated/kesshoProductSchema';
import { DEFAULT_REVERB_PRE_COMP, DEFAULT_STATE, type SliderState } from '../ui/state';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { getCoreProductSoundscapeAssetDescriptorsForState, getPrimaryCoreProductSoundscapeAssetIdForState } from './coreProductAssets';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from './outputTrims';
import { delayAFilterTypeId, delayBPatternId, delayBTapeSpacingId, delayBWarpId, dynamicsDriftModeId, dynamicsDriftQualityId, dynamicsErosionQualityId, dynamicsEndCompModeId, dynamicsSaturationModeId, dynamicsSaturationQualityId, granularAnchorPatternId, granularCloudStyleId, granularLegacyPitchModeId, granularPitchModeId, granularQualityId, granularShapeId, granularVoiceModeId, reverbModCharacterId, reverbQualityId, reverbSaturationModeId, reverbTypeId, sidechainKeyId } from './CoreProductModeIds';
import { assignLeadAlgorithmOverrideFields, assignLeadEnvelopeOverrideFields, assignLeadPresetIds, emptyLeadOverrideIndices, emptyLeadOverrideValues, exactLeadPatchFromState, leadAlgorithmPresetAEnabledFromState, leadEnvelopeGateSecondsFromState, leadEnvelopeOverrideFromState } from './CoreProductLeadPatch';
import { emptyPadOverrideIndices, emptyPadOverrideValues, exactPadPatchFromState } from './CoreProductPadPatch';
import { emptyDrumOverrideIndices, emptyDrumOverrideValues, exactDrumPatchFromState } from './CoreProductDrumPatch';
import { defaultPresetId, drumVoiceMorphsFromState, drumVoicePresetIdsFromState, endpointPresetId, soundscapePresetIdFromState, sourcePresetId } from './CoreProductPresetIds';
import { getTransportMetrics } from './transport';
import { computeGranularMacroModel, type GranularMacroModel } from './granularMacroCore';
import { applyDistanceValue, getVoiceDistanceKey, type DistanceVoice } from './distanceMacro';
import { computeGranularRuntimeSeed, getUtcBucket } from './rng';
import { defaultDrumEuclidPattern, defaultSynthEuclidPattern, euclideanPatternMask, resolveEuclidPatternParams } from './euclideanPatterns';
import { sequencerClockDivisionToNumericValue } from './sequencerClockDivisions';
import { normalizeSequencerSwing } from './sequencerSwing';
import { drumVoiceBaseMidiFromIndex } from './drumVoiceMidi';
import { delayBTapeHeadLevelsFromState, delayBTapeHeadMaskFromState, delayBTapeHeadPansFromState, delayDivisionMs } from './coreProductDelaySnapshot';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';
import { resolveReverbSnapshotParams, scaleIdFromState, shouldUseMobileReverbQualityOverride } from './coreProductReverbSnapshot';
import { coreProductDrumLaneMacroDefaultsFromState, coreProductSynthLaneMacroDefaultsFromState } from './coreProductSequencerMacroDefaults';
import { laneDefaults as coreProductLaneDefaults } from './coreProductSnapshotDefaults';
import { soundscapeSnapshotPayloadFromState, type SoundscapeSnapshotPayload } from './coreProductSoundscapesSnapshot';
import { HARMONY_POOL_MAX_NOTES, HARMONY_SOURCE_IDS, HARMONY_STRENGTH_IDS, resolveProductHarmonyState } from './CoreProductHarmonyControl';
import { coreProductSynthSequencerHoldSecondsFromState } from './coreProductSequencerHold';
import { productAnchorWalkerFromConfig, productOrbitFromConfig, SEQUENCER_MODE_IDS, synthSequencerFaceSlotsFromState } from './coreProductSequencerFaceSnapshot';
import {
  encodedPadVoiceLaneSeed,
  synthSourceIdFromState,
  synthSourcePadVoiceMaskFromState,
} from './coreProductSnapshotPadVoiceRouting';
import { readSampleSlotState } from './sampleLibraries/sampleSlotState';
import { sampleSlotSnapshotFields } from './sampleLibraries/sampleSlotProductSnapshot';
import type { SampleSlotId, SampleSlotState } from './sampleLibraries/SampleLibraryTypes';
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
  CORE_PRODUCT_SOURCE_IDS.sample1,
  CORE_PRODUCT_SOURCE_IDS.soundscape,
  CORE_PRODUCT_SOURCE_IDS.sample2,
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

function drumDelayFilterHz(state: Record<string, unknown> | undefined): number { return clamp(500 * Math.pow(32, clamp(numberFromState(state, 'drumDelayFilter', 0.5), 0, 1)), 200, 12000); }

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

function positiveU32(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback >>> 0 || 1;
  const rounded = Math.round(value);
  if (rounded <= 0) return fallback >>> 0 || 1;
  const normalized = rounded >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function dynamicsEqEdgeTypeId(value: unknown): number { return value === 'bell' ? 1 : 0; }

function dynamicsBusFromState(state: Record<string, unknown> | undefined, key: keyof SliderState): number { return clamp(Math.round(numberFromState(state, key, 0)), 0, 3) >>> 0; }

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

function fixedHarmonyPool(notes: readonly number[]): number[] {
  return Array.from({ length: HARMONY_POOL_MAX_NOTES }, (_, index) => {
    const note = notes[index];
    return typeof note === 'number' && Number.isFinite(note) ? clamp(Math.round(note), 0, 127) : 0;
  });
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
      phraseSeconds: 16,
      swing: 0,
    };
  }
  const metrics = getTransportMetrics(state as Partial<SliderState>);

  return {
    running: false,
    bpm: clamp(metrics.effectiveBpm, 1, 400),
    beatsPerBar: clamp(Math.round(numberFromState(state, 'transportBeatsPerBar', 4)), 1, 32),
    barsPerPhrase: clamp(Math.round(numberFromState(state, 'transportBarsPerPhrase', 4)), 1, 256),
    phraseSeconds: clamp(metrics.phraseDurationFromPhraseClockSec, 0.001, 4096),
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
    degradeSend: 0,
    diffuseSend: 0,
    postLpfHz: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_HZ,
    stereoWidth: KESSHO_PRODUCT_DEFAULT_SOURCE_STEREO_WIDTH,
    postLpfKeyTracking: KESSHO_PRODUCT_DEFAULT_SOURCE_POST_LPF_KEY_TRACKING,
    leadVibratoDepth: 0,
    leadVibratoRate: 0,
    leadGlide: 0,
    attackSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_ATTACK_SECONDS,
    decaySeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_DECAY_SECONDS,
    sustain: KESSHO_PRODUCT_DEFAULT_SOURCE_SUSTAIN,
    holdSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_HOLD_SECONDS,
    releaseSeconds: KESSHO_PRODUCT_DEFAULT_SOURCE_RELEASE_SECONDS,
    sampleLibraryId: 1,
    sampleRoleId: 0,
    sampleArticulationId: 0,
    sampleSelectionMode: 0,
    sampleDynamicMode: 2,
    sampleFixedDynamicId: 13,
    sampleLoopEnabled: true,
    sampleMaxVoices: 16,
    sampleVariantMode: 0,
    sampleReserved0: 0,
    padOverrideCount: 0,
    padOverrideIndices: emptyPadOverrideIndices(),
    padOverrideValues: emptyPadOverrideValues(),
    leadOverrideCount: 0,
    leadOverrideIndices: emptyLeadOverrideIndices(),
    leadOverrideValues: emptyLeadOverrideValues(),
    drumOverrideCount: 0,
    drumOverrideIndices: emptyDrumOverrideIndices(),
    drumOverrideValues: emptyDrumOverrideValues(),
    drumVoicePresetAIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoicePresetBIds: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
    drumVoiceMorphs: Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, () => 0),
  };
}

function sampleSlotStateForSource(
  slotId: SampleSlotId,
  state: Record<string, unknown> | undefined,
): SampleSlotState {
  return readSampleSlotState(state, slotId);
}

function assignSampleSlotSource(
  source: ProductSourceSnapshot,
  slotId: SampleSlotId,
  state: Record<string, unknown> | undefined,
): void {
  const slot = sampleSlotStateForSource(slotId, state);
  Object.assign(source, sampleSlotSnapshotFields(slot));
  const sampleKey = (suffix: string) => `${slotId}${suffix}`;
  const numberFromSampleState = (suffix: string, fallback: number): number => {
    const explicit = numberFromState(state, sampleKey(suffix), Number.NaN);
    if (Number.isFinite(explicit)) return explicit;
    return fallback;
  };
  source.enabled = slot.enabled;
  source.assetId = 0;
  source.level = slot.level * (slot.libraryKey === 'piano' ? ENGINE_TRIMS.piano : 1);
  source.distance = numberFromSampleState('Distance', source.distance);
  source.attackSeconds = slot.attackMs / 1000;
  source.decaySeconds = slot.decayMs / 1000;
  source.sustain = slot.sustain;
  source.holdSeconds = slot.holdMs / 1000;
  source.releaseSeconds = slot.releaseMs / 1000;
  source.reverbSend = numberFromSampleState('ReverbSend', source.reverbSend);
  source.delayASend = numberFromSampleState('DelayASend', source.delayASend);
  source.delayBSend = numberFromSampleState('DelayBSend', source.delayBSend);
  source.granularSend = numberFromState(state, `granular${slotId === 'sample1' ? 'Sample1' : 'Sample2'}Send`, source.granularSend);
  source.degradeSend = numberFromState(state, `degrade${slotId === 'sample1' ? 'Sample1' : 'Sample2'}Send`, source.degradeSend);
  source.diffuseSend = numberFromSampleState('DiffuseSend', source.diffuseSend);
  source.postLpfHz = numberFromSampleState('PostLPF', source.postLpfHz);
  source.stereoWidth = numberFromSampleState('StereoWidth', source.stereoWidth);
  source.presetId = sourcePresetId('sample', 'default', 'default');
}

function assignSourcePresetEndpoints(source: ProductSourceSnapshot, sourceFamily: 'pad' | 'lead', morph: number, keyA: unknown, keyB: unknown, fallbackKey: string): void {
  const presetA = sourcePresetId(sourceFamily, keyA, fallbackKey), presetB = sourcePresetId(sourceFamily, keyB, fallbackKey);
  source.sourcePresetAId = presetA; source.sourcePresetBId = presetB; source.morph = clamp(morph, 0, 1);
}

function sourceFromState(
  sourceId: number,
  state: Record<string, unknown> | undefined,
  soundscapePayload?: SoundscapeSnapshotPayload,
): ProductSourceSnapshot {
  const source = sourceDefaults(sourceId);
  switch (sourceId) {
    case CORE_PRODUCT_SOURCE_IDS.pad1:
      source.enabled = booleanFromState(state, 'padEnabled', false);
      source.level = numberFromState(state, 'synthLevel', source.level);
      source.morph = numberFromState(state, 'padMorph', source.morph);
      source.distance = numberFromState(state, 'padDistance', source.distance);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'pad1ReverbSend', 'pad1', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad1Send', source.granularSend);
      source.degradeSend = numberFromState(state, 'degradePad1Send', source.degradeSend);
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
      source.enabled = booleanFromState(state, 'pad2Enabled', false);
      source.level = numberFromState(state, 'pad2Level', source.level);
      source.morph = numberFromState(state, 'pad2Morph', source.morph);
      source.distance = numberFromState(state, 'pad2Distance', source.distance);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'pad2ReverbSend', 'pad2', source.reverbSend);
      source.delayASend = numberFromState(state, 'pad2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'pad2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularPad2Send', source.granularSend);
      source.degradeSend = numberFromState(state, 'degradePad2Send', source.degradeSend);
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
      source.enabled = booleanFromState(state, 'leadEnabled', false);
      source.level = distanceAdjustedNumberFromState(state, 'lead1Level', 'lead1', numberFromState(state, 'leadLevel', source.level));
      source.morph = numberFromState(state, 'lead1Morph', source.morph);
      source.distance = numberFromState(state, 'lead1Distance', source.distance);
      source.holdSeconds = leadEnvelopeGateSecondsFromState(state, 0);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'lead1ReverbSend', 'lead1', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead1DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead1DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead1Send', source.granularSend);
      source.degradeSend = numberFromState(state, 'degradeLead1Send', source.degradeSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'lead1DiffuseSend', 'lead1', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead1PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead1StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead1PostLPFKeyTracking', source.postLpfKeyTracking);
      source.leadVibratoDepth = numberFromState(state, 'leadVibratoDepth', source.leadVibratoDepth);
      source.leadVibratoRate = numberFromState(state, 'leadVibratoRate', source.leadVibratoRate);
      source.leadGlide = numberFromState(state, 'leadGlide', source.leadGlide);
      assignLeadPresetIds(source, state, 0);
      assignLeadAlgorithmOverrideFields(source, leadAlgorithmPresetAEnabledFromState(state, 0));
      assignLeadEnvelopeOverrideFields(source, leadEnvelopeOverrideFromState(state, 0));
      Object.assign(source, exactLeadPatchFromState(state, 0, source.sourcePresetAId, source.sourcePresetBId, source.morph));
      break;
    case CORE_PRODUCT_SOURCE_IDS.lead2:
      source.enabled = booleanFromState(state, 'lead2Enabled', booleanFromState(state, 'leadEnabled', false));
      source.level = distanceAdjustedNumberFromState(state, 'lead2Level', 'lead2', source.level);
      source.morph = numberFromState(state, 'lead2Morph', source.morph);
      source.distance = numberFromState(state, 'lead2Distance', source.distance);
      source.holdSeconds = leadEnvelopeGateSecondsFromState(state, 1);
      source.reverbSend = distanceAdjustedNumberFromState(state, 'lead2ReverbSend', 'lead2', numberFromState(state, 'leadReverbSend', source.reverbSend));
      source.delayASend = numberFromState(state, 'lead2DelayASend', source.delayASend);
      source.delayBSend = numberFromState(state, 'lead2DelayBSend', source.delayBSend);
      source.granularSend = numberFromState(state, 'granularLead2Send', source.granularSend);
      source.degradeSend = numberFromState(state, 'degradeLead2Send', source.degradeSend);
      source.diffuseSend = distanceAdjustedNumberFromState(state, 'lead2DiffuseSend', 'lead2', source.diffuseSend);
      source.postLpfHz = numberFromState(state, 'lead2PostLPF', source.postLpfHz);
      source.stereoWidth = numberFromState(state, 'lead2StereoWidth', source.stereoWidth);
      source.postLpfKeyTracking = numberFromState(state, 'lead2PostLPFKeyTracking', source.postLpfKeyTracking);
      source.leadVibratoDepth = numberFromState(state, 'leadVibratoDepth', source.leadVibratoDepth);
      source.leadVibratoRate = numberFromState(state, 'leadVibratoRate', source.leadVibratoRate);
      source.leadGlide = numberFromState(state, 'leadGlide', source.leadGlide);
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
      source.degradeSend = numberFromState(state, 'degradeDrumSend', source.degradeSend);
      source.presetId = sourcePresetId('drum', 'default', 'default');
      source.drumVoicePresetAIds = drumVoicePresetIdsFromState(state, 'a');
      source.drumVoicePresetBIds = drumVoicePresetIdsFromState(state, 'b');
      source.drumVoiceMorphs = drumVoiceMorphsFromState(state);
      Object.assign(source, exactDrumPatchFromState(state));
      break;
    case CORE_PRODUCT_SOURCE_IDS.sample1:
      assignSampleSlotSource(source, 'sample1', state);
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
        source.degradeSend = source.enabled ? payload.routePeaks[4] ?? 0 : source.degradeSend;
        source.presetId = soundscapePresetIdFromState(state);
      }
      break;
    case CORE_PRODUCT_SOURCE_IDS.sample2:
      assignSampleSlotSource(source, 'sample2', state);
      break;
    default:
      break;
  }
  source.reverbSend = clamp(source.reverbSend, 0, 2);
  source.delayASend = clamp(source.delayASend, 0, 2);
  source.delayBSend = clamp(source.delayBSend, 0, 2);
  source.granularSend = clamp(source.granularSend, 0, 2);
  source.degradeSend = clamp(source.degradeSend, 0, 2);
  source.diffuseSend = clamp(source.diffuseSend, 0, 2);
  source.level = clamp(source.level, 0, 1.5);
  source.morph = clamp(source.morph, 0, 1);
  source.distance = clamp(source.distance, 0, 1);
  source.postLpfHz = clamp(source.postLpfHz, 20, 20000);
  source.stereoWidth = clamp(source.stereoWidth, 0, 1);
  source.postLpfKeyTracking = clamp(source.postLpfKeyTracking, 0, 1);
  source.attackSeconds = clamp(source.attackSeconds, 0.001, 16);
  source.decaySeconds = clamp(source.decaySeconds, 0.01, 8);
  source.sustain = clamp(source.sustain, 0, 1);
  source.holdSeconds = clamp(source.holdSeconds, 0, 20);
  source.releaseSeconds = clamp(source.releaseSeconds, 0.01, 30);
  return source;
}

function laneDefaults(targetSourceId: number, midiNote: number): ProductLaneSnapshot {
  return coreProductLaneDefaults(targetSourceId, midiNote);
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
  lane.seed = encodedPadVoiceLaneSeed(1000 + laneNumber, synthSourcePadVoiceMaskFromState(state, `${prefix}Source`));
  Object.assign(lane, laneManualMaskFromPattern(state, prefix, resolved.steps, resolved.hits, resolved.rotation));
  const faceSlot = synthSequencerFaceSlotsFromState(state)[laneNumber - 1] ?? synthSequencerFaceSlotsFromState(undefined)[0]!;
  lane.sequencerMode = SEQUENCER_MODE_IDS[faceSlot.mode] ?? 0;
  lane.anchorWalker = productAnchorWalkerFromConfig(faceSlot.anchorWalker, laneNumber - 1, sourceId);
  lane.orbit = productOrbitFromConfig(faceSlot.orbit, laneNumber - 1, sourceId);
  const laneEnabledGate = lane.enabled;
  if (faceSlot.mode === 'anchorWalker') {
    lane.enabled = laneEnabledGate && faceSlot.anchorWalker.enabled;
    lane.targetSourceId = lane.anchorWalker.targetSourceId;
    lane.swing = normalizeSequencerSwing(faceSlot.anchorWalker.swing);
    lane.velocity = numberFromState(state, `${prefix}Level`, lane.velocity);
    lane.holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, lane.targetSourceId, lane.holdSeconds);
    lane.seed = Math.max(1, Math.round(faceSlot.anchorWalker.seed));
  } else if (faceSlot.mode === 'orbit') {
    lane.enabled = laneEnabledGate && faceSlot.orbit.enabled;
    lane.targetSourceId = lane.orbit.targetSourceId;
    lane.velocity = numberFromState(state, `${prefix}Level`, lane.velocity);
    lane.holdSeconds = coreProductSynthSequencerHoldSecondsFromState(state, lane.targetSourceId, lane.holdSeconds);
    lane.seed = Math.max(1, Math.round(faceSlot.orbit.seed));
  }
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
const DRUM_SEQUENCER_LANE_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

const DRUM_VOICE_MASK_SEED_FLAG = 0x80000000;
const DRUM_VOICE_MASK_SEED_SHIFT = 24;
const DRUM_VOICE_MASK_SEED_PAYLOAD_MASK = 0x00ffffff;

function defaultDrumTargetSuffix(laneNumber: number): (typeof DRUM_TARGETS)[number]['suffix'] {
  if (laneNumber === 2) return 'BeepHi';
  if (laneNumber === 3) return 'Click';
  if (laneNumber === 4) return 'Noise';
  if (laneNumber === 5) return 'BeepLo';
  if (laneNumber === 6) return 'Membrane';
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

function drumLaneBaseFromState(
  state: Record<string, unknown> | undefined,
  laneNumber: number,
  voiceIndices: readonly number[],
  defaultEnabled: boolean,
  transport: CoreProductSnapshot['transport'],
): ProductLaneSnapshot {
  const prefix = `drumEuclid${laneNumber}`;
  const voiceIndex = voiceIndices[0] ?? 1;
  const lane = laneDefaults(CORE_PRODUCT_SOURCE_IDS.drum, drumVoiceBaseMidiFromIndex(voiceIndex));
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
  for (const laneNumber of DRUM_SEQUENCER_LANE_NUMBERS) {
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
    positionSpray: clamp(macro?.voicePositionSpray?.[voiceIndex] ?? numberFromState(state, `${prefix}PositionSpray`, numberFromState(state, `${prefix}Spray`, 0.3)), 0, 1),
    timingSpray: clamp(macro?.voiceTimingSpray?.[voiceIndex] ?? numberFromState(state, `${prefix}TimingSpray`, 0), 0, 1),
    lookback: clamp(numberFromState(state, `${prefix}Lookback`, 0.35), 0, 1),
    writeGuard: clamp(numberFromState(state, `${prefix}WriteGuard`, 0.3), 0, 1),
    pitchMode: granularPitchModeId(state?.[`${prefix}PitchMode`]),
    pitchSpread: clamp(numberFromState(state, `${prefix}PitchSpread`, 0), 0, 24),
    pitchJitterCents: clamp(macro?.voicePitchJitter?.[voiceIndex] ?? numberFromState(state, `${prefix}PitchJitter`, 4), 0, 50),
    pitchQuantize: clamp(numberFromState(state, `${prefix}PitchQuantize`, 1), 0, 1),
    reverseChance: clamp(numberFromState(state, `${prefix}ReverseChance`, 0), 0, 1),
    bloom: clamp(macro?.voiceBloom?.[voiceIndex] ?? numberFromState(state, `${prefix}Bloom`, 0), 0, 1),
    glide: clamp(numberFromState(state, `${prefix}Glide`, 0), 0, 1),
    cloudStyle: granularCloudStyleId(state?.[`${prefix}CloudStyle`]),
    anchorPattern: granularAnchorPatternId(state?.[`${prefix}AnchorPattern`]),
    loopCrossfadeMs: clamp(numberFromState(state, `${prefix}LoopCrossfade`, 12), 4, 80),
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

  const delayBSendActive = sources.some((source) => source.delayBSend > 0.0001);
  const soundscapeSource = sources.find((source) => source.sourceId === CORE_PRODUCT_SOURCE_IDS.soundscape);
  const soundscapeAssets = soundscapeSource?.enabled
    ? getCoreProductSoundscapeAssetDescriptorsForState(sliderState)
    : [];
  const rngSeed = rngSeedFromState(sliderState);
  const rngState = rngStateFromState(sliderState, rngSeed);
  const rootMidi = rootMidiFromState(sliderState);
  const scaleId = scaleIdFromState(sliderState, tension);
  const journey = {
    enabled: booleanFromState(sliderState, 'journeyEnabled', false),
    morphPhase: clamp(numberFromState(sliderState, 'journeyMorphPhase', 0), 0, 1),
    morphRateBars: clamp(numberFromState(sliderState, 'journeyMorphRateBars', 8), 0.25, 128),
  };
  const harmonyControl = resolveProductHarmonyState({
    state: sliderState,
    rootMidi,
    scaleId,
    tension,
    seed: rngSeed,
    morphPercent: journey.morphPhase * 100,
  });
  const harmonyFrame = harmonyControl.resolvedHarmonyFrame;
  const granularEnabled =
    booleanFromState(sliderState, 'granularEnabled', false) ||
    numberFromState(sliderState, 'granularDegradeSend', 0) > 0.0001;
  const granularToDelayA = clamp(numberFromState(sliderState, 'granularDelayASend', 0), 0, 1);
  const granularToDelayB = clamp(numberFromState(sliderState, 'granularDelayBSend', 0), 0, 1);
  const delayAEnabled = booleanFromState(sliderState, 'delayAEnabled', true);
  const delayBOutputDefaultActive =
    delayBSendActive ||
    numberFromState(sliderState, 'delayAToBSend', 0) > 0.0001 ||
    granularToDelayB > 0.0001;
  const delayBEnabled = booleanFromState(sliderState, 'granularDelayEnabled', false);
  const rawDelayAToB = clamp(numberFromState(sliderState, 'delayAToBSend', 0), 0, 1), rawDelayBToA = clamp(numberFromState(sliderState, 'delayBToASend', 0), 0, 1), delayCrossScale = rawDelayAToB * rawDelayBToA > 0.4 ? Math.sqrt(0.4 / (rawDelayAToB * rawDelayBToA)) : 1, delayBToATrim = rawDelayAToB > 0.0001 && rawDelayBToA > 0.0001 ? 0.7 : 1;
  const spectralFreezeEnabled = booleanFromState(sliderState, 'spectralFreezeEnabled', false);
  const degradeToReverb = clamp(numberFromState(sliderState, 'degradeReverbSend', 0), 0, 1);
  const reverbToDegrade = degradeToReverb > 0.0001
    ? 0
    : clamp(numberFromState(sliderState, 'reverbDegradeSend', 0), 0, 1);
  const degradeSendActive =
    numberFromState(sliderState, 'degradePad1Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradePad2Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeLead1Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeLead2Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeSample1Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeSample2Send', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeDrumSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeWavesSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeWaterSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeInsectsSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'degradeNatureSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'delayADegradeSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'delayBDegradeSend', 0) > 0.0001 ||
    numberFromState(sliderState, 'granularDegradeSend', 0) > 0.0001 ||
    reverbToDegrade > 0.0001;
  const rawDynamicsEnabled = booleanFromState(sliderState, 'dynamicsEnabled', false);
  const rawDegradeEnabled = booleanFromState(sliderState, 'degradeEnabled', false);
  const rawDriftEnabled = booleanFromState(sliderState, 'driftEnabled', false);
  const rawErosionEnabled = booleanFromState(sliderState, 'erosionEnabled', false);
  const rawReverbEnabled = booleanFromState(sliderState, 'reverbEnabled', false);
  const degradeOutputActive = numberFromState(sliderState, 'degradeLevel', 1) > 0.0001 || degradeToReverb > 0.0001;
  const degradeReturnActive = degradeSendActive && degradeOutputActive;
  const degradeEngineActive = rawDegradeEnabled || degradeReturnActive;
  const dynamicsEnabled = rawDynamicsEnabled || degradeEngineActive;
  let driftMix = clamp(numberFromState(sliderState, 'driftMix', 0), 0, 1);
  let erosionMix = clamp(numberFromState(sliderState, 'erosionMix', 0), 0, 1);
  if (degradeReturnActive && driftMix <= 0.0001 && erosionMix <= 0.0001) {
    if (rawErosionEnabled && !rawDriftEnabled) {
      erosionMix = 1;
    } else {
      driftMix = 1;
    }
  }
  const degradeControlsEnabled = rawDynamicsEnabled || degradeEngineActive;
  const driftEnabled = degradeControlsEnabled && (rawDriftEnabled || (degradeReturnActive && driftMix > 0.0001));
  const erosionEnabled = degradeControlsEnabled && (rawErosionEnabled || (degradeReturnActive && erosionMix > 0.0001));
  const reverbReturnActive = rawReverbEnabled || degradeToReverb > 0.0001;
  const reverbEnabled = reverbReturnActive || reverbToDegrade > 0.0001;
  const granularMacroModel = computeGranularMacroModel((sliderState ?? {}) as unknown as SliderState, (key, fallback) => numberFromState(sliderState, key as string, fallback));
  const granularUsesLegacyRuntimeSeed = usesLegacyGranularRuntimeSeed(sliderState);
  const reverbParams = resolveReverbSnapshotParams(sliderState, tension);
  const delayBTapeMode = sliderState?.delayBAlgorithm === 'tapeHeads';

  return {
    transport,
    harmony: {
      rootMidi,
      scaleId,
      tension,
      chordMode: numberFromState(sliderState, 'chordMode', 0),
      voicingMode: numberFromState(sliderState, 'voicingMode', 1),
      ...harmonyControl,
      controlMode: harmonyFrame.activeSource === 'sequence'
        ? 1
        : harmonyFrame.activeSource === 'manualControl'
          ? 2
          : harmonyFrame.activeSource === 'slot'
            ? 3
            : 0,
      controlStrength: HARMONY_STRENGTH_IDS[harmonyControl.manualControl.strength],
      activeSource: HARMONY_SOURCE_IDS[harmonyFrame.activeSource],
      activeSlotId: harmonyFrame.activeSlotId ?? -1,
      activeStepIndex: harmonyFrame.activeStepIndex ?? -1,
      manualControlAvailable: harmonyFrame.manualControlAvailable,
      notePoolCount: Math.min(harmonyFrame.currentNotePool.length, HARMONY_POOL_MAX_NOTES),
      notePoolMidi: fixedHarmonyPool(harmonyFrame.currentNotePool),
      bassMidi: harmonyFrame.bassNote ?? -1,
      nextNotePoolCount: Math.min(harmonyFrame.nextNotePool.length, HARMONY_POOL_MAX_NOTES),
      nextNotePoolMidi: fixedHarmonyPool(harmonyFrame.nextNotePool),
      nextSource: harmonyFrame.nextSource ? HARMONY_SOURCE_IDS[harmonyFrame.nextSource] : -1,
      nextStepIndex: harmonyFrame.nextStepIndex ?? -1,
    },
    sources,
    synthLanes,
    drumLanes,
    journey,
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
      granularQuality: granularQualityId(sliderState?.granularQuality),
      granularMaxGrains: clamp(Math.round(numberFromState(sliderState, 'granularMaxGrains', 48)), 8, 64),
      granularSprayMacro: clamp(numberFromState(sliderState, 'granularSprayMacro', 0), 0, 1),
      granularCloudMacro: clamp(numberFromState(sliderState, 'granularCloudMacro', 0), 0, 1),
      granularPitchMacro: clamp(numberFromState(sliderState, 'granularPitchMacro', 0), 0, 1),
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
      reverbMix: reverbReturnActive ? clamp(numberFromState(sliderState, 'reverbLevel', 0.12), 0, 1) : 0,
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
      reverbBloom: clamp(numberFromState(sliderState, 'reverbBloom', 0), -1, 1),
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
      dynamicsDriftEnabled: dynamicsEnabled && driftEnabled,
      dynamicsDriftMode: dynamicsDriftModeId(sliderState?.driftMode),
      dynamicsDriftQuality: dynamicsDriftQualityId(sliderState?.driftQuality),
      dynamicsDriftAntiComb: clamp(numberFromState(sliderState, 'driftAntiComb', 1), 0, 1),
      dynamicsDriftDiffusion: clamp(numberFromState(sliderState, 'driftDiffusion', 0.55), 0, 1),
      dynamicsDriftMix: driftMix,
      dynamicsDriftAge: clamp(numberFromState(sliderState, 'driftAge', 0), 0, 1),
      dynamicsDriftBias: clamp(numberFromState(sliderState, 'driftBias', 0.5), 0, 1),
      dynamicsDriftLpgAmount: clamp(numberFromState(sliderState, 'driftLpgAmount', 0.5), 0, 1),
      dynamicsDriftResonance: clamp(numberFromState(sliderState, 'driftResonance', 0.2), 0, 1),
      dynamicsDriftStereo: clamp(numberFromState(sliderState, 'driftStereo', 0.5), 0, 1),
      dynamicsDriftEnvFollow: clamp(numberFromState(sliderState, 'driftEnvFollow', 0), 0, 1),
      dynamicsDriftDepth: clamp(numberFromState(sliderState, 'driftDepth', 0), 0, 1),
      dynamicsDriftRate: clamp(numberFromState(sliderState, 'driftRate', 0.3), 0, 1),
      dynamicsDriftDamp: clamp(numberFromState(sliderState, 'driftDamp', 0.5), 0, 1),
      dynamicsErosionEnabled: dynamicsEnabled && erosionEnabled,
      dynamicsErosionQuality: dynamicsErosionQualityId(sliderState?.erosionQuality),
      dynamicsErosionEventAmount: clamp(numberFromState(sliderState, 'erosionEventAmount', 0.45), 0, 1),
      dynamicsErosionProfileAmount: clamp(numberFromState(sliderState, 'erosionProfileAmount', 0.65), 0, 1),
      dynamicsErosionDitherAmount: clamp(numberFromState(sliderState, 'erosionDitherAmount', 0.55), 0, 1),
      dynamicsErosionMix: erosionMix,
      dynamicsErosionAge: clamp(numberFromState(sliderState, 'erosionAge', 0), 0, 1),
      dynamicsErosionGeneration: clamp(numberFromState(sliderState, 'erosionGeneration', 0), 0, 1),
      dynamicsErosionAlias: clamp(numberFromState(sliderState, 'erosionAlias', 0), 0, 1),
      dynamicsErosionWow: clamp(numberFromState(sliderState, 'erosionWow', 0), 0, 1),
      dynamicsErosionFlutter: clamp(numberFromState(sliderState, 'erosionFlutter', 0), 0, 1),
      dynamicsErosionDrift: clamp(numberFromState(sliderState, 'erosionDrift', 0), 0, 1),
      dynamicsErosionWobbleSpeed: clamp(numberFromState(sliderState, 'erosionWobbleSpeed', 0.35), 0, 1),
      dynamicsErosionTone: clamp(numberFromState(sliderState, 'erosionTone', 0.5), 0, 1),
      dynamicsDegradeHp: clamp(numberFromState(sliderState, 'degradeHp', 0), 0, 1),
      dynamicsDegradeLp: clamp(numberFromState(sliderState, 'degradeLp', 1), 0, 1),
      dynamicsErosionNoise: clamp(numberFromState(sliderState, 'erosionNoise', 0), 0, 1),
      dynamicsErosionSaturation: clamp(numberFromState(sliderState, 'erosionSaturation', 0), 0, 1),
      dynamicsErosionCorrosion: clamp(numberFromState(sliderState, 'erosionCorrosion', 0), 0, 1),
      dynamicsModSlowWow: clamp(numberFromState(sliderState, 'erosionModSlowWow', 0.18), 0, 1),
      dynamicsModSlowFlutter: clamp(numberFromState(sliderState, 'erosionModSlowFlutter', 0.02), 0, 1),
      dynamicsModSlowLp: clamp(numberFromState(sliderState, 'erosionModSlowLp', 0.12), 0, 1),
      dynamicsModSlowWet: clamp(numberFromState(sliderState, 'erosionModSlowWet', 0.03), 0, 1),
      dynamicsModSlowDropout: clamp(numberFromState(sliderState, 'erosionModSlowDropout', 0.04), 0, 1),
      dynamicsModSlowAlias: clamp(numberFromState(sliderState, 'erosionModSlowAlias', 0), 0, 1),
      dynamicsModFlutterWow: clamp(numberFromState(sliderState, 'erosionModFlutterWow', 0), 0, 1),
      dynamicsModFlutterFlutter: clamp(numberFromState(sliderState, 'erosionModFlutterFlutter', 0.12), 0, 1),
      dynamicsModFlutterLp: clamp(numberFromState(sliderState, 'erosionModFlutterLp', 0.02), 0, 1),
      dynamicsModFlutterWet: clamp(numberFromState(sliderState, 'erosionModFlutterWet', 0), 0, 1),
      dynamicsModFlutterDropout: clamp(numberFromState(sliderState, 'erosionModFlutterDropout', 0.02), 0, 1),
      dynamicsModFlutterAlias: clamp(numberFromState(sliderState, 'erosionModFlutterAlias', 0), 0, 1),
      dynamicsModRandomWow: clamp(numberFromState(sliderState, 'erosionModRandomWow', 0.04), 0, 1),
      dynamicsModRandomFlutter: clamp(numberFromState(sliderState, 'erosionModRandomFlutter', 0.03), 0, 1),
      dynamicsModRandomLp: clamp(numberFromState(sliderState, 'erosionModRandomLp', 0.14), 0, 1),
      dynamicsModRandomWet: clamp(numberFromState(sliderState, 'erosionModRandomWet', 0.02), 0, 1),
      dynamicsModRandomDropout: clamp(numberFromState(sliderState, 'erosionModRandomDropout', 0.1), 0, 1),
      dynamicsModRandomAlias: clamp(numberFromState(sliderState, 'erosionModRandomAlias', 0.02), 0, 1),
      dynamicsModEnvWow: clamp(numberFromState(sliderState, 'erosionModEnvWow', 0), 0, 1),
      dynamicsModEnvFlutter: clamp(numberFromState(sliderState, 'erosionModEnvFlutter', 0), 0, 1),
      dynamicsModEnvLp: clamp(numberFromState(sliderState, 'erosionModEnvLp', 0.08), 0, 1),
      dynamicsModEnvWet: clamp(numberFromState(sliderState, 'erosionModEnvWet', 0.04), 0, 1),
      dynamicsModEnvDropout: clamp(numberFromState(sliderState, 'erosionModEnvDropout', 0), 0, 1),
      dynamicsModEnvAlias: clamp(numberFromState(sliderState, 'erosionModEnvAlias', 0), 0, 1),
      dynamicsModNoiseWow: clamp(numberFromState(sliderState, 'erosionModNoiseWow', 0), 0, 1),
      dynamicsModNoiseFlutter: clamp(numberFromState(sliderState, 'erosionModNoiseFlutter', 0.06), 0, 1),
      dynamicsModNoiseLp: clamp(numberFromState(sliderState, 'erosionModNoiseLp', 0.02), 0, 1),
      dynamicsModNoiseWet: clamp(numberFromState(sliderState, 'erosionModNoiseWet', 0), 0, 1),
      dynamicsModNoiseDropout: clamp(numberFromState(sliderState, 'erosionModNoiseDropout', 0.06), 0, 1),
      dynamicsModNoiseAlias: clamp(numberFromState(sliderState, 'erosionModNoiseAlias', 0.02), 0, 1),
      dynamicsSaturationEnabled: booleanFromState(sliderState, 'dynamicsSaturationEnabled', false),
      dynamicsSaturationMode: dynamicsSaturationModeId(sliderState?.dynamicsSaturationMode),
      dynamicsSaturationQuality: dynamicsSaturationQualityId(sliderState?.dynamicsSaturationQuality),
      dynamicsSaturationDrive: clamp(numberFromState(sliderState, 'dynamicsSaturationDrive', 0), 0, 1),
      dynamicsSaturationTone: clamp(numberFromState(sliderState, 'dynamicsSaturationTone', 0.5), 0, 1),
      dynamicsSaturationBias: clamp(numberFromState(sliderState, 'dynamicsSaturationBias', 0.5), 0, 1),
      dynamicsEndCompEnabled: dynamicsEnabled && booleanFromState(sliderState, 'endCompEnabled', false),
      dynamicsEndCompMode: dynamicsEndCompModeId(sliderState?.endCompMode),
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
      dynamicsEndCompPeakBlend: clamp(numberFromState(sliderState, 'endCompPeakBlend', 0.25), 0, 1),
      dynamicsEndCompClarity: clamp(numberFromState(sliderState, 'endCompClarity', 0.22), 0, 1),
      dynamicsEndCompTwoBandAmount: clamp(numberFromState(sliderState, 'endCompTwoBandAmount', 0), 0, 1),
      dynamicsEndCompBandSplit: clamp(numberFromState(sliderState, 'endCompBandSplit', 0.5), 0, 1),
      dynamicsEq1Enabled: booleanFromState(sliderState, 'dynamicsEq1Enabled', false),
      dynamicsEq1InputGain: clamp(numberFromState(sliderState, 'dynamicsEq1InputGain', 0), -24, 24),
      dynamicsEq1OutputGain: clamp(numberFromState(sliderState, 'dynamicsEq1OutputGain', 0), -24, 24),
      dynamicsEq1LowType: dynamicsEqEdgeTypeId(sliderState?.dynamicsEq1LowType),
      dynamicsEq1LowFreq: clamp(numberFromState(sliderState, 'dynamicsEq1LowFreq', 120), 20, 20000),
      dynamicsEq1LowGain: clamp(numberFromState(sliderState, 'dynamicsEq1LowGain', 0), -24, 24),
      dynamicsEq1LowQ: clamp(numberFromState(sliderState, 'dynamicsEq1LowQ', 0.7), 0.1, 18),
      dynamicsEq1LowSlope: clamp(numberFromState(sliderState, 'dynamicsEq1LowSlope', 1), 0.25, 4),
      dynamicsEq1MidFreq: clamp(numberFromState(sliderState, 'dynamicsEq1MidFreq', 1000), 20, 20000),
      dynamicsEq1MidGain: clamp(numberFromState(sliderState, 'dynamicsEq1MidGain', 0), -24, 24),
      dynamicsEq1MidQ: clamp(numberFromState(sliderState, 'dynamicsEq1MidQ', 0.9), 0.1, 18),
      dynamicsEq1HighType: dynamicsEqEdgeTypeId(sliderState?.dynamicsEq1HighType),
      dynamicsEq1HighFreq: clamp(numberFromState(sliderState, 'dynamicsEq1HighFreq', 8000), 20, 20000),
      dynamicsEq1HighGain: clamp(numberFromState(sliderState, 'dynamicsEq1HighGain', 0), -24, 24),
      dynamicsEq1HighQ: clamp(numberFromState(sliderState, 'dynamicsEq1HighQ', 0.7), 0.1, 18),
      dynamicsEq1HighSlope: clamp(numberFromState(sliderState, 'dynamicsEq1HighSlope', 1), 0.25, 4),
      dynamicsEq2Enabled: booleanFromState(sliderState, 'dynamicsEq2Enabled', false),
      dynamicsEq2InputGain: clamp(numberFromState(sliderState, 'dynamicsEq2InputGain', 0), -24, 24),
      dynamicsEq2OutputGain: clamp(numberFromState(sliderState, 'dynamicsEq2OutputGain', 0), -24, 24),
      dynamicsEq2LowType: dynamicsEqEdgeTypeId(sliderState?.dynamicsEq2LowType),
      dynamicsEq2LowFreq: clamp(numberFromState(sliderState, 'dynamicsEq2LowFreq', 90), 20, 20000),
      dynamicsEq2LowGain: clamp(numberFromState(sliderState, 'dynamicsEq2LowGain', 0), -24, 24),
      dynamicsEq2LowQ: clamp(numberFromState(sliderState, 'dynamicsEq2LowQ', 0.7), 0.1, 18),
      dynamicsEq2LowSlope: clamp(numberFromState(sliderState, 'dynamicsEq2LowSlope', 1), 0.25, 4),
      dynamicsEq2MidFreq: clamp(numberFromState(sliderState, 'dynamicsEq2MidFreq', 2200), 20, 20000),
      dynamicsEq2MidGain: clamp(numberFromState(sliderState, 'dynamicsEq2MidGain', 0), -24, 24),
      dynamicsEq2MidQ: clamp(numberFromState(sliderState, 'dynamicsEq2MidQ', 0.9), 0.1, 18),
      dynamicsEq2HighType: dynamicsEqEdgeTypeId(sliderState?.dynamicsEq2HighType),
      dynamicsEq2HighFreq: clamp(numberFromState(sliderState, 'dynamicsEq2HighFreq', 10000), 20, 20000),
      dynamicsEq2HighGain: clamp(numberFromState(sliderState, 'dynamicsEq2HighGain', 0), -24, 24),
      dynamicsEq2HighQ: clamp(numberFromState(sliderState, 'dynamicsEq2HighQ', 0.7), 0.1, 18),
      dynamicsEq2HighSlope: clamp(numberFromState(sliderState, 'dynamicsEq2HighSlope', 1), 0.25, 4),
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
      delayAToDegrade: clamp(numberFromState(sliderState, 'delayADegradeSend', 0), 0, 1),
      delayBToDegrade: clamp(numberFromState(sliderState, 'delayBDegradeSend', 0), 0, 1),
      granularToDegrade: clamp(numberFromState(sliderState, 'granularDegradeSend', 0), 0, 1),
      reverbToDegrade,
      degradeToReverb,
      degradeReturnLevel: clamp(numberFromState(sliderState, 'degradeLevel', 1), 0, 1),
      dynamicsPad1Bus: dynamicsBusFromState(sliderState, 'dynamicsPad1Bus'),
      dynamicsPad2Bus: dynamicsBusFromState(sliderState, 'dynamicsPad2Bus'),
      dynamicsLead1Bus: dynamicsBusFromState(sliderState, 'dynamicsLead1Bus'),
      dynamicsLead2Bus: dynamicsBusFromState(sliderState, 'dynamicsLead2Bus'),
      dynamicsPianoBus: dynamicsBusFromState(sliderState, 'dynamicsPianoBus'),
      dynamicsDrumBus: dynamicsBusFromState(sliderState, 'dynamicsDrumBus'),
      dynamicsGranularBus: dynamicsBusFromState(sliderState, 'dynamicsGranularBus'),
      dynamicsWavesBus: dynamicsBusFromState(sliderState, 'dynamicsWavesBus'),
      dynamicsWaterBus: dynamicsBusFromState(sliderState, 'dynamicsWaterBus'),
      dynamicsInsectsBus: dynamicsBusFromState(sliderState, 'dynamicsInsectsBus'),
      dynamicsNatureBus: dynamicsBusFromState(sliderState, 'dynamicsNatureBus'),
      dynamicsDelayABus: dynamicsBusFromState(sliderState, 'dynamicsDelayABus'),
      dynamicsDelayBBus: dynamicsBusFromState(sliderState, 'dynamicsDelayBBus'),
      dynamicsDegradeBus: dynamicsBusFromState(sliderState, 'dynamicsDegradeBus'),
      dynamicsReverbBus: dynamicsBusFromState(sliderState, 'dynamicsReverbBus'),
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
