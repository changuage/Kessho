import type { SliderMode } from '../state';
import { normalizeSliderRange } from './scale';

export type ModulationSlot = 'a' | 'b';
export type DualSliderWalkRelationship = 'free' | 'link';
export type DualSliderShape = 'sine' | 'triangle' | 'square';
export type DualSliderShapeDivision = '4x' | '2x' | '1' | '1/2' | '1/4' | '1/8' | '1/16';
export type DualSliderShapeTiming =
  | { mode: 'free'; speed: number }
  | { mode: 'link'; speed: number }
  | { mode: 'sync'; reference: 'bar' | 'phrase'; division: DualSliderShapeDivision };

export interface DualSliderWalkConfig {
  relationship: DualSliderWalkRelationship;
  speed: number;
}

export interface DualSliderShapeConfig {
  shape: DualSliderShape;
  timing: DualSliderShapeTiming;
}

export type ModulationSourceConfig =
  | { type: 'walk'; walk: DualSliderWalkConfig }
  | { type: 'sampleHold' }
  | { type: 'shape'; shape: DualSliderShapeConfig };

export const DEFAULT_DUAL_SLIDER_SPEED = 1;
export const DEFAULT_DUAL_SLIDER_SHAPE: DualSliderShape = 'sine';
export const DEFAULT_DUAL_SLIDER_SHAPE_DIVISION: DualSliderShapeDivision = '1';
const DEFAULT_WALK_CONFIG: DualSliderWalkConfig = {
  relationship: 'free',
  speed: DEFAULT_DUAL_SLIDER_SPEED,
};
export const DEFAULT_MODULATION_SOURCE_A: ModulationSourceConfig = {
  type: 'walk',
  walk: DEFAULT_WALK_CONFIG,
};
export const DEFAULT_MODULATION_SOURCE_B: ModulationSourceConfig = { type: 'sampleHold' };

/** A parameter only owns a bus assignment and its output range. */
export interface DualSliderConfig {
  source: ModulationSlot;
  range: readonly [number, number];
}

type LegacyDualSliderConfig = Partial<DualSliderConfig> & {
  mode?: SliderMode | 'modA' | 'modB';
  walk?: Partial<DualSliderWalkConfig>;
  shape?: { shape?: DualSliderShape; timing?: Partial<DualSliderShapeTiming> };
};

export type DualSliderConfigMap<Key extends PropertyKey = string> = Partial<Record<Key, DualSliderConfig>>;
export type DualSliderConfigAction<Key extends PropertyKey = string> =
  | { type: 'setConfig'; key: Key; config: DualSliderConfig }
  | { type: 'setRange'; key: Key; range: readonly [number, number] }
  | { type: 'remove'; key: Key }
  | { type: 'replaceScope'; configs: DualSliderConfigMap<Key> }
  | { type: 'mergeSnapshot'; configs: DualSliderConfigMap<Key> };

export type LegacySliderModeMap<Key extends PropertyKey = string> = Partial<Record<Key, SliderMode>>;
export type LegacyDualRangeMap<Key extends PropertyKey = string> = Partial<
  Record<Key, { min: number; max: number } | undefined>
>;

function finiteSpeed(value: unknown, fallback = DEFAULT_DUAL_SLIDER_SPEED): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeShapeTiming(
  value: Partial<DualSliderShapeTiming> | null | undefined,
  fallback: DualSliderShapeTiming,
): DualSliderShapeTiming {
  if (value?.mode === 'sync') {
    const division = value.division;
    return {
      mode: 'sync',
      reference: value.reference === 'phrase' ? 'phrase' : 'bar',
      division: division === '4x' || division === '2x' || division === '1' || division === '1/2'
        || division === '1/4' || division === '1/8' || division === '1/16'
        ? division
        : DEFAULT_DUAL_SLIDER_SHAPE_DIVISION,
    };
  }
  const fallbackSpeed = fallback.mode === 'sync' ? DEFAULT_DUAL_SLIDER_SPEED : fallback.speed;
  return {
    mode: value?.mode === 'link' ? 'link' : 'free',
    speed: finiteSpeed(value && 'speed' in value ? value.speed : undefined, fallbackSpeed),
  };
}

export function normalizeModulationSourceConfig(
  value: Partial<ModulationSourceConfig> | null | undefined,
  fallback: ModulationSourceConfig,
): ModulationSourceConfig {
  const type = value?.type === 'walk' || value?.type === 'sampleHold' || value?.type === 'shape'
    ? value.type
    : fallback.type;
  if (type === 'walk') {
    const candidate = value?.type === 'walk' ? value.walk : undefined;
    const fallbackWalk = fallback.type === 'walk' ? fallback.walk : DEFAULT_WALK_CONFIG;
    return {
      type,
      walk: {
        relationship: candidate?.relationship === 'link' ? 'link' : fallbackWalk.relationship,
        speed: finiteSpeed(candidate?.speed, fallbackWalk.speed),
      },
    };
  }
  if (type === 'shape') {
    const candidate = value?.type === 'shape' ? value.shape : undefined;
    const fallbackShape = fallback.type === 'shape'
      ? fallback.shape
      : { shape: DEFAULT_DUAL_SLIDER_SHAPE, timing: { mode: 'free' as const, speed: DEFAULT_DUAL_SLIDER_SPEED } };
    return {
      type,
      shape: {
        shape: candidate?.shape === 'triangle' || candidate?.shape === 'square'
          ? candidate.shape
          : fallbackShape.shape,
        timing: normalizeShapeTiming(candidate?.timing, fallbackShape.timing),
      },
    };
  }
  return { type: 'sampleHold' };
}

