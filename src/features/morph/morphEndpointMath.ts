import type { SliderState } from '../../ui/state';
import {
  getPadPreset,
  morphPadPresets,
  PAD_PRESET_PARAM_KEYS,
  PAD1_TO_PAD2_KEY,
  type PadPreset,
  type PadPresetParamKey,
} from '../../audio/padPresets';
import { clampMorphPosition, isAtEndpoint0, isAtEndpoint1 } from '../../audio/morphUtils';
import { getRuntimeValue } from '../../ui/runtimeValueState';

const LEAD_PRESET_SLOT_KEYS = [
  'lead1PresetA',
  'lead1PresetB',
  'lead2PresetC',
  'lead2PresetD',
] as const satisfies readonly (keyof SliderState)[];

export type LeadPresetSlotStateKey = typeof LEAD_PRESET_SLOT_KEYS[number];
export type PadMorphScope = 'pad1' | 'pad2';
export type LeadMorphScope = 'lead1' | 'lead2';
export type PadMorphEndpoint = 'a' | 'b';
type PadMorphEndpointParamValue = number | string | boolean;
type PadMorphEndpointParamOverrides = Partial<Record<PadPresetParamKey, PadMorphEndpointParamValue>>;
export type PadMorphEndpointOverrides = Record<PadMorphScope, Record<PadMorphEndpoint, PadMorphEndpointParamOverrides>>;

const PAD_PRESET_PARAM_KEY_SET = new Set<string>(PAD_PRESET_PARAM_KEYS);
const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, PadPresetParamKey>;

export function isLeadPresetSlotKey(key: keyof SliderState): key is LeadPresetSlotStateKey {
  return (LEAD_PRESET_SLOT_KEYS as readonly string[]).includes(String(key));
}

export function leadPresetSlotsChanged(previous: SliderState, next: SliderState): boolean {
  return LEAD_PRESET_SLOT_KEYS.some((key) => previous[key] !== next[key]);
}

export function createPadMorphEndpointOverrides(): PadMorphEndpointOverrides {
  return {
    pad1: { a: {}, b: {} },
    pad2: { a: {}, b: {} },
  };
}

export function getPadMorphParamChange(key: keyof SliderState): { scope: PadMorphScope; paramKey: PadPresetParamKey } | null {
  const keyStr = String(key);
  if (PAD_PRESET_PARAM_KEY_SET.has(keyStr)) {
    return { scope: 'pad1', paramKey: keyStr as PadPresetParamKey };
  }

  const pad1Key = PAD2_TO_PAD1_KEY[keyStr];
  return pad1Key ? { scope: 'pad2', paramKey: pad1Key } : null;
}

export function getPadMorphPosition(state: SliderState, scope: PadMorphScope): number | null {
  const runtimeKey = scope === 'pad2' ? 'pad2Morph' : 'padMorph';
  const runtimeMorph = getRuntimeValue(runtimeKey);
  if (typeof runtimeMorph === 'number' && Number.isFinite(runtimeMorph)) {
    return runtimeMorph;
  }
  const morphPosition = scope === 'pad2' ? state.pad2Morph : state.padMorph;
  if (typeof morphPosition !== 'number') return null;
  return morphPosition;
}

export function applyLiveLeadMorphToPresetChange(state: SliderState, scope: LeadMorphScope): void {
  const runtimeKey = scope === 'lead2' ? 'lead2Morph' : 'lead1Morph';
  const runtimeMorph = getRuntimeValue(runtimeKey);
  if (typeof runtimeMorph !== 'number' || !Number.isFinite(runtimeMorph)) return;
  state[runtimeKey] = clampMorphPosition(runtimeMorph);
}

export function applyLiveLeadMorphToChangedPresetSlots(previous: SliderState, next: SliderState): SliderState {
  let normalized = next;
  if (previous.lead1PresetA !== next.lead1PresetA || previous.lead1PresetB !== next.lead1PresetB) {
    normalized = normalized === next ? { ...next } : normalized;
    applyLiveLeadMorphToPresetChange(normalized, 'lead1');
  }
  if (previous.lead2PresetC !== next.lead2PresetC || previous.lead2PresetD !== next.lead2PresetD) {
    normalized = normalized === next ? { ...next } : normalized;
    applyLiveLeadMorphToPresetChange(normalized, 'lead2');
  }
  return normalized;
}

