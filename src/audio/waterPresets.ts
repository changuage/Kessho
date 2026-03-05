/**
 * Water Preset System
 *
 * Defines preset data and morph interpolation for the water/soundscapes engine.
 * Used by both App.tsx (for state management) and EarthPage (for UI).
 */

export const WATER_PRESETS = ['Tap Drips', 'Stream', 'Waterfall', 'Rain Window'] as const;

export const LAYER_KEYS = ['hardDrops', 'waterDrops', 'turbulence', 'bubbling', 'roar', 'rivulets'] as const;
export type LayerKey = typeof LAYER_KEYS[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
  hardDrops: 'Hard Drops',
  waterDrops: 'Water Drops',
  turbulence: 'Turbulence',
  bubbling: 'Bubbling',
  roar: 'Roar',
  rivulets: 'Rivulets',
};

/** Map LayerKey → SliderState key for that layer level */
export const LAYER_TO_STATE_KEY: Record<LayerKey, string> = {
  hardDrops: 'waterLayerHardDrops',
  waterDrops: 'waterLayerWaterDrops',
  turbulence: 'waterLayerTurbulence',
  bubbling: 'waterLayerBubbling',
  roar: 'waterLayerRoar',
  rivulets: 'waterLayerRivulets',
};

// Preset base frequencies (matches C++ WATER_PRESETS)
const PRESET_BASE_FREQ: Record<number, number> = {
  0: 2500, // tapDrips
  1: 2300, // stream
  2: 4500, // waterfall
  3: 2100, // rainWindow
};

// Preset layer mixes (matches JS WATER_PRESETS exactly)
const PRESET_LAYERS: Record<number, Record<LayerKey, number>> = {
  0: { hardDrops: 0.7, waterDrops: 0.5, turbulence: 0.3, bubbling: 0.0, roar: 0.0, rivulets: 0.0 },
  1: { hardDrops: 0.08, waterDrops: 0.82, turbulence: 0.56, bubbling: 0.92, roar: 0.0, rivulets: 0.0 },
  2: { hardDrops: 0.1, waterDrops: 0.3, turbulence: 0.4, bubbling: 0.4, roar: 1.0, rivulets: 0.0 },
  3: { hardDrops: 0.32, waterDrops: 0.42, turbulence: 0.18, bubbling: 0.0, roar: 0.0, rivulets: 0.92 },
};

// Preset water slider defaults (matches original JS WATER_PRESETS param values)
const PRESET_PARAMS: Record<number, {
  waterIntensity: number; waterRate: number; waterDistance: number;
  waterDropSize: number; waterHardness: number; waterGlassThickness: number;
}> = {
  0: { waterIntensity: 0.4, waterRate: 0.3,  waterDistance: 0.2, waterDropSize: 0.7,  waterHardness: 0.8,  waterGlassThickness: 0.0  },
  1: { waterIntensity: 0.7, waterRate: 0.5,  waterDistance: 0.3, waterDropSize: 0.45, waterHardness: 0.2,  waterGlassThickness: 0.0  },
  2: { waterIntensity: 1.0, waterRate: 0.85, waterDistance: 0.5, waterDropSize: 0.2,  waterHardness: 0.2,  waterGlassThickness: 0.0  },
  3: { waterIntensity: 0.5, waterRate: 0.4,  waterDistance: 0.3, waterDropSize: 0.55, waterHardness: 0.58, waterGlassThickness: 0.7  },
};

/** SliderState keys that waterMorph affects */
export const WATER_MORPH_PARAM_KEYS = [
  'waterIntensity', 'waterRate', 'waterDistance', 'waterBaseFreq',
  'waterDropSize', 'waterHardness', 'waterGlassThickness',
  'waterLayerHardDrops', 'waterLayerWaterDrops', 'waterLayerTurbulence',
  'waterLayerBubbling', 'waterLayerRoar', 'waterLayerRivulets',
] as const;

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
