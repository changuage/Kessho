import {
  KESSHO_PRODUCT_LEAD_PARAM_COUNT,
  KESSHO_PRODUCT_LEAD_PARAM_SPECS,
  KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES,
  KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES,
  KESSHO_PRODUCT_SOURCE_PRESETS,
} from './generated/kesshoProductSchema';
import { DEFAULT_GAMELAN, DEFAULT_SOFT_RHODES, loadLead4opFMPreset, loadLead4opFMPresetVerified, morphPresets, type Lead4opFMPreset } from './lead4opfm';
import { getVoiceDistanceKey } from './distanceMacro';
import { booleanFromState, clamp, coreProductParamValue, numberFromState } from './coreProductSnapshotState';
import { normalizePresetKey, sourcePresetId } from './CoreProductPresetIds';
import { emptyParamArray, paramsMatch, sparseParamOverridesFromDiff } from './CoreProductSparseOverrides';
import { generatedProductParamIndex } from './CoreProductGeneratedParamMetadata';

const LEAD_PATCH_EPSILON = 0.000001;
const LEAD_ALGORITHM_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'algorithm');
const LEAD_ATTACK_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'attack');
const LEAD_DECAY_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'decay');
const LEAD_SUSTAIN_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'sustain');
const LEAD_RELEASE_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'release');
const LEAD_FILTER_FREQ_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'filterFreq');
const LEAD_FILTER_Q_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'filterQ');
const LEAD_FILTER_ENV_DEPTH_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'filterEnvDepth');
const LEAD_DRIVE_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'drive');
const LEAD_TRANSIENT_CLICK_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'transientClick');
const LEAD_TRANSIENT_NOISE_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'transientNoise');
const LEAD_GAIN_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'gain');
const LEAD_CARRIER2_MIX_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'carrier2Mix');
const LEAD_MOD1_INDEX_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'mod1Index');
const LEAD_MOD2_INDEX_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'mod2Index');
const LEAD_MOD3_INDEX_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'mod3Index');
const LEAD_MOD4_INDEX_PARAM_INDEX = generatedProductParamIndex(KESSHO_PRODUCT_LEAD_PARAM_SPECS, 'mod4Index');
const DISTANCE_SLIGHT_POINT = 0.25;
const DISTANCE_STRENGTH = 2;
const ATTACK_DISTANCE_BASE_BOOST_SECONDS = 0.1;
const ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS = 0.005;

