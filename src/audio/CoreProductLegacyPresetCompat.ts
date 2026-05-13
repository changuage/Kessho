import {
  KESSHO_PRODUCT_PAD_OUTPUT_TRIM,
  KESSHO_PRODUCT_PAD_PARAM_COUNT,
  KESSHO_PRODUCT_PAD_PARAM_SPECS,
  KESSHO_PRODUCT_LEAD_PARAM_COUNT,
  KESSHO_PRODUCT_LEAD_PARAM_SPECS,
  KESSHO_PRODUCT_DRUM_PARAM_COUNT,
  KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS,
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_DRUM_VOICES,
  KESSHO_PRODUCT_DRUM_VOICE_PRESETS,
  KESSHO_PRODUCT_SOURCE_PRESETS,
} from './generated/kesshoProductSchema';
import { DEFAULT_GAMELAN, DEFAULT_SOFT_RHODES, morphPresets } from './lead4opfm';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { delayNoteToSeconds } from './delayBuses';

// SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE - legacy UI/preset conversions are isolated here for retirement.

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function delayDivisionMs(state: Record<string, unknown> | undefined, key: string, fallback: string, bpm: number): number {
  return delayNoteToSeconds(stringFromState(state, key, fallback), bpm) * 1000;
}

export function delayAFilterTypeId(value: unknown): number {
  if (value === 'highpass') return 1;
  if (value === 'bandpass') return 2;
  return 0;
}

