/**
 * Water Preset System
 *
 * Defines preset data and morph interpolation for the water/soundscapes engine.
 * Used by both App.tsx (for state management) and EarthPage (for UI).
 */

import type { PresetLibrary } from '../presets/types';

export const WATER_PRESETS = ['Tap Drips', 'Stream', 'Waterfall', 'Rain Window', 'Ocean Surf', 'Storm Coast', 'Mountain Brook', 'Wind & Mist'] as const;

export const LAYER_KEYS = ['hardDrops', 'waterDrops', 'bubbling', 'turbulence', 'channels', 'surf'] as const;
export type LayerKey = typeof LAYER_KEYS[number];

export interface WaterPresetState {
  waterBaseFreq: number;
  waterIntensity: number;
  waterDistance: number;
  waterDropSize: number;
  waterHardness: number;
  waterGlassThickness: number;
  waterLayerHardDrops: number;
  waterLayerWaterDrops: number;
  waterLayerTurbulence: number;
  waterLayerBubbling: number;
  waterLayerSurf: number;
  waterLayerChannels: number;
  waterHardDropBaseFreq: number;
  waterHardDropRate: number;
  waterHardDropLPF: number;
  waterHardDropTone: number;
  waterWaterDropBaseFreq: number;
  waterWaterDropRate: number;
  waterWaterDropLPF: number;
  waterBubblingRate: number;
  waterBubblingLPF: number;
  waterSurfDuration: number;
  waterSurfInterval: number;
  waterSurfFoam: number;
  waterSurfFoamBright: number;
  waterSurfProximity: number;
  waterSurfDepth: number;
  waterSurfBody: number;
  waterSurfSpray: number;
  waterDensityHardSend: number;
  waterDensityWaterSend: number;
  waterDensityBubbleSend: number;
  waterDensityFeedback: number;
  waterDensityTone: number;
  waterDensityRing: number;
  waterDensityWet: number;
  waterChannelsMorph: number;
  waterChannelsSpeed: number;
}

export const LAYER_LABELS: Record<LayerKey, string> = {
  hardDrops: 'Hard Drops',
  waterDrops: 'Water Drops',
  bubbling: 'Bubbling',
  turbulence: 'Turbulence',
  channels: 'Channels',
  surf: 'Surf',
};

/** Map LayerKey → SliderState key for that layer level */
export const LAYER_TO_STATE_KEY: Record<LayerKey, keyof WaterPresetState> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  bubbling: 'waterLayerBubbling',
  turbulence: 'waterLayerTurbulence',
  channels: 'waterLayerChannels',
  surf: 'waterLayerSurf',
};

// Preset base frequencies (matches C++ WATER_PRESETS)
const PRESET_BASE_FREQ: Record<number, number> = {
  0: 2500, // tapDrips
  1: 2300, // stream
  2: 4500, // waterfall
  3: 2100, // rainWindow
  4: 2800, // oceanSurf
  5: 3500, // stormCoast
  6: 2000, // mountainBrook
  7: 1800, // windMist
};

// Preset layer mixes (matches JS WATER_PRESETS exactly)
const PRESET_LAYERS: Record<number, Record<LayerKey, number>> = {
  0: { hardDrops: 0.7, waterDrops: 0.5, bubbling: 0.0, turbulence: 0.3, channels: 0.0, surf: 0.0 },
  1: { hardDrops: 0.08, waterDrops: 0.82, bubbling: 0.92, turbulence: 0.56, channels: 0.0, surf: 0.0 },
  2: { hardDrops: 0.1, waterDrops: 0.3, bubbling: 0.4, turbulence: 0.4, channels: 0.0, surf: 1.0 },
  3: { hardDrops: 0.32, waterDrops: 0.42, bubbling: 0.0, turbulence: 0.18, channels: 0.92, surf: 0.0 },
  4: { hardDrops: 0.0, waterDrops: 0.0, bubbling: 0.0, turbulence: 0.0, channels: 0.0, surf: 1.0 },
  5: { hardDrops: 0.05, waterDrops: 0.15, bubbling: 0.2, turbulence: 0.5, channels: 0.7, surf: 1.0 },
  6: { hardDrops: 0.15, waterDrops: 0.6, bubbling: 0.7, turbulence: 0.3, channels: 0.85, surf: 0.25 },
  7: { hardDrops: 0.0, waterDrops: 0.0, bubbling: 0.0, turbulence: 0.15, channels: 1.0, surf: 0.15 },
};

