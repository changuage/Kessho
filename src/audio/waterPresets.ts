/**
 * Water Preset System
 *
 * Defines preset data and morph interpolation for the water/soundscapes engine.
 * Used by both App.tsx (for state management) and EarthPage (for UI).
 */

export const WATER_PRESETS = ['Tap Drips', 'Stream', 'Waterfall', 'Rain Window', 'Ocean Surf', 'Storm Coast', 'Mountain Brook', 'Wind & Mist'] as const;

export const LAYER_KEYS = ['hardDrops', 'waterDrops', 'turbulence', 'bubbling', 'surf', 'channels'] as const;
export type LayerKey = typeof LAYER_KEYS[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
  hardDrops: 'Hard Drops',
  waterDrops: 'Water Drops',
  turbulence: 'Turbulence',
  bubbling: 'Bubbling',
  surf: 'Surf',
  channels: 'Channels',
};

/** Map LayerKey → SliderState key for that layer level */
export const LAYER_TO_STATE_KEY: Record<LayerKey, string> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  turbulence: 'waterLayerTurbulence',
  bubbling: 'waterLayerBubbling',
  surf: 'waterLayerSurf',
  channels: 'waterLayerChannels',
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
  0: { hardDrops: 0.7, waterDrops: 0.5, turbulence: 0.3, bubbling: 0.0, surf: 0.0, channels: 0.0 },
  1: { hardDrops: 0.08, waterDrops: 0.82, turbulence: 0.56, bubbling: 0.92, surf: 0.0, channels: 0.0 },
  2: { hardDrops: 0.1, waterDrops: 0.3, turbulence: 0.4, bubbling: 0.4, surf: 1.0, channels: 0.0 },
  3: { hardDrops: 0.32, waterDrops: 0.42, turbulence: 0.18, bubbling: 0.0, surf: 0.0, channels: 0.92 },
  4: { hardDrops: 0.0, waterDrops: 0.0, turbulence: 0.1, bubbling: 0.0, surf: 0.9, channels: 0.0 },
  5: { hardDrops: 0.05, waterDrops: 0.15, turbulence: 0.5, bubbling: 0.2, surf: 1.0, channels: 0.7 },
  6: { hardDrops: 0.15, waterDrops: 0.6, turbulence: 0.3, bubbling: 0.7, surf: 0.25, channels: 0.85 },
  7: { hardDrops: 0.0, waterDrops: 0.0, turbulence: 0.15, bubbling: 0.0, surf: 0.15, channels: 1.0 },
};

