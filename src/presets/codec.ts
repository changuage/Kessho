// src/presets/codec.ts
// Phase 0 — Codec functions for slicing and merging SliderState by level+scope.

import { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export type { ParamLevel } from './ParamRegistry';
import type { SliderState } from '../ui/state';

/** Extract only the params owned by a level+scope from full state */
export function extractParams(
  state: SliderState,
  level: ParamLevel,
  scope?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!scope || info.scope === scope)) {
      if (key in state) result[key] = (state as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

/** Apply preset params into state, only touching keys at specified level+scope */
export function applyParams(
  state: SliderState,
  presetData: Record<string, unknown>,
  level: ParamLevel,
  scope?: string,
): SliderState {
  const merged: Record<string, unknown> = { ...state };
  for (const [key, info] of Object.entries(PARAM_REGISTRY)) {
    if (info.level === level && (!scope || info.scope === scope)) {
      if (key in presetData) merged[key] = presetData[key];
    }
  }
  return merged as unknown as SliderState;
}

/** Get all keys owned by a level+scope */
export function getKeysForScope(level: ParamLevel, scope: string): string[] {
  return Object.entries(PARAM_REGISTRY)
    .filter(([, info]) => info.level === level && info.scope === scope)
    .map(([key]) => key);
}

/** Get all scopes at a given level */
export function getScopesForLevel(level: ParamLevel): string[] {
  const scopes = new Set<string>();
  for (const info of Object.values(PARAM_REGISTRY)) {
    if (info.level === level) scopes.add(info.scope);
  }
  return [...scopes];
}

/** Validate registry completeness against SliderState keys */
export function validateRegistry(stateKeys: string[]): {
  missing: string[];    // in registry but not in state
  unassigned: string[]; // in state but not in registry
} {
  const registryKeys = new Set(Object.keys(PARAM_REGISTRY));
  const stateSet = new Set(stateKeys);
  // Known intentionally-dropped keys (not in registry, not a bug)
  const dropped = new Set(['leadTimbre', 'granularPreset']);

  return {
    missing: [...registryKeys].filter(k => !stateSet.has(k)),
    unassigned: stateKeys.filter(k => !registryKeys.has(k) && !dropped.has(k)),
  };
}
