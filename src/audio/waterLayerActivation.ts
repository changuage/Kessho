export const WATER_LAYER_LEVEL_EPSILON = 0.0001;

export const WATER_LAYER_ENABLED_BY_LEVEL = {
  waterLayerHardDrops: 'waterLayerHardDropsEnabled',
  waterLayerWaterDrops: 'waterLayerWaterDropsEnabled',
  waterLayerBubbling: 'waterLayerBubblingEnabled',
  waterLayerChannels: 'waterLayerChannelsEnabled',
  waterLayerTurbulence: 'waterLayerTurbulenceEnabled',
  waterLayerSurf: 'waterLayerSurfEnabled',
} as const;

export type WaterLayerLevelKey = keyof typeof WATER_LAYER_ENABLED_BY_LEVEL;
export type WaterLayerEnabledKey = typeof WATER_LAYER_ENABLED_BY_LEVEL[WaterLayerLevelKey];

export const WATER_LAYER_LEVEL_KEYS = Object.keys(WATER_LAYER_ENABLED_BY_LEVEL) as WaterLayerLevelKey[];

/** Native mask bit order; keep aligned with kSoundscapeWaterLayerParamStart. */
export const WATER_LAYER_MASK_KEYS = [
  ['waterLayerHardDrops', 'waterLayerHardDropsEnabled'],
  ['waterLayerWaterDrops', 'waterLayerWaterDropsEnabled'],
  ['waterLayerTurbulence', 'waterLayerTurbulenceEnabled'],
  ['waterLayerBubbling', 'waterLayerBubblingEnabled'],
  ['waterLayerSurf', 'waterLayerSurfEnabled'],
  ['waterLayerChannels', 'waterLayerChannelsEnabled'],
] as const satisfies readonly [WaterLayerLevelKey, WaterLayerEnabledKey][];

export function deriveMissingWaterLayerEnabledFlags(record: Record<string, unknown>): void {
  for (const [levelKey, enabledKey] of WATER_LAYER_MASK_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, enabledKey)) continue;
    const level = record[levelKey];
    if (typeof level === 'number' && Number.isFinite(level)) {
      record[enabledKey] = level > WATER_LAYER_LEVEL_EPSILON;
    }
  }
}
