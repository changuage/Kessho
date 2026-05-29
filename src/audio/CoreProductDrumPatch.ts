import {
  KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS,
  KESSHO_PRODUCT_DRUM_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_PARAM_SPECS,
  KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES,
  KESSHO_PRODUCT_DRUM_VOICES,
  KESSHO_PRODUCT_DRUM_VOICE_PRESETS,
} from './generated/kesshoProductSchema';
import { generatedProductParamIndex } from './CoreProductGeneratedParamMetadata';
import { drumVoiceMorphsFromState, drumVoicePresetIdsFromState } from './CoreProductPresetIds';
import { emptyParamArray, paramsMatch, sparseParamOverridesFromDiff } from './CoreProductSparseOverrides';
import { clamp, coreProductParamValue, numberFromState } from './coreProductSnapshotState';

const DRUM_PARAM_MASTER_LEVEL = generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumLevel');
const DRUM_PARAM_REVERB_SEND = generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, 'drumReverbSend');
const DRUM_PATCH_EPSILON = 0.000001;

type DrumVoicePreset = (typeof KESSHO_PRODUCT_DRUM_VOICE_PRESETS)[number];
type DrumVoice = (typeof KESSHO_PRODUCT_DRUM_VOICES)[number];
type DrumVoicePresetPair = {
  voice: DrumVoice;
  presetA: DrumVoicePreset;
  presetB: DrumVoicePreset;
};

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function drumParamUsesPresetSnap(paramIndex: number): boolean {
  return KESSHO_PRODUCT_DRUM_PRESET_SNAP_PARAM_INDICES.some((snapParamIndex) => snapParamIndex === paramIndex);
}

function findDrumVoicePreset(voiceIndex: number, presetId: number): DrumVoicePreset | undefined {
  for (const preset of KESSHO_PRODUCT_DRUM_VOICE_PRESETS) {
    if (preset.voiceIndex !== voiceIndex) continue;
    if (preset.id === presetId) return preset;
  }
  return undefined;
}

function generatedDrumVoicePresetPairs(
  presetAIds: readonly number[],
  presetBIds: readonly number[],
): DrumVoicePresetPair[] | undefined {
  const pairs: DrumVoicePresetPair[] = [];
  for (const voice of KESSHO_PRODUCT_DRUM_VOICES) {
    const voiceIndex = voice.index;
    const presetA = findDrumVoicePreset(voiceIndex, presetAIds[voiceIndex] ?? 0);
    const presetB = findDrumVoicePreset(voiceIndex, presetBIds[voiceIndex] ?? 0);
    if (!presetA || !presetB) return undefined;
    pairs.push({ voice, presetA, presetB });
  }
  return pairs;
}

function emptyDrumParams(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_DRUM_PARAM_COUNT);
}

export function emptyDrumOverrideIndices(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_DRUM_PARAM_COUNT);
}

export function emptyDrumOverrideValues(): number[] {
  return emptyParamArray(KESSHO_PRODUCT_DRUM_PARAM_COUNT);
}

function exactDrumParamsFromState(
  state?: Record<string, unknown>,
  reconstructedParams?: readonly number[],
): number[] {
  // SNAPSHOT_AUTHORITY: PRODUCT_CORE_DRUM_OVERRIDE_BRIDGE - generated Drum params are computed only to derive bounded sparse Drum overrides for generated voice-preset snapshots.
  // PATCH_BRIDGE_RETIREMENT: exact Drum params remain in the snapshot shape only for legacy compatibility while generated Drum IDs, morphs, source fields, and sparse overrides own new snapshots; invalid voice IDs emit no exact or sparse web fallback payload.
  const params = reconstructedParams
    ? Array.from(reconstructedParams)
    : reconstructedDrumParamsFromPresetIds(
      drumVoicePresetIdsFromState(state, 'a'),
      drumVoicePresetIdsFromState(state, 'b'),
      drumVoiceMorphsFromState(state),
      numberFromState(state, 'drumLevel', 0.8),
      numberFromState(state, 'drumReverbSend', 0.1),
    );
  for (const spec of KESSHO_PRODUCT_DRUM_PARAM_SPECS) {
    if (!state || !Object.prototype.hasOwnProperty.call(state, spec.key)) continue;
    params[spec.index] = coreProductParamValue(state[spec.key], spec.enumMap, params[spec.index] ?? spec.fallback);
  }
  params[DRUM_PARAM_MASTER_LEVEL] = clamp(numberFromState(state, 'drumLevel', 0.8), 0, 1.5);
  params[DRUM_PARAM_REVERB_SEND] = clamp(numberFromState(state, 'drumReverbSend', 0.1), 0, 1);
  return params;
}