export function delayBPatternId(value: unknown): number {
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

export function delayBWarpId(value: unknown): number {
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

export function reverbTypeId(value: unknown): number {
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

export function reverbQualityId(value: unknown): number {
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

export function reverbModCharacterId(value: unknown): number {
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

export function reverbSaturationModeId(value: unknown): number {
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

export function dynamicsCharacterModeId(value: unknown): number {
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

export function dynamicsSaturationModeId(value: unknown): number {
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

export function sidechainKeyId(value: unknown): number {
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

export function granularShapeId(value: unknown): number {
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

export function granularVoiceModeId(value: unknown): number {
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

export function granularLegacyPitchModeId(value: unknown): number {
  return value === 'random' ? 0 : 1;
}

export function normalizePresetKey(key: unknown, fallbackKey: string): string {
  const text = String(key ?? fallbackKey).trim();
  if (!text) return fallbackKey;
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

// SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID - maps old app keys to generated Product Core preset IDs.
export function sourcePresetId(sourceFamily: string, key: unknown, fallbackKey = 'default'): number {
  const normalized = normalizePresetKey(key, fallbackKey);
  const fallback = normalizePresetKey(fallbackKey, fallbackKey);
  return (
    KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === normalized)?.id ??
    KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === fallback)?.id ??
    0
  );
}

export function endpointPresetId(
  sourceFamily: 'pad' | 'lead',
  morph: number,
  keyA: unknown,
  keyB: unknown,
  fallbackKey: string,
): number {
  return sourcePresetId(sourceFamily, clamp(morph, 0, 1) >= 0.5 ? keyB : keyA, fallbackKey);
}

export function defaultPresetId(sourceId: number): number {
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

export function padParamValue(value: unknown, enumMap: Readonly<Record<string, number>> | null, fallback: number): number {
  if (typeof value === 'string' && enumMap && Object.prototype.hasOwnProperty.call(enumMap, value)) {
    return enumMap[value] ?? fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function emptyPadParams(): number[] {
  return Array.from({ length: KESSHO_PRODUCT_PAD_PARAM_COUNT }, () => 0);
}

// SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE - temporary exact Pad bridge, not final source-patch ownership.
export function exactPadParamsFromState(state: Record<string, unknown> | undefined, padIndex: 0 | 1): number[] {
  // PATCH_BRIDGE_RETIREMENT: exact Pad params are a DEPRECATED_BRIDGE_FIELD until Product Core owns structured Pad preset overrides.
  const params = emptyPadParams();
  for (const spec of KESSHO_PRODUCT_PAD_PARAM_SPECS) {
    const key = padIndex === 0 ? spec.key : spec.pad2Key;
    params[spec.index] = padParamValue(state?.[key], spec.enumMap, spec.fallback);
  }
  params[52] = KESSHO_PRODUCT_PAD_OUTPUT_TRIM;
  return params;
}

export function leadPresetFromKey(key: unknown) {
  const normalized = normalizePresetKey(key, 'soft_rhodes');
  return normalized === 'gamelan' ? DEFAULT_GAMELAN : DEFAULT_SOFT_RHODES;
}

export function leadAlgorithmMode(value: unknown): 'snap' | 'presetA' {
  return value === 'presetA' ? 'presetA' : 'snap';
}

export function emptyLeadParams(): number[] {
  return Array.from({ length: KESSHO_PRODUCT_LEAD_PARAM_COUNT }, () => 0);
}

// SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE - temporary exact Lead bridge, not final source-patch ownership.
export function exactLeadParamsFromState(state: Record<string, unknown> | undefined, leadIndex: 0 | 1): number[] {
  // PATCH_BRIDGE_RETIREMENT: exact Lead params are a DEPRECATED_BRIDGE_FIELD until Product Core owns structured Lead preset overrides.
  const params = emptyLeadParams();
  const presetAKey = leadIndex === 0 ? state?.lead1PresetA : state?.lead2PresetC;
  const presetBKey = leadIndex === 0 ? state?.lead1PresetB : state?.lead2PresetD;
  const morph = clamp(numberFromState(state, leadIndex === 0 ? 'lead1Morph' : 'lead2Morph', 0), 0, 1);
  const algorithm = leadAlgorithmMode(state?.[leadIndex === 0 ? 'lead1AlgorithmMode' : 'lead2AlgorithmMode']);
  const morphed = morphPresets(leadPresetFromKey(presetAKey), leadPresetFromKey(presetBKey), morph, algorithm) as unknown as Record<string, unknown>;
  for (const spec of KESSHO_PRODUCT_LEAD_PARAM_SPECS) {
    params[spec.index] = padParamValue(morphed[spec.key], spec.enumMap, spec.fallback);
  }
  return params;
}

export function exactDrumParamsFromState(): number[] {
  // SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE - temporary exact Drum ABI filler; generated Drum voice IDs own the bridge.
  // PATCH_BRIDGE_RETIREMENT: exact Drum params stay zero/default here; Drum voice preset IDs and morphs are the canonical bridge.
  return Array.from({ length: KESSHO_PRODUCT_DRUM_PARAM_COUNT }, (_, index) => KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS[index] ?? 0);
}

export function drumVoicePresetId(voiceIndex: number, presetName: unknown): number {
  const voice = KESSHO_PRODUCT_DRUM_VOICES[voiceIndex];
  const name = typeof presetName === 'string' && presetName.length > 0 ? presetName : voice?.defaultPreset;
  const preset =
    KESSHO_PRODUCT_DRUM_VOICE_PRESETS.find((candidate) => candidate.voiceIndex === voiceIndex && candidate.name === name) ??
    KESSHO_PRODUCT_DRUM_VOICE_PRESETS.find((candidate) => candidate.voiceIndex === voiceIndex && candidate.defaultForVoice) ??
    KESSHO_PRODUCT_DRUM_VOICE_PRESETS.find((candidate) => candidate.voiceIndex === voiceIndex);
  return preset?.id ?? 0;
}

export function drumVoicePresetIdsFromState(state: Record<string, unknown> | undefined, endpoint: 'a' | 'b'): number[] {
  return Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, (_, voiceIndex) => {
    const voice = KESSHO_PRODUCT_DRUM_VOICES[voiceIndex];
    const key = endpoint === 'a' ? voice?.presetAKey : voice?.presetBKey;
    return drumVoicePresetId(voiceIndex, key ? state?.[key] : undefined);
  });
}

export function drumVoiceMorphsFromState(state: Record<string, unknown> | undefined): number[] {
  return Array.from({ length: KESSHO_PRODUCT_DRUM_VOICE_COUNT }, (_, voiceIndex) => {
    const voice = KESSHO_PRODUCT_DRUM_VOICES[voiceIndex];
    return clamp(numberFromState(state, voice?.morphKey ?? '', 0), 0, 1);
  });
}

export function waterPresetKeyFromState(state: Record<string, unknown> | undefined): string {
  const morph = clamp(numberFromState(state, 'waterMorph', 0), 0, 1);
  const presetA = numberFromState(state, 'waterMorphA', numberFromState(state, 'waterPreset', 0));
  const presetB = numberFromState(state, 'waterMorphB', numberFromState(state, 'waterPreset', presetA));
  return `water_${clamp(Math.round(morph < 0.5 ? presetA : presetB), 0, 7)}`;
}

export function soundscapePresetIdFromState(state: Record<string, unknown> | undefined): number {
  if (booleanFromState(state, 'oceanSampleEnabled', false)) return sourcePresetId('soundscape', 'ocean_sample', 'ocean_sample');
  if (booleanFromState(state, 'waterEnabled', false)) return sourcePresetId('soundscape', waterPresetKeyFromState(state), 'ocean_sample');
  if (booleanFromState(state, 'birds2Enabled', false)) return sourcePresetId('soundscape', 'birds2', 'ocean_sample');
  if (booleanFromState(state, 'birdsEnabled', false)) return sourcePresetId('soundscape', 'birds', 'ocean_sample');
  if (booleanFromState(state, 'frogsEnabled', false)) return sourcePresetId('soundscape', 'frogs', 'ocean_sample');
  if (booleanFromState(state, 'insects2Enabled', false)) return sourcePresetId('soundscape', 'insects2', 'ocean_sample');
  if (booleanFromState(state, 'insectsEnabled', false)) return sourcePresetId('soundscape', 'insects', 'ocean_sample');
  return sourcePresetId('soundscape', 'ocean_sample', 'ocean_sample');
}
