// src/presets/index.ts
// Barrel export for the preset system (Phases 0–2).

// Phase 0: Types & Registry
export type { PresetLevel, PresetVersion, PresetRef, PresetEntry, PresetFile, PresetSummary } from './types';
export { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export { extractParams, applyParams, getKeysForScope, getScopesForLevel, validateRegistry } from './codec';

// Phase 1: PresetStore
export type { IPresetStore } from './PresetStore';
export { LocalStoragePresetStore, getPresetStore } from './PresetStore';
export { loadFactoryPresets, isFactoryLoaded } from './factoryPresets';
export { usePresets } from './usePresets';

// Phase 2: File I/O
export { exportPresetToFile, importPresetFromFile, quickExport } from './fileIO';

// Phase 3: PresetDropdown component
export { PresetDropdown } from './PresetDropdown';
export type { PresetDropdownProps } from './PresetDropdown';