type SourcePreset = (typeof KESSHO_PRODUCT_SOURCE_PRESETS)[number];
export type LeadEnvelopeOverride = {
  enabled: boolean;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

export {
  loadLead4opFMPreset as loadProductLead4opFMPreset,
  loadLead4opFMPresetVerified as loadProductLead4opFMPresetVerified,
};

function leadParamUsesPresetSnap(paramIndex: number): boolean {
  return KESSHO_PRODUCT_LEAD_PRESET_SNAP_PARAM_INDICES.some((snapParamIndex) => snapParamIndex === paramIndex);
}

function leadParamUsesPresetRound(paramIndex: number): boolean {
  return KESSHO_PRODUCT_LEAD_PRESET_ROUND_PARAM_INDICES.some((roundParamIndex) => roundParamIndex === paramIndex);
}

function findGeneratedLeadPreset(presetId: number): SourcePreset | undefined {
  return KESSHO_PRODUCT_SOURCE_PRESETS.find(
    (preset) =>
      preset.source === 'lead' &&
      preset.id === presetId,
  );
}

function canReconstructGeneratedLeadParams(presetAId: number, presetBId: number): boolean {
  return Boolean(
    generatedLeadParamsFromPresetId(presetAId) &&
      generatedLeadParamsFromPresetId(presetBId),
  );
}

function isLeadPresetObject(key: unknown): key is Lead4opFMPreset {
  if (
    key &&
    typeof key === 'object' &&
    typeof (key as Record<string, unknown>).algorithm === 'string' &&
    (key as Record<string, unknown>).params &&
    typeof (key as Record<string, unknown>).params === 'object'
  ) {
    return true;
  }
  return false;
}

export function hasLeadCustomPresetData(state: Record<string, unknown> | undefined, leadIndex: 0 | 1): boolean {
  const presetAData = leadIndex === 0 ? state?.lead1PresetAData : state?.lead2PresetCData;
  const presetBData = leadIndex === 0 ? state?.lead1PresetBData : state?.lead2PresetDData;
  return isLeadPresetObject(presetAData) || isLeadPresetObject(presetBData);
}

export function hasLeadCustomPresetEndpointData(
  state: Record<string, unknown> | undefined,
  leadIndex: 0 | 1,
  endpoint: 'a' | 'b',
): boolean {
  const presetData = leadIndex === 0
    ? endpoint === 'a' ? state?.lead1PresetAData : state?.lead1PresetBData
    : endpoint === 'a' ? state?.lead2PresetCData : state?.lead2PresetDData;
  return isLeadPresetObject(presetData);
}

function leadPresetFromKey(key: unknown, fallbackKey: 'soft_rhodes' | 'gamelan'): Lead4opFMPreset {
  if (isLeadPresetObject(key)) return key;
  const normalized = normalizePresetKey(key, fallbackKey);
  return normalized === 'gamelan' ? DEFAULT_GAMELAN : DEFAULT_SOFT_RHODES;
}

function generatedLeadAnchorPresetId(
  key: unknown,
  defaultKey: 'soft_rhodes' | 'gamelan',
  useDefaultAnchorForInvalidKey: boolean,
): number {
  const presetId = sourcePresetId('lead', key, '');
  if (presetId !== 0) return presetId;
  if (useDefaultAnchorForInvalidKey || typeof key !== 'string' || key.trim() === '') {
    return sourcePresetId('lead', defaultKey, defaultKey);
  }
  return 0;
}

export function assignLeadPresetIds(
  source: { sourcePresetAId: number; sourcePresetBId: number; presetId: number; morph: number },
  state: Record<string, unknown> | undefined,
  leadIndex: 0 | 1,
): void {
  const keyA = leadIndex === 0 ? state?.lead1PresetA : state?.lead2PresetC;
  const keyB = leadIndex === 0 ? state?.lead1PresetB : state?.lead2PresetD;
  const defaultA = 'soft_rhodes';
  const defaultB = 'gamelan';
  const hasCustomPresetData = hasLeadCustomPresetData(state, leadIndex);
  const presetA = generatedLeadAnchorPresetId(
    keyA,
    defaultA,
    hasCustomPresetData && hasLeadCustomPresetEndpointData(state, leadIndex, 'a'),
  );
  const presetB = generatedLeadAnchorPresetId(
    keyB,
    defaultB,
    hasCustomPresetData && hasLeadCustomPresetEndpointData(state, leadIndex, 'b'),
  );
  source.sourcePresetAId = presetA;
  source.sourcePresetBId = presetB;
  source.presetId = clamp(source.morph, 0, 1) >= 0.5 ? presetB : presetA;
  source.morph = clamp(source.morph, 0, 1);
}

function leadAlgorithmMode(value: unknown): 'snap' | 'presetA' {
  return value === 'presetA' ? 'presetA' : 'snap';
}

function scaleLeadDistance(distance: number): number {
  const safeDistance = clamp(distance, 0, 1);
  return DISTANCE_STRENGTH <= 1 ? safeDistance : 1 - Math.pow(1 - safeDistance, DISTANCE_STRENGTH);
}

function leadDistanceAnchor(distance: number, startValue: number, slightValue: number, maxValue: number): number {
  const safeDistance = scaleLeadDistance(distance);
  if (safeDistance <= DISTANCE_SLIGHT_POINT) {
    return startValue + (safeDistance / DISTANCE_SLIGHT_POINT) * (slightValue - startValue);
  }
  const tailT = (safeDistance - DISTANCE_SLIGHT_POINT) / (1 - DISTANCE_SLIGHT_POINT);
  return slightValue + tailT * (maxValue - slightValue);
}

function leadDistanceAdd(base: number, distance: number, slightDelta: number, maxDelta: number, min: number, max: number): number {
  return clamp(base + leadDistanceAnchor(distance, 0, slightDelta, maxDelta), min, max);
}

function leadDistanceMultiply(base: number, distance: number, slightMul: number, maxMul: number, min: number, max: number): number {
  return clamp(base * leadDistanceAnchor(distance, 1, slightMul, maxMul), min, max);
}

function leadDistanceAttack(base: number, distance: number, slightMul: number, maxMul: number): number {
  if (Math.abs(distance) <= 0.0001) return clamp(base, 0.001, 2);
  const effectiveBase = base <= ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS ? base + ATTACK_DISTANCE_BASE_BOOST_SECONDS : base;
  return leadDistanceMultiply(effectiveBase, distance, slightMul, maxMul, 0.001, 2);
}

function applyLeadDistanceParams(params: number[], leadIndex: 0 | 1, distance: number): void {
  if (distance <= 0.0001) return;
  const lead2 = leadIndex === 1;
  const shaped = scaleLeadDistance(distance);
  params[LEAD_ATTACK_PARAM_INDEX] = leadDistanceAttack(params[LEAD_ATTACK_PARAM_INDEX] ?? 0, distance, lead2 ? 1.25 : 1.2, lead2 ? 3.6 : 3.2);
  params[LEAD_DECAY_PARAM_INDEX] = leadDistanceMultiply(params[LEAD_DECAY_PARAM_INDEX] ?? 0, distance, lead2 ? 0.94 : 0.95, lead2 ? 0.74 : 0.78, 0.01, 4);
  params[LEAD_SUSTAIN_PARAM_INDEX] = leadDistanceAdd(params[LEAD_SUSTAIN_PARAM_INDEX] ?? 0, distance, lead2 ? -0.05 : -0.04, lead2 ? -0.30 : -0.26, 0, 1);
  params[LEAD_RELEASE_PARAM_INDEX] = leadDistanceMultiply(params[LEAD_RELEASE_PARAM_INDEX] ?? 0, distance, lead2 ? 1.15 : 1.12, lead2 ? 2.0 : 1.9, 0.01, 8);
  params[LEAD_FILTER_FREQ_PARAM_INDEX] = Math.max(80, (params[LEAD_FILTER_FREQ_PARAM_INDEX] ?? 0) * (1 - shaped * 0.72));
  params[LEAD_FILTER_Q_PARAM_INDEX] = Math.max(0.05, (params[LEAD_FILTER_Q_PARAM_INDEX] ?? 0) * (1 - shaped * 0.18));
  params[LEAD_FILTER_ENV_DEPTH_PARAM_INDEX] = (params[LEAD_FILTER_ENV_DEPTH_PARAM_INDEX] ?? 0) * (1 - shaped * 0.55);
  params[LEAD_TRANSIENT_CLICK_PARAM_INDEX] = (params[LEAD_TRANSIENT_CLICK_PARAM_INDEX] ?? 0) * (1 - shaped * 0.92);
  params[LEAD_TRANSIENT_NOISE_PARAM_INDEX] = (params[LEAD_TRANSIENT_NOISE_PARAM_INDEX] ?? 0) * (1 - shaped * 0.82);
  params[LEAD_MOD1_INDEX_PARAM_INDEX] = (params[LEAD_MOD1_INDEX_PARAM_INDEX] ?? 0) * (1 - shaped * 0.34);
  params[LEAD_MOD2_INDEX_PARAM_INDEX] = (params[LEAD_MOD2_INDEX_PARAM_INDEX] ?? 0) * (1 - shaped * 0.30);
  params[LEAD_MOD3_INDEX_PARAM_INDEX] = (params[LEAD_MOD3_INDEX_PARAM_INDEX] ?? 0) * (1 - shaped * 0.24);
  params[LEAD_MOD4_INDEX_PARAM_INDEX] = (params[LEAD_MOD4_INDEX_PARAM_INDEX] ?? 0) * (1 - shaped * 0.18);
  params[LEAD_DRIVE_PARAM_INDEX] = (params[LEAD_DRIVE_PARAM_INDEX] ?? 0) * (1 - shaped * 0.62);
  params[LEAD_CARRIER2_MIX_PARAM_INDEX] = (params[LEAD_CARRIER2_MIX_PARAM_INDEX] ?? 0) * (1 - shaped * 0.12);
  params[LEAD_GAIN_PARAM_INDEX] = (params[LEAD_GAIN_PARAM_INDEX] ?? 0) * (1 - shaped * 0.15);
}

export function leadEnvelopeOverrideFromState(
  state: Record<string, unknown> | undefined,
  leadIndex: 0 | 1,
): LeadEnvelopeOverride {
  const prefix = leadIndex === 0 ? 'lead1' : 'lead2';
  return {
    enabled: booleanFromState(state, `${prefix}UseCustomAdsr`, false),
    attack: clamp(numberFromState(state, `${prefix}Attack`, 0.01), 0.001, 2),
    decay: clamp(numberFromState(state, `${prefix}Decay`, 0.8), 0.01, 4),
    sustain: clamp(numberFromState(state, `${prefix}Sustain`, 0.3), 0, 1),
    release: clamp(numberFromState(state, `${prefix}Release`, 2), 0.01, 8),
  };
}

export function leadAlgorithmPresetAEnabledFromState(
  state: Record<string, unknown> | undefined,
  leadIndex: 0 | 1,
): boolean {
  return leadAlgorithmMode(state?.[leadIndex === 0 ? 'lead1AlgorithmMode' : 'lead2AlgorithmMode']) === 'presetA';
}

function applyLeadEnvelopeOverrideParams(params: number[], override: LeadEnvelopeOverride): void {
  if (!override.enabled) return;
  params[LEAD_ATTACK_PARAM_INDEX] = override.attack;
  params[LEAD_DECAY_PARAM_INDEX] = override.decay;
  params[LEAD_SUSTAIN_PARAM_INDEX] = override.sustain;
  params[LEAD_RELEASE_PARAM_INDEX] = override.release;
}

export function assignLeadEnvelopeOverrideFields(
  source: { leadEnvelopeOverrideEnabled: boolean; attackSeconds: number; decaySeconds: number; sustain: number; releaseSeconds: number },
  override: LeadEnvelopeOverride,
): void {
  source.leadEnvelopeOverrideEnabled = override.enabled;
  if (!override.enabled) return;
  source.attackSeconds = override.attack;
  source.decaySeconds = override.decay;
  source.sustain = override.sustain;
  source.releaseSeconds = override.release;
}

export function assignLeadAlgorithmOverrideFields(
  source: { leadAlgorithmPresetAEnabled: boolean },
  presetAEnabled: boolean,
): void {
  source.leadAlgorithmPresetAEnabled = presetAEnabled;
}

function emptyLeadParams(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_LEAD_PARAM_COUNT);
}

