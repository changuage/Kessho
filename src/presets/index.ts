// src/presets/index.ts
// Barrel export for the preset system (Phases 0–2).

// Phase 0: Types & Registry
export type {
  PresetLevel,
  PresetLibrary,
  PresetVisibility,
  PresetVersion,
  PresetVersionMetadata,
  PresetRef,
  PresetEntry,
  PresetFile,
  PresetSaveIdentity,
  PresetSummary,
  PresetVariantSummary,
  PresetFamilySummary,
} from './types';
export { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
export { extractParams, applyParams, getKeysForScope, getScopesForLevel, validateRegistry, extractCascade, compressVersions, getVersionData } from './codec';
export {
  generatePresetId,
  makePresetKey,
  parsePresetKey,
  getPresetScope,
  normalizePresetEntry,
  normalizePresetVersion,
  extractPresetVersionMetadata,
  isPresetCompatibleWithSlot,
  comparePresetVersions,
} from './presetUtils';
export { buildPresetFamilies, getPresetDisplayLabel } from './catalog';

// Phase 1: PresetStore
export type { IPresetStore } from './PresetStore';
export { LocalStoragePresetStore, getPresetStore, setPresetStore } from './PresetStore';
export { SupabasePresetStore } from './SupabasePresetStore';
export { HybridPresetStore } from './HybridPresetStore';
export { loadFactoryPresets, isFactoryLoaded } from './factoryPresets';
export {
  optimizeStringWavesV2,
  repairPresetChildGraphsV2,
  repairPresetChildGraphsV2ForClient,
  repairStringWavesGraphV2,
  repairStringWavesGraphV2ForClient,
  runPresetV2Migration,
  verifyPresetV2Migration,
} from './presetV2Migration';
export type {
  PresetV2MigrationOptions,
  PresetV2MigrationReport,
  PresetChildGraphRepairReport,
  PresetChildGraphRepairScope,
  StringWavesGraphRepairReport,
  StringWavesOptimizationReport,
} from './presetV2Migration';
export { usePresets } from './usePresets';
export type { UsePresetsOptions } from './usePresets';

// Phase 2: File I/O
export { exportPresetToFile, importPresetFromFile, quickExport } from './fileIO';

// Phase 3: PresetDropdown component
export { PresetDropdown } from './PresetDropdown';
export type { PresetDropdownProps } from './PresetDropdown';

// Family tree visualizer
export { PresetFamilyTree } from './PresetFamilyTree';
export type { PresetFamilyTreeProps } from './PresetFamilyTree';
