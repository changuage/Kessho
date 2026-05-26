import {
  KESSHO_PRODUCT_DRUM_VOICE_COUNT,
  KESSHO_PRODUCT_DRUM_VOICES,
  KESSHO_PRODUCT_DRUM_VOICE_PRESETS,
  KESSHO_PRODUCT_SOURCE_PRESETS,
} from './generated/kesshoProductSchema';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';

// SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID - maps old app keys into canonical generated Product Core preset IDs only.
export function normalizePresetKey(key: unknown, fallbackKey: string): string {
  const text = String(key ?? fallbackKey).trim();
  if (!text) return fallbackKey;
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function presetKeyIsExplicit(key: unknown): boolean {
  return typeof key === 'string' ? key.trim().length > 0 : key != null;
}

export function sourcePresetId(sourceFamily: string, key: unknown, fallbackKey = 'default'): number {
  const lookupKey = presetKeyIsExplicit(key) ? key : fallbackKey;
  const normalized = normalizePresetKey(lookupKey, '');
  if (!normalized) return 0;
  return KESSHO_PRODUCT_SOURCE_PRESETS.find((preset) => preset.source === sourceFamily && preset.key === normalized)?.id ?? 0;
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

export function drumVoicePresetId(voiceIndex: number, presetName: unknown): number {
  const voice = KESSHO_PRODUCT_DRUM_VOICES[voiceIndex];
  if (!voice) return 0;
  const name = presetKeyIsExplicit(presetName) ? String(presetName) : voice.defaultPreset;
  return KESSHO_PRODUCT_DRUM_VOICE_PRESETS.find((candidate) => candidate.voiceIndex === voiceIndex && candidate.name === name)?.id ?? 0;
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
