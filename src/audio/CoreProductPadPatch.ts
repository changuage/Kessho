import {
  KESSHO_PRODUCT_PAD_OUTPUT_TRIM,
  KESSHO_PRODUCT_PAD_PARAM_COUNT,
  KESSHO_PRODUCT_PAD_PARAM_SPECS,
  KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES,
  KESSHO_PRODUCT_SOURCE_PRESETS,
} from './generated/kesshoProductSchema';
import { getPadPreset, morphPadPresets } from './padPresets';
import { clamp, coreProductParamValue, numberFromState } from './coreProductSnapshotState';
import { getVoiceDistanceKey } from './distanceMacro';
import { emptyParamArray, paramsMatch, sparseParamOverridesFromDiff } from './CoreProductSparseOverrides';

const PAD_PATCH_EPSILON = 0.000001;
const PAD_HARDNESS_PARAM_INDEX = 15;
const PAD_WARMTH_PARAM_INDEX = 16;
const PAD_PRESENCE_PARAM_INDEX = 17;
const PAD_FILTER_CUTOFF_MIN_PARAM_INDEX = 21;
const PAD_FILTER_CUTOFF_MAX_PARAM_INDEX = 22;
const PAD_ATTACK_PARAM_INDEX = 33;
const PAD_DECAY_PARAM_INDEX = 34;
const PAD_SUSTAIN_PARAM_INDEX = 35;
const PAD_RELEASE_PARAM_INDEX = 36;
const DISTANCE_SLIGHT_POINT = 0.25;
const DISTANCE_STRENGTH = 2;
const ATTACK_DISTANCE_BASE_BOOST_SECONDS = 0.1;
const ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS = 0.005;

type SourcePreset = (typeof KESSHO_PRODUCT_SOURCE_PRESETS)[number];

function padParamUsesPresetSnap(paramIndex: number): boolean {
  return KESSHO_PRODUCT_PAD_PRESET_SNAP_PARAM_INDICES.some((snapParamIndex) => snapParamIndex === paramIndex);
}

function findGeneratedPadPreset(presetId: number): SourcePreset | undefined {
  return KESSHO_PRODUCT_SOURCE_PRESETS.find(
    (preset) =>
      preset.source === 'pad' &&
      preset.id === presetId &&
      preset.exactPadParamCount === KESSHO_PRODUCT_PAD_PARAM_COUNT,
  );
}

function canReconstructGeneratedPadParams(presetAId: number, presetBId: number): boolean {
  return Boolean(findGeneratedPadPreset(presetAId) && findGeneratedPadPreset(presetBId));
}

function generatedPadPresetId(key: string): number {
  return KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === 'pad' && preset.key === key)?.id ?? 0;
}

function scalePadDistance(distance: number): number {
  const safeDistance = clamp(distance, 0, 1);
  return DISTANCE_STRENGTH <= 1 ? safeDistance : 1 - Math.pow(1 - safeDistance, DISTANCE_STRENGTH);
}

function padDistanceAnchor(distance: number, startValue: number, slightValue: number, maxValue: number): number {
  const safeDistance = scalePadDistance(distance);
  if (safeDistance <= DISTANCE_SLIGHT_POINT) {
    return startValue + (safeDistance / DISTANCE_SLIGHT_POINT) * (slightValue - startValue);
  }
  const tailT = (safeDistance - DISTANCE_SLIGHT_POINT) / (1 - DISTANCE_SLIGHT_POINT);
  return slightValue + tailT * (maxValue - slightValue);
}

function padDistanceAdd(base: number, distance: number, slightDelta: number, maxDelta: number, min: number, max: number): number {
  return clamp(base + padDistanceAnchor(distance, 0, slightDelta, maxDelta), min, max);
}

function padDistanceMultiply(base: number, distance: number, slightMul: number, maxMul: number, min: number, max: number): number {
  return clamp(base * padDistanceAnchor(distance, 1, slightMul, maxMul), min, max);
}

function padDistanceAttack(base: number, distance: number, slightMul: number, maxMul: number): number {
  if (Math.abs(distance) <= 0.0001) return clamp(base, 0.001, 16);
  const effectiveBase = base <= ATTACK_DISTANCE_ZERO_THRESHOLD_SECONDS ? base + ATTACK_DISTANCE_BASE_BOOST_SECONDS : base;
  return padDistanceMultiply(effectiveBase, distance, slightMul, maxMul, 0.001, 16);
}