function getPadMorphEndpoint(state: SliderState, scope: PadMorphScope): PadMorphEndpoint | null {
  const morphPosition = getPadMorphPosition(state, scope);
  if (morphPosition === null) return null;
  if (isAtEndpoint0(morphPosition)) return 'a';
  if (isAtEndpoint1(morphPosition)) return 'b';
  return null;
}

function getPadPresetStateKey(scope: PadMorphScope, paramKey: PadPresetParamKey): string | undefined {
  return scope === 'pad2' ? PAD1_TO_PAD2_KEY[paramKey] : paramKey;
}

function isPadMorphEndpointParamValue(value: unknown): value is PadMorphEndpointParamValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

export function rememberPadMorphEndpointState(
  overrides: PadMorphEndpointOverrides,
  state: SliderState,
  scope: PadMorphScope,
): void {
  const endpoint = getPadMorphEndpoint(state, scope);
  if (!endpoint) return;

  const target = overrides[scope][endpoint];
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    const stateKey = getPadPresetStateKey(scope, paramKey);
    if (!stateKey) continue;
    const value = (state as unknown as Record<string, unknown>)[stateKey];
    if (isPadMorphEndpointParamValue(value)) {
      target[paramKey] = value;
    }
  }
}

function padMorphScopeParamsChanged(previous: SliderState, next: SliderState, scope: PadMorphScope): boolean {
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    const stateKey = getPadPresetStateKey(scope, paramKey);
    if (!stateKey) continue;
    const key = stateKey as keyof SliderState;
    if (previous[key] !== next[key]) return true;
  }
  return false;
}

export function rememberChangedPadMorphEndpointStates(
  overrides: PadMorphEndpointOverrides,
  previous: SliderState,
  next: SliderState,
): void {
  if (padMorphScopeParamsChanged(previous, next, 'pad1')) {
    rememberPadMorphEndpointState(overrides, next, 'pad1');
  }
  if (padMorphScopeParamsChanged(previous, next, 'pad2')) {
    rememberPadMorphEndpointState(overrides, next, 'pad2');
  }
}

export function clearPadMorphEndpointState(
  overrides: PadMorphEndpointOverrides,
  scope: PadMorphScope,
  endpoint: PadMorphEndpoint,
): void {
  overrides[scope][endpoint] = {};
}

function applyPadEndpointOverridesToPreset(
  preset: PadPreset,
  overrides: PadMorphEndpointParamOverrides,
): PadPreset {
  if (Object.keys(overrides).length === 0) return preset;
  return {
    ...preset,
    params: {
      ...preset.params,
      ...overrides,
    },
  };
}

export function applyPadPresetMorphToState(
  state: SliderState,
  scope: PadMorphScope,
  overrides: PadMorphEndpointOverrides,
): void {
  const presetAKey = scope === 'pad2' ? 'pad2PresetA' : 'padPresetA';
  const presetBKey = scope === 'pad2' ? 'pad2PresetB' : 'padPresetB';
  const presetA = getPadPreset(String(state[presetAKey] ?? 'init'), scope);
  const presetB = getPadPreset(String(state[presetBKey] ?? state[presetAKey] ?? 'init'), scope);
  if (!presetA || !presetB) return;

  const morphPosition = getPadMorphPosition(state, scope) ?? 0;
  const morphed = morphPadPresets(
    applyPadEndpointOverridesToPreset(presetA, overrides[scope].a),
    applyPadEndpointOverridesToPreset(presetB, overrides[scope].b),
    morphPosition,
  );
  const record = state as unknown as Record<string, unknown>;
  for (const paramKey of PAD_PRESET_PARAM_KEYS) {
    if (!(paramKey in morphed)) continue;
    const targetKey = getPadPresetStateKey(scope, paramKey);
    if (targetKey) {
      record[targetKey] = morphed[paramKey];
    }
  }
}
