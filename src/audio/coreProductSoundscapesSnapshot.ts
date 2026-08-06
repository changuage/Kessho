import {
  KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_PARITY_FIXTURE_PARAM,
  KESSHO_PRODUCT_SOUNDSCAPE_PARITY_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_COUNT,
  KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_START,
  KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_STRIDE,
  KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_SLOT_COUNT,
} from './generated/kesshoProductSchema';
import { getUtcBucket, xmur3 } from './rng';
import { morphWaterPresets, type WaterPresetState } from './waterPresets';
import { NATURE_SLOT_KEYS } from './natureSlots';
import { natureSampleDefinition } from './natureSampleCatalog';

// SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION - soundscape module params and layer route slots.

export const SOUNDSCAPE_ROUTE_PARAM_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_LAYER_ROUTE_PARAM_COUNT;
export const SOUNDSCAPE_ROUTE_KEYS = [
  ['oceanReverbSend', 'oceanDelayASend', 'oceanDelayBSend', 'granularWavesSend', 'degradeWavesSend'],
  ['waterReverbSend', 'waterDelayASend', 'waterDelayBSend', 'granularWaterSend', 'degradeWaterSend'],
  ['insectsReverbSend', 'insDelayASend', 'insDelayBSend', 'granularInsectsSend', 'degradeInsectsSend'],
  ['natureReverbSend', 'natureDelayASend', 'natureDelayBSend', 'granularNatureSend', 'degradeNatureSend'],
] as const;
const SOUNDSCAPE_LAYER_ROUTE_STRIDE = SOUNDSCAPE_ROUTE_KEYS[0]?.length ?? 0;
export const SOUNDSCAPE_ROUTE_FALLBACKS = [
  [0.2, 0, 0, 0, 0],
  [0.3, 0, 0, 0, 0],
  [0.15, 0, 0, 0, 0],
  [0.18, 0, 0, 0, 0],
] as const;
export const SOUNDSCAPE_PARITY_FIXTURE_PARAM = KESSHO_PRODUCT_SOUNDSCAPE_PARITY_FIXTURE_PARAM;
export const SOUNDSCAPE_PARITY_PARAM_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_PARITY_PARAM_COUNT;
export const SOUNDSCAPE_TEXTURE_PARAM_START = KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_START;
export const SOUNDSCAPE_TEXTURE_PARAM_STRIDE = KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_STRIDE;
export const SOUNDSCAPE_TEXTURE_SLOT_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_SLOT_COUNT;
export const SOUNDSCAPE_TEXTURE_PARAM_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_TEXTURE_PARAM_COUNT;

const NATURE_FILTER_TYPE_VALUE = { lowpass: 0, bandpass: 1, highpass: 2, notch: 3 } as const;

const SOUNDSCAPES_MODULE_PARAM_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_MODULE_PARAM_COUNT;
export const SOUNDSCAPES_PRODUCT_PARAM_COUNT = KESSHO_PRODUCT_SOUNDSCAPE_PRODUCT_MODULE_PARAM_COUNT;
const SOUNDSCAPES_SEED_NO_CHANGE = -1;
const SOUNDSCAPES_PARAM_INDEX = {
  waterActive: 0,
  waterPreset: 1,
  waterParams: 2,
  waterLayerDetail: 16,
  waterLayerMix: 23,
  waterLayerDensity: 29,
  waterDensityLoop: 35,
  waterSurf: 42,
  waterChannels: 58,
  waterSeed: 60,
  insectsActive: 61,
  insectsEngine: 62,
  insectsParams: 63,
  insectsSeed: 77,
  insects2Active: 78,
  insects2Engine: 79,
  insects2Params: 80,
  insects2Seed: 94,
  outputSelect: 95,
} as const;
const SOUNDSCAPES_PRODUCT_PARAM_INDEX = {
  waterLevel: SOUNDSCAPES_MODULE_PARAM_COUNT,
  insectsLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 1,
  insects2Level: SOUNDSCAPES_MODULE_PARAM_COUNT + 2,
  insectsSharedLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 3,
  earthLevel: SOUNDSCAPES_MODULE_PARAM_COUNT + 4,
  waterMasterEnabled: SOUNDSCAPES_MODULE_PARAM_COUNT + 5,
  insectsMasterEnabled: SOUNDSCAPES_MODULE_PARAM_COUNT + 6,
  natureMasterEnabled: SOUNDSCAPES_MODULE_PARAM_COUNT + 7,
} as const;