const DENSITY_LOOP_DEFAULTS = {
  waterDensityHardSend: 0.28,
  waterDensityWaterSend: 0.46,
  waterDensityBubbleSend: 0.62,
  waterDensityFeedback: 0.74,
  waterDensityTone: 900,
  waterDensityRing: 1.0,
  waterDensityWet: 0.48,
} as const;

// Legacy global waterRate used to multiply all three discrete event layers together.
// We fold that preset-level energy into the per-layer rate defaults so there is only
// one event-rate control path in the UI and engine now.
const LEGACY_EVENT_RATE_SCALE: Record<number, number> = {
  0: 0.76,
  1: 1.0,
  2: 1.3,
  3: 0.88,
  4: 0.8,
  5: 1.3636,
  6: 0.9,
  7: 0.64,
};

function discreteLayerDefaults(preset: number) {
  const rateScale = LEGACY_EVENT_RATE_SCALE[preset] ?? 1.0;
  return {
    waterHardDropRate: rateScale,
    waterHardDropLPF: 12000,
    waterHardDropTone: 1.0,
    waterWaterDropRate: rateScale,
    waterWaterDropLPF: 16000,
    waterBubblingRate: rateScale,
    waterBubblingLPF: 1500,
  } as const;
}

// Preset water slider defaults (matches original JS WATER_PRESETS param values)
const PRESET_PARAMS: Record<number, {
  waterIntensity: number; waterDistance: number;
  waterDropSize: number; waterHardness: number; waterGlassThickness: number;
  waterHardDropRate: number; waterHardDropLPF: number; waterHardDropTone: number;
  waterWaterDropRate: number; waterWaterDropLPF: number;
  waterBubblingRate: number; waterBubblingLPF: number;
  waterSurfDuration: number; waterSurfInterval: number;
  waterSurfFoam: number; waterSurfFoamBright: number; waterSurfProximity: number; waterSurfDepth: number;
  waterSurfBody: number; waterSurfSpray: number;
  waterDensityHardSend: number; waterDensityWaterSend: number; waterDensityBubbleSend: number;
  waterDensityFeedback: number; waterDensityTone: number; waterDensityRing: number; waterDensityWet: number;
  waterChannelsMorph: number; waterChannelsSpeed: number;
}> = {
  // Tap Drips — no surf or channels
  0: {
    waterIntensity: 0.4, waterDistance: 0.2, waterDropSize: 0.7,  waterHardness: 0.8,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(0),
    waterSurfDuration: 8.0, waterSurfInterval: 9.5, waterSurfFoam: 0.35, waterSurfFoamBright: 0.3, waterSurfProximity: 0.15, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Stream — light channels in stream mode (gentle trickling)
  1: {
    waterIntensity: 0.7, waterDistance: 0.3, waterDropSize: 0.45, waterHardness: 0.2,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(1),
    waterSurfDuration: 8.0, waterSurfInterval: 9.5, waterSurfFoam: 0.2, waterSurfFoamBright: 0.25, waterSurfProximity: 0.22, waterSurfDepth: 0.3,
    waterSurfBody: 250, waterSurfSpray: 3500, waterChannelsMorph: 0.1, waterChannelsSpeed: 0.6,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Waterfall — full surf (matches the retired Wave Synth defaults)
  2: {
    waterIntensity: 1.0, waterDistance: 0.5, waterDropSize: 0.2,  waterHardness: 0.2,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(2),
    waterSurfDuration: 7.0, waterSurfInterval: 8.5, waterSurfFoam: 0.35, waterSurfFoamBright: 0.4, waterSurfProximity: 0.75, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Rain Window — channels in wind mode (wind-driven rain)
  3: {
    waterIntensity: 0.5, waterDistance: 0.3, waterDropSize: 0.55, waterHardness: 0.58, waterGlassThickness: 0.7,
    ...discreteLayerDefaults(3),
    waterSurfDuration: 10.0, waterSurfInterval: 14.0, waterSurfFoam: 0.15, waterSurfFoamBright: 0.3, waterSurfProximity: 0.2, waterSurfDepth: 0.3,
    waterSurfBody: 200, waterSurfSpray: 5000, waterChannelsMorph: 0.65, waterChannelsSpeed: 0.35,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Ocean Surf — closest Water-layer approximation of the retired Wave Synth
  4: {
    waterIntensity: 0.6, waterDistance: 0.4, waterDropSize: 0.3,  waterHardness: 0.3,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(4),
    waterSurfDuration: 7.0, waterSurfInterval: 8.5, waterSurfFoam: 0.35, waterSurfFoamBright: 0.4, waterSurfProximity: 1.0, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Storm Coast — intense crashing surf + wind channels
  5: {
    waterIntensity: 1.0, waterDistance: 0.6, waterDropSize: 0.15, waterHardness: 0.15, waterGlassThickness: 0.0,
    ...discreteLayerDefaults(5),
    waterSurfDuration: 5.0, waterSurfInterval: 6.0, waterSurfFoam: 0.7, waterSurfFoamBright: 0.8, waterSurfProximity: 0.95, waterSurfDepth: 0.8,
    waterSurfBody: 200, waterSurfSpray: 5500, waterChannelsMorph: 0.75, waterChannelsSpeed: 0.4,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Mountain Brook — gentle stream channels + subtle background surf
  6: {
    waterIntensity: 0.5, waterDistance: 0.25, waterDropSize: 0.5,  waterHardness: 0.3,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(6),
    waterSurfDuration: 14.0, waterSurfInterval: 18.0, waterSurfFoam: 0.1, waterSurfFoamBright: 0.25, waterSurfProximity: 0.35, waterSurfDepth: 0.25,
    waterSurfBody: 400, waterSurfSpray: 3000, waterChannelsMorph: 0.15, waterChannelsSpeed: 0.7,
    ...DENSITY_LOOP_DEFAULTS,
  },
  // Wind & Mist — pure wind channels + sparse misty spray surf
  7: {
    waterIntensity: 0.3, waterDistance: 0.5, waterDropSize: 0.4,  waterHardness: 0.2,  waterGlassThickness: 0.0,
    ...discreteLayerDefaults(7),
    waterSurfDuration: 16.0, waterSurfInterval: 22.0, waterSurfFoam: 0.5, waterSurfFoamBright: 0.55, waterSurfProximity: 0.08, waterSurfDepth: 0.15,
    waterSurfBody: 350, waterSurfSpray: 6000, waterChannelsMorph: 0.9, waterChannelsSpeed: 0.25,
    ...DENSITY_LOOP_DEFAULTS,
  },
};

/** SliderState keys that waterMorph affects */
export const WATER_MORPH_PARAM_KEYS = [
  'waterIntensity', 'waterDistance',
  'waterDropSize', 'waterHardness', 'waterGlassThickness',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerSurf', 'waterLayerChannels',
  'waterHardDropBaseFreq', 'waterHardDropRate', 'waterHardDropLPF', 'waterHardDropTone',
  'waterWaterDropBaseFreq', 'waterWaterDropRate', 'waterWaterDropLPF',
  'waterBubblingRate', 'waterBubblingLPF',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfFoamBright', 'waterSurfProximity', 'waterSurfDepth',
  'waterSurfBody', 'waterSurfSpray',
  'waterDensityHardSend', 'waterDensityWaterSend', 'waterDensityBubbleSend',
  'waterDensityFeedback', 'waterDensityTone', 'waterDensityRing', 'waterDensityWet',
  'waterChannelsMorph', 'waterChannelsSpeed',
] as const;

type SliderMode = 'single' | 'walk' | 'sampleHold';

/** Per-preset dual ranges (only keys that should start in dual mode) */
export const PRESET_DUAL_RANGES: Record<number, Record<string, { min: number; max: number }>> = {
  0: {}, // Tap Drips — all single
  1: {}, // Stream — all single
  2: {}, // Waterfall — all single
  3: {}, // Rain Window — all single
  // Ocean Surf — keep the wave motion stable for a closer Ocean match
  4: {},
  // Storm Coast — S&H variation on nearly everything
  5: {
    waterSurfDuration: { min: 3.0, max: 7.0 },
    waterSurfInterval: { min: 3.5, max: 9.0 },
    waterSurfFoam:     { min: 0.4, max: 1.0 },
    waterSurfProximity:{ min: 0.72, max: 1.0 },
    waterSurfDepth:    { min: 0.5, max: 1.0 },
  },
  6: {}, // Mountain Brook — all single
  7: {}, // Wind & Mist — all single
};

/** Per-preset slider modes (only keys that should be walk or sampleHold) */
export const PRESET_SLIDER_MODES: Record<number, Record<string, SliderMode>> = {
  0: {},
  1: {},
  2: {},
  3: {},
  4: {},
  5: {
    waterSurfDuration: 'sampleHold',
    waterSurfInterval: 'sampleHold',
    waterSurfFoam: 'sampleHold',
    waterSurfProximity: 'sampleHold',
    waterSurfDepth: 'sampleHold',
  },
  6: {},
  7: {},
};

export interface WaterPresetOption {
  id: number;
  name: string;
  library: PresetLibrary;
}

interface RuntimeWaterPresetEntry extends WaterPresetOption {
  data: Record<string, number>;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
}

const USER_WATER_PRESETS = new Map<number, RuntimeWaterPresetEntry>();

function normalizeWaterPresetName(name: string): string {
  return name.trim().toLowerCase();
}

function getWaterPresetOptionPriority(option: Pick<WaterPresetOption, 'library'>): number {
  switch (option.library) {
    case 'cloud':
      return 3;
    case 'user':
      return 2;
    case 'stock':
    default:
      return 1;
  }
}

export function getStockWaterPresetIdByName(name: string): number | null {
  const normalizedName = normalizeWaterPresetName(name);
  for (let index = 0; index < WATER_PRESETS.length; index += 1) {
    if (normalizeWaterPresetName(WATER_PRESETS[index] ?? '') === normalizedName) {
      return index;
    }
  }
  return null;
}

function hashRuntimePresetId(sourceId: string): number {
  const stockMatch = /^stock:(\d+)$/.exec(sourceId);
  if (stockMatch) {
    return Number(stockMatch[1]);
  }
  let hash = 5381;
  for (let index = 0; index < sourceId.length; index += 1) {
    hash = ((hash << 5) + hash) ^ sourceId.charCodeAt(index);
  }
  return 1000 + Math.abs(hash >>> 0);
}

function buildStockWaterPresetState(presetId: number): WaterPresetState {
  const fallbackParams = PRESET_PARAMS[0]!;
  const fallbackLayers = PRESET_LAYERS[0]!;
  const params = PRESET_PARAMS[presetId] ?? fallbackParams;
  const layers = PRESET_LAYERS[presetId] ?? fallbackLayers;
  const baseFreq = PRESET_BASE_FREQ[presetId] ?? PRESET_BASE_FREQ[0] ?? 2500;

  return {
    waterBaseFreq: baseFreq,
    waterHardDropBaseFreq: baseFreq,
    waterWaterDropBaseFreq: baseFreq,
    waterIntensity: params.waterIntensity,
    waterDistance: params.waterDistance,
    waterDropSize: params.waterDropSize,
    waterHardness: params.waterHardness,
    waterGlassThickness: params.waterGlassThickness,
    waterLayerHardDrops: layers.hardDrops ?? fallbackLayers.hardDrops,
    waterLayerWaterDrops: layers.waterDrops ?? fallbackLayers.waterDrops,
    waterLayerTurbulence: layers.turbulence ?? fallbackLayers.turbulence,
    waterLayerBubbling: layers.bubbling ?? fallbackLayers.bubbling,
    waterLayerSurf: layers.surf ?? fallbackLayers.surf,
    waterLayerChannels: layers.channels ?? fallbackLayers.channels,
    waterHardDropRate: params.waterHardDropRate,
    waterHardDropLPF: params.waterHardDropLPF,
    waterHardDropTone: params.waterHardDropTone,
    waterWaterDropRate: params.waterWaterDropRate,
    waterWaterDropLPF: params.waterWaterDropLPF,
    waterBubblingRate: params.waterBubblingRate,
    waterBubblingLPF: params.waterBubblingLPF,
    waterSurfDuration: params.waterSurfDuration,
    waterSurfInterval: params.waterSurfInterval,
    waterSurfFoam: params.waterSurfFoam,
    waterSurfFoamBright: params.waterSurfFoamBright,
    waterSurfProximity: params.waterSurfProximity,
    waterSurfDepth: params.waterSurfDepth,
    waterSurfBody: params.waterSurfBody,
    waterSurfSpray: params.waterSurfSpray,
    waterDensityHardSend: params.waterDensityHardSend,
    waterDensityWaterSend: params.waterDensityWaterSend,
    waterDensityBubbleSend: params.waterDensityBubbleSend,
    waterDensityFeedback: params.waterDensityFeedback,
    waterDensityTone: params.waterDensityTone,
    waterDensityRing: params.waterDensityRing,
    waterDensityWet: params.waterDensityWet,
    waterChannelsMorph: params.waterChannelsMorph,
    waterChannelsSpeed: params.waterChannelsSpeed,
  };
}

function getWaterPresetState(presetId: number): WaterPresetState {
  const stockState = buildStockWaterPresetState(presetId);
  const userState = USER_WATER_PRESETS.get(presetId)?.data;
  return userState ? { ...stockState, ...userState } : stockState;
}

export function getWaterPresetOptions(): WaterPresetOption[] {
  const optionsById = new Map<number, WaterPresetOption>();
  const optionIdByName = new Map<string, number>();

  const mergeOption = (option: WaterPresetOption) => {
    const normalizedName = normalizeWaterPresetName(option.name);
    const existingById = optionsById.get(option.id);
    if (existingById && getWaterPresetOptionPriority(existingById) >= getWaterPresetOptionPriority(option)) {
      optionIdByName.set(normalizedName, existingById.id);
      return;
    }

    const existingIdByName = optionIdByName.get(normalizedName);
    if (existingIdByName !== undefined) {
      const existingByName = optionsById.get(existingIdByName);
      if (existingByName && getWaterPresetOptionPriority(existingByName) > getWaterPresetOptionPriority(option)) {
        return;
      }
      optionsById.delete(existingIdByName);
    }

    optionsById.set(option.id, option);
    optionIdByName.set(normalizedName, option.id);
  };

  WATER_PRESETS.forEach((name, index) => {
    mergeOption({
      id: index,
      name,
      library: 'stock',
    });
  });

  for (const preset of USER_WATER_PRESETS.values()) {
    mergeOption({
      id: preset.id,
      name: preset.name,
      library: preset.library,
    });
  }

  return [...optionsById.values()];
}

export function getWaterPresetDisplayName(presetId: number): string {
  return USER_WATER_PRESETS.get(presetId)?.name ?? WATER_PRESETS[presetId] ?? `Preset ${presetId}`;
}

export function setUserWaterPresets(
  presets: Array<{
    sourceId: string;
    name: string;
    library: Exclude<PresetLibrary, 'stock'>;
    data: Record<string, number>;
    dualRanges?: Record<string, { min: number; max: number }>;
    sliderModes?: Record<string, SliderMode>;
  }>,
): void {
  USER_WATER_PRESETS.clear();
  for (const preset of presets) {
    const id = hashRuntimePresetId(preset.sourceId);
    USER_WATER_PRESETS.set(id, {
      id,
      name: preset.name,
      library: preset.library,
      data: preset.data,
      dualRanges: preset.dualRanges,
      sliderModes: preset.sliderModes,
    });
  }
}

export function upsertUserWaterPreset(
  preset: {
    sourceId: string;
    name: string;
    library: Exclude<PresetLibrary, 'stock'>;
    data: Record<string, number>;
    dualRanges?: Record<string, { min: number; max: number }>;
    sliderModes?: Record<string, SliderMode>;
  },
): number {
  const id = hashRuntimePresetId(preset.sourceId);
  USER_WATER_PRESETS.set(id, {
    id,
    name: preset.name,
    library: preset.library,
    data: preset.data,
    dualRanges: preset.dualRanges,
    sliderModes: preset.sliderModes,
  });
  return id;
}

export function getWaterPresetDualRanges(presetId: number): Record<string, { min: number; max: number }> {
  return USER_WATER_PRESETS.get(presetId)?.dualRanges ?? PRESET_DUAL_RANGES[presetId] ?? {};
}

export function getWaterPresetSliderModes(presetId: number): Record<string, SliderMode> {
  return USER_WATER_PRESETS.get(presetId)?.sliderModes ?? PRESET_SLIDER_MODES[presetId] ?? {};
}

/**
 * Interpolate between two water presets.
 * Returns flat SliderState-compatible keys (waterIntensity, waterLayerHardDrops, etc.)
 */
export function morphWaterPresets(
  idxA: number, idxB: number, t: number
): WaterPresetState {
  const presetA = getWaterPresetState(idxA);
  const presetB = getWaterPresetState(idxB);
  const fallback = buildStockWaterPresetState(0);

  // Smoothstep for nicer feel
  const s = t * t * (3 - 2 * t);

  const lrp = (a: number, b: number) => a + (b - a) * s;
  const eLrp = (a: number, b: number) => (a > 0 && b > 0) ? a * Math.pow(b / a, s) : lrp(a, b);

  const result: WaterPresetState = {
    waterBaseFreq: eLrp(presetA.waterBaseFreq ?? fallback.waterBaseFreq, presetB.waterBaseFreq ?? fallback.waterBaseFreq),
    waterHardDropBaseFreq: eLrp(
      presetA.waterHardDropBaseFreq ?? presetA.waterBaseFreq ?? fallback.waterHardDropBaseFreq,
      presetB.waterHardDropBaseFreq ?? presetB.waterBaseFreq ?? fallback.waterHardDropBaseFreq
    ),
    waterWaterDropBaseFreq: eLrp(
      presetA.waterWaterDropBaseFreq ?? presetA.waterBaseFreq ?? fallback.waterWaterDropBaseFreq,
      presetB.waterWaterDropBaseFreq ?? presetB.waterBaseFreq ?? fallback.waterWaterDropBaseFreq
    ),
    waterIntensity: lrp(presetA.waterIntensity ?? fallback.waterIntensity, presetB.waterIntensity ?? fallback.waterIntensity),
    waterDistance: lrp(presetA.waterDistance ?? fallback.waterDistance, presetB.waterDistance ?? fallback.waterDistance),
    waterDropSize: lrp(presetA.waterDropSize ?? fallback.waterDropSize, presetB.waterDropSize ?? fallback.waterDropSize),
    waterHardness: lrp(presetA.waterHardness ?? fallback.waterHardness, presetB.waterHardness ?? fallback.waterHardness),
    waterGlassThickness: lrp(presetA.waterGlassThickness ?? fallback.waterGlassThickness, presetB.waterGlassThickness ?? fallback.waterGlassThickness),
    waterLayerHardDrops: lrp(presetA.waterLayerHardDrops ?? fallback.waterLayerHardDrops, presetB.waterLayerHardDrops ?? fallback.waterLayerHardDrops),
    waterLayerWaterDrops: lrp(presetA.waterLayerWaterDrops ?? fallback.waterLayerWaterDrops, presetB.waterLayerWaterDrops ?? fallback.waterLayerWaterDrops),
    waterLayerTurbulence: lrp(presetA.waterLayerTurbulence ?? fallback.waterLayerTurbulence, presetB.waterLayerTurbulence ?? fallback.waterLayerTurbulence),
    waterLayerBubbling: lrp(presetA.waterLayerBubbling ?? fallback.waterLayerBubbling, presetB.waterLayerBubbling ?? fallback.waterLayerBubbling),
    waterLayerSurf: lrp(presetA.waterLayerSurf ?? fallback.waterLayerSurf, presetB.waterLayerSurf ?? fallback.waterLayerSurf),
    waterLayerChannels: lrp(presetA.waterLayerChannels ?? fallback.waterLayerChannels, presetB.waterLayerChannels ?? fallback.waterLayerChannels),
    waterHardDropRate: lrp(presetA.waterHardDropRate ?? fallback.waterHardDropRate, presetB.waterHardDropRate ?? fallback.waterHardDropRate),
    waterHardDropLPF: eLrp(presetA.waterHardDropLPF ?? fallback.waterHardDropLPF, presetB.waterHardDropLPF ?? fallback.waterHardDropLPF),
    waterHardDropTone: lrp(presetA.waterHardDropTone ?? fallback.waterHardDropTone, presetB.waterHardDropTone ?? fallback.waterHardDropTone),
    waterWaterDropRate: lrp(presetA.waterWaterDropRate ?? fallback.waterWaterDropRate, presetB.waterWaterDropRate ?? fallback.waterWaterDropRate),
    waterWaterDropLPF: eLrp(presetA.waterWaterDropLPF ?? fallback.waterWaterDropLPF, presetB.waterWaterDropLPF ?? fallback.waterWaterDropLPF),
    waterBubblingRate: lrp(presetA.waterBubblingRate ?? fallback.waterBubblingRate, presetB.waterBubblingRate ?? fallback.waterBubblingRate),
    waterBubblingLPF: eLrp(presetA.waterBubblingLPF ?? fallback.waterBubblingLPF, presetB.waterBubblingLPF ?? fallback.waterBubblingLPF),
    waterSurfDuration: lrp(presetA.waterSurfDuration ?? fallback.waterSurfDuration, presetB.waterSurfDuration ?? fallback.waterSurfDuration),
    waterSurfInterval: lrp(presetA.waterSurfInterval ?? fallback.waterSurfInterval, presetB.waterSurfInterval ?? fallback.waterSurfInterval),
    waterSurfFoam: lrp(presetA.waterSurfFoam ?? fallback.waterSurfFoam, presetB.waterSurfFoam ?? fallback.waterSurfFoam),
    waterSurfFoamBright: lrp(presetA.waterSurfFoamBright ?? fallback.waterSurfFoamBright, presetB.waterSurfFoamBright ?? fallback.waterSurfFoamBright),
    waterSurfProximity: lrp(presetA.waterSurfProximity ?? fallback.waterSurfProximity, presetB.waterSurfProximity ?? fallback.waterSurfProximity),
    waterSurfDepth: lrp(presetA.waterSurfDepth ?? fallback.waterSurfDepth, presetB.waterSurfDepth ?? fallback.waterSurfDepth),
    waterSurfBody: eLrp(presetA.waterSurfBody ?? fallback.waterSurfBody, presetB.waterSurfBody ?? fallback.waterSurfBody),
    waterSurfSpray: eLrp(presetA.waterSurfSpray ?? fallback.waterSurfSpray, presetB.waterSurfSpray ?? fallback.waterSurfSpray),
    waterDensityHardSend: lrp(presetA.waterDensityHardSend ?? fallback.waterDensityHardSend, presetB.waterDensityHardSend ?? fallback.waterDensityHardSend),
    waterDensityWaterSend: lrp(presetA.waterDensityWaterSend ?? fallback.waterDensityWaterSend, presetB.waterDensityWaterSend ?? fallback.waterDensityWaterSend),
    waterDensityBubbleSend: lrp(presetA.waterDensityBubbleSend ?? fallback.waterDensityBubbleSend, presetB.waterDensityBubbleSend ?? fallback.waterDensityBubbleSend),
    waterDensityFeedback: lrp(presetA.waterDensityFeedback ?? fallback.waterDensityFeedback, presetB.waterDensityFeedback ?? fallback.waterDensityFeedback),
    waterDensityTone: eLrp(presetA.waterDensityTone ?? fallback.waterDensityTone, presetB.waterDensityTone ?? fallback.waterDensityTone),
    waterDensityRing: lrp(presetA.waterDensityRing ?? fallback.waterDensityRing, presetB.waterDensityRing ?? fallback.waterDensityRing),
    waterDensityWet: lrp(presetA.waterDensityWet ?? fallback.waterDensityWet, presetB.waterDensityWet ?? fallback.waterDensityWet),
    waterChannelsMorph: lrp(presetA.waterChannelsMorph ?? fallback.waterChannelsMorph, presetB.waterChannelsMorph ?? fallback.waterChannelsMorph),
    waterChannelsSpeed: lrp(presetA.waterChannelsSpeed ?? fallback.waterChannelsSpeed, presetB.waterChannelsSpeed ?? fallback.waterChannelsSpeed),
  };

  for (const key of LAYER_KEYS) {
    const stateKey = LAYER_TO_STATE_KEY[key];
    const fallbackValue = fallback[stateKey];
    result[stateKey] = lrp(
      presetA[stateKey] ?? fallbackValue,
      presetB[stateKey] ?? fallbackValue,
    );
  }

  return result;
}

export const INSECT_ENGINES = ['Cricket', 'Tree Cricket', 'Katydid', 'Cicada', 'Grasshopper', 'Mole Cricket', 'Fly/Bee'] as const;

/** Per-engine default slider values for insects (index matches INSECT_ENGINES) */
export const INSECT_ENGINE_DEFAULTS: Record<number, {
  density: number; temperature: number; distance: number; proximity: number;
  antiphony: number; clickRate: number; motion: number;
}> = {
  0: { density: 0.5, temperature: 0.5, distance: 0.3, proximity: 0.5, antiphony: 0.3, clickRate: 0.3, motion: 0.5 },
  1: { density: 0.6, temperature: 0.7, distance: 0.4, proximity: 0.4, antiphony: 0.2, clickRate: 0.5, motion: 0.3 },
  2: { density: 0.4, temperature: 0.5, distance: 0.3, proximity: 0.6, antiphony: 0.8, clickRate: 0.4, motion: 0.4 },
  3: { density: 0.5, temperature: 0.6, distance: 0.4, proximity: 0.5, antiphony: 0.3, clickRate: 0.6, motion: 0.5 },
  4: { density: 0.4, temperature: 0.5, distance: 0.3, proximity: 0.5, antiphony: 0.2, clickRate: 0.7, motion: 0.3 },
  5: { density: 0.3, temperature: 0.4, distance: 0.2, proximity: 0.7, antiphony: 0.1, clickRate: 0.2, motion: 0.6 },
  6: { density: 0.5, temperature: 0.5, distance: 0.5, proximity: 0.5, antiphony: 0.1, clickRate: 0.5, motion: 0.8 },
};