function applyPadDistanceParams(params: number[], distance: number): void {
  if (distance <= 0.0001) return;
  params[PAD_ATTACK_PARAM_INDEX] = padDistanceAttack(params[PAD_ATTACK_PARAM_INDEX] ?? 0, distance, 1.35, 4.0);
  params[PAD_DECAY_PARAM_INDEX] = padDistanceMultiply(params[PAD_DECAY_PARAM_INDEX] ?? 0, distance, 1.08, 1.35, 0.01, 8);
  params[PAD_SUSTAIN_PARAM_INDEX] = padDistanceAdd(params[PAD_SUSTAIN_PARAM_INDEX] ?? 0, distance, -0.03, -0.18, 0, 1);
  params[PAD_RELEASE_PARAM_INDEX] = padDistanceMultiply(params[PAD_RELEASE_PARAM_INDEX] ?? 0, distance, 1.18, 2.40, 0.01, 30);
  params[PAD_HARDNESS_PARAM_INDEX] = padDistanceAdd(params[PAD_HARDNESS_PARAM_INDEX] ?? 0, distance, -0.04, -0.22, 0, 2);
  params[PAD_WARMTH_PARAM_INDEX] = padDistanceAdd(params[PAD_WARMTH_PARAM_INDEX] ?? 0, distance, 0.04, 0.18, 0, 1);
  params[PAD_PRESENCE_PARAM_INDEX] = padDistanceAdd(params[PAD_PRESENCE_PARAM_INDEX] ?? 0, distance, -0.05, -0.30, 0, 1);
  params[PAD_FILTER_CUTOFF_MIN_PARAM_INDEX] = padDistanceMultiply(params[PAD_FILTER_CUTOFF_MIN_PARAM_INDEX] ?? 0, distance, 0.85, 0.45, 40, 8000);
  params[PAD_FILTER_CUTOFF_MAX_PARAM_INDEX] = padDistanceMultiply(params[PAD_FILTER_CUTOFF_MAX_PARAM_INDEX] ?? 0, distance, 0.92, 0.55, 40, 8000);
}

export function emptyPadParams(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_PAD_PARAM_COUNT);
}

export function emptyPadOverrideIndices(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_PAD_PARAM_COUNT);
}

export function emptyPadOverrideValues(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_PAD_PARAM_COUNT);
}

function morphedPadPresetParamsFromState(
  state: Record<string, unknown> | undefined,
  padIndex: 0 | 1,
): Record<string, number | string | boolean> {
  const scope = padIndex === 0 ? 'pad1' : 'pad2';
  const presetAKey = padIndex === 0 ? 'padPresetA' : 'pad2PresetA';
  const presetBKey = padIndex === 0 ? 'padPresetB' : 'pad2PresetB';
  const morphKey = padIndex === 0 ? 'padMorph' : 'pad2Morph';
  const presetA = getPadPreset(String(state?.[presetAKey] ?? 'init'), scope);
  const presetB = getPadPreset(String(state?.[presetBKey] ?? state?.[presetAKey] ?? 'init'), scope);
  if (!presetA || !presetB) return {};
  return morphPadPresets(presetA, presetB, numberFromState(state, morphKey, 0));
}

function exactPadParamsFromState(state: Record<string, unknown> | undefined, padIndex: 0 | 1): number[] {
  // SNAPSHOT_AUTHORITY: PRODUCT_CORE_PAD_OVERRIDE_BRIDGE - legacy Pad presets are read only to derive bounded sparse user overrides for reconstructable generated endpoints.
  // PATCH_BRIDGE_RETIREMENT: exact Pad params are intermediate diff inputs only; invalid/non-reconstructable endpoint IDs emit no exact web fallback arrays.
  const params = emptyPadParams();
  const morphedPresetParams = morphedPadPresetParamsFromState(state, padIndex);
  for (const spec of KESSHO_PRODUCT_PAD_PARAM_SPECS) {
    const key = padIndex === 0 ? spec.key : spec.pad2Key;
    params[spec.index] = coreProductParamValue(state?.[key] ?? morphedPresetParams[spec.key], spec.enumMap, spec.fallback);
  }
  applyPadDistanceParams(params, clamp(numberFromState(state, getVoiceDistanceKey(padIndex === 0 ? 'pad1' : 'pad2'), 0), 0, 1));
  params[52] = KESSHO_PRODUCT_PAD_OUTPUT_TRIM;
  return params;
}

function reconstructedPadParamsFromPresetIds(presetAId: number, presetBId: number, morph: number, distance = 0): number[] {
  const params = emptyPadParams();
  const presetA = findGeneratedPadPreset(presetAId);
  const presetB = findGeneratedPadPreset(presetBId);
  if (!presetA || !presetB) {
    params[52] = KESSHO_PRODUCT_PAD_OUTPUT_TRIM;
    return params;
  }

  const t = clamp(morph, 0, 1);
  for (let paramIndex = 0; paramIndex < KESSHO_PRODUCT_PAD_PARAM_COUNT; paramIndex += 1) {
    const a = presetA.exactPadParams[paramIndex] ?? 0;
    const b = presetB.exactPadParams[paramIndex] ?? 0;
    params[paramIndex] = padParamUsesPresetSnap(paramIndex) ? (t < 0.5 ? a : b) : a + (b - a) * t;
  }
  applyPadDistanceParams(params, distance);
  return params;
}