// Preset water slider defaults (matches original JS WATER_PRESETS param values)
const PRESET_PARAMS: Record<number, {
  waterIntensity: number; waterRate: number; waterDistance: number;
  waterDropSize: number; waterHardness: number; waterGlassThickness: number;
  waterSurfDuration: number; waterSurfInterval: number;
  waterSurfFoam: number; waterSurfDepth: number;
  waterSurfBody: number; waterSurfSpray: number;
  waterChannelsMorph: number; waterChannelsSpeed: number;
}> = {
  // Tap Drips — no surf or channels
  0: {
    waterIntensity: 0.4, waterRate: 0.3,  waterDistance: 0.2, waterDropSize: 0.7,  waterHardness: 0.8,  waterGlassThickness: 0.0,
    waterSurfDuration: 8.0, waterSurfInterval: 9.5, waterSurfFoam: 0.35, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
  },
  // Stream — light channels in stream mode (gentle trickling)
  1: {
    waterIntensity: 0.7, waterRate: 0.5,  waterDistance: 0.3, waterDropSize: 0.45, waterHardness: 0.2,  waterGlassThickness: 0.0,
    waterSurfDuration: 8.0, waterSurfInterval: 9.5, waterSurfFoam: 0.2, waterSurfDepth: 0.3,
    waterSurfBody: 250, waterSurfSpray: 3500, waterChannelsMorph: 0.1, waterChannelsSpeed: 0.6,
  },
  // Waterfall — full surf (matches Ocean wave synthesis defaults)
  2: {
    waterIntensity: 1.0, waterRate: 0.85, waterDistance: 0.5, waterDropSize: 0.2,  waterHardness: 0.2,  waterGlassThickness: 0.0,
    waterSurfDuration: 7.0, waterSurfInterval: 8.5, waterSurfFoam: 0.35, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
  },
  // Rain Window — channels in wind mode (wind-driven rain)
  3: {
    waterIntensity: 0.5, waterRate: 0.4,  waterDistance: 0.3, waterDropSize: 0.55, waterHardness: 0.58, waterGlassThickness: 0.7,
    waterSurfDuration: 10.0, waterSurfInterval: 14.0, waterSurfFoam: 0.15, waterSurfDepth: 0.3,
    waterSurfBody: 200, waterSurfSpray: 5000, waterChannelsMorph: 0.65, waterChannelsSpeed: 0.35,
  },
  // Ocean Surf — mimics Ocean wave synthesis defaults (pure surf, no drops)
  4: {
    waterIntensity: 0.6, waterRate: 0.3,  waterDistance: 0.4, waterDropSize: 0.3,  waterHardness: 0.3,  waterGlassThickness: 0.0,
    waterSurfDuration: 7.0, waterSurfInterval: 8.5, waterSurfFoam: 0.35, waterSurfDepth: 0.5,
    waterSurfBody: 300, waterSurfSpray: 4000, waterChannelsMorph: 0.0, waterChannelsSpeed: 0.5,
  },
  // Storm Coast — intense crashing surf + wind channels
  5: {
    waterIntensity: 1.0, waterRate: 0.9,  waterDistance: 0.6, waterDropSize: 0.15, waterHardness: 0.15, waterGlassThickness: 0.0,
    waterSurfDuration: 5.0, waterSurfInterval: 6.0, waterSurfFoam: 0.7, waterSurfDepth: 0.8,
    waterSurfBody: 200, waterSurfSpray: 5500, waterChannelsMorph: 0.75, waterChannelsSpeed: 0.4,
  },
  // Mountain Brook — gentle stream channels + subtle background surf
  6: {
    waterIntensity: 0.5, waterRate: 0.4,  waterDistance: 0.25, waterDropSize: 0.5,  waterHardness: 0.3,  waterGlassThickness: 0.0,
    waterSurfDuration: 14.0, waterSurfInterval: 18.0, waterSurfFoam: 0.1, waterSurfDepth: 0.25,
    waterSurfBody: 400, waterSurfSpray: 3000, waterChannelsMorph: 0.15, waterChannelsSpeed: 0.7,
  },
  // Wind & Mist — pure wind channels + sparse misty spray surf
  7: {
    waterIntensity: 0.3, waterRate: 0.2,  waterDistance: 0.5, waterDropSize: 0.4,  waterHardness: 0.2,  waterGlassThickness: 0.0,
    waterSurfDuration: 16.0, waterSurfInterval: 22.0, waterSurfFoam: 0.5, waterSurfDepth: 0.15,
    waterSurfBody: 350, waterSurfSpray: 6000, waterChannelsMorph: 0.9, waterChannelsSpeed: 0.25,
  },
};

/** SliderState keys that waterMorph affects */
export const WATER_MORPH_PARAM_KEYS = [
  'waterIntensity', 'waterRate', 'waterDistance', 'waterBaseFreq',
  'waterDropSize', 'waterHardness', 'waterGlassThickness',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerSurf', 'waterLayerChannels',
  'waterSurfDuration', 'waterSurfInterval', 'waterSurfFoam', 'waterSurfDepth',
  'waterSurfBody', 'waterSurfSpray',
  'waterChannelsMorph', 'waterChannelsSpeed',
] as const;

type SliderMode = 'single' | 'walk' | 'sampleHold';