export function configForModulationSource(
  source: ModulationSlot,
  _sourceConfig: ModulationSourceConfig,
  range: readonly [number, number],
): DualSliderConfig {
  return normalizeDualSliderConfig({ source, range });
}

/** Accept legacy generator-shaped configs, but always emit assignment-only state. */
export function normalizeDualSliderConfig(config: DualSliderConfig | LegacyDualSliderConfig): DualSliderConfig {
  const legacyMode = 'mode' in config ? config.mode : undefined;
  const source: ModulationSlot = config.source === 'a' || config.source === 'b'
    ? config.source
    : legacyMode === 'modB' || legacyMode === 'sampleHold' ? 'b' : 'a';
  const range = Array.isArray(config.range) ? config.range : [0, 0];
  return { source, range: normalizeSliderRange(range[0], range[1]) };
}

export function dualSliderConfigsEqual(left: DualSliderConfig | undefined, right: DualSliderConfig): boolean {
  return left?.source === right.source
    && left.range[0] === right.range[0]
    && left.range[1] === right.range[1];
}

export function dualConfigReducer<Key extends PropertyKey>(
  state: DualSliderConfigMap<Key>,
  action: DualSliderConfigAction<Key>,
): DualSliderConfigMap<Key> {
  if (action.type === 'replaceScope') return normalizeDualConfigMap(action.configs);
  if (action.type === 'mergeSnapshot') {
    const next = { ...state };
    let changed = false;
    for (const key of Reflect.ownKeys(action.configs) as Key[]) {
      const raw = action.configs[key];
      if (!raw) continue;
      const config = normalizeDualSliderConfig(raw);
      if (dualSliderConfigsEqual(state[key], config)) continue;
      next[key] = config;
      changed = true;
    }
    return changed ? next : state;
  }
  if (action.type === 'remove') {
    if (!state[action.key]) return state;
    const next = { ...state };
    delete next[action.key];
    return next;
  }
  if (action.type === 'setRange') {
    const current = state[action.key];
    if (!current) return state;
    const nextConfig = normalizeDualSliderConfig({ ...current, range: action.range });
    return dualSliderConfigsEqual(current, nextConfig) ? state : { ...state, [action.key]: nextConfig };
  }
  const nextConfig = normalizeDualSliderConfig(action.config);
  return dualSliderConfigsEqual(state[action.key], nextConfig)
    ? state
    : { ...state, [action.key]: nextConfig };
}

export function normalizeDualConfigMap<Key extends PropertyKey>(
  configs: DualSliderConfigMap<Key> | Partial<Record<Key, LegacyDualSliderConfig>>,
  _options?: { walkSpeed?: number; shapeSpeed?: number },
): DualSliderConfigMap<Key> {
  const next: DualSliderConfigMap<Key> = {};
  for (const key of Reflect.ownKeys(configs) as Key[]) {
    const config = configs[key];
    if (config?.range) next[key] = normalizeDualSliderConfig(config);
  }
  return next;
}

export function fromLegacyDualState<Key extends PropertyKey>(
  modes: LegacySliderModeMap<Key>,
  ranges: LegacyDualRangeMap<Key>,
  _options?: { walkSpeed?: number },
): DualSliderConfigMap<Key> {
  const configs: DualSliderConfigMap<Key> = {};
  for (const key of Reflect.ownKeys(ranges) as Key[]) {
    const range = ranges[key];
    const mode = modes[key];
    if (!range || (mode !== 'walk' && mode !== 'sampleHold' && mode !== 'shape')) continue;
    configs[key] = normalizeDualSliderConfig({ mode, range: [range.min, range.max] });
  }
  return configs;
}

export function toLegacyDualState<Key extends PropertyKey>(
  configs: DualSliderConfigMap<Key>,
  sourceA: ModulationSourceConfig = DEFAULT_MODULATION_SOURCE_A,
  sourceB: ModulationSourceConfig = DEFAULT_MODULATION_SOURCE_B,
): { sliderModes: LegacySliderModeMap<Key>; dualRanges: LegacyDualRangeMap<Key> } {
  const sliderModes: LegacySliderModeMap<Key> = {};
  const dualRanges: LegacyDualRangeMap<Key> = {};
  for (const key of Reflect.ownKeys(configs) as Key[]) {
    const config = configs[key];
    if (!config) continue;
    const normalized = normalizeDualSliderConfig(config);
    sliderModes[key] = (normalized.source === 'a' ? sourceA : sourceB).type;
    dualRanges[key] = { min: normalized.range[0], max: normalized.range[1] };
  }
  return { sliderModes, dualRanges };
}