function numberFromState(state: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = state?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanFromState(state: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = state?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteNumber(value, fallback), min, max);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function earthTextureSeed(layer: string, state: Record<string, unknown> | undefined): number {
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  const seedValue = state?.seed;
  const seed = Number.isFinite(Number(seedValue)) ? Math.trunc(Number(seedValue)) : 42;
  return xmur3(`${getUtcBucket(seedWindow)}|${seed}|earth-texture|${layer}`)();
}

export function writeSoundscapeTextureParamsFromState(
  params: number[],
  state: Record<string, unknown> | undefined,
): void {
  const config = { fadeTime: 5 };
  const natureLevel = boundedNumber(state?.natureLevel, 1, 0, 1);
  const soundscapeParityFixture = state?.soundscapeParityFixture === true;
  for (let slot = 0; slot < NATURE_SLOT_KEYS.length; slot += 1) {
    const keys = NATURE_SLOT_KEYS[slot]!;
    const sample = natureSampleDefinition(state?.[keys.sampleIdKey], keys.slot);
    const offset = SOUNDSCAPE_TEXTURE_PARAM_START + slot * SOUNDSCAPE_TEXTURE_PARAM_STRIDE;
    const seed = earthTextureSeed(`nature-${keys.slot}`, state);
    params[offset] = boundedNumber(state?.[keys.sliceDurationKey], sample.defaultSliceDuration, 1.5, Math.max(1.5, sample.durationSeconds));
    params[offset + 1] = boundedNumber(state?.[keys.sliceDensityKey], sample.defaultSliceDensity, 0, 1);
    params[offset + 2] = soundscapeParityFixture === true ? 0 : config.fadeTime;
    params[offset + 3] = seed & 0xffff;
    params[offset + 4] = seed >>> 16;
    params[offset + 5] = sample.assetId;
    params[offset + 6] = booleanFromState(state, keys.enabledKey, false) ? 1 : 0;
    params[offset + 7] = boundedNumber(state?.[keys.levelKey], 0.5, 0, 1) * natureLevel;
    const filterType = state?.[keys.filterTypeKey];
    params[offset + 8] = NATURE_FILTER_TYPE_VALUE[filterType === 'bandpass' || filterType === 'highpass' || filterType === 'notch' ? filterType : 'lowpass'];
    params[offset + 9] = boundedNumber(state?.[keys.filterCutoffKey], sample.defaultFilterCutoff, 40, 20000);
    params[offset + 10] = boundedNumber(state?.[keys.filterResonanceKey], sample.defaultFilterResonance, 0, 1);
  }
}

function resolveWaterState(state: Record<string, unknown> | undefined): WaterPresetState {
  const presetA = boundedInteger(state?.waterMorphA ?? state?.waterPreset, 0, 0, 7);
  const presetB = boundedInteger(state?.waterMorphB ?? state?.waterPreset, presetA, 0, 7);
  const morph = boundedNumber(state?.waterMorph, 0, 0, 1);
  const morphed = morphWaterPresets(presetA, presetB, morph);
  const resolved = { ...morphed };
  for (const key of Object.keys(morphed) as Array<keyof WaterPresetState>) {
    if (typeof state?.[key] === 'number') {
      resolved[key] = Number(state[key]);
    }
  }
  return resolved;
}

function earthLayerActive(
  state: Record<string, unknown> | undefined,
  enabledKey: string,
  levelKey: string,
  fallbackLevel: number,
): boolean {
  return booleanFromState(state, enabledKey, false) && numberFromState(state, levelKey, fallbackLevel) > 0.0001;
}

export function exactSoundscapesModuleParamsFromState(state: Record<string, unknown> | undefined): number[] {
  const params = Array.from({ length: SOUNDSCAPES_PRODUCT_PARAM_COUNT }, () => 0);
  const water = resolveWaterState(state);
  const waterActive = numberFromState(state, 'waterLevel', 0.8) > 0.0001 && [
    water.waterLayerHardDrops, water.waterLayerWaterDrops, water.waterLayerTurbulence,
    water.waterLayerBubbling, water.waterLayerSurf, water.waterLayerChannels,
  ].some((value) => finiteNumber(value, 0) > 0.0001);
  const insectsMasterEnabled = booleanFromState(state, 'insectsMasterEnabled',
    booleanFromState(state, 'insectsEnabled', false) || booleanFromState(state, 'insects2Enabled', false));
  const insectsActive = earthLayerActive(state, 'insectsEnabled', 'insectsLevel', 0.7);
  const insects2Active = earthLayerActive(state, 'insects2Enabled', 'insects2Level', 0.5);
  const deterministicSeeds = booleanFromState(state, 'soundscapeParityFixture', false);

  params[SOUNDSCAPES_PARAM_INDEX.waterActive] = waterActive ? 1 : 0;
  params[SOUNDSCAPES_PARAM_INDEX.waterPreset] = boundedInteger(
    state?.waterMorph !== undefined
      ? (boundedNumber(state.waterMorph, 0, 0, 1) < 0.5 ? state.waterMorphA : state.waterMorphB)
      : state?.waterPreset,
    0,
    0,
    7,
  );
  [
    water.waterIntensity,
    water.waterIntensity,
    water.waterDistance,
    water.waterDistance,
    water.waterHardDropBaseFreq ?? water.waterBaseFreq,
    water.waterHardDropBaseFreq ?? water.waterBaseFreq,
    water.waterWaterDropBaseFreq ?? water.waterBaseFreq,
    water.waterWaterDropBaseFreq ?? water.waterBaseFreq,
    water.waterDropSize,
    water.waterDropSize,
    water.waterHardness,
    water.waterHardness,
    water.waterGlassThickness,
    water.waterGlassThickness,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterParams + index] = finiteNumber(value, 0.5);
  });
  [
    water.waterHardDropRate,
    water.waterHardDropLPF,
    water.waterHardDropTone,
    water.waterWaterDropRate,
    water.waterWaterDropLPF,
    water.waterBubblingRate,
    water.waterBubblingLPF,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerDetail + index] = finiteNumber(value, index % 3 === 1 ? 12000 : 1);
  });
  [
    water.waterLayerHardDrops,
    water.waterLayerWaterDrops,
    water.waterLayerTurbulence,
    water.waterLayerBubbling,
    water.waterLayerSurf,
    water.waterLayerChannels,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerMix + index] = finiteNumber(value, 0);
  });
  [0.5, 0.5, 0.5, 0.5, 1, 1].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterLayerDensity + index] = value;
  });
  [
    water.waterDensityHardSend,
    water.waterDensityWaterSend,
    water.waterDensityBubbleSend,
    water.waterDensityFeedback,
    water.waterDensityTone,
    water.waterDensityRing,
    water.waterDensityWet,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterDensityLoop + index] = finiteNumber(value, 0.5);
  });
  [
    water.waterSurfDuration,
    water.waterSurfDuration,
    water.waterSurfInterval,
    water.waterSurfInterval,
    water.waterSurfFoam,
    water.waterSurfFoam,
    water.waterSurfProximity,
    water.waterSurfProximity,
    water.waterSurfDepth,
    water.waterSurfDepth,
    water.waterSurfBody,
    water.waterSurfBody,
    water.waterSurfSpray,
    water.waterSurfSpray,
    water.waterSurfFoamBright,
    water.waterSurfFoamBright,
  ].forEach((value, index) => {
    params[SOUNDSCAPES_PARAM_INDEX.waterSurf + index] = finiteNumber(value, 0.5);
  });
  params[SOUNDSCAPES_PARAM_INDEX.waterChannels] = finiteNumber(water.waterChannelsMorph, 0);
  params[SOUNDSCAPES_PARAM_INDEX.waterChannels + 1] = finiteNumber(water.waterChannelsSpeed, 0.5);
  params[SOUNDSCAPES_PARAM_INDEX.waterSeed] = deterministicSeeds ? 12345 : SOUNDSCAPES_SEED_NO_CHANGE;

  const writeInsectsParams = (
    activeIndex: number,
    engineIndex: number,
    paramsIndex: number,
    seedIndex: number,
    prefix: 'insects' | 'insects2',
    active: boolean,
    fallbackEngine: number,
  ) => {
    params[activeIndex] = active ? 1 : 0;
    params[engineIndex] = boundedInteger(state?.[`${prefix}Engine`], fallbackEngine, 0, 6);
    [
      state?.[`${prefix}Density`],
      state?.[`${prefix}Density`],
      state?.[`${prefix}Temperature`],
      state?.[`${prefix}Temperature`],
      state?.[`${prefix}Distance`],
      state?.[`${prefix}Distance`],
      state?.[`${prefix}Proximity`],
      state?.[`${prefix}Proximity`],
      state?.[`${prefix}Antiphony`],
      state?.[`${prefix}Antiphony`],
      state?.[`${prefix}ClickRate`],
      state?.[`${prefix}ClickRate`],
      state?.[`${prefix}Motion`],
      state?.[`${prefix}Motion`],
    ].forEach((value, index) => {
      params[paramsIndex + index] = finiteNumber(value, index >= 4 && index <= 5 ? 0.3 : 0.5);
    });
    params[seedIndex] = deterministicSeeds
      ? (prefix === 'insects2' ? 67890 : 12345)
      : SOUNDSCAPES_SEED_NO_CHANGE;
  };

  writeInsectsParams(
    SOUNDSCAPES_PARAM_INDEX.insectsActive,
    SOUNDSCAPES_PARAM_INDEX.insectsEngine,
    SOUNDSCAPES_PARAM_INDEX.insectsParams,
    SOUNDSCAPES_PARAM_INDEX.insectsSeed,
    'insects',
    insectsActive,
    0,
  );
  writeInsectsParams(
    SOUNDSCAPES_PARAM_INDEX.insects2Active,
    SOUNDSCAPES_PARAM_INDEX.insects2Engine,
    SOUNDSCAPES_PARAM_INDEX.insects2Params,
    SOUNDSCAPES_PARAM_INDEX.insects2Seed,
    'insects2',
    insects2Active,
    1,
  );

  const activeCount = [waterActive, insectsActive, insects2Active].filter(Boolean).length;
  params[SOUNDSCAPES_PARAM_INDEX.outputSelect] = activeCount > 1
    ? 3
    : insects2Active
      ? 2
      : insectsActive
        ? 1
        : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.waterLevel] = waterActive ? numberFromState(state, 'waterLevel', 0.8) : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insectsLevel] = numberFromState(state, 'insectsLevel', 0.7);
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insects2Level] = numberFromState(state, 'insects2Level', 0.5);
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insectsSharedLevel] = numberFromState(state, 'insectsSharedLevel', 1);
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.earthLevel] = numberFromState(state, 'earthLevel', 1);
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.waterMasterEnabled] = booleanFromState(state, 'waterEnabled', false) ? 1 : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.insectsMasterEnabled] = insectsMasterEnabled ? 1 : 0;
  params[SOUNDSCAPES_PRODUCT_PARAM_INDEX.natureMasterEnabled] = booleanFromState(state, 'natureMasterEnabled', false) ? 1 : 0;
  return params;
}