/** Per-preset dual ranges (only keys that should start in dual mode) */
export const PRESET_DUAL_RANGES: Record<number, Record<string, { min: number; max: number }>> = {
  0: {}, // Tap Drips — all single
  1: {}, // Stream — all single
  2: {}, // Waterfall — all single
  3: {}, // Rain Window — all single
  // Ocean Surf — S&H variation on wave timing + foam + depth
  4: {
    waterSurfInterval: { min: 5.0, max: 14.0 },
    waterSurfFoam:     { min: 0.15, max: 0.6 },
    waterSurfDepth:    { min: 0.25, max: 0.75 },
  },
  // Storm Coast — S&H variation on nearly everything
  5: {
    waterSurfDuration: { min: 3.0, max: 7.0 },
    waterSurfInterval: { min: 3.5, max: 9.0 },
    waterSurfFoam:     { min: 0.4, max: 1.0 },
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
  4: {
    waterSurfInterval: 'sampleHold',
    waterSurfFoam: 'sampleHold',
    waterSurfDepth: 'sampleHold',
  },
  5: {
    waterSurfDuration: 'sampleHold',
    waterSurfInterval: 'sampleHold',
    waterSurfFoam: 'sampleHold',
    waterSurfDepth: 'sampleHold',
  },
  6: {},
  7: {},
};

/**
 * Interpolate between two water presets.
 * Returns flat SliderState-compatible keys (waterIntensity, waterLayerHardDrops, etc.)
 */
export function morphWaterPresets(
  idxA: number, idxB: number, t: number
): Record<string, number> {
  const ppA = PRESET_PARAMS[idxA] ?? PRESET_PARAMS[0];
  const ppB = PRESET_PARAMS[idxB] ?? PRESET_PARAMS[0];
  const layA = PRESET_LAYERS[idxA] ?? PRESET_LAYERS[0];
  const layB = PRESET_LAYERS[idxB] ?? PRESET_LAYERS[0];
  const freqA = PRESET_BASE_FREQ[idxA] ?? 2500;
  const freqB = PRESET_BASE_FREQ[idxB] ?? 2500;

  // Smoothstep for nicer feel
  const s = t * t * (3 - 2 * t);

  const lrp = (a: number, b: number) => a + (b - a) * s;
  const eLrp = (a: number, b: number) => (a > 0 && b > 0) ? a * Math.pow(b / a, s) : lrp(a, b);

  const result: Record<string, number> = {
    waterBaseFreq: eLrp(freqA, freqB),
    waterIntensity: lrp(ppA.waterIntensity, ppB.waterIntensity),
    waterRate: lrp(ppA.waterRate, ppB.waterRate),
    waterDistance: lrp(ppA.waterDistance, ppB.waterDistance),
    waterDropSize: lrp(ppA.waterDropSize, ppB.waterDropSize),
    waterHardness: lrp(ppA.waterHardness, ppB.waterHardness),
    waterGlassThickness: lrp(ppA.waterGlassThickness, ppB.waterGlassThickness),
    waterSurfDuration: lrp(ppA.waterSurfDuration, ppB.waterSurfDuration),
    waterSurfInterval: lrp(ppA.waterSurfInterval, ppB.waterSurfInterval),
    waterSurfFoam: lrp(ppA.waterSurfFoam, ppB.waterSurfFoam),
    waterSurfDepth: lrp(ppA.waterSurfDepth, ppB.waterSurfDepth),
    waterSurfBody: eLrp(ppA.waterSurfBody, ppB.waterSurfBody),
    waterSurfSpray: eLrp(ppA.waterSurfSpray, ppB.waterSurfSpray),
    waterChannelsMorph: lrp(ppA.waterChannelsMorph, ppB.waterChannelsMorph),
    waterChannelsSpeed: lrp(ppA.waterChannelsSpeed, ppB.waterChannelsSpeed),
  };

  for (const k of LAYER_KEYS) {
    const lvl = lrp(layA[k], layB[k]);
    result[LAYER_TO_STATE_KEY[k]] = lvl;
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
