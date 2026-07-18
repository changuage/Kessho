export const PRODUCT_SOURCE_MORPH_AUTOMATION_COUNT = 11;

export const PRODUCT_MORPH_MODE_IDS = Object.freeze({
  linear: 0,
  pingpong: 1,
  random: 2,
} as const);

export type ProductSourceMorphAutomationConfig = {
  enabled: boolean;
  mode: number;
  phrasesPerCycle: number;
  seed: number;
};

const TARGETS = [
  ['padMorphAuto', 'padMorphSpeed', null],
  ['pad2MorphAuto', 'pad2MorphSpeed', null],
  ['lead1MorphAuto', 'lead1MorphSpeed', 'lead1MorphMode'],
  ['lead2MorphAuto', 'lead2MorphSpeed', 'lead2MorphMode'],
  ['drumSubMorphAuto', 'drumSubMorphSpeed', 'drumSubMorphMode'],
  ['drumKickMorphAuto', 'drumKickMorphSpeed', 'drumKickMorphMode'],
  ['drumClickMorphAuto', 'drumClickMorphSpeed', 'drumClickMorphMode'],
  ['drumBeepHiMorphAuto', 'drumBeepHiMorphSpeed', 'drumBeepHiMorphMode'],
  ['drumBeepLoMorphAuto', 'drumBeepLoMorphSpeed', 'drumBeepLoMorphMode'],
  ['drumNoiseMorphAuto', 'drumNoiseMorphSpeed', 'drumNoiseMorphMode'],
  ['drumMembraneMorphAuto', 'drumMembraneMorphSpeed', 'drumMembraneMorphMode'],
] as const;

function hashU32(value: number): number {
  let hashed = value >>> 0;
  hashed = Math.imul(hashed ^ (hashed >>> 16), 0x7feb352d);
  hashed = Math.imul(hashed ^ (hashed >>> 15), 0x846ca68b);
  hashed = (hashed ^ (hashed >>> 16)) >>> 0;
  return hashed || 1;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function modeId(value: unknown): number {
  return value === 'linear'
    ? PRODUCT_MORPH_MODE_IDS.linear
    : value === 'random'
      ? PRODUCT_MORPH_MODE_IDS.random
      : PRODUCT_MORPH_MODE_IDS.pingpong;
}

export function compileProductSourceMorphAutomation(
  state: Record<string, unknown> | undefined,
  seed: number,
): ProductSourceMorphAutomationConfig[] {
  return TARGETS.map(([enabledKey, speedKey, modeKey], targetId) => ({
    enabled: state?.[enabledKey] === true,
    mode: modeKey === null ? PRODUCT_MORPH_MODE_IDS.pingpong : modeId(state?.[modeKey]),
    phrasesPerCycle: Math.max(1, Math.min(4096, finiteNumber(state?.[speedKey], 8))),
    seed: hashU32((seed >>> 0) ^ Math.imul(targetId + 1, 0x9e3779b9)),
  }));
}