function defaultPadStateCacheParams(
  state: Record<string, unknown> | undefined,
  padIndex: 0 | 1,
): number[] {
  // Full UI snapshots may carry default slider-cache values after preset selectors change;
  // those cached controls are not Product Core overrides when generated presets reconstruct.
  const defaultPresetId = generatedPadPresetId('init');
  return reconstructedPadParamsFromPresetIds(
    defaultPresetId,
    defaultPresetId,
    0,
    clamp(numberFromState(state, getVoiceDistanceKey(padIndex === 0 ? 'pad1' : 'pad2'), 0), 0, 1),
  );
}

function matchesSelectedPadEndpointStateCacheParams(
  params: readonly number[],
  state: Record<string, unknown> | undefined,
  padIndex: 0 | 1,
  presetAId: number,
  presetBId: number,
): boolean {
  const distance = clamp(numberFromState(state, getVoiceDistanceKey(padIndex === 0 ? 'pad1' : 'pad2'), 0), 0, 1);
  const endpointIds = presetAId === presetBId ? [presetAId] : [presetAId, presetBId];
  for (const presetId of endpointIds) {
    const cacheParams = reconstructedPadParamsFromPresetIds(presetId, presetId, 0, distance);
    if (paramsMatch(params, cacheParams, KESSHO_PRODUCT_PAD_PARAM_COUNT, PAD_PATCH_EPSILON)) {
      return true;
    }
  }
  return false;
}

export function exactPadPatchFromState(
  state: Record<string, unknown> | undefined,
  padIndex: 0 | 1,
  presetAId: number,
  presetBId: number,
  morph: number,
): {
  exactPadParamCount: number;
  exactPadParams: number[];
  padOverrideCount: number;
  padOverrideIndices: number[];
  padOverrideValues: number[];
} {
  if (!canReconstructGeneratedPadParams(presetAId, presetBId)) {
    return {
      exactPadParamCount: 0,
      exactPadParams: emptyPadParams(),
      padOverrideCount: 0,
      padOverrideIndices: emptyPadOverrideIndices(),
      padOverrideValues: emptyPadOverrideValues(),
    };
  }
  const exactPadParams = exactPadParamsFromState(state, padIndex);
  const reconstructedParams = reconstructedPadParamsFromPresetIds(
    presetAId,
    presetBId,
    morph,
    clamp(numberFromState(state, getVoiceDistanceKey(padIndex === 0 ? 'pad1' : 'pad2'), 0), 0, 1),
  );
  if (paramsMatch(exactPadParams, reconstructedParams, KESSHO_PRODUCT_PAD_PARAM_COUNT, PAD_PATCH_EPSILON)) {
    return {
      exactPadParamCount: 0,
      exactPadParams: emptyPadParams(),
      padOverrideCount: 0,
      padOverrideIndices: emptyPadOverrideIndices(),
      padOverrideValues: emptyPadOverrideValues(),
    };
  }
  if (paramsMatch(exactPadParams, defaultPadStateCacheParams(state, padIndex), KESSHO_PRODUCT_PAD_PARAM_COUNT, PAD_PATCH_EPSILON)) {
    return {
      exactPadParamCount: 0,
      exactPadParams: emptyPadParams(),
      padOverrideCount: 0,
      padOverrideIndices: emptyPadOverrideIndices(),
      padOverrideValues: emptyPadOverrideValues(),
    };
  }
  if (matchesSelectedPadEndpointStateCacheParams(exactPadParams, state, padIndex, presetAId, presetBId)) {
    return {
      exactPadParamCount: 0,
      exactPadParams: emptyPadParams(),
      padOverrideCount: 0,
      padOverrideIndices: emptyPadOverrideIndices(),
      padOverrideValues: emptyPadOverrideValues(),
    };
  }
  const sparseOverrides = sparseParamOverridesFromDiff(
    exactPadParams,
    reconstructedParams,
    KESSHO_PRODUCT_PAD_PARAM_COUNT,
    PAD_PATCH_EPSILON,
  );
  return {
    exactPadParamCount: 0,
    exactPadParams: emptyPadParams(),
    padOverrideCount: sparseOverrides.overrideCount,
    padOverrideIndices: sparseOverrides.overrideIndices,
    padOverrideValues: sparseOverrides.overrideValues,
  };
}