function reconstructedDrumParamsFromPresetIds(
  presetAIds: readonly number[],
  presetBIds: readonly number[],
  morphs: readonly number[],
  masterLevel = 0.8,
  reverbSend = 0.1,
): number[] {
  const pairs = generatedDrumVoicePresetPairs(presetAIds, presetBIds);
  if (!pairs) return emptyDrumParams();
  return reconstructedDrumParamsFromPresetPairs(pairs, morphs, masterLevel, reverbSend);
}

function reconstructedDrumParamsFromPresetPairs(
  pairs: readonly DrumVoicePresetPair[],
  morphs: readonly number[],
  masterLevel = 0.8,
  reverbSend = 0.1,
): number[] {
  const params: number[] = Array.from(
    { length: KESSHO_PRODUCT_DRUM_PARAM_COUNT },
    (_, index) => KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS[index] ?? 0,
  );

  for (const { voice, presetA, presetB } of pairs) {
    const voiceIndex = voice.index;
    const morph = clamp(morphs[voiceIndex] ?? 0, 0, 1);
    const smooth = smoothstep01(morph);
    const end = Math.min(voice.paramStart + voice.paramCount, KESSHO_PRODUCT_DRUM_PARAM_COUNT);
    for (let paramIndex = voice.paramStart; paramIndex < end; paramIndex += 1) {
      const a = presetA.params[paramIndex] ?? params[paramIndex] ?? 0;
      const b = presetB.params[paramIndex] ?? params[paramIndex] ?? 0;
      params[paramIndex] = drumParamUsesPresetSnap(paramIndex)
        ? (morph < 0.5 ? a : b)
        : a + (b - a) * smooth;
    }
  }

  params[DRUM_PARAM_MASTER_LEVEL] = clamp(masterLevel, 0, 1.5);
  params[DRUM_PARAM_REVERB_SEND] = clamp(reverbSend, 0, 1);
  return params;
}

function defaultDrumStateCacheParams(state: Record<string, unknown> | undefined): number[] {
  // Full UI snapshots may carry default slider-cache values after voice selectors change;
  // those cached controls are not Product Core overrides when generated voice presets reconstruct.
  return reconstructedDrumParamsFromPresetIds(
    drumVoicePresetIdsFromState(undefined, 'a'),
    drumVoicePresetIdsFromState(undefined, 'b'),
    drumVoiceMorphsFromState(undefined),
    numberFromState(state, 'drumLevel', 0.8),
    numberFromState(state, 'drumReverbSend', 0.1),
  );
}

export function exactDrumPatchFromState(state: Record<string, unknown> | undefined): {
  drumOverrideCount: number;
  drumOverrideIndices: number[];
  drumOverrideValues: number[];
} {
  const presetAIds = drumVoicePresetIdsFromState(state, 'a');
  const presetBIds = drumVoicePresetIdsFromState(state, 'b');
  const presetPairs = generatedDrumVoicePresetPairs(presetAIds, presetBIds);
  if (!presetPairs) {
    return {
      drumOverrideCount: 0,
      drumOverrideIndices: emptyDrumOverrideIndices(),
      drumOverrideValues: emptyDrumOverrideValues(),
    };
  }
  const reconstructedParams = reconstructedDrumParamsFromPresetPairs(
    presetPairs,
    drumVoiceMorphsFromState(state),
    numberFromState(state, 'drumLevel', 0.8),
    numberFromState(state, 'drumReverbSend', 0.1),
  );
  const exactDrumParams = exactDrumParamsFromState(state, reconstructedParams);
  if (
    paramsMatch(exactDrumParams, reconstructedParams, KESSHO_PRODUCT_DRUM_PARAM_COUNT, DRUM_PATCH_EPSILON) ||
    paramsMatch(exactDrumParams, defaultDrumStateCacheParams(state), KESSHO_PRODUCT_DRUM_PARAM_COUNT, DRUM_PATCH_EPSILON)
  ) {
    return {
      drumOverrideCount: 0,
      drumOverrideIndices: emptyDrumOverrideIndices(),
      drumOverrideValues: emptyDrumOverrideValues(),
    };
  }
  const sparseOverrides = sparseParamOverridesFromDiff(
    exactDrumParams,
    reconstructedParams,
    KESSHO_PRODUCT_DRUM_PARAM_COUNT,
    DRUM_PATCH_EPSILON,
  );
  return {
    drumOverrideCount: sparseOverrides.overrideCount,
    drumOverrideIndices: sparseOverrides.overrideIndices,
    drumOverrideValues: sparseOverrides.overrideValues,
  };
}