function generatedLeadPresetFromKey(key: string): Lead4opFMPreset | undefined {
  if (key === 'soft_rhodes') return DEFAULT_SOFT_RHODES;
  if (key === 'gamelan') return DEFAULT_GAMELAN;
  return undefined;
}

function generatedLeadParamsFromPreset(preset: SourcePreset): number[] | undefined {
  const leadPreset = generatedLeadPresetFromKey(preset.key);
  if (!leadPreset) return undefined;
  const morphed = morphPresets(leadPreset, leadPreset, 0) as unknown as Record<string, unknown>;
  const params = emptyLeadParams();
  for (const spec of KESSHO_PRODUCT_LEAD_PARAM_SPECS) {
    params[spec.index] = coreProductParamValue(morphed[spec.key], spec.enumMap, spec.fallback);
  }
  return params;
}

function generatedLeadParamsFromPresetId(presetId: number): number[] | undefined {
  const preset = findGeneratedLeadPreset(presetId);
  return preset ? generatedLeadParamsFromPreset(preset) : undefined;
}

export function emptyLeadOverrideIndices(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_LEAD_PARAM_COUNT);
}

export function emptyLeadOverrideValues(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_LEAD_PARAM_COUNT);
}

function exactLeadParamsFromState(state: Record<string, unknown> | undefined, leadIndex: 0 | 1): number[] {
  // SNAPSHOT_AUTHORITY: PRODUCT_CORE_LEAD_OVERRIDE_BRIDGE - legacy Lead presets are read only to derive bounded sparse user overrides for reconstructable generated endpoints and custom Lead preset data.
  // PATCH_BRIDGE_RETIREMENT: exact Lead params are intermediate diff inputs only; invalid/non-reconstructable endpoint IDs emit no exact web fallback arrays.
  const params = emptyLeadParams();
  const presetAKey = leadIndex === 0 ? state?.lead1PresetA : state?.lead2PresetC;
  const presetBKey = leadIndex === 0 ? state?.lead1PresetB : state?.lead2PresetD;
  const presetAData = leadIndex === 0 ? state?.lead1PresetAData : state?.lead2PresetCData;
  const presetBData = leadIndex === 0 ? state?.lead1PresetBData : state?.lead2PresetDData;
  const morph = clamp(numberFromState(state, leadIndex === 0 ? 'lead1Morph' : 'lead2Morph', 0), 0, 1);
  const algorithm = leadAlgorithmMode(state?.[leadIndex === 0 ? 'lead1AlgorithmMode' : 'lead2AlgorithmMode']);
  let morphed = morphPresets(
    leadPresetFromKey(presetAData ?? presetAKey, 'soft_rhodes'),
    leadPresetFromKey(presetBData ?? presetBKey, 'gamelan'),
    morph,
    algorithm,
  );
  const envelopeOverride = leadEnvelopeOverrideFromState(state, leadIndex);
  if (envelopeOverride.enabled) {
    morphed.attack = envelopeOverride.attack;
    morphed.decay = envelopeOverride.decay;
    morphed.sustain = envelopeOverride.sustain;
    morphed.release = envelopeOverride.release;
  }
  const voice = leadIndex === 0 ? 'lead1' : 'lead2';
  const distance = clamp(numberFromState(state, getVoiceDistanceKey(voice), 0), 0, 1);
  const morphedParams = morphed as unknown as Record<string, unknown>;
  for (const spec of KESSHO_PRODUCT_LEAD_PARAM_SPECS) {
    params[spec.index] = coreProductParamValue(morphedParams[spec.key], spec.enumMap, spec.fallback);
  }
  applyLeadDistanceParams(params, leadIndex, distance);
  return params;
}