export type SoundscapeSnapshotPayload = {
  enabled: boolean;
  routePeaks: number[];
  parityFixture: boolean;
  textureParamCount: number;
  textureParams: number[];
  moduleParamCount: number;
  moduleParams: number[];
};

export function soundscapeSnapshotPayloadFromState(state: Record<string, unknown> | undefined): SoundscapeSnapshotPayload {
  const waterActive = booleanFromState(state, 'waterEnabled', false);
  const insectsActive = booleanFromState(state, 'insectsMasterEnabled',
    booleanFromState(state, 'insectsEnabled', false) || booleanFromState(state, 'insects2Enabled', false)) &&
    (booleanFromState(state, 'insectsEnabled', false) || booleanFromState(state, 'insects2Enabled', false));
  const natureActive = booleanFromState(state, 'natureMasterEnabled', false) && NATURE_SLOT_KEYS.some((keys) =>
    booleanFromState(state, keys.enabledKey, false));
  const parityFixture = booleanFromState(state, 'soundscapeParityFixture', false);
  const textureParams = Array.from({ length: SOUNDSCAPE_TEXTURE_PARAM_COUNT }, () => 0);
  const moduleParams = exactSoundscapesModuleParamsFromState(state).slice(0, SOUNDSCAPES_PRODUCT_PARAM_COUNT);
  const layerActive = [false, waterActive, insectsActive, natureActive];
  const routePeaks = [0, 0, 0, 0, 0];

  if (parityFixture) textureParams[SOUNDSCAPE_PARITY_FIXTURE_PARAM] = 1;
  writeSoundscapeTextureParamsFromState(textureParams, state);
  for (let layer = 0; layer < SOUNDSCAPE_ROUTE_KEYS.length; layer += 1) {
    const routeKeys = SOUNDSCAPE_ROUTE_KEYS[layer] ?? SOUNDSCAPE_ROUTE_KEYS[0];
    const routeFallbacks = SOUNDSCAPE_ROUTE_FALLBACKS[layer] ?? SOUNDSCAPE_ROUTE_FALLBACKS[0];
    for (let route = 0; route < routeKeys.length; route += 1) {
      const key = routeKeys[route] ?? 'oceanReverbSend';
      const value = layerActive[layer] === true
        ? clamp(numberFromState(state, key, routeFallbacks[route] ?? 0), 0, 2)
        : 0;
      textureParams[layer * SOUNDSCAPE_LAYER_ROUTE_STRIDE + route] = value;
      routePeaks[route] = Math.max(routePeaks[route] ?? 0, value);
    }
  }

  return {
    // The shared source stays alive as a lightweight container. Individual Earth
    // families own their 5 s lifecycle gates, avoiding a final-source hard stop.
    enabled: true,
    routePeaks,
    parityFixture,
    textureParamCount: SOUNDSCAPE_TEXTURE_PARAM_COUNT,
    textureParams,
    moduleParamCount: SOUNDSCAPES_PRODUCT_PARAM_COUNT,
    moduleParams,
  };
}
