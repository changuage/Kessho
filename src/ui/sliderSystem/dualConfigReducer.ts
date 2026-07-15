import type { SliderMode } from '../state';
import { normalizeSliderRange } from './scale';

export type DualSliderMode = Exclude<SliderMode, 'single'>;

export interface DualSliderConfig {
  mode: DualSliderMode;
  range: readonly [number, number];
}

export type DualSliderConfigMap<Key extends PropertyKey = string> = Partial<Record<Key, DualSliderConfig>>;

export type DualSliderConfigAction<Key extends PropertyKey = string> =
  | { type: 'enable'; key: Key; mode: DualSliderMode; range: readonly [number, number] }
  | { type: 'setRange'; key: Key; range: readonly [number, number] }
  | { type: 'setMode'; key: Key; mode: DualSliderMode }
  | { type: 'remove'; key: Key }
  | { type: 'replaceScope'; configs: DualSliderConfigMap<Key> }
  | { type: 'mergeSnapshot'; configs: DualSliderConfigMap<Key> };

export type LegacySliderModeMap<Key extends PropertyKey = string> = Partial<Record<Key, SliderMode>>;
export type LegacyDualRangeMap<Key extends PropertyKey = string> = Partial<
  Record<Key, { min: number; max: number } | undefined>
>;

function normalizeConfig(config: DualSliderConfig): DualSliderConfig {
  return {
    mode: config.mode,
    range: normalizeSliderRange(config.range[0], config.range[1]),
  };
}

function configsEqual(left: DualSliderConfig | undefined, right: DualSliderConfig): boolean {
  return left?.mode === right.mode
    && left.range[0] === right.range[0]
    && left.range[1] === right.range[1];
}

export function dualConfigReducer<Key extends PropertyKey>(
  state: DualSliderConfigMap<Key>,
  action: DualSliderConfigAction<Key>,
): DualSliderConfigMap<Key> {
  if (action.type === 'replaceScope') {
    return normalizeDualConfigMap(action.configs);
  }
  if (action.type === 'mergeSnapshot') {
    const normalized = normalizeDualConfigMap(action.configs);
    let next = state;
    for (const key of Reflect.ownKeys(normalized) as Key[]) {
      const config = normalized[key];
      if (!config || configsEqual(state[key], config)) continue;
      if (next === state) next = { ...state };
      next[key] = config;
    }
    return next;
  }
  if (action.type === 'remove') {
    if (!state[action.key]) return state;
    const next = { ...state };
    delete next[action.key];
    return next;
  }

  const current = state[action.key];
  if (action.type === 'setRange' && !current) return state;
  if (action.type === 'setMode' && !current) return state;
  const nextConfig = normalizeConfig(action.type === 'enable'
    ? { mode: action.mode, range: action.range }
    : action.type === 'setRange'
      ? { mode: current!.mode, range: action.range }
      : { mode: action.mode, range: current!.range });
  if (configsEqual(current, nextConfig)) return state;
  return { ...state, [action.key]: nextConfig };
}

export function normalizeDualConfigMap<Key extends PropertyKey>(
  configs: DualSliderConfigMap<Key>,
): DualSliderConfigMap<Key> {
  const next: DualSliderConfigMap<Key> = {};
  for (const key of Reflect.ownKeys(configs) as Key[]) {
    const config = configs[key];
    if (!config) continue;
    next[key] = normalizeConfig(config);
  }
  return next;
}

export function fromLegacyDualState<Key extends PropertyKey>(
  modes: LegacySliderModeMap<Key>,
  ranges: LegacyDualRangeMap<Key>,
): DualSliderConfigMap<Key> {
  const configs: DualSliderConfigMap<Key> = {};
  for (const key of Reflect.ownKeys(modes) as Key[]) {
    const mode = modes[key];
    const range = ranges[key];
    if ((mode !== 'walk' && mode !== 'sampleHold') || !range) continue;
    configs[key] = normalizeConfig({ mode, range: [range.min, range.max] });
  }
  return configs;
}

export function toLegacyDualState<Key extends PropertyKey>(
  configs: DualSliderConfigMap<Key>,
): {
  sliderModes: LegacySliderModeMap<Key>;
  dualRanges: LegacyDualRangeMap<Key>;
} {
  const sliderModes: LegacySliderModeMap<Key> = {};
  const dualRanges: LegacyDualRangeMap<Key> = {};
  for (const key of Reflect.ownKeys(configs) as Key[]) {
    const config = configs[key];
    if (!config) continue;
    const normalized = normalizeConfig(config);
    sliderModes[key] = normalized.mode;
    dualRanges[key] = { min: normalized.range[0], max: normalized.range[1] };
  }
  return { sliderModes, dualRanges };
}

export interface DualModeCyclePlan {
  action: DualSliderConfigAction<string>;
  commitEffectiveValue?: number;
}

export function planDualModeCycle(
  key: string,
  current: DualSliderConfig | undefined,
  defaultRange: readonly [number, number],
  effectiveValue: number,
  sampleHoldSupported: boolean,
): DualModeCyclePlan {
  if (!current) return { action: { type: 'enable', key, mode: 'walk', range: defaultRange } };
  if (current.mode === 'walk' && sampleHoldSupported) {
    return { action: { type: 'setMode', key, mode: 'sampleHold' } };
  }
  return { action: { type: 'remove', key }, commitEffectiveValue: effectiveValue };
}
