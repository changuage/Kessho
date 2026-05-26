import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function coreProductSynthLaneMacroDefaultsFromState(
  state: Record<string, unknown> | undefined,
  sourceId: number,
): { morph: number; distance: number } {
  const keyBySource: Record<number, readonly [string | null, string | null]> = {
    [CORE_PRODUCT_SOURCE_IDS.pad1]: ['padMorph', 'padDistance'],
    [CORE_PRODUCT_SOURCE_IDS.pad2]: ['pad2Morph', 'pad2Distance'],
    [CORE_PRODUCT_SOURCE_IDS.lead1]: ['lead1Morph', 'lead1Distance'],
    [CORE_PRODUCT_SOURCE_IDS.lead2]: ['lead2Morph', 'lead2Distance'],
    [CORE_PRODUCT_SOURCE_IDS.piano]: [null, 'pianoDistance'],
  };
  const [morphKey, distanceKey] = keyBySource[sourceId] ?? [null, null];
  return {
    morph: morphKey ? clamp(numberFromState(state, morphKey, 0), 0, 1) : 0,
    distance: distanceKey ? clamp(numberFromState(state, distanceKey, 0), 0, 1) : 0,
  };
}

const DRUM_VOICE_MACRO_KEYS = [
  ['drumSubMorph', 'drumSubDistance'],
  ['drumKickMorph', 'drumKickDistance'],
  ['drumClickMorph', 'drumClickDistance'],
  ['drumBeepHiMorph', 'drumBeepHiDistance'],
  ['drumBeepLoMorph', 'drumBeepLoDistance'],
  ['drumNoiseMorph', 'drumNoiseDistance'],
  ['drumMembraneMorph', 'drumMembraneDistance'],
] as const;

export function coreProductDrumLaneMacroDefaultsFromState(
  state: Record<string, unknown> | undefined,
  voiceIndices: readonly number[],
): { morph: number; distance: number } {
  const voiceIndex = clamp(Math.round(voiceIndices[0] ?? 1), 0, DRUM_VOICE_MACRO_KEYS.length - 1);
  const [morphKey, distanceKey] = DRUM_VOICE_MACRO_KEYS[voiceIndex] ?? DRUM_VOICE_MACRO_KEYS[1];
  return {
    morph: clamp(numberFromState(state, morphKey, 0), 0, 1),
    distance: clamp(numberFromState(state, distanceKey, 0.5), 0, 1),
  };
}
