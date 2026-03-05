// src/presets/index.ts
// Barrel export for the preset system (Phase 0).

export type { PresetLevel, PresetVersion, PresetRef, PresetEntry, PresetFile, PresetSummary } from './types';
export { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export { extractParams, applyParams, getKeysForScope, getScopesForLevel, validateRegistry } from './codec';