function reconstructedLeadParamsFromPresetIds(
  presetAId: number,
  presetBId: number,
  morph: number,
  algorithmPresetAEnabled = false,
): number[] {
  const params = emptyLeadParams();
  const presetAParams = generatedLeadParamsFromPresetId(presetAId);
  const presetBParams = generatedLeadParamsFromPresetId(presetBId);
  if (!presetAParams || !presetBParams) return params;

  const t = clamp(morph, 0, 1);
  for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_LEAD_PARAM_COUNT; paramIndex += 1) {
    const a = presetAParams[paramIndex] ?? 0;
    const b = presetBParams[paramIndex] ?? 0;
    if (paramIndex === LEAD_ALGORITHM_PARAM_INDEX && algorithmPresetAEnabled) {
      params[paramIndex] = a;
    } else if (leadParamUsesPresetSnap(paramIndex)) {
      params[paramIndex] = t < 0.5 ? a : b;
    } else {
      const value = a + (b - a) * t;
      params[paramIndex] = leadParamUsesPresetRound(paramIndex) ? Math.round(value) : value;
    }
  }
  return params;
}

export function exactLeadPatchFromState(
  state: Record<string, unknown> | undefined,
  leadIndex: 0 | 1,
  presetAId: number,
  presetBId: number,
  morph: number,
): {
  leadOverrideCount: number;
  leadOverrideIndices: number[];
  leadOverrideValues: number[];
} {
  const canReconstruct = canReconstructGeneratedLeadParams(presetAId, presetBId);
  if (!canReconstruct) {
    return {
      leadOverrideCount: 0,
      leadOverrideIndices: emptyLeadOverrideIndices(),
      leadOverrideValues: emptyLeadOverrideValues(),
    };
  }
  const exactLeadParams = exactLeadParamsFromState(state, leadIndex);
  const reconstructedParams = reconstructedLeadParamsFromPresetIds(presetAId, presetBId, morph, leadAlgorithmPresetAEnabledFromState(state, leadIndex));
  applyLeadEnvelopeOverrideParams(reconstructedParams, leadEnvelopeOverrideFromState(state, leadIndex));
  applyLeadDistanceParams(reconstructedParams, leadIndex, clamp(numberFromState(state, getVoiceDistanceKey(leadIndex === 0 ? 'lead1' : 'lead2'), 0), 0, 1));
  if (paramsMatch(exactLeadParams, reconstructedParams, KESSHO_PRODUCT_LEAD_PARAM_COUNT, LEAD_PATCH_EPSILON)) {
    return {
      leadOverrideCount: 0,
      leadOverrideIndices: emptyLeadOverrideIndices(),
      leadOverrideValues: emptyLeadOverrideValues(),
    };
  }
  const sparseOverrides = sparseParamOverridesFromDiff(
    exactLeadParams,
    reconstructedParams,
    KESSHO_PRODUCT_LEAD_PARAM_COUNT,
    LEAD_PATCH_EPSILON,
  );
  return {
    leadOverrideCount: sparseOverrides.overrideCount,
    leadOverrideIndices: sparseOverrides.overrideIndices,
    leadOverrideValues: sparseOverrides.overrideValues,
  };
}
